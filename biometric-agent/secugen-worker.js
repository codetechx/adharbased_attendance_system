/**
 * SecuGen SDK Worker Thread
 * ─────────────────────────
 * Runs in a dedicated Node.js worker thread so that blocking SDK calls
 * (SGFPM_GetImageEx waits up to 12 s for a finger) never touch the main
 * event loop.  All koffi calls here are SYNCHRONOUS — no koffi.async,
 * no nested-pointer marshalling bugs.
 *
 * Message protocol
 * ────────────────
 * Main → Worker  { type: 'capture', timeout, minQuality, maxAttempts }
 *                { type: 'cancel' }
 *                { type: 'health' }
 *                { type: 'match',  t1: base64, t2: base64 }
 *
 * Worker → Main  { type: 'sdk_ready',  mode, deviceInfo }
 *                { type: 'sdk_error',  message }
 *                { type: 'status',     message, attempt, maxAttempts, quality }
 *                { type: 'captured',   template, quality, warning }
 *                { type: 'capture_error', code, message }
 *                { type: 'health_result', device_connected, sdk_version, device_info }
 *                { type: 'match_result',  matched, score }
 */

"use strict";

const { parentPort } = require("worker_threads");
const koffi = require("koffi");
const path  = require("path");
const fs    = require("fs");

// ── Constants ─────────────────────────────────────────────────────────────────
const SG_DEV_AUTO          = 0;
const SG_DEV_U20AP         = 17;
const TEMPLATE_FORMAT_SG400 = 0x0200;
const IMAGE_WIDTH           = 300;
const IMAGE_HEIGHT          = 400;
const DPI                   = 500;
const FMD_BUFFER_LEN        = 400;
const AP_QUALITY_PARAM      = 0;   // AP devices: SDK controls trigger
const MATCH_THRESHOLD       = 40;

const ERR = {
  0:"SGFDX_ERROR_NONE", 1:"SGFDX_ERROR_CREATION_FAILED",
  2:"SGFDX_ERROR_FUNCTION_FAILED", 3:"SGFDX_ERROR_INVALID_PARAM",
  4:"SGFDX_ERROR_NOT_USED", 5:"SGFDX_ERROR_DLLLOAD_FAILED",
  51:"SGFDX_ERROR_SYSLOAD_FAILED", 52:"SGFDX_ERROR_INITIALIZE_FAILED",
  54:"SGFDX_ERROR_TIME_OUT", 55:"SGFDX_ERROR_DEVICE_NOT_FOUND",
  57:"SGFDX_ERROR_WRONG_IMAGE", 59:"SGFDX_ERROR_DEV_ALREADY_OPEN",
  62:"SGFDX_ERROR_FAKE_FINGER",
  101:"SGFDX_ERROR_FEAT_NUMBER", 105:"SGFDX_ERROR_EXTRACT_FAIL",
  106:"SGFDX_ERROR_MATCH_FAIL",
};
const errName = c => ERR[c] ?? `UNKNOWN_ERROR_${c}`;

// ── DLL paths ─────────────────────────────────────────────────────────────────
const DLL_PATHS = [
  // Local copy — most reliable, no install path dependency
  path.join(__dirname, "sgfplib.dll"),
  // Original SDK location (kept as fallback)
  "D:/drivers/FDx_SDK_Pro_Windows_v4.3.1_J1.21/FDx_SDK_Pro_Windows_v4.3.1_J1.21/FDx SDK Pro for Windows v4.3.1/bin/x64/sgfplib.dll",
  "C:/Program Files/SecuGen/SgiBioSrv/sgfplib.dll",
  "C:/Windows/System32/SGFPLIB.dll",
];
const SDK_EXTRA_DIRS = [
  __dirname,  // local DLL copies take priority
  "D:\\drivers\\FDx_SDK_Pro_Windows_v4.3.1_J1.21\\FDx_SDK_Pro_Windows_v4.3.1_J1.21\\FDx SDK Pro for Windows v4.3.1\\bin\\x64",
  "C:\\Program Files\\SecuGen\\SgiBioSrv",
  "C:\\Program Files\\SecuGen\\Drivers\\U20AP",
  "C:\\Program Files\\SecuGen\\Drivers\\HU20A",
  "C:\\Program Files\\SecuGen\\Drivers\\HU20",
];

