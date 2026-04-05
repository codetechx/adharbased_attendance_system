/**
 * SecuGen HU20-AP (Hamster Pro 20 with Auto-Placement) — SGFPLIB Bridge
 * ────────────────────────────────────────────────────────────────────────
 * Calls SGFPLIB.dll via koffi (native FFI, no rebuild needed).
 *
 * Device  : SecuGen HU20-AP  (SDK name: SG_DEV_FDU08P, ID = 68)
 * SDK     : SecuGen FDx SDK Pro for Windows
 *           https://secugen.com/download-sdk/
 * DLL     : SGFPLIB.dll  → auto-installed to C:\Windows\System32\ by SDK
 *
 * HU20-AP "Auto-Placement" behaviour:
 *   The -AP suffix means the device has a proximity sensor + LED ring.
 *   The LED lights automatically when a finger is near the platen.
 *   In the SDK, SGFPM_GetImageEx nQuality MUST be 0 for AP devices —
 *   the AP hardware controls image triggering; setting nQuality > 0 fights
 *   the AP sensor and causes erratic retries.
 *
 * HU20-AP sensor specs:
 *   Image size : 260 × 300 pixels
 *   Resolution : 500 DPI
 *   Gray levels: 256 (8-bit grayscale)
 *   FMD size   : 400 bytes (ISO 19794-2)
 *
 * SGFingerInfo struct layout (64-bit Windows, MSVC padding):
 *   offset  0 : ImageWidth   DWORD  (4 bytes)
 *   offset  4 : ImageHeight  DWORD  (4 bytes)
 *   offset  8 : Resolution   DWORD  (4 bytes)
 *   offset 12 : FingerNumber DWORD  (4 bytes)  — 0 = any finger
 *   offset 16 : Reserved1    DWORD  (4 bytes)
 *   offset 20 : Reserved2    DWORD  (4 bytes)
 *   offset 24 : pBuffer      BYTE*  (8 bytes, 64-bit pointer)
 *   total     : 32 bytes
 */

"use strict";

const koffi = require("koffi");

// ─── Device constants (from SGFPLIB.h) ───────────────────────────────────────
const SG_DEV_AUTO   = 0;   // auto-detect
const SG_DEV_FDU08P = 68;  // HU20-AP / Hamster Pro 20

// ─── HU20-AP sensor specs ──────────────────────────────────────────────────────
const IMAGE_WIDTH    = 260;   // pixels
const IMAGE_HEIGHT   = 300;   // pixels
const DPI            = 500;   // sensor DPI
const FMD_BUFFER_LEN = 400;   // ISO 19794-2 FMD template (bytes)

// For AP devices: nQuality MUST be 0 — AP hardware triggers the image capture.
// Setting nQuality > 0 enables SDK-side quality-retry loop which interferes
// with the proximity sensor and causes capture to fail or behave erratically.
const AP_QUALITY_PARAM = 0;

// SecuGen match score range: 0–200 (0 = no match).
// Score ≥ 40 is the vendor-recommended threshold for general applications.
const MATCH_THRESHOLD = 40;

// ─── Error codes (from SGFPLIB.h) ────────────────────────────────────────────
const ERR = {
  0:  "SGFDX_ERROR_NONE",
  1:  "SGFDX_ERROR_MEMORY",
  2:  "SGFDX_ERROR_INVALID_PARAM",
  3:  "SGFDX_ERROR_SYSFILE",
  4:  "SGFDX_ERROR_IO",
  5:  "SGFDX_ERROR_NOT_SUPPORTED",
  6:  "SGFDX_ERROR_SYSTEM",
  7:  "SGFDX_ERROR_DEV_NOT_FOUND",
  8:  "SGFDX_ERROR_TIMEOUT",
  9:  "SGFDX_ERROR_WRONG_IMAGE",
  10: "SGFDX_ERROR_LACK_BANDWIDTH",
  51: "SGFDX_ERROR_INVALID_HANDLE",
  52: "SGFDX_ERROR_ALREADY_OPENED",
};

const errName = (code) => ERR[code] ?? `UNKNOWN_ERROR_${code}`;

// ─── Load DLL and bind functions ──────────────────────────────────────────────
let fn_Create, fn_Destroy, fn_Init, fn_OpenDevice, fn_CloseDevice;
let fn_GetImageEx, fn_GetImageQuality, fn_CreateTemplate, fn_MatchTemplate;
let fn_GetDeviceInfo;

