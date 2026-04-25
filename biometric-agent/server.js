/**
 * AMS Biometric Agent — SecuGen Hamster Pro 20
 * ─────────────────────────────────────────────
 * HTTP  : GET /health
 * WS    : ws://localhost:12345
 *
 * The blocking SDK call (SGFPM_GetImageEx) runs in a dedicated Node.js
 * worker thread (secugen-worker.js) so the main event loop stays free
 * to handle WebSocket messages (e.g. cancel) during a scan.
 */

"use strict";

const { WebSocketServer } = require("ws");
const { Worker }          = require("worker_threads");
const http                = require("http");
const path                = require("path");

const PORT = 12345;

// Allow any localhost / 127.0.0.1 origin (any port)
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// ── SDK Worker ────────────────────────────────────────────────────────────────
let mode          = "simulation"; // updated when worker reports sdk_ready
let sdkWorker     = null;
let deviceWidth   = 300;
let deviceHeight  = 400;

// Map of pending one-shot message handlers: messageType → resolve fn
const workerWaiters = new Map();

function startWorker() {
  sdkWorker = new Worker(path.join(__dirname, "secugen-worker.js"));

  sdkWorker.on("message", (msg) => {
    // Route to a specific waiter if one is registered
    const waiter = workerWaiters.get(msg.type);
    if (waiter) {
      workerWaiters.delete(msg.type);
      waiter(msg);
      return;
    }

    switch (msg.type) {
      case "sdk_ready":
        mode        = "hardware";
        deviceWidth  = msg.deviceWidth  ?? 300;
        deviceHeight = msg.deviceHeight ?? 400;
        console.log(`[Agent] SecuGen SDK ready (hardware mode, ${deviceWidth}×${deviceHeight}px)`);
        break;

      case "sdk_error":
        console.warn("[Agent] SDK failed to load:", msg.message);
        console.warn("[Agent] Running in SIMULATION mode.");
        break;

      // status / captured / capture_error / match_result forwarded in handleCapture
    }
  });

  sdkWorker.on("error",  (e) => console.error("[Agent] Worker error:", e));
  sdkWorker.on("exit",   (c) => { if (c !== 0) console.error(`[Agent] Worker exited (code ${c})`); });
}

try {
  startWorker();
} catch (e) {
  console.warn("[Agent] Could not start SDK worker:", e.message);
}

// ── HTTP health endpoint ──────────────────────────────────────────────────────
const httpServer = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/health") {
    if (mode === "hardware" && sdkWorker) {
      // Ask worker for live device status
      const result = await new Promise((resolve) => {
        workerWaiters.set("health_result", resolve);
        sdkWorker.postMessage({ type: "health" });
        setTimeout(() => { // timeout guard
          if (workerWaiters.has("health_result")) {
            workerWaiters.delete("health_result");
            resolve({ device_connected: false, sdk_version: null, device_info: null });
          }
        }, 3000);
      });
      res.writeHead(200);
      res.end(JSON.stringify({
        status: "ok", mode,
        device: "SecuGen Hamster Pro 20",
        device_connected: result.device_connected,
        sdk_version:      result.sdk_version,
        device_info:      result.device_info,
      }));
    } else {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: "ok", mode,
        device: "SecuGen Hamster Pro 20",
        device_connected: false,
        sdk_version: null, device_info: null,
      }));
    }
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: ({ origin }, done) => {
    if (!origin || LOCALHOST_ORIGIN_RE.test(origin)) {
      done(true);
    } else {
      console.warn(`[Agent] Rejected connection from: ${origin}`);
      done(false, 403, "Forbidden");
    }
  },
});

// Per-connection capture listener — only one capture active at a time
const captureListeners = new WeakMap();