(function primeSearchPath() {
  const cur = process.env.PATH || "";
  const add = SDK_EXTRA_DIRS.filter(d => !cur.includes(d)).reverse();
  if (add.length) process.env.PATH = add.join(";") + ";" + cur;
})();

// ── Load DLL ──────────────────────────────────────────────────────────────────
let loadedDllDir = null;
let lib = null;

function loadSgLib() {
  for (const p of DLL_PATHS) {
    const abs = path.resolve(p.replace(/\//g, path.sep));
    if (!fs.existsSync(abs)) continue;
    loadedDllDir = path.dirname(abs);
    try {
      const loaded = koffi.load(abs);
      console.log(`[Worker] DLL loaded: ${abs}`);
      return loaded;
    } catch (e) {
      console.warn(`[Worker] koffi.load failed for ${abs}: ${e.message}`);
    }
  }
  throw new Error("sgfplib.dll not found in any known location");
}

try {
  lib = loadSgLib();
} catch (e) {
  parentPort.postMessage({ type: "sdk_error", message: e.message });
  process.exit(0);
}

// ── Structs & bindings (only if DLL loaded) ───────────────────────────────────
if (!lib) process.exit(0); // sdk_error already sent above

koffi.struct("SGFingerInfo", {
  ImageWidth:   "uint32",
  ImageHeight:  "uint32",
  Resolution:   "uint32",
  FingerNumber: "uint32",
  Reserved1:    "uint32",
  Reserved2:    "uint32",
  pBuffer:      koffi.pointer("uint8"),
});

koffi.struct("SGDeviceInfoParam", {
  DeviceID:"uint32", ComPort:"uint32", BaudRate:"uint32",
  ImageWidth:"uint32", ImageHeight:"uint32",
  Contrast:"uint32", Brightness:"uint32", Gain:"uint32",
  ImageDPI:"uint32", FWVersion:"uint32",
});

// All calls are SYNCHRONOUS — no .async(), no threading concerns
const fn_Create          = lib.func("SGFPM_Create",          "uint32", [koffi.out(koffi.pointer("void *"))]);
const fn_Init            = lib.func("SGFPM_Init",            "uint32", ["void *", "uint32"]);
const fn_OpenDevice      = lib.func("SGFPM_OpenDevice",      "uint32", ["void *", "uint32"]);
const fn_CloseDevice     = lib.func("SGFPM_CloseDevice",     "uint32", ["void *"]);
const fn_GetImageEx      = lib.func("SGFPM_GetImageEx",      "uint32", ["void *", koffi.pointer("SGFingerInfo"), "uint32", "void *", "uint32"]);
const fn_GetImageQuality = lib.func("SGFPM_GetImageQuality", "uint32", ["void *", "uint32", "uint32", koffi.pointer("uint8"), koffi.out(koffi.pointer("uint32"))]);
const fn_CreateTemplate  = lib.func("SGFPM_CreateTemplate",  "uint32", ["void *", koffi.pointer("SGFingerInfo"), koffi.pointer("uint8")]);
const fn_MatchTemplate   = lib.func("SGFPM_MatchTemplate",   "uint32", ["void *", koffi.pointer("uint8"), koffi.pointer("uint8"), koffi.out(koffi.pointer("uint32"))]);
const fn_GetDeviceInfo   = lib.func("SGFPM_GetDeviceInfo",   "uint32", ["void *", koffi.inout(koffi.pointer("SGDeviceInfoParam"))]);
const fn_SetTemplateFormat = lib.func("SGFPM_SetTemplateFormat","uint32",["void *","uint16"]);

// ── Device state ──────────────────────────────────────────────────────────────
let hFPM        = null;
let deviceWidth  = IMAGE_WIDTH;
let deviceHeight = IMAGE_HEIGHT;

// Module-level image buffer — stable native allocation, never GC'd,
// pointer is always valid for synchronous SDK calls.
// (On the main thread koffi.async + nested pointer = FUNCTION_FAILED;
//  in a worker thread all calls are sync so this is fine.)
let imageBuffer = null;

function initDevice() {
  const pHandle = [null];
  let rc = fn_Create(pHandle);
  if (rc !== 0) throw new Error(`SGFPM_Create failed: ${errName(rc)} (${rc})`);
  hFPM = pHandle[0];

  rc = fn_Init(hFPM, SG_DEV_U20AP);
  if (rc !== 0) {
    console.warn(`[Worker] U20-AP init failed (${errName(rc)}), trying auto-detect...`);
    rc = fn_Init(hFPM, SG_DEV_AUTO);
    if (rc !== 0) throw new Error(`SGFPM_Init failed: ${errName(rc)} (${rc})`);
  }

  rc = fn_OpenDevice(hFPM, 0);
  if (rc !== 0) throw new Error(`SGFPM_OpenDevice failed: ${errName(rc)} (${rc})`);

  fn_SetTemplateFormat(hFPM, TEMPLATE_FORMAT_SG400);

  const devInfo = makeDeviceInfo();
  rc = fn_GetDeviceInfo(hFPM, devInfo);
  if (rc === 0 && devInfo.ImageWidth > 0 && devInfo.ImageWidth <= 1000) {
    deviceWidth  = devInfo.ImageWidth;
    deviceHeight = devInfo.ImageHeight;
    console.log(`[Worker] Device ready — ${deviceWidth}×${deviceHeight}px @ ${devInfo.ImageDPI}DPI`);
  } else {
    console.log(`[Worker] Device ready — default ${deviceWidth}×${deviceHeight}px`);
  }

  // Allocate image buffer after we know the dimensions
  imageBuffer = Buffer.alloc(deviceWidth * deviceHeight, 0);
}

function makeDeviceInfo() {
  return { DeviceID:0, ComPort:0, BaudRate:0, ImageWidth:0, ImageHeight:0,
           Contrast:0, Brightness:0, Gain:0, ImageDPI:0, FWVersion:0 };
}

function isDeviceConnected() {
  if (!hFPM) return false;
  try {
    const d = makeDeviceInfo();
    return fn_GetDeviceInfo(hFPM, d) === 0;
  } catch { return false; }
}

// ── Single capture (SYNCHRONOUS — safe in worker thread) ──────────────────────
let cancelFlag = false;

function captureOnce(timeout) {
  // Re-use module-level buffer — stable address, no allocation overhead
  imageBuffer.fill(0);

  const fingerInfo = {
    ImageWidth: deviceWidth, ImageHeight: deviceHeight,
    Resolution: DPI, FingerNumber: 0,
    Reserved1: 0, Reserved2: 0,
    pBuffer: imageBuffer,
  };

  // SYNCHRONOUS call — blocks this worker thread until finger or timeout
  const rc = fn_GetImageEx(hFPM, fingerInfo, timeout, null, AP_QUALITY_PARAM);
  console.log(`[Worker] GetImageEx rc=${rc} (${errName(rc)})`);

  if (rc === 54) return { success: false, code: "TIMEOUT",     message: "No finger detected. Try again." };
  if (rc !== 0)  return { success: false, code: errName(rc),   message: `Capture failed: ${errName(rc)} (${rc})` };

  // Quality
  const qualOut = [0];
  fn_GetImageQuality(hFPM, deviceWidth, deviceHeight, imageBuffer, qualOut);
  const quality = qualOut[0];
  console.log(`[Worker] Quality: ${quality}%`);

  // Template — fresh fingerInfo so pBuffer is clean
  const fingerInfoT = {
    ImageWidth: deviceWidth, ImageHeight: deviceHeight,
    Resolution: DPI, FingerNumber: 0,
    Reserved1: 0, Reserved2: 0,
    pBuffer: imageBuffer,
  };
  const fmdBuf = Buffer.alloc(FMD_BUFFER_LEN, 0);
  const trc = fn_CreateTemplate(hFPM, fingerInfoT, fmdBuf);
  if (trc !== 0) {
    return { success: false, code: errName(trc),
             message: `Template extraction failed: ${errName(trc)} (${trc}). Press firmly and evenly.` };
  }

  return { success: true, template: fmdBuf.toString("base64"), quality };
}

// ── Retry loop (runs entirely in the worker — blocking between attempts is OK) ─
function captureWithRetry({ timeout = 12000, minQuality = 65, maxAttempts = 5 } = {}) {
  let best = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (cancelFlag) return { success: false, code: "CANCELLED", message: "Cancelled." };

    if (attempt > 1) {
      // Brief synchronous pause so the user can lift their finger
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200);
      if (cancelFlag) return { success: false, code: "CANCELLED", message: "Cancelled." };
      parentPort.postMessage({
        type: "status",
        message: `Attempt ${attempt}/${maxAttempts} — place your finger firmly on the scanner...`,
        attempt, maxAttempts, quality: null,
      });
    }

    const result = captureOnce(timeout);

    if (!result.success) return result; // timeout / device error — bubble up

    if (!best || result.quality > best.quality) best = result;
    if (cancelFlag) return { success: false, code: "CANCELLED", message: "Cancelled." };

    if (result.quality >= minQuality) return result;

    if (attempt < maxAttempts) {
      const tip = result.quality < 30
        ? "Very low quality — clean the sensor and press firmly"
        : result.quality < 50
          ? "Low quality — press with the centre of your fingertip"
          : "Almost there — try pressing slightly harder or a different angle";
      parentPort.postMessage({
        type: "status",
        message: `Quality ${result.quality}% — ${tip}. Lift and try again...`,
        attempt, maxAttempts, quality: result.quality,
      });
    }
  }

  // Return best result even if below threshold rather than failing completely
  if (best && best.quality > 0) {
    return { ...best, warning: `Best quality was ${best.quality}% after ${maxAttempts} attempts.` };
  }
  return { success: false, code: "LOW_QUALITY",
           message: `Could not get a good quality scan after ${maxAttempts} attempts. Clean the sensor and try again.` };
}

