/**
 * AttendanceMark — fingerprint-based IN/OUT via SecuGen SGIBIOSRV.
 *
 * Flow:
 *   1. Capture probe template  →  POST https://localhost:8443/SGIFPCapture
 *   2. Fetch enrolled workers  →  GET  /api/attendance/worker-templates?company_id=X
 *   3. Match 1:N              →  POST https://localhost:8443/SGIFPVerify  (per worker, parallel)
 *   4. Confirm                →  POST /api/attendance/mark
 */

import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useAuth } from "@/contexts/AuthContext";
import toast from "react-hot-toast";
import {
  Fingerprint, CheckCircle, XCircle, LogIn, LogOut,
  AlertTriangle, RefreshCw, ExternalLink,
} from "lucide-react";

const SGIBIOSRV = "https://localhost:8443";
const MATCH_THRESHOLD = 40; // SecuGen 0–200 scale

const SGI_ERRORS = {
  51:    "Capture failed — try again",
  53:    "Device not found — check USB connection",
  54:    "No finger detected — place finger and try again",
  55:    "Device busy — wait a moment",
  56:    "Poor image quality — clean the sensor",
  63:    "SecuGen service not running",
  10004: "No finger detected — click Scan then immediately place your finger on the device",
};

const PHASE = {
  IDLE:      "idle",
  SCANNING:  "scanning",
  MATCHING:  "matching",
  CONFIRMED: "confirmed",
  ERROR:     "error",
};

async function sgiCapture() {
  const res = await fetch(`${SGIBIOSRV}/SGIFPCapture`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: "Timeout=10000&Quality=50&licstr=&templateFormat=ISO&imageWSQRate=0.75",
  });
  return res.json();
}

async function sgiMatchScore(template1, template2) {
  const body = `template1=${encodeURIComponent(template1)}&template2=${encodeURIComponent(template2)}&licstr=&templateFormat=ISO`;
  const res = await fetch(`${SGIBIOSRV}/SGIMatchScore`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body,
  });
  return res.json();
}