try {
  const lib = koffi.load("SGFPLIB.dll");

  // ── Structs ────────────────────────────────────────────────────────────────

  // SGFingerInfo — passed to GetImageEx and CreateTemplate
  koffi.struct("SGFingerInfo", {
    ImageWidth:   "uint32",
    ImageHeight:  "uint32",
    Resolution:   "uint32",
    FingerNumber: "uint32",
    Reserved1:    "uint32",
    Reserved2:    "uint32",
    pBuffer:      koffi.pointer("uint8"),  // 8-byte pointer on 64-bit
  });

  // SGDeviceInfoParam — filled by GetDeviceInfo
  koffi.struct("SGDeviceInfoParam", {
    DeviceID:     "uint32",
    ComPort:      "uint32",
    BaudRate:     "uint32",
    ImageWidth:   "uint32",
    ImageHeight:  "uint32",
    Contrast:     "uint32",
    Brightness:   "uint32",
    Gain:         "uint32",
    ImageDPI:     "uint32",
    FWVersion:    "uint32",
  });

  // ── Function bindings ──────────────────────────────────────────────────────
  // All SGFPLIB functions follow __cdecl on 64-bit Windows (no __stdcall).
  // koffi uses __cdecl by default, so no calling convention override needed.

  // DWORD SGFPM_Create(HSGFPM **phFPM)
  fn_Create = lib.func("SGFPM_Create", "uint32", ["void **"]);

  // DWORD SGFPM_Destroy(HSGFPM *hFPM)
  fn_Destroy = lib.func("SGFPM_Destroy", "uint32", ["void *"]);

  // DWORD SGFPM_Init(HSGFPM *hFPM, DWORD dwDevName)
  fn_Init = lib.func("SGFPM_Init", "uint32", ["void *", "uint32"]);

  // DWORD SGFPM_OpenDevice(HSGFPM *hFPM, DWORD dwDevID)
  fn_OpenDevice = lib.func("SGFPM_OpenDevice", "uint32", ["void *", "uint32"]);

  // DWORD SGFPM_CloseDevice(HSGFPM *hFPM)
  fn_CloseDevice = lib.func("SGFPM_CloseDevice", "uint32", ["void *"]);

  // DWORD SGFPM_GetImageEx(HSGFPM *hFPM, SGFingerInfo *pFingerInfo,
  //   DWORD dwTimeOut, HWND hWndNotify, DWORD nQuality)
  // NOTE: this call BLOCKS until a finger is placed or timeout. We use
  // koffi's .async() variant so it runs in a background thread, keeping
  // the Node.js event loop free to handle WebSocket messages (e.g. cancel).
  fn_GetImageEx = lib.func("SGFPM_GetImageEx", "uint32",
    ["void *", koffi.inout(koffi.pointer("SGFingerInfo")), "uint32", "void *", "uint32"]);

  // DWORD SGFPM_GetImageQuality(HSGFPM *hFPM, DWORD nWidth, DWORD nHeight,
  //   BYTE *pBuffer, DWORD *pQuality)
  // pQuality is a plain output DWORD — allocate a 4-byte buffer and read it.
  fn_GetImageQuality = lib.func("SGFPM_GetImageQuality", "uint32",
    ["void *", "uint32", "uint32",
     koffi.pointer("uint8"),   // pBuffer (image data, input)
     koffi.pointer("uint32"),  // pQuality (output — we write a uint32 Buffer)
    ]);

  // DWORD SGFPM_CreateTemplate(HSGFPM *hFPM, SGFingerInfo *pFingerInfo,
  //   BYTE *pMinutiae)
  fn_CreateTemplate = lib.func("SGFPM_CreateTemplate", "uint32",
    ["void *", koffi.inout(koffi.pointer("SGFingerInfo")), koffi.pointer("uint8")]);

  // DWORD SGFPM_MatchTemplate(HSGFPM *hFPM, BYTE *pMinutiae1,
  //   BYTE *pMinutiae2, DWORD *pScore)
  // pScore is a plain output DWORD — use a 4-byte Buffer.
  fn_MatchTemplate = lib.func("SGFPM_MatchTemplate", "uint32",
    ["void *",
     koffi.pointer("uint8"),   // pMinutiae1
     koffi.pointer("uint8"),   // pMinutiae2
     koffi.pointer("uint32"),  // pScore (output — write a uint32 Buffer)
    ]);

  // DWORD SGFPM_GetDeviceInfo(HSGFPM *hFPM, SGDeviceInfoParam *pDeviceInfo)
  // pDeviceInfo is a pre-allocated struct filled by the SDK — use inout.
  fn_GetDeviceInfo = lib.func("SGFPM_GetDeviceInfo", "uint32",
    ["void *", koffi.inout(koffi.pointer("SGDeviceInfoParam"))]);

} catch (err) {
  throw new Error(
    "Cannot load SGFPLIB.dll.\n" +
    "1. Download SecuGen FDx SDK: https://secugen.com/download-sdk/\n" +
    "2. Run installer as Administrator (puts SGFPLIB.dll in System32)\n" +
    "3. Plug in HU20-AP and restart this agent\n" +
    "Original error: " + err.message
  );
}

