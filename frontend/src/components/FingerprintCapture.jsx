/**
 * FingerprintCapture Component
 * ─────────────────────────────
 * Connects to the local biometric agent (Node.js running on port 12345)
 * via WebSocket, triggers a fingerprint scan on the SecuGen device,
 * and returns the captured FMD template to the parent.
 *
 * Architecture:
 *   Browser ←─WebSocket─→ biometric-agent/server.js ←─FFI─→ SecuGen SGFPLIB.dll
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Fingerprint, Wifi, WifiOff, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";

const WS_URL = import.meta.env.VITE_BIOMETRIC_WS || "ws://localhost:12345";

const STATUS = {
  DISCONNECTED: "disconnected",
  CONNECTING:   "connecting",
  CONNECTED:    "connected",
  SCANNING:     "scanning",
  SUCCESS:      "success",
  ERROR:        "error",
};

export default function FingerprintCapture({ worker, onCaptured, onSkip }) {
  const [status, setStatus]   = useState(STATUS.DISCONNECTED);
  const [message, setMessage] = useState("Connect to the fingerprint device to begin.");
  const [quality, setQuality] = useState(null);
  const [mode, setMode]       = useState(null); // "hardware" | "simulation"
  const wsRef = useRef(null);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    disconnect();
    setStatus(STATUS.CONNECTING);
    setMessage("Connecting to fingerprint device...");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      // Connected; wait for initial message
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case "connected":
          setStatus(STATUS.CONNECTED);
          setMode(msg.mode);
          setMessage(msg.message || "Device ready. Click Scan to capture fingerprint.");
          break;

        case "status":
          if (msg.device_connected === false) {
            setStatus(STATUS.ERROR);
            setMessage("Fingerprint device not connected. Please plug in the device and retry.");
          } else {
            setMessage(msg.message || "Ready.");
          }
          break;

        case "captured":
          setStatus(STATUS.SUCCESS);
          setQuality(msg.quality);
          setMessage(`Fingerprint captured! Quality: ${msg.quality}%`);
          onCaptured(msg.template, msg.quality);
          break;

        case "cancelled":
          setStatus(STATUS.CONNECTED);
          setMessage("Cancelled. Click Scan to try again.");
          break;

        case "error":
          setStatus(STATUS.ERROR);
          setMessage(msg.message || "Capture failed. Please try again.");
          break;

        default:
          if (msg.message) setMessage(msg.message);
      }
    };

    ws.onerror = () => {
      setStatus(STATUS.ERROR);
      setMessage(
        "Cannot connect to biometric agent. Make sure the agent is running:\n" +
        "  cd biometric-agent\n  npm start"
      );
    };

    ws.onclose = () => {
      if (status !== STATUS.SUCCESS) {
        setStatus(STATUS.DISCONNECTED);
      }
    };
  }, [disconnect, onCaptured, status]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const scan = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setStatus(STATUS.SCANNING);
    setMessage("Place your thumb firmly on the scanner...");
    wsRef.current.send(JSON.stringify({ action: "capture", minQuality: 40 }));
  };

  const cancel = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "cancel" }));
    }
    setStatus(STATUS.CONNECTED);
    setMessage("Cancelled. Click Scan to try again.");
  };

  const ringColor = {
    [STATUS.DISCONNECTED]: "border-gray-200",
    [STATUS.CONNECTING]:   "border-yellow-300",
    [STATUS.CONNECTED]:    "border-brand-400",
    [STATUS.SCANNING]:     "border-brand-500 animate-pulse",
    [STATUS.SUCCESS]:      "border-green-400",
    [STATUS.ERROR]:        "border-red-300",
  }[status];

  const iconColor = {
    [STATUS.DISCONNECTED]: "text-gray-300",
    [STATUS.CONNECTING]:   "text-yellow-400",
    [STATUS.CONNECTED]:    "text-brand-500",
    [STATUS.SCANNING]:     "text-brand-600",
    [STATUS.SUCCESS]:      "text-green-500",
    [STATUS.ERROR]:        "text-red-400",
  }[status];

  return (
    <div className="card space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">Step 3: Fingerprint Enrollment</h2>
          <p className="text-sm text-gray-500 mt-1">Register {worker.name}'s fingerprint using the SecuGen device.</p>
        </div>
        {mode && (
          <span className={`badge ${mode === "simulation" ? "badge-yellow" : "badge-green"}`}>
            {mode === "simulation" ? "Simulation Mode" : "Hardware"}
          </span>
        )}
      </div>

      {/* Connection indicator */}
      <div className="flex items-center gap-2 text-sm">
        {status === STATUS.CONNECTED || status === STATUS.SUCCESS ? (
          <><Wifi size={16} className="text-green-500" /> <span className="text-green-600">Agent connected</span></>
        ) : status === STATUS.CONNECTING ? (
          <><RefreshCw size={16} className="text-yellow-500 animate-spin" /> <span className="text-yellow-600">Connecting...</span></>
        ) : (
          <><WifiOff size={16} className="text-gray-400" /> <span className="text-gray-500">Not connected</span></>
        )}
      </div>

      {/* Fingerprint visual */}
      <div className="flex flex-col items-center space-y-4 py-6">
        <div className={`w-36 h-36 rounded-full border-4 ${ringColor} flex items-center justify-center bg-gray-50 transition-all`}>
          {status === STATUS.SUCCESS
            ? <CheckCircle className="w-20 h-20 text-green-500" />
            : <Fingerprint className={`w-20 h-20 ${iconColor}`} />
          }
        </div>

        <p className="text-sm text-center text-gray-600 max-w-xs whitespace-pre-line">{message}</p>

        {quality && status === STATUS.SUCCESS && (
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 bg-gray-200 rounded-full">
              <div
                className={`h-2 rounded-full ${quality >= 70 ? "bg-green-500" : quality >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                style={{ width: `${quality}%` }}
              />
            </div>
            <span className="text-xs text-gray-600">Quality: {quality}%</span>
          </div>
        )}
      </div>

      {/* Mode notice */}
      {mode === "simulation" && (
        <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-xs text-yellow-700">
          <strong>Simulation Mode:</strong> No real fingerprint device detected. Templates are generated for testing.
          For production, install SecuGen FDx SDK and connect the device before starting the agent.
        </div>
      )}

      {/* Error agent instructions */}
      {status === STATUS.ERROR && (
        <div className="p-4 bg-red-50 rounded-lg border border-red-200 space-y-2">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle size={16} />
            <span className="text-sm font-medium">Could not connect to biometric agent</span>
          </div>
          <div className="text-xs text-red-600 font-mono bg-red-100 rounded p-2">
            cd biometric-agent<br />
            npm install<br />
            npm start
          </div>
          <p className="text-xs text-red-600">Run the agent on the local gate computer, then click Retry.</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {status === STATUS.DISCONNECTED || status === STATUS.ERROR ? (
          <button type="button" onClick={connect} className="btn-primary">
            <Wifi size={16} />
            Connect to Agent
          </button>
        ) : status === STATUS.CONNECTED ? (
          <button type="button" onClick={scan} className="btn-primary">
            <Fingerprint size={16} />
            Scan Fingerprint
          </button>
        ) : status === STATUS.SCANNING ? (
          <button type="button" onClick={cancel} className="btn-secondary">
            Cancel
          </button>
        ) : status === STATUS.SUCCESS ? (
          <button type="button" onClick={scan} className="btn-secondary">
            <RefreshCw size={16} />
            Re-scan
          </button>
        ) : null}

        <button type="button" onClick={onSkip} className="btn-secondary">
          Skip for Now
        </button>
      </div>
    </div>
  );
}
