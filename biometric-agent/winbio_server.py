"""
AMS Biometric Agent — Windows Biometric Framework (WBF) edition
───────────────────────────────────────────────────────────────
HTTP  : GET /health        (returns device info as JSON)
WS    : ws://localhost:12345

Actions (client → server):
  { "action": "enroll",    "sub_factor": 2 }   enroll finger (multi-swipe)
  { "action": "identify" }                      identify finger via WBF
  { "action": "capture"  }                      alias for identify
  { "action": "cancel"   }                      cancel in-progress op
  { "action": "status"   }                      request current status

Messages (server → client):
  { "type": "connected",  "mode": "wbf", "device": "...", "message": "..." }
  { "type": "status",     "message": "...", "swipe": N }
  { "type": "captured",   "template": "<guid>", "quality": 100, "is_new": bool }
  { "type": "identified", "template": "<guid>", "sub_factor": N, "finger_name": "..." }
  { "type": "error",      "message": "...", "code": "0x..." }
  { "type": "cancelled",  "message": "..." }
"""

import asyncio
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor

import websockets
from websockets.asyncio.server import ServerConnection, serve
from websockets.datastructures import Headers
from websockets.http11 import Request, Response

from winbio_api import (
    WinBio, WinBioError,
    WINBIO_ANSI_381_POS_RH_INDEX_FINGER,
    WINBIO_I_MORE_DATA,
    FINGER_NAMES,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [WBF-Agent] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

PORT = 12345

# ── Thread pool for blocking WBF calls ───────────────────────────────────────
executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="wbf")

# ── Cancel flag — set to request abort of current WBF blocking call ───────────
_cancel_event = threading.Event()

# ── Device info cached at startup ─────────────────────────────────────────────
_device_info: dict | None = None


def _probe_device():
    """
    Try opening a WBF session to verify the device is accessible.
    enum_units() returns [] when the device hasn't fully registered with WBF yet,
    but open_session() still works. We use that as the availability check instead.
    """
    global _device_info
    try:
        wb = WinBio()
        # First try enum_units — works when device is fully registered
        units = wb.enum_units()
        if units:
            _device_info = units[0]
            log.info("WBF device: %s (unit_id=%s)", _device_info.get("description"), _device_info.get("unit_id"))
            return

        # Fallback: try to open a session — device is accessible even without enum_units
        wb.open_session()
        wb.close_session()
        _device_info = {"description": "SecuGen HU20-AP (WBF)", "unit_id": None}
        log.info("WBF session opened OK — device accessible (unit_id resolved at capture time)")

    except Exception as exc:
        log.warning("WBF device not available: %s", exc)


# ── Thread-safe send helper ───────────────────────────────────────────────────
def _send(ws: ServerConnection, data: dict, loop: asyncio.AbstractEventLoop):
    asyncio.run_coroutine_threadsafe(ws.send(json.dumps(data)), loop)


# ── Enrollment (blocking) ─────────────────────────────────────────────────────
def _do_enroll(ws: ServerConnection, sub_factor: int, loop: asyncio.AbstractEventLoop):
    try:
        wb = WinBio()
        wb.open_session()
        try:
            # Resolve unit_id: use cached value or locate via sensor touch
            unit_id = _device_info.get("unit_id") if _device_info else None
            if unit_id is None:
                _send(ws, {"type": "status", "message": "Touch sensor once to begin…"}, loop)
                unit_id = wb.locate_sensor()
                if _cancel_event.is_set():
                    _send(ws, {"type": "cancelled", "message": "Enrollment cancelled."}, loop)
                    return

            wb.enroll_begin(sub_factor, unit_id)
            swipe = 0

            while not _cancel_event.is_set():
                swipe += 1
                _send(ws, {
                    "type": "status",
                    "message": f"Swipe #{swipe} — place finger on sensor…",
                    "swipe": swipe,
                }, loop)

                reject, needs_more = wb.enroll_capture()

                if _cancel_event.is_set():
                    break

                if needs_more:
                    _send(ws, {
                        "type": "status",
                        "message": f"Swipe #{swipe} accepted — lift and re-place finger.",
                        "swipe": swipe,
                    }, loop)
                    continue

                # S_OK → commit
                identity, is_new = wb.enroll_commit()
                guid = identity.guid_str()
                log.info("Enrolled: GUID=%s is_new=%s", guid, is_new)
                _send(ws, {
                    "type": "captured",
                    "template": guid,
                    "quality": 100,
                    "is_new": is_new,
                    "message": "Fingerprint enrolled successfully.",
                }, loop)
                return

            # Cancelled
            wb.enroll_discard()
            _send(ws, {"type": "cancelled", "message": "Enrollment cancelled."}, loop)

        finally:
            wb.close_session()

    except WinBioError as exc:
        log.error("WBF enroll error: %s", exc)
        _send(ws, {"type": "error", "message": str(exc), "code": f"0x{exc.hr:08X}"}, loop)
    except Exception as exc:
        log.exception("Unexpected enroll error")
        _send(ws, {"type": "error", "message": str(exc)}, loop)


