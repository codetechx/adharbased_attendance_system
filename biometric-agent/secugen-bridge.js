/**
 * SecuGen HU20-AP (Hamster Pro 20 with Auto-Placement) — SGFPLIB Bridge
 * ────────────────────────────────────────────────────────────────────────
 * Calls SGFPLIB.dll via koffi (native FFI, no rebuild needed).
 *
 * Device  : SecuGen U20-AP / Hamster Pro 20 Auto-On
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
 * U20-AP sensor specs:
 *   Image size : 300 × 400 pixels
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
const path  = require("path");
const fs    = require("fs");

// ─── Device constants (from SGFPLIB.h) ───────────────────────────────────────
const SG_DEV_AUTO  = 0;   // auto-detect
const SG_DEV_U20AP = 17;  // detected SDK id for SecuGen U20-AP WUDF

// ─── Template format (SGFPLIB.h TEMPLATE_FORMAT enum) ────────────────────────
// SG400 = fixed 400-byte proprietary format — simplest, no size guessing needed.
const TEMPLATE_FORMAT_SG400 = 0x0200;

// ─── U20-AP sensor specs ───────────────────────────────────────────────────────
const IMAGE_WIDTH    = 300;   // pixels
const IMAGE_HEIGHT   = 400;   // pixels
const DPI            = 500;   // sensor DPI
// SG400 template is exactly 400 bytes.
const FMD_BUFFER_LEN = 400;

// For AP devices: nQuality MUST be 0 — AP hardware triggers the image capture.
// Setting nQuality > 0 enables SDK-side quality-retry loop which interferes
// with the proximity sensor and causes capture to fail or behave erratically.
const AP_QUALITY_PARAM = 0;

// SecuGen match score range: 0–200 (0 = no match).
// Score ≥ 40 is the vendor-recommended threshold for general applications.
const MATCH_THRESHOLD = 40;

// ─── Error codes — FDx SDK Pro v4.3.1 (from sgfplib.h) ──────────────────────
const ERR = {
  // General errors (0–9)
  0:   "SGFDX_ERROR_NONE",
  1:   "SGFDX_ERROR_CREATION_FAILED",
  2:   "SGFDX_ERROR_FUNCTION_FAILED",
  3:   "SGFDX_ERROR_INVALID_PARAM",
  4:   "SGFDX_ERROR_NOT_USED",
  5:   "SGFDX_ERROR_DLLLOAD_FAILED",
  6:   "SGFDX_ERROR_DLLLOAD_FAILED_DRV",
  7:   "SGFDX_ERROR_DLLLOAD_FAILED_ALGO",
  8:   "SGFDX_ERROR_NO_LONGER_SUPPORTED",
  9:   "SGFDX_ERROR_DLLLOAD_FAILED_WSQ",
  // Device errors (51–63)
  51:  "SGFDX_ERROR_SYSLOAD_FAILED",
  52:  "SGFDX_ERROR_INITIALIZE_FAILED",
  53:  "SGFDX_ERROR_LINE_DROPPED",
  54:  "SGFDX_ERROR_TIME_OUT",
  55:  "SGFDX_ERROR_DEVICE_NOT_FOUND",
  56:  "SGFDX_ERROR_DRVLOAD_FAILED",
  57:  "SGFDX_ERROR_WRONG_IMAGE",
  58:  "SGFDX_ERROR_LACK_OF_BANDWIDTH",
  59:  "SGFDX_ERROR_DEV_ALREADY_OPEN",
  60:  "SGFDX_ERROR_GETSN_FAILED",
  61:  "SGFDX_ERROR_UNSUPPORTED_DEV",
  62:  "SGFDX_ERROR_FAKE_FINGER",
  63:  "SGFDX_ERROR_FAKE_INITIALIZE_FAILED",
  // Algorithm errors (101–106)
  101: "SGFDX_ERROR_FEAT_NUMBER",          // too few minutiae in image
  102: "SGFDX_ERROR_INVALID_TEMPLATE_TYPE",
  103: "SGFDX_ERROR_INVALID_TEMPLATE1",
  104: "SGFDX_ERROR_INVALID_TEMPLATE2",
  105: "SGFDX_ERROR_EXTRACT_FAIL",         // minutiae extraction failed (poor image)
  106: "SGFDX_ERROR_MATCH_FAIL",
  // Image error
  600: "SGFDX_ERROR_NO_IMAGE",
  // License errors (501–504)
  501: "SGFDX_ERROR_LICENSE_LOAD",
  502: "SGFDX_ERROR_LICENSE_KEY",
  503: "SGFDX_ERROR_LICENSE_EXPIRED",
  504: "SGFDX_ERROR_LICENSE_WRITE",
};

const errName = (code) => ERR[code] ?? `UNKNOWN_ERROR_${code}`;

// ─── Load DLL and bind functions ──────────────────────────────────────────────
let fn_Create, fn_Init, fn_OpenDevice, fn_CloseDevice;
let fn_GetImageEx, fn_GetImageQuality, fn_CreateTemplate, fn_MatchTemplate;
let fn_GetDeviceInfo, fn_SetTemplateFormat;

// SDK installs sgfplib.dll into its own folder, not System32.
// Use forward slashes — koffi requires them on Windows.
const DLL_PATHS = [
  "D:/drivers/FDx_SDK_Pro_Windows_v4.3.1_J1.21/FDx_SDK_Pro_Windows_v4.3.1_J1.21/FDx SDK Pro for Windows v4.3.1/bin/x64/sgfplib.dll",
  "C:/Program Files/SecuGen/SgiBioSrv/sgfplib.dll",          // SDK default install path
  "SGFPLIB.dll",                                              // System32 (if user copied it)
  "C:/Windows/System32/SGFPLIB.dll",
  "C:/Windows/SysWOW64/SGFPLIB.dll",
];

// Known locations for per-device driver DLLs and model/license files.
// SGFPM_Init tries to LoadLibrary the device-specific driver at runtime;
// that DLL in turn looks for its .dat model file alongside itself.
// Adding these dirs to PATH before loading ensures Windows finds them.
const SDK_EXTRA_DIRS = [
  "D:\\drivers\\FDx_SDK_Pro_Windows_v4.3.1_J1.21\\FDx_SDK_Pro_Windows_v4.3.1_J1.21\\FDx SDK Pro for Windows v4.3.1\\bin\\x64",
  "C:\\Program Files\\SecuGen\\SgiBioSrv",
  "C:\\Program Files\\SecuGen\\Drivers\\U20AP",
  "C:\\Program Files\\SecuGen\\Drivers\\HU20A",   // sgfdu08x64.dll + *.dat + *.lic
  "C:\\Program Files\\SecuGen\\Drivers\\HU20",
];

// Prepend SDK dirs to PATH so dependent DLLs are found at load time.
// Must run BEFORE koffi.load so that Windows DLL loader already has the path.
(function primeSearchPath() {
  const cur = process.env.PATH || "";
  const toAdd = SDK_EXTRA_DIRS.filter(d => !cur.includes(d)).reverse();
  if (toAdd.length) process.env.PATH = toAdd.join(";") + ";" + cur;
})();

// Track which path was successfully loaded so we can chdir to its folder
let loadedDllDir = null;

function loadSgLib() {
  for (const p of DLL_PATHS) {
    try {
      const abs = path.resolve(p.replace(/\//g, path.sep));
      if (fs.existsSync(abs)) {
        // Chdir to the DLL's folder so the SDK finds its data files via
        // relative paths (e.g. "sgfpamx.dll", "sgfdu08mlp.dat").
        loadedDllDir = path.dirname(abs);
        const origCwd = process.cwd();
        process.chdir(loadedDllDir);
        try {
          const lib = koffi.load(abs);
          console.log(`[SecuGen] Loaded DLL from: ${abs} (CWD=${loadedDllDir})`);
          return lib;
        } finally {
          process.chdir(origCwd); // restore immediately; chdir again in initDevice
        }
      }
    } catch {}
  }
  // Last-ditch: try bare name (must be on PATH/System32)
  for (const p of ["SGFPLIB.dll", "C:/Windows/System32/SGFPLIB.dll"]) {
    try {
      const lib = koffi.load(p);
      loadedDllDir = null;
      console.log(`[SecuGen] Loaded DLL (system): ${p}`);
      return lib;
    } catch {}
  }
  throw new Error("sgfplib.dll not found in any known location: " + DLL_PATHS.join(", "));
}

try {
  const lib = loadSgLib();

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
  // Must use koffi.out(koffi.pointer(...)) — bare "void **" returns a null handle.
  fn_Create = lib.func("SGFPM_Create", "uint32", [koffi.out(koffi.pointer("void *"))]);

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
  //
  // Do NOT use koffi.inout here. inout makes koffi copy the struct before
  // the async call; the copy loses the nested pBuffer pointer, causing the
  // SDK to receive pBuffer=NULL → INVALID_PARAM (2). imageBuffer is a JS
  // Buffer (reference type), so the SDK writes image data into it directly
  // through the pointer without needing inout on the struct wrapper.
  fn_GetImageEx = lib.func("SGFPM_GetImageEx", "uint32",
    ["void *", koffi.pointer("SGFingerInfo"), "uint32", "void *", "uint32"]);

  // DWORD SGFPM_GetImageQuality(HSGFPM *hFPM, DWORD nWidth, DWORD nHeight,
  //   BYTE *pBuffer, DWORD *pQuality)
  // pQuality is an output DWORD* — use koffi.out so koffi writes the value
  // back into the JS array element after the call.
  fn_GetImageQuality = lib.func("SGFPM_GetImageQuality", "uint32",
    ["void *", "uint32", "uint32",
     koffi.pointer("uint8"),        // pBuffer (image data, input)
     koffi.out(koffi.pointer("uint32")),  // pQuality (output)
    ]);

  // DWORD SGFPM_CreateTemplate(HSGFPM *hFPM, SGFingerInfo *pFingerInfo,
  //   BYTE *pMinutiae)
  // Plain pointer — no inout needed; we rebuild fingerInfo fresh before this call.
  fn_CreateTemplate = lib.func("SGFPM_CreateTemplate", "uint32",
    ["void *", koffi.pointer("SGFingerInfo"), koffi.pointer("uint8")]);

  // DWORD SGFPM_MatchTemplate(HSGFPM *hFPM, BYTE *pMinutiae1,
  //   BYTE *pMinutiae2, DWORD *pScore)
  // pScore is an output DWORD* — use koffi.out so the value is written back.
  fn_MatchTemplate = lib.func("SGFPM_MatchTemplate", "uint32",
    ["void *",
     koffi.pointer("uint8"),             // pMinutiae1
     koffi.pointer("uint8"),             // pMinutiae2
     koffi.out(koffi.pointer("uint32")), // pScore (output)
    ]);

  // DWORD SGFPM_GetDeviceInfo(HSGFPM *hFPM, SGDeviceInfoParam *pDeviceInfo)
  // pDeviceInfo is a pre-allocated struct filled by the SDK — use inout.
  fn_GetDeviceInfo = lib.func("SGFPM_GetDeviceInfo", "uint32",
    ["void *", koffi.inout(koffi.pointer("SGDeviceInfoParam"))]);

  // DWORD SGFPM_SetTemplateFormat(HSGFPM *hFPM, WORD format)
  // Must be called after OpenDevice. Default is ANSI378 (variable size).
  // We use SG400 (0x0200) = fixed 400-byte format — simpler buffer management.
  fn_SetTemplateFormat = lib.func("SGFPM_SetTemplateFormat", "uint32",
    ["void *", "uint16"]);

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

function makeDeviceInfo() {
  return {
    DeviceID: 0, ComPort: 0, BaudRate: 0,
    ImageWidth: 0, ImageHeight: 0,
    Contrast: 0, Brightness: 0, Gain: 0,
    ImageDPI: 0, FWVersion: 0,
  };
}

function normalizeDeviceInfo(devInfo) {
  if (
    devInfo &&
    devInfo.ImageWidth > 0 &&
    devInfo.ImageWidth <= 1000 &&
    devInfo.ImageHeight > 0 &&
    devInfo.ImageHeight <= 1000
  ) {
    return devInfo;
  }

  return {
    DeviceID: devInfo?.DeviceID ?? 0,
    ComPort: 0,
    BaudRate: 0,
    ImageWidth: deviceWidth,
    ImageHeight: deviceHeight,
    Contrast: 0,
    Brightness: 0,
    Gain: 0,
    ImageDPI: DPI,
    FWVersion: 0,
  };
}

// ─── Initialize device ────────────────────────────────────────────────────────
function initDevice() {
  // SGFPM_Create: SDK allocates the handle and returns it via void**
  const pHandle = [null];
  let rc = fn_Create(pHandle);
  if (rc !== 0) throw new Error(`SGFPM_Create failed: ${errName(rc)} (${rc})`);
  hFPM = pHandle[0];

  // ── SGFPM_Init needs the SDK data files (sgfpamx.dat, licence) ──────────
  // These live in the same directory as sgfplib.dll.
  // The SDK looks for them relative to the current working directory or its
  // install dir. We chdir to the DLL folder to guarantee it can find them.
  const origCwd = process.cwd();
  if (loadedDllDir) {
    try { process.chdir(loadedDllDir); } catch {}
    // Also add SDK and driver dirs to PATH so any further DLL loads succeed
    const driverDir = "C:\\Program Files\\SecuGen\\Drivers\\HU20A";
    const sdkDir    = loadedDllDir;
    for (const d of [driverDir, sdkDir]) {
      if (process.env.PATH && !process.env.PATH.includes(d)) {
        process.env.PATH = d + ";" + process.env.PATH;
      }
    }
    console.log(`[SecuGen] CWD set to SDK dir: ${loadedDllDir}`);
  }

  try {
    // SGFPM_Init: tell the SDK which device type to expect
    rc = fn_Init(hFPM, SG_DEV_U20AP);
    if (rc !== 0) {
      console.warn(`[SecuGen] U20-AP init failed (${errName(rc)}), trying auto-detect...`);
      rc = fn_Init(hFPM, SG_DEV_AUTO);
      if (rc !== 0) throw new Error(`SGFPM_Init failed: ${errName(rc)} (${rc})`);
    }
  } finally {
    // Restore original CWD regardless of success or failure
    try { process.chdir(origCwd); } catch {}
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

  // Set template format to SG400 (fixed 400-byte proprietary).
  // Default is ANSI378 (variable size) — SG400 keeps buffer management simple.
  fn_SetTemplateFormat(hFPM, TEMPLATE_FORMAT_SG400);

  // Query actual image dimensions from the live device
  // SGDeviceInfoParam is passed as inout — SDK fills it.
  const devInfo = makeDeviceInfo();
  rc = fn_GetDeviceInfo(hFPM, devInfo);
  if (
    rc === 0 &&
    devInfo.ImageWidth > 0 &&
    devInfo.ImageWidth <= 1000 &&
    devInfo.ImageHeight > 0 &&
    devInfo.ImageHeight <= 1000
  ) {
    deviceWidth  = devInfo.ImageWidth;
    deviceHeight = devInfo.ImageHeight;
    console.log(
      `[SecuGen] U20-AP ready — ` +
      `${deviceWidth}×${deviceHeight}px @ ${devInfo.ImageDPI}DPI  ` +
      `FW:${devInfo.FWVersion}`
    );
  } else {
    console.log(`[SecuGen] U20-AP ready — using default ${deviceWidth}×${deviceHeight}px`);
  }
}

// Run init on module load — throws if device/SDK not available
// server.js catches the error and falls back to simulation mode
initDevice();

// ─── Single raw capture (one finger placement) ────────────────────────────────
// Returns { success, template, quality } or { success: false, code, message }.
// IMPORTANT: SGFPM_GetImageEx BLOCKS until a finger is placed or timeout.
// We use fn_GetImageEx.async() so koffi runs it in a thread pool, keeping
// the Node.js event loop free to handle WebSocket messages (e.g. cancel).
async function captureOnce(timeout) {
  // Use koffi.alloc for the image buffer.
  // JS Buffers (Buffer.alloc) can be moved by V8's GC during an async FFI call,
  // making the pointer stored in SGFingerInfo.pBuffer stale → FUNCTION_FAILED (2).
  // koffi.alloc returns native heap memory whose address is guaranteed stable.
  const imageMem = koffi.alloc("uint8", deviceWidth * deviceHeight);

  try {
    const fingerInfo = {
      ImageWidth:   deviceWidth,
      ImageHeight:  deviceHeight,
      Resolution:   DPI,
      FingerNumber: 0,
      Reserved1:    0,
      Reserved2:    0,
      pBuffer:      imageMem,
    };

    let rc;
    try {
      rc = await new Promise((resolve, reject) => {
        fn_GetImageEx.async(hFPM, fingerInfo, timeout, null, AP_QUALITY_PARAM,
          (err, result) => { err ? reject(err) : resolve(result); });
      });
    } catch (err) {
      return { success: false, code: "FFI_ERROR", message: err.message };
    }

    if (rc === 54) {
      return { success: false, code: "TIMEOUT", message: "No finger detected. Please try again." };
    }
    if (rc !== 0) {
      console.warn(`[SecuGen] GetImageEx failed: ${errName(rc)} (${rc})`);
      return { success: false, code: errName(rc), message: `Capture failed: ${errName(rc)} (${rc})` };
    }

    // Measure quality — imageMem is the same native pointer the SDK wrote into
    const qualityOut = [0];
    fn_GetImageQuality(hFPM, deviceWidth, deviceHeight, imageMem, qualityOut);
    const quality = qualityOut[0];
    console.log(`[SecuGen] Capture quality: ${quality}%`);

    // Build template using the same native image memory
    const fingerInfoForTemplate = {
      ImageWidth: deviceWidth, ImageHeight: deviceHeight,
      Resolution: DPI, FingerNumber: 0,
      Reserved1: 0, Reserved2: 0,
      pBuffer: imageMem,
    };
    const fmdBuffer = Buffer.alloc(FMD_BUFFER_LEN, 0);
    rc = fn_CreateTemplate(hFPM, fingerInfoForTemplate, fmdBuffer);
    if (rc !== 0) {
      return {
        success: false,
        code:    errName(rc),
        message: `Template extraction failed: ${errName(rc)} (${rc}). Press firmly and evenly.`,
      };
    }

    return {
      success:  true,
      template: fmdBuffer.toString("base64"),
      quality,
    };
  } finally {
    koffi.free(imageMem); // Always release native memory
  }
}

// ─── Capture fingerprint with quality-retry loop ──────────────────────────────
//
// Keeps scanning until quality ≥ minQuality or maxAttempts is exhausted —
// exactly like Android fingerprint enrollment.
//
// onStatus(msg, attempt, maxAttempts, quality?) — called between attempts so
//   the caller can push live feedback to the UI.
// shouldCancel() — checked between attempts; return true to abort.
//
async function captureFingerprint({
  timeout     = 12000,
  minQuality  = 65,
  maxAttempts = 5,
  onStatus,
  shouldCancel,
} = {}) {
  if (!hFPM) return { success: false, code: "NOT_INITIALIZED", message: "Device not initialized." };

  let best = null;   // track best result across attempts

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Between attempts: brief pause so the user can lift their finger, then prompt
    if (attempt > 1) {
      await new Promise(r => setTimeout(r, 1200));
      if (shouldCancel?.()) return { success: false, code: "CANCELLED", message: "Cancelled." };
      onStatus?.(`Attempt ${attempt}/${maxAttempts} — place your finger firmly on the scanner...`, attempt, maxAttempts, null);
    }

    const result = await captureOnce(timeout);

    // Non-quality failures (TIMEOUT, FFI error, etc.) bubble up immediately
    if (!result.success) return result;

    // Check for cancel after blocking call returns
    if (shouldCancel?.()) return { success: false, code: "CANCELLED", message: "Cancelled." };

    // Track best quality across attempts
    if (!best || result.quality > best.quality) best = result;

    console.log(`[SecuGen] Attempt ${attempt}/${maxAttempts} — quality ${result.quality}%`);

    if (result.quality >= minQuality) {
      // Good enough — done
      return result;
    }

    // Not good enough — give user feedback before next attempt
    if (attempt < maxAttempts) {
      const tip = result.quality < 30
        ? "Very low quality — clean the sensor and press firmly"
        : result.quality < 50
          ? "Low quality — press with the centre of your fingertip"
          : "Almost there — try pressing slightly harder or from a different angle";
      onStatus?.(
        `Quality ${result.quality}% — ${tip}. Lift finger and try again...`,
        attempt, maxAttempts, result.quality,
      );
    }
  }

  // All attempts exhausted
  if (best && best.quality > 0) {
    // Return the best we got with a warning rather than failing entirely
    return {
      ...best,
      warning: `Best quality was ${best.quality}% after ${maxAttempts} attempts.`,
    };
  }

  return {
    success: false,
    code:    "LOW_QUALITY",
    message: `Could not get a good quality scan after ${maxAttempts} attempts. Clean the sensor and try again.`,
  };
}

// ─── Match two FMD templates ──────────────────────────────────────────────────
// SecuGen match score is 0–200. Score ≥ 40 = match (SDK recommendation).
// Returns { matched: bool, score: number (0-200) }
function matchTemplates(template1Base64, template2Base64) {
  if (!hFPM) return { matched: false, score: 0 };

  const buf1 = Buffer.from(template1Base64, "base64");
  const buf2 = Buffer.from(template2Base64, "base64");

  // koffi.out(pointer) pattern: pass a one-element array; koffi writes back.
  const scoreOut = [0];
  const rc = fn_MatchTemplate(hFPM, buf1, buf2, scoreOut);
  if (rc !== 0) return { matched: false, score: 0, error: errName(rc) };

  const score = scoreOut[0];
  return { matched: score >= MATCH_THRESHOLD, score };
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function isDeviceConnected() {
  if (!hFPM) return false;
  // Ask the SDK — if the USB device has been unplugged, GetDeviceInfo returns
  // a non-zero error code even though the handle still exists.
  try {
    const devInfo = makeDeviceInfo();
    return fn_GetDeviceInfo(hFPM, devInfo) === 0;
  } catch {
    return false;
  }
}

function getDeviceInfo() {
  if (!hFPM) return null;
  try {
    const devInfo = makeDeviceInfo();
    return fn_GetDeviceInfo(hFPM, devInfo) === 0 ? normalizeDeviceInfo(devInfo) : null;
  } catch { return null; }
}

function getVersion() {
  return "SecuGen U20-AP (SDK id 17) via SGFPLIB";
}

// ─── Graceful cleanup ─────────────────────────────────────────────────────────
process.on("exit", () => {
  if (hFPM) {
    try { fn_CloseDevice(hFPM); } catch {}
    // SGFPM_Destroy is not exported by this SDK version — CloseDevice is sufficient
  }
});

module.exports = {
  captureFingerprint,
  matchTemplates,
  isDeviceConnected,
  getDeviceInfo,
  getVersion,
};