// ── Message handler ───────────────────────────────────────────────────────────
parentPort.on("message", (msg) => {
  switch (msg.type) {
    case "capture":
      cancelFlag = false;
      parentPort.postMessage({
        type: "status",
        message: "Place your thumb firmly on the scanner...",
        attempt: 1, maxAttempts: msg.maxAttempts ?? 5, quality: null,
      });
      {
        const result = captureWithRetry({
          timeout:     msg.timeout     ?? 12000,
          minQuality:  msg.minQuality  ?? 65,
          maxAttempts: msg.maxAttempts ?? 5,
        });
        if (result.success) {
          parentPort.postMessage({
            type: "captured",
            template: result.template,
            quality:  result.quality,
            warning:  result.warning ?? null,
          });
        } else {
          parentPort.postMessage({
            type: "capture_error",
            code: result.code,
            message: result.message,
          });
        }
      }
      break;

    case "cancel":
      cancelFlag = true;
      break;

    case "health":
      parentPort.postMessage({
        type: "health_result",
        device_connected: isDeviceConnected(),
        sdk_version:  "SecuGen U20-AP (SDK id 17) via SGFPLIB",
        device_info:  (() => { try { const d = makeDeviceInfo(); fn_GetDeviceInfo(hFPM, d); return d; } catch { return null; } })(),
      });
      break;

    case "match": {
      const buf1 = Buffer.from(msg.t1, "base64");
      const buf2 = Buffer.from(msg.t2, "base64");
      const scoreOut = [0];
      const rc = fn_MatchTemplate(hFPM, buf1, buf2, scoreOut);
      const score = rc === 0 ? scoreOut[0] : 0;
      parentPort.postMessage({ type: "match_result", matched: score >= MATCH_THRESHOLD, score, error: rc !== 0 ? errName(rc) : null });
      break;
    }
  }
});

// ── Startup ───────────────────────────────────────────────────────────────────
try {
  initDevice();
  parentPort.postMessage({ type: "sdk_ready", mode: "hardware", deviceWidth, deviceHeight });
} catch (err) {
  parentPort.postMessage({ type: "sdk_error", message: err.message });
}

process.on("exit", () => {
  if (hFPM) try { fn_CloseDevice(hFPM); } catch {}
});
