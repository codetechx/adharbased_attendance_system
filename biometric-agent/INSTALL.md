# Biometric Agent — SecuGen HU20-AP Setup

**Device: SecuGen HU20-AP** (Hamster Pro 20 with Auto-Placement)

This agent runs **locally on your Windows PC** (not in Docker).
It bridges the fingerprint device to the web app via WebSocket.

---

## Requirements

| Item | Detail |
|------|--------|
| Device | SecuGen **HU20-AP** (Hamster Pro 20 Auto-Placement) |
| OS | Windows 10 / 11 (64-bit) |
| Node.js | v18 or newer |
| SecuGen FDx SDK | Installs `SGFPLIB.dll` into System32 |

---

## Step 1 — Install SecuGen FDx SDK

1. Go to: **https://secugen.com/download-sdk/**
2. Download **FDx SDK Pro for Windows** (supports HU20 / Hamster Pro 20 series)
3. Run the installer as **Administrator**
4. The installer puts `SGFPLIB.dll` into `C:\Windows\System32\` automatically
5. Restart your PC if prompted

> **Note:** The SDK also installs the USB driver for the HU20-AP.
> After install, plug the device in — Windows should show
> **"SecuGen Hamster Pro 20"** in Device Manager → Biometric Devices.

### About the HU20-AP Auto-Placement feature
The `-AP` suffix means the device has a **proximity sensor and LED ring**.
The LED automatically lights up when a finger approaches the platen.
You do **not** need to do anything special in software — the SDK handles
this transparently. Just call capture and tell the worker to place their thumb.

---

## Step 2 — Verify Device is Recognized

1. Open **Device Manager** → expand **Biometric devices**
2. You should see: `SecuGen Hamster Pro 20`
3. If there's a yellow warning icon, reinstall the SDK driver

---

## Step 3 — Install Node.js (if not already installed)

Download from: **https://nodejs.org** (LTS version)

Verify:
```
node --version   # should be v18+
npm --version
```

---

## Step 4 — Install Agent Dependencies

Open a **Command Prompt** or **PowerShell** in this folder:

```cmd
cd C:\Users\sdmal\projects\attendance_system\biometric-agent
npm install
```

This installs `koffi` (the native FFI library that calls SGFPLIB.dll).

---

## Step 5 — Start the Agent

```cmd
npm start
```

Expected output:
```
╔══════════════════════════════════════════════════════╗
║       AMS Biometric Agent — SecuGen Hamster Pro 20   ║
╠══════════════════════════════════════════════════════╣
║  WebSocket : ws://localhost:12345                    ║
║  Health    : http://localhost:12345/health           ║
║  Mode      : hardware                               ║
╚══════════════════════════════════════════════════════╝

[SecuGen] Device opened. Image: 260×300px @ 500DPI
```

If you see **`Mode: simulation`** instead, the SDK or device is not properly detected. Check Steps 1–3.

---

## Verifying It Works

Open a browser and go to:
```
http://localhost:12345/health
```

You should see:
```json
{
  "status": "ok",
  "mode": "hardware",
  "device": "SecuGen Hamster Pro 20",
  "device_connected": true
}
```

---

## Running as a Windows Service (Production)

To have the agent start automatically with Windows:

### Using PM2

```cmd
npm install -g pm2
pm2 start server.js --name ams-biometric
pm2 startup
pm2 save
```

### Using NSSM (Non-Sucking Service Manager)

1. Download NSSM from https://nssm.cc
2. Run: `nssm install AMS-Biometric`
3. Set path to `node.exe` and script to `server.js`
4. Start the service

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot load SGFPLIB.dll` | Install SecuGen FDx SDK as Administrator |
| `Mode: simulation` | SDK not found or device not plugged in |
| `SGFPM_OpenDevice failed` | Unplug and replug the Hamster Pro 20 |
| `Device not found in Device Manager` | Reinstall SDK driver; try different USB port |
| Browser can't connect to ws://localhost:12345 | Make sure `npm start` is running |
| Firewall blocking port 12345 | Allow port 12345 in Windows Defender Firewall (localhost only) |

---

## How It Works (Architecture)

```
Browser (React)
    │
    │  WebSocket  ws://localhost:12345
    ▼
biometric-agent/server.js   (Node.js — runs on Windows)
    │
    │  koffi FFI  (calls native DLL)
    ▼
SGFPLIB.dll   (SecuGen SDK — installed in System32)
    │
    │  USB
    ▼
SecuGen Hamster Pro 20
```

**Fingerprint template flow:**
1. Gate user opens attendance page in browser
2. Browser connects to agent via WebSocket
3. Agent sends `{ action: "capture" }` to device via SDK
4. Worker places thumb on scanner
5. SDK returns ISO 19794-2 FMD template (400 bytes)
6. Agent sends `{ type: "captured", template: "base64..." }` to browser
7. Browser sends template to Laravel API for identity matching
8. Server compares against stored templates of workers assigned today
9. Match found → gate user confirms IN/OUT
