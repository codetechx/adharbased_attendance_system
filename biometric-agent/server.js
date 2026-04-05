/**
 * AMS Biometric Agent — SecuGen Hamster Pro 20
 * ─────────────────────────────────────────────
 * Runs locally on Windows.
 * Browser connects via WebSocket at ws://localhost:12345
 *
 * Protocol:
 *   Client → Agent : { action: "capture" | "status" | "cancel", ... }
 *   Agent → Client : { type: "connected"|"captured"|"status"|"error"|"cancelled", ... }
 */

"use strict";

const { WebSocketServer } = require("ws");
const http = require("http");

const PORT = 12345;
const ALLOWED_ORIGINS = [
  "http://localhost",
  "http://localhost:5173",
  "http://localhost:80",
  "http://127.0.0.1:5173",
];

// ── Load SecuGen bridge ────────────────────────────────────────────────────────
let sg = null;
let mode = "simulation";

try {
  sg = require("./secugen-bridge");
  mode = "hardware";
  console.log("[Agent] SecuGen Hamster Pro 20 SDK loaded successfully.");
} catch (err) {
  console.warn("[Agent] SecuGen SDK not available:", err.message);
  console.warn("[Agent] Running in SIMULATION mode — fingerprints will be fake.");
  console.warn("[Agent] To use real device: install SecuGen FDx SDK and reconnect the device.");
}

// ── HTTP server (health endpoint) ─────────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.url === "/health") {
    const info = mode === "hardware" ? sg.getDeviceInfo?.() : null;
    res.writeHead(200);
    res.end(JSON.stringify({
      status:           "ok",
      mode,
      device:           "SecuGen Hamster Pro 20",
      device_connected: mode === "hardware" ? sg.isDeviceConnected() : false,
      sdk_version:      mode === "hardware" ? sg.getVersion() : null,
      device_info:      info,
    }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

// ── WebSocket server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: ({ origin }, done) => {
    // In production: restrict to only localhost origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      done(true);
    } else {
      console.warn(`[Agent] Rejected connection from: ${origin}`);
      done(false, 403, "Forbidden");
    }
  },
});

// Active capture cancellation flag per connection
const cancelFlags = new WeakMap();

wss.on("connection", (ws, req) => {
  console.log(`[Agent] Client connected (${mode} mode)`);
  cancelFlags.set(ws, false);

  const info = mode === "hardware" ? sg.getDeviceInfo?.() : null;

  ws.send(JSON.stringify({
    type:    "connected",
    mode,
    device:  "SecuGen Hamster Pro 20",
    message: mode === "hardware"
      ? `Device ready (${info?.ImageWidth ?? 260}×${info?.ImageHeight ?? 300}px).`
      : "SIMULATION MODE — no real device. Install SecuGen FDx SDK for production use.",
  }));

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); }
    catch { ws.send(JSON.stringify({ type: "error", message: "Invalid JSON." })); return; }

    console.log(`[Agent] Action: ${msg.action}`);

    switch (msg.action) {
      case "capture":
        cancelFlags.set(ws, false);
        await handleCapture(ws, msg);
        break;

      case "status":
        handleStatus(ws);
        break;

      case "cancel":
        cancelFlags.set(ws, true);
        ws.send(JSON.stringify({ type: "cancelled", message: "Capture cancelled." }));
        break;

      default:
        ws.send(JSON.stringify({ type: "error", message: `Unknown action: ${msg.action}` }));
    }
  });

  ws.on("close", () => console.log("[Agent] Client disconnected."));
  ws.on("error", (e) => console.error("[Agent] WS error:", e.message));
});

// ── Capture handler ───────────────────────────────────────────────────────────
async function handleCapture(ws, msg) {
  const timeout    = msg.timeout    ?? 12000;
  const minQuality = msg.minQuality ?? 40;

  safeSend(ws, {
    type:    "status",
    message: "Place your thumb firmly on the Hamster Pro 20 scanner...",
  });

  try {
    let result;

    if (mode === "hardware") {
      result = await sg.captureFingerprint({ timeout, minQuality });
    } else {
      result = await simulateCapture();
    }

    if (cancelFlags.get(ws)) return; // user cancelled while scanning

    if (!result.success) {
      safeSend(ws, {
        type:    "error",
        code:    result.code ?? "CAPTURE_FAILED",
        message: result.message ?? "Fingerprint capture failed. Please try again.",
      });
      return;
    }

    safeSend(ws, {
      type:     "captured",
      template: result.template,    // base64 ISO 19794-2 FMD
      quality:  result.quality,     // 0–100 quality score
      message:  `Captured! Quality: ${result.quality}%`,
    });

  } catch (err) {
    console.error("[Agent] Capture error:", err);
    safeSend(ws, { type: "error", message: "Unexpected error: " + err.message });
  }
}

function handleStatus(ws) {
  const connected = mode === "hardware" ? sg.isDeviceConnected() : false;
  safeSend(ws, {
    type:             "status",
    mode,
    device_connected: connected,
    device:           "SecuGen Hamster Pro 20",
    sdk_version:      mode === "hardware" ? sg.getVersion() : null,
  });
}

function safeSend(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// ── Development simulation ─────────────────────────────────────────────────────
async function simulateCapture() {
  await new Promise((r) => setTimeout(r, 2000)); // simulate device delay

  // Generate a repeatable fake template (same base bytes, small random salt)
  // NOT a real fingerprint — only for UI/flow testing
  const base = Buffer.alloc(400, 0x42);
  const salt = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) salt[i] = Math.floor(Math.random() * 256);
  salt.copy(base, 384);

  return {
    success:  true,
    template: base.toString("base64"),
    quality:  Math.floor(Math.random() * 20) + 75, // 75–95
  };
}

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, "127.0.0.1", () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║       AMS Biometric Agent — SecuGen Hamster Pro 20   ║
╠══════════════════════════════════════════════════════╣
║  WebSocket : ws://localhost:${PORT}                    ║
║  Health    : http://localhost:${PORT}/health           ║
║  Mode      : ${mode.padEnd(38)}║
╚══════════════════════════════════════════════════════╝
`);

  if (mode === "simulation") {
    console.log("  To use the real Hamster Pro 20:");
    console.log("  1. Download SecuGen FDx SDK: https://secugen.com/download-sdk/");
    console.log("  2. Install it (puts SGFPLIB.dll into System32)");
    console.log("  3. Keep Hamster Pro 20 connected via USB");
    console.log("  4. Restart this agent: npm start");
  }
});