wss.on("connection", (ws) => {
  console.log(`[Agent] Client connected (${mode} mode)`);

  ws.send(JSON.stringify({
    type:    "connected",
    mode,
    device:  "SecuGen Hamster Pro 20",
    message: mode === "hardware"
      ? `Device ready (${deviceWidth}×${deviceHeight}px).`
      : "SIMULATION MODE — no real device. Install SecuGen FDx SDK for production.",
  }));

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { safeSend(ws, { type: "error", message: "Invalid JSON." }); return; }

    console.log(`[Agent] Action: ${msg.action}`);

    switch (msg.action) {
      case "capture":
        await handleCapture(ws, msg);
        break;

      case "cancel":
        if (sdkWorker) sdkWorker.postMessage({ type: "cancel" });
        safeSend(ws, { type: "cancelled", message: "Capture cancelled." });
        break;

      case "status":
        handleStatus(ws);
        break;

      default:
        safeSend(ws, { type: "error", message: `Unknown action: ${msg.action}` });
    }
  });

  ws.on("close", () => {
    console.log("[Agent] Client disconnected.");
    // Clean up any active capture listener for this socket
    const listener = captureListeners.get(ws);
    if (listener && sdkWorker) {
      sdkWorker.off("message", listener);
      captureListeners.delete(ws);
    }
  });

  ws.on("error", (e) => console.error("[Agent] WS error:", e.message));
});

// ── Capture handler ───────────────────────────────────────────────────────────
async function handleCapture(ws, msg) {
  const timeout     = msg.timeout     ?? 12000;
  const minQuality  = msg.minQuality  ?? 65;
  const maxAttempts = msg.maxAttempts ?? 5;

  if (mode !== "hardware" || !sdkWorker) {
    // Simulation fallback
    const result = await simulateCapture();
    safeSend(ws, { type: "captured", template: result.template, quality: result.quality,
                   message: `Captured! Quality: ${result.quality}%` });
    return;
  }

  // Remove any stale listener from a previous capture on this socket
  const oldListener = captureListeners.get(ws);
  if (oldListener) sdkWorker.off("message", oldListener);

  // Listen to worker messages for the duration of this capture
  const listener = (workerMsg) => {
    switch (workerMsg.type) {
      case "status":
        safeSend(ws, {
          type: "status", message: workerMsg.message,
          attempt: workerMsg.attempt, maxAttempts: workerMsg.maxAttempts,
          quality: workerMsg.quality,
        });
        break;

      case "captured":
        sdkWorker.off("message", listener);
        captureListeners.delete(ws);
        safeSend(ws, {
          type:     "captured",
          template: workerMsg.template,
          quality:  workerMsg.quality,
          warning:  workerMsg.warning ?? null,
          message:  `Captured! Quality: ${workerMsg.quality}%`,
        });
        break;

      case "capture_error":
        sdkWorker.off("message", listener);
        captureListeners.delete(ws);
        safeSend(ws, {
          type:    "error",
          code:    workerMsg.code,
          message: workerMsg.message,
        });
        break;
    }
  };

  sdkWorker.on("message", listener);
  captureListeners.set(ws, listener);

  sdkWorker.postMessage({ type: "capture", timeout, minQuality, maxAttempts });
}

function handleStatus(ws) {
  safeSend(ws, {
    type: "status", mode,
    device_connected: mode === "hardware",
    device: "SecuGen Hamster Pro 20",
  });
}

function safeSend(ws, data) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

// ── Simulation (no device) ────────────────────────────────────────────────────
async function simulateCapture() {
  await new Promise(r => setTimeout(r, 2000));
  const base = Buffer.alloc(400, 0x42);
  const salt = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) salt[i] = Math.floor(Math.random() * 256);
  salt.copy(base, 384);
  return { template: base.toString("base64"), quality: Math.floor(Math.random() * 20) + 75 };
}

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║       AMS Biometric Agent — SecuGen Hamster Pro 20   ║
╠══════════════════════════════════════════════════════╣
║  WebSocket : ws://localhost:${PORT}                    ║
║  Health    : http://localhost:${PORT}/health           ║
╚══════════════════════════════════════════════════════╝
`);
});