// ─── Device handle (void* from SGFPM_Create) ─────────────────────────────────
let hFPM = null;
let deviceWidth  = IMAGE_WIDTH;
let deviceHeight = IMAGE_HEIGHT;

// ─── Initialize device ────────────────────────────────────────────────────────
function initDevice() {
  // SGFPM_Create: SDK allocates the handle and returns it via void**
  const pHandle = [null];
  let rc = fn_Create(pHandle);
  if (rc !== 0) throw new Error(`SGFPM_Create failed: ${errName(rc)} (${rc})`);
  hFPM = pHandle[0];

  // SGFPM_Init: tell the SDK which device type to expect
  rc = fn_Init(hFPM, SG_DEV_FDU08P);
  if (rc !== 0) {
    console.warn(`[SecuGen] FDU08P init failed (${rc}), trying auto-detect...`);
    rc = fn_Init(hFPM, SG_DEV_AUTO);
    if (rc !== 0) throw new Error(`SGFPM_Init failed: ${errName(rc)} (${rc})`);
  }

  // SGFPM_OpenDevice: open first connected device (index 0)
  rc = fn_OpenDevice(hFPM, 0);
  if (rc !== 0) {
    throw new Error(
      `SGFPM_OpenDevice failed: ${errName(rc)} (${rc})\n` +
      `  → Check HU20-AP is plugged in via USB\n` +
      `  → Check SecuGen FDx SDK is installed\n` +
      `  → Check Device Manager shows "SecuGen Hamster Pro 20" without errors`
    );
  }

  // Query actual image dimensions from the live device
  // SGDeviceInfoParam is passed as inout — SDK fills it.
  const devInfo = {
    DeviceID: 0, ComPort: 0, BaudRate: 0,
    ImageWidth: 0, ImageHeight: 0,
    Contrast: 0, Brightness: 0, Gain: 0,
    ImageDPI: 0, FWVersion: 0,
  };
  rc = fn_GetDeviceInfo(hFPM, devInfo);
  if (rc === 0 && devInfo.ImageWidth > 0) {
    deviceWidth  = devInfo.ImageWidth;
    deviceHeight = devInfo.ImageHeight;
    console.log(
      `[SecuGen] HU20-AP ready — ` +
      `${deviceWidth}×${deviceHeight}px @ ${devInfo.ImageDPI}DPI  ` +
      `FW:${devInfo.FWVersion}`
    );
  } else {
    console.log(`[SecuGen] HU20-AP ready — using default ${deviceWidth}×${deviceHeight}px`);
  }
}

// Run init on module load — throws if device/SDK not available
// server.js catches the error and falls back to simulation mode
initDevice();