export default function AttendanceMark() {
  const { user } = useAuth();
  const companyId = user?.company_id;

  const [phase, setPhase]     = useState(PHASE.IDLE);
  const [message, setMessage] = useState("Click Scan to begin.");
  const [matched, setMatched] = useState(null);
  const [certError, setCertError] = useState(false);
  const abortRef = useRef(null);

  const scan = async () => {
    setPhase(PHASE.SCANNING);
    setCertError(false);
    setMatched(null);
    setMessage("👇 Place your finger on the scanner NOW and hold it");

    // 1. Capture
    let capture;
    try {
      capture = await sgiCapture();
    } catch (err) {
      setCertError(true);
      setPhase(PHASE.ERROR);
      setMessage("Cannot reach SecuGen service at https://localhost:8443");
      return;
    }

    if (capture.ErrorCode !== 0) {
      setPhase(PHASE.ERROR);
      setMessage(SGI_ERRORS[capture.ErrorCode] ?? `Scanner error ${capture.ErrorCode}`);
      return;
    }
    const probeTemplate = capture.TemplateBase64;

    // 2. Fetch worker templates from backend
    setPhase(PHASE.MATCHING);
    setMessage("Identifying worker…");

    let workers;
    try {
      const res = await api.get("/attendance/worker-templates", {
        params: { company_id: companyId },
      });
      workers = res.data;
    } catch (err) {
      setPhase(PHASE.ERROR);
      setMessage(err.response?.data?.message || "Failed to load worker list. Check your connection.");
      return;
    }

    if (!workers?.length) {
      setPhase(PHASE.ERROR);
      setMessage("No workers found. Ensure at least one vendor is approved for this company and workers have fingerprints enrolled.");
      return;
    }

    // 3. Match probe against all workers via SGIMatchScore (parallel)
    const results = await Promise.all(
      workers.map(async (w) => {
        try {
          const v = await sgiMatchScore(w.template, probeTemplate);
          return { worker: w, score: v.ErrorCode === 0 ? (v.MatchingScore ?? 0) : 0 };
        } catch {
          return { worker: w, score: 0 };
        }
      })
    );

    // 4. Best match above threshold wins
    const best = results.reduce((a, b) => (a.score > b.score ? a : b));

    if (best.score < MATCH_THRESHOLD) {
      setPhase(PHASE.ERROR);
      setMessage("No fingerprint match found. Worker may not be assigned or enrolled.");
      return;
    }

    setMatched({ ...best.worker, score: best.score });
    setPhase(PHASE.CONFIRMED);
    setMessage("Worker identified!");
  };

  const markMutation = useMutation({
    mutationFn: (payload) => api.post("/attendance/mark", payload).then((r) => r.data),
    onSuccess: (data) => {
      toast.success(`${matched?.name} — ${matched?.pending_type} marked!`, { duration: 5000 });
      reset();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || "Mark failed.");
    },
  });

  const handleMark = () => {
    if (!matched) return;
    markMutation.mutate({
      worker_id:         matched.worker_id,
      company_id:        companyId,
      assignment_id:     matched.assignment_id,
      type:              matched.pending_type,
      fingerprint_score: matched.score,
    });
  };

  const reset = () => {
    setPhase(PHASE.IDLE);
    setMatched(null);
    setMessage("Click Scan to begin.");
    setCertError(false);
  };

  const ringColor = {
    [PHASE.IDLE]:      "border-gray-200",
    [PHASE.SCANNING]:  "border-brand-400 animate-pulse",
    [PHASE.MATCHING]:  "border-yellow-400 animate-pulse",
    [PHASE.CONFIRMED]: matched?.pending_type === "IN" ? "border-green-400" : "border-blue-400",
    [PHASE.ERROR]:     "border-red-300",
  }[phase];

  if (!companyId) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="card p-6 flex items-start gap-3">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-gray-900">No company assigned</p>
            <p className="text-sm text-gray-500 mt-1">
              This page is for gate users linked to a company. Your account (role:{" "}
              <span className="font-mono">{user?.role}</span>) has no company assigned.
              Log in with a company gate or admin account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Mark</h1>
        <p className="text-gray-500 text-sm mt-1">Fingerprint-based IN/OUT verification</p>
      </div>

      {/* Scanner visual */}
      <div className="card flex flex-col items-center space-y-5 py-10">
        <div className={`w-40 h-40 rounded-full border-4 ${ringColor} flex items-center justify-center bg-gray-50 transition-all`}>
          {phase === PHASE.CONFIRMED && matched?.pending_type === "IN" &&
            <LogIn className="w-20 h-20 text-green-500" />}
          {phase === PHASE.CONFIRMED && matched?.pending_type === "OUT" &&
            <LogOut className="w-20 h-20 text-blue-500" />}
          {phase === PHASE.ERROR &&
            <XCircle className="w-20 h-20 text-red-400" />}
          {(phase === PHASE.IDLE || phase === PHASE.SCANNING || phase === PHASE.MATCHING) &&
            <Fingerprint className={`w-20 h-20 ${phase === PHASE.IDLE ? "text-gray-200" : "text-brand-400"}`} />}
        </div>

        <p className="text-sm text-center text-gray-600 max-w-xs">{message}</p>

        {/* Identified worker card */}
        {phase === PHASE.CONFIRMED && matched && (
          <div className={`w-full rounded-xl p-4 border-2 ${
            matched.pending_type === "IN" ? "bg-green-50 border-green-200" : "bg-blue-50 border-blue-200"
          }`}>
            <div className="flex items-center gap-4">
              {matched.photo_url ? (
                <img src={matched.photo_url} alt="" className="w-16 h-16 rounded-lg object-cover" />
              ) : (
                <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center">
                  <span className="text-2xl text-gray-400 font-bold">{matched.name?.[0]}</span>
                </div>
              )}
              <div className="flex-1">
                <p className="font-bold text-gray-900 text-lg">{matched.name}</p>
                <p className="text-sm text-gray-500">{matched.vendor}</p>
                <p className="text-xs text-gray-400 font-mono">{matched.aadhaar_number_masked}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`badge ${matched.pending_type === "IN" ? "badge-green" : "badge-blue"}`}>
                    Pending: {matched.pending_type}
                  </span>
                  <span className="text-xs text-gray-400">Score: {matched.score}/200</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={handleMark}
                disabled={markMutation.isPending}
                className={`flex-1 btn ${matched.pending_type === "IN" ? "btn-success" : "btn-primary"} justify-center`}
              >
                {markMutation.isPending ? "Marking…" : `Confirm ${matched.pending_type}`}
              </button>
              <button onClick={reset} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}

        {/* Proxy not running */}
        {certError && (
          <div className="w-full p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-2">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle size={15} />
              <span className="text-sm font-medium">Biometric proxy not running</span>
            </div>
            <p className="text-xs text-amber-700">Run this on the gate PC, then scan again:</p>
            <div className="text-xs font-mono bg-amber-100 rounded p-2 text-amber-800">
              cd biometric-agent<br />
              py -3 sgibiosrv_proxy.py
            </div>
          </div>
        )}

        {phase === PHASE.ERROR && !certError && (
          <div className="w-full p-3 bg-red-50 rounded-lg border border-red-200 flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{message}</p>
          </div>
        )}
      </div>

      {/* Scan / Reset button */}
      <div className="flex gap-3 justify-center">
        {phase === PHASE.IDLE || phase === PHASE.ERROR ? (
          <button onClick={scan} className="btn-primary px-8 py-3 text-base">
            <Fingerprint size={20} />
            Scan Fingerprint
          </button>
        ) : phase === PHASE.SCANNING || phase === PHASE.MATCHING ? (
          <button onClick={reset} className="btn-secondary">
            <RefreshCw size={16} /> Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
