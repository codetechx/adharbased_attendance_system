/**
 * AttendanceMark — Gate User view
 * Quick fingerprint-based IN/OUT attendance marking.
 */

import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useAuth } from "@/contexts/AuthContext";
import toast from "react-hot-toast";
import { Fingerprint, CheckCircle, XCircle, LogIn, LogOut, AlertTriangle } from "lucide-react";

const WS_URL = import.meta.env.VITE_BIOMETRIC_WS || "ws://localhost:12345";

const PHASE = {
  IDLE:        "idle",
  SCANNING:    "scanning",
  IDENTIFYING: "identifying",
  CONFIRMED:   "confirmed",
  ERROR:       "error",
};

export default function AttendanceMark() {
  const { user }         = useAuth();
  const [phase, setPhase]             = useState(PHASE.IDLE);
  const [agentConnected, setAgent]    = useState(false);
  const [matched, setMatched]         = useState(null); // { worker, assignment_id, pending_type, score }
  const [message, setMessage]         = useState("Connect device and click Scan");
  const wsRef                         = useRef(null);

  const companyId = user?.company_id;

  const connectWs = () => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "connected") { setAgent(true); setMessage("Device ready. Press Scan."); }
    };
    ws.onerror = () => { setAgent(false); setMessage("Cannot reach biometric agent."); };
    ws.onclose = () => setAgent(false);
  };

  const scan = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error("Connect the device first.");
      return;
    }
    setPhase(PHASE.SCANNING);
    setMatched(null);
    setMessage("Place your thumb on the scanner...");

    // Override message handler for one-time capture
    wsRef.current.onmessage = async (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "captured") {
        setPhase(PHASE.IDENTIFYING);
        setMessage("Identifying worker...");

        try {
          const res = await api.post("/attendance/verify", {
            probe_template: msg.template,
            company_id:     companyId,
          });

          const data = res.data;
          if (!data.matched) {
            setPhase(PHASE.ERROR);
            setMessage("No match found. Worker may not be assigned today.");
            return;
          }

          setMatched(data);
          setPhase(PHASE.CONFIRMED);
          setMessage("Worker identified!");

        } catch {
          setPhase(PHASE.ERROR);
          setMessage("Identification failed. Please retry.");
        }

      } else if (msg.type === "error") {
        setPhase(PHASE.ERROR);
        setMessage(msg.message || "Scan failed.");
      }
    };

    wsRef.current.send(JSON.stringify({ action: "capture", minQuality: 40 }));
  };

  const markMutation = useMutation({
    mutationFn: (payload) => api.post("/attendance/mark", payload).then((r) => r.data),
    onSuccess: (data) => {
      toast.success(`${data.log?.worker?.name} — ${matched.pending_type} marked!`, { duration: 5000 });
      setPhase(PHASE.IDLE);
      setMatched(null);
      setMessage("Ready for next scan.");
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Mark failed.");
      setPhase(PHASE.IDLE);
    },
  });

  const handleMark = () => {
    if (!matched) return;
    markMutation.mutate({
      worker_id:         matched.worker.id,
      company_id:        companyId,
      assignment_id:     matched.assignment_id,
      type:              matched.pending_type,
      fingerprint_score: matched.score,
    });
  };

  const reset = () => { setPhase(PHASE.IDLE); setMatched(null); setMessage("Ready. Press Scan."); };

  const ringColor = {
    [PHASE.IDLE]:        "border-gray-200",
    [PHASE.SCANNING]:    "border-brand-400 animate-pulse",
    [PHASE.IDENTIFYING]: "border-yellow-400 animate-pulse",
    [PHASE.CONFIRMED]:   matched?.pending_type === "IN" ? "border-green-400" : "border-blue-400",
    [PHASE.ERROR]:       "border-red-300",
  }[phase];

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Mark</h1>
        <p className="text-gray-500 text-sm mt-1">Fingerprint-based IN/OUT verification</p>
      </div>

      {/* Device status */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 text-sm">
          <span className={`w-2 h-2 rounded-full ${agentConnected ? "bg-green-500" : "bg-gray-300"}`} />
          <span className={agentConnected ? "text-green-700" : "text-gray-500"}>
            {agentConnected ? "Device Connected" : "Not connected"}
          </span>
        </div>
        {!agentConnected && (
          <button className="btn-secondary text-xs py-1" onClick={connectWs}>
            Connect
          </button>
        )}
      </div>

      {/* Fingerprint scanner visual */}
      <div className="card flex flex-col items-center space-y-5 py-10">
        <div className={`w-40 h-40 rounded-full border-4 ${ringColor} flex items-center justify-center bg-gray-50 transition-all`}>
          {phase === PHASE.CONFIRMED && matched?.pending_type === "IN" &&
            <LogIn className="w-20 h-20 text-green-500" />}
          {phase === PHASE.CONFIRMED && matched?.pending_type === "OUT" &&
            <LogOut className="w-20 h-20 text-blue-500" />}
          {phase === PHASE.ERROR &&
            <XCircle className="w-20 h-20 text-red-400" />}
          {(phase === PHASE.IDLE || phase === PHASE.SCANNING || phase === PHASE.IDENTIFYING) &&
            <Fingerprint className={`w-20 h-20 ${phase === PHASE.IDLE ? "text-gray-200" : "text-brand-400"}`} />}
        </div>

        <p className="text-sm text-center text-gray-600 max-w-xs">{message}</p>

        {/* Identified worker card */}
        {phase === PHASE.CONFIRMED && matched && (
          <div className={`w-full rounded-xl p-4 border-2 ${
            matched.pending_type === "IN"
              ? "bg-green-50 border-green-200"
              : "bg-blue-50 border-blue-200"
          }`}>
            <div className="flex items-center gap-4">
              {matched.worker.photo_url ? (
                <img src={matched.worker.photo_url} alt="" className="w-16 h-16 rounded-lg object-cover" />
              ) : (
                <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                  <span className="text-2xl text-gray-400 font-bold">
                    {matched.worker.name[0]}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <p className="font-bold text-gray-900 text-lg">{matched.worker.name}</p>
                <p className="text-sm text-gray-500">{matched.worker.vendor}</p>
                <p className="text-xs text-gray-400 font-mono">{matched.worker.aadhaar_number_masked}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`badge ${matched.pending_type === "IN" ? "badge-green" : "badge-blue"}`}>
                    Pending: {matched.pending_type}
                  </span>
                  <span className="text-xs text-gray-400">Score: {matched.score}%</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleMark}
                disabled={markMutation.isPending}
                className={`flex-1 btn ${matched.pending_type === "IN" ? "btn-success" : "btn-primary"} justify-center`}
              >
                {markMutation.isPending
                  ? "Marking..."
                  : `Confirm ${matched.pending_type}`}
              </button>
              <button onClick={reset} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase === PHASE.ERROR && (
          <div className="w-full p-3 bg-red-50 rounded-lg border border-red-200 flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{message}</p>
          </div>
        )}
      </div>

      {/* Scan / Reset button */}
      <div className="flex gap-3 justify-center">
        {phase === PHASE.IDLE || phase === PHASE.ERROR ? (
          <button
            onClick={agentConnected ? scan : connectWs}
            className="btn-primary px-8 py-3 text-base"
          >
            <Fingerprint size={20} />
            {agentConnected ? "Scan Fingerprint" : "Connect & Scan"}
          </button>
        ) : phase === PHASE.SCANNING ? (
          <button onClick={reset} className="btn-secondary">
            Cancel Scan
          </button>
        ) : null}
      </div>
    </div>
  );
}