// ─── Capture fingerprint (non-blocking via koffi async) ───────────────────────
//
// IMPORTANT: SGFPM_GetImageEx is a BLOCKING call that waits for a finger.
// We use fn_GetImageEx.async() so koffi runs it in a native thread pool,
// keeping the Node.js event loop free during the wait.
// This allows WebSocket messages (e.g. cancel) to still be processed.
//
async function captureFingerprint({ timeout = 12000 } = {}) {
  if (!hFPM) return { success: false, code: "NOT_INITIALIZED", message: "Device not initialized." };

  // Allocate pixel buffer: 1 byte per pixel (8-bit grayscale)
  const imageBuffer = Buffer.alloc(deviceWidth * deviceHeight, 0);

  // SGFingerInfo — inout struct, SDK fills pBuffer with image data
  const fingerInfo = {
    ImageWidth:   deviceWidth,
    ImageHeight:  deviceHeight,
    Resolution:   DPI,
    FingerNumber: 0,          // 0 = any finger
    Reserved1:    0,
    Reserved2:    0,
    pBuffer:      imageBuffer,
  };

  // ── Non-blocking capture via koffi async ───────────────────────────────────
  // nQuality = AP_QUALITY_PARAM (0) because HU20-AP controls its own trigger.
  let rc;
  try {
    rc = await fn_GetImageEx.async(hFPM, fingerInfo, timeout, null, AP_QUALITY_PARAM);
  } catch (err) {
    return { success: false, code: "FFI_ERROR", message: err.message };
  }

  if (rc === 8) {
    return { success: false, code: "TIMEOUT", message: "No finger detected within timeout. Please try again." };
  }
  if (rc !== 0) {
    return { success: false, code: errName(rc), message: `Capture failed: ${errName(rc)} (${rc})` };
  }

  // ── Measure image quality ──────────────────────────────────────────────────
  // pQuality is an output DWORD: allocate a 4-byte Buffer, read after call.
  const qualityBuf = Buffer.alloc(4, 0);
  fn_GetImageQuality(hFPM, deviceWidth, deviceHeight, imageBuffer, qualityBuf);
  const quality = qualityBuf.readUInt32LE(0);

  // ── Create FMD template ────────────────────────────────────────────────────
  const fmdBuffer = Buffer.alloc(FMD_BUFFER_LEN, 0);
  rc = fn_CreateTemplate(hFPM, fingerInfo, fmdBuffer);
  if (rc !== 0) {
    return { success: false, code: errName(rc), message: `Template creation failed: ${errName(rc)} (${rc})` };
  }

  return {
    success:  true,
    template: fmdBuffer.toString("base64"),   // ISO 19794-2 FMD, base64-encoded
    quality,                                  // 0–100 quality score from SDK
  };
}

// ─── Match two FMD templates ──────────────────────────────────────────────────
// SecuGen match score is 0–200. Score ≥ 40 = match (SDK recommendation).
// Returns { matched: bool, score: number (0-200) }
function matchTemplates(template1Base64, template2Base64) {
  if (!hFPM) return { matched: false, score: 0 };

  const buf1 = Buffer.from(template1Base64, "base64");
  const buf2 = Buffer.from(template2Base64, "base64");

  // pScore is an output DWORD — allocate a 4-byte Buffer, read after call.
  const scoreBuf = Buffer.alloc(4, 0);
  const rc = fn_MatchTemplate(hFPM, buf1, buf2, scoreBuf);
  if (rc !== 0) return { matched: false, score: 0, error: errName(rc) };

  const score = scoreBuf.readUInt32LE(0);
  return { matched: score >= MATCH_THRESHOLD, score };
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function isDeviceConnected() {
  if (!hFPM) return false;
  try {
    const devInfo = {
      DeviceID: 0, ComPort: 0, BaudRate: 0,
      ImageWidth: 0, ImageHeight: 0,
      Contrast: 0, Brightness: 0, Gain: 0,
      ImageDPI: 0, FWVersion: 0,
    };
    return fn_GetDeviceInfo(hFPM, devInfo) === 0;
  } catch { return false; }
}

function getDeviceInfo() {
  if (!hFPM) return null;
  try {
    const devInfo = {
      DeviceID: 0, ComPort: 0, BaudRate: 0,
      ImageWidth: 0, ImageHeight: 0,
      Contrast: 0, Brightness: 0, Gain: 0,
      ImageDPI: 0, FWVersion: 0,
    };
    return fn_GetDeviceInfo(hFPM, devInfo) === 0 ? devInfo : null;
  } catch { return null; }
}

function getVersion() {
  return "SecuGen HU20-AP (SG_DEV_FDU08P=68) via SGFPLIB";
}

// ─── Graceful cleanup ─────────────────────────────────────────────────────────
process.on("exit", () => {
  if (hFPM) {
    try { fn_CloseDevice(hFPM); } catch {}
    try { fn_Destroy(hFPM); } catch {}
  }
});

module.exports = {
  captureFingerprint,
  matchTemplates,
  isDeviceConnected,
  getDeviceInfo,
  getVersion,
};