# ── Identification (blocking) ─────────────────────────────────────────────────
def _do_identify(ws: ServerConnection, loop: asyncio.AbstractEventLoop):
    try:
        wb = WinBio()
        wb.open_session()
        try:
            _send(ws, {
                "type": "status",
                "message": "Place finger on sensor to identify…",
            }, loop)

            unit_id, identity, sub_factor, reject = wb.identify()

            if _cancel_event.is_set():
                _send(ws, {"type": "cancelled", "message": "Identification cancelled."}, loop)
                return

            guid = identity.guid_str()
            finger_name = FINGER_NAMES.get(sub_factor, f"Finger {sub_factor}")
            log.info("Identified: GUID=%s sub=%s (%s)", guid, sub_factor, finger_name)
            _send(ws, {
                "type": "identified",
                "template": guid,
                "sub_factor": sub_factor,
                "finger_name": finger_name,
                "quality": 100,
                "message": f"Finger identified: {finger_name}",
            }, loop)

        finally:
            wb.close_session()

    except WinBioError as exc:
        log.error("WBF identify error: %s", exc)
        _send(ws, {"type": "error", "message": str(exc), "code": f"0x{exc.hr:08X}"}, loop)
    except Exception as exc:
        log.exception("Unexpected identify error")
        _send(ws, {"type": "error", "message": str(exc)}, loop)


# ── WebSocket handler ─────────────────────────────────────────────────────────
async def handle_client(ws: ServerConnection):
    loop = asyncio.get_event_loop()
    device_name = (
        _device_info.get("description", "WBF Fingerprint Device")
        if _device_info
        else "No device found"
    )

    await ws.send(json.dumps({
        "type": "connected",
        "mode": "wbf",
        "device": device_name,
        "message": (
            f"WBF device ready: {device_name}"
            if _device_info
            else "No WBF fingerprint device found. Connect device and restart."
        ),
    }))

    log.info("Client connected — device: %s", device_name)

    async for raw in ws:
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError:
            await ws.send(json.dumps({"type": "error", "message": "Invalid JSON."}))
            continue

        action = msg.get("action", "")
        log.info("Action: %s", action)

        if action == "status":
            await ws.send(json.dumps({
                "type": "status",
                "mode": "wbf",
                "device_connected": _device_info is not None,
                "device": device_name,
            }))

        elif action == "cancel":
            _cancel_event.set()
            await ws.send(json.dumps({"type": "cancelled", "message": "Operation cancelled."}))

        elif action == "enroll":
            if not _device_info:
                await ws.send(json.dumps({"type": "error", "message": "No fingerprint device found."}))
                continue
            _cancel_event.clear()
            sub_factor = msg.get("sub_factor", WINBIO_ANSI_381_POS_RH_INDEX_FINGER)
            loop.run_in_executor(executor, _do_enroll, ws, sub_factor, loop)

        elif action in ("capture", "identify"):
            if not _device_info:
                await ws.send(json.dumps({"type": "error", "message": "No fingerprint device found."}))
                continue
            _cancel_event.clear()
            loop.run_in_executor(executor, _do_identify, ws, loop)

        else:
            await ws.send(json.dumps({"type": "error", "message": f"Unknown action: {action}"}))

    _cancel_event.set()
    log.info("Client disconnected.")


# ── HTTP /health request interceptor ─────────────────────────────────────────
async def process_request(connection: ServerConnection, request: Request):
    if request.path == "/health":
        device_connected = _device_info is not None
        body = json.dumps({
            "status": "ok",
            "mode": "wbf",
            "device": _device_info.get("description") if _device_info else None,
            "device_connected": device_connected,
            "sdk_version": None,
            "device_info": _device_info,
        }).encode()
        return Response(
            200,
            "OK",
            Headers([
                ("Content-Type", "application/json"),
                ("Access-Control-Allow-Origin", "*"),
                ("Content-Length", str(len(body))),
            ]),
            body,
        )

    if request.path != "/":
        body = b'{"error":"Not found"}'
        return Response(
            404,
            "Not Found",
            Headers([("Content-Type", "application/json")]),
            body,
        )

    return None  # proceed with WebSocket upgrade


# ── Main ──────────────────────────────────────────────────────────────────────
async def main():
    _probe_device()

    print(f"""
╔══════════════════════════════════════════════════════╗
║   AMS Biometric Agent — Windows Biometric Framework  ║
╠══════════════════════════════════════════════════════╣
║  WebSocket : ws://localhost:{PORT}                    ║
║  Health    : http://localhost:{PORT}/health           ║
╚══════════════════════════════════════════════════════╝
""")

    async with serve(
        handle_client,
        "localhost",
        PORT,
        process_request=process_request,
    ):
        await asyncio.get_event_loop().create_future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
