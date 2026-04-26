/**
 * AttendanceMark — Fingerprint or Manual IN/OUT with optional photo proof.
 *
 * Fingerprint flow:
 *   1. Scan  →  POST https://localhost:8443/SGIFPCapture
 *   2. Match →  GET /attendance/worker-templates, then SGIMatchScore 1:N
 *   3. Optionally add photo proof
 *   4. Confirm  →  POST /attendance/mark
 *
 * Manual flow:
 *   1. Search/select worker  →  GET /attendance/assigned-workers
 *   2. Optionally add photo proof
 *   3. Confirm  →  POST /attendance/mark
 */

import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useAuth } from "@/contexts/AuthContext";
import toast from "react-hot-toast";
import {
  Fingerprint, Camera, LogIn, LogOut, XCircle, AlertTriangle,
  RefreshCw, MapPin, Search, User,
} from "lucide-react";

const SGIBIOSRV       = "https://localhost:8443";
const MATCH_THRESHOLD = 40;

const SGI_ERRORS = {
  51:    "Capture failed — try again",
  53:    "Device not found — check USB connection",
  54:    "No finger detected — place finger and try again",
  56:    "Poor image quality — clean the sensor",
  63:    "SecuGen service not running",
  10004: "No finger detected — click Scan then immediately place your finger",
};

const PHASE = { IDLE: "idle", SCANNING: "scanning", MATCHING: "matching", CONFIRMED: "confirmed", ERROR: "error" };

async function sgiCapture() {
  const res = await fetch(`${SGIBIOSRV}/SGIFPCapture`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: "Timeout=10000&Quality=50&licstr=&templateFormat=ISO&imageWSQRate=0.75",
  });
  return res.json();
}

async function sgiMatchScore(t1, t2) {
  const res = await fetch(`${SGIBIOSRV}/SGIMatchScore`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: `template1=${encodeURIComponent(t1)}&template2=${encodeURIComponent(t2)}&licstr=&templateFormat=ISO`,
  });
  return res.json();
}

// ─── Location Selector ─────────────────────────────────────────────────────────

function LocationSelector({ locationType, locationName, onTypeChange, onNameChange }) {
  return (
    <div className="card flex flex-wrap items-center gap-3 py-3">
      <MapPin size={16} className="text-brand-500 shrink-0" />
      <span className="text-sm font-medium text-gray-700">Checkpoint:</span>
      <div className="flex gap-1">
        {[["main_gate", "Main Gate"], ["department", "Department"], ["checkpoint", "Checkpoint"]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => onTypeChange(val)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              locationType === val ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {locationType !== "main_gate" && (
        <input
          value={locationName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Production Floor, Building A..."
          className="input flex-1 min-w-[200px] py-1.5 text-sm"
        />
      )}
    </div>
  );
}

// ─── Confirmed worker card (shared between both modes) ─────────────────────────

function ConfirmedCard({ worker, score, photoPreview, onPhotoClick, onConfirm, onCancel, isPending }) {
  const isIn = worker.pending_type === "IN";
  return (
    <div className={`card border-2 space-y-4 ${isIn ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"}`}>
      {/* Worker info */}
      <div className="flex items-center gap-4">
        {worker.photo_url ? (
          <img src={worker.photo_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
        ) : (
          <div className="w-16 h-16 bg-gray-200 rounded-xl flex items-center justify-center">
            <User size={24} className="text-gray-400" />
          </div>
        )}
        <div>
          <p className="font-bold text-gray-900 text-lg">{worker.name}</p>
          <p className="text-sm text-gray-500">{worker.vendor}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`badge ${isIn ? "badge-green" : "badge-blue"}`}>
              {isIn ? <LogIn size={10} className="mr-1 inline" /> : <LogOut size={10} className="mr-1 inline" />}
              Pending {worker.pending_type}
            </span>
            {score != null && <span className="text-xs text-gray-400">Score: {score}/200</span>}
          </div>
        </div>
      </div>

      {/* Optional photo proof */}
      {photoPreview ? (
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium">Photo proof</p>
          <img src={photoPreview} alt="proof" className="h-32 w-full object-cover rounded-lg border border-gray-200" />
          <button type="button" onClick={onPhotoClick} className="text-xs text-brand-600 hover:underline">
            Retake
          </button>
        </div>
      ) : (
        <button type="button" onClick={onPhotoClick} className="btn-secondary w-full text-sm">
          <Camera size={15} />
          Add Photo Proof
          <span className="text-gray-400 font-normal ml-1">(optional)</span>
        </button>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-black/5">
        <button
          onClick={onConfirm}
          disabled={isPending}
          className={`flex-1 btn ${isIn ? "btn-success" : "btn-primary"} justify-center`}
        >
          {isPending ? "Marking…" : `Confirm ${worker.pending_type}`}
          {isIn ? <LogIn size={16} /> : <LogOut size={16} />}
        </button>
        <button onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export default function AttendanceMark() {
  const { user }  = useAuth();
  const companyId = user?.company_id;
  const fileRef   = useRef(null);

  const [mode, setMode]           = useState("fingerprint"); // "fingerprint" | "manual"
  const [locationType, setLocType] = useState("main_gate");
  const [locationName, setLocName] = useState("Main Gate");

  // Fingerprint-specific state
  const [phase, setPhase]         = useState(PHASE.IDLE);
  const [message, setMessage]     = useState("Click Scan to begin.");
  const [matched, setMatched]     = useState(null);
  const [certError, setCertError] = useState(false);

  // Manual-specific state
  const [search, setSearch]       = useState("");
  const [selectedWorker, setSel]  = useState(null);

  // Shared proof photo
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPrev] = useState(null);

  // Whichever worker is confirmed (from either mode)
  const confirmedWorker = matched || selectedWorker;

  const resolvedLocation = locationType === "main_gate" ? "Main Gate" : (locationName || "");

  const { data: assignedWorkers } = useQuery({
    queryKey: ["assigned-workers", companyId, search],
    queryFn:  () => api.get("/attendance/assigned-workers", {
      params: { company_id: companyId, search: search || undefined },
    }).then(r => r.data),
    enabled: mode === "manual" && !!companyId && !confirmedWorker,
  });

  const handleLocTypeChange = (val) => {
    setLocType(val);
    setLocName(val === "main_gate" ? "Main Gate" : "");
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPrev(URL.createObjectURL(file));
  };

  // ── Fingerprint scan ──────────────────────────────────────────────────────

  const scan = async () => {
    setPhase(PHASE.SCANNING);
    setCertError(false);
    setMatched(null);
    setMessage("👇 Place your finger on the scanner NOW and hold it");

    let capture;
    try {
      capture = await sgiCapture();
    } catch {
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

    setPhase(PHASE.MATCHING);
    setMessage("Identifying worker…");

    let workers;
    try {
      const res = await api.get("/attendance/worker-templates", { params: { company_id: companyId } });
      workers = res.data;
    } catch (err) {
      setPhase(PHASE.ERROR);
      setMessage(err.response?.data?.message || "Failed to load worker list.");
      return;
    }

    if (!workers?.length) {
      setPhase(PHASE.ERROR);
      setMessage("No workers deployed today. Deploy workers via Vendor → Worker Deployments.");
      return;
    }

    const results = await Promise.all(
      workers.map(async (w) => {
        try {
          const v = await sgiMatchScore(w.template, capture.TemplateBase64);
          return { worker: w, score: v.ErrorCode === 0 ? (v.MatchingScore ?? 0) : 0 };
        } catch {
          return { worker: w, score: 0 };
        }
      })
    );

    const best = results.reduce((a, b) => (a.score > b.score ? a : b));

    if (best.score < MATCH_THRESHOLD) {
      setPhase(PHASE.ERROR);
      setMessage("No fingerprint match found. Worker may not be deployed or enrolled.");
      return;
    }

    setMatched({ ...best.worker, score: best.score });
    setPhase(PHASE.CONFIRMED);
    setMessage("Worker identified!");
  };

  // ── Mark (unified) ────────────────────────────────────────────────────────

  const markMutation = useMutation({
    mutationFn: async ({ payload, file }) => {
      if (file) {
        const fd = new FormData();
        Object.entries(payload).forEach(([k, v]) => v != null && fd.append(k, String(v)));
        fd.append("photo", file);
        return api.post("/attendance/mark", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        }).then(r => r.data);
      }
      return api.post("/attendance/mark", payload).then(r => r.data);
    },
    onSuccess: (data) => { toast.success(data.message, { duration: 5000 }); reset(); },
    onError:   (err)  => toast.error(err.response?.data?.message || "Mark failed."),
  });

  const handleMark = () => {
    const worker = confirmedWorker;
    const method = matched ? "fingerprint" : "manual";
    markMutation.mutate({
      payload: {
        worker_id:         worker.worker_id,
        company_id:        companyId,
        assignment_id:     worker.assignment_id,
        type:              worker.pending_type,
        method,
        fingerprint_score: matched?.score,
        location_type:     locationType,
        location_name:     resolvedLocation,
      },
      file: photoFile,
    });
  };

  const reset = () => {
    setPhase(PHASE.IDLE);
    setMatched(null);
    setMessage("Click Scan to begin.");
    setCertError(false);
    setSel(null);
    setPhotoFile(null);
    setPhotoPrev(null);
    setSearch("");
  };

  if (!companyId) {
    return (
      <div className="max-w-lg mx-auto card p-6 flex items-start gap-3">
        <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
        <div>
          <p className="font-semibold">No company assigned</p>
          <p className="text-sm text-gray-500 mt-1">Log in with a company gate or admin account.</p>
        </div>
      </div>
    );
  }

  const ringColor = {
    [PHASE.IDLE]:      "border-gray-200",
    [PHASE.SCANNING]:  "border-brand-400 animate-pulse",
    [PHASE.MATCHING]:  "border-yellow-400 animate-pulse",
    [PHASE.CONFIRMED]: "border-green-400",
    [PHASE.ERROR]:     "border-red-300",
  }[phase];

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Mark</h1>
        <p className="text-gray-500 text-sm mt-1">Mark worker IN/OUT at this location</p>
      </div>

      <LocationSelector
        locationType={locationType}
        locationName={locationName}
        onTypeChange={handleLocTypeChange}
        onNameChange={setLocName}
      />

      {/* Mode toggle */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        {[
          ["fingerprint", <Fingerprint size={15} key="fp" />, "Fingerprint"],
          ["manual",      <User        size={15} key="mn" />, "Manual"],
        ].map(([m, icon, label]) => (
          <button
            key={m}
            onClick={() => { setMode(m); reset(); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
              mode === m ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* Hidden photo input — used by both modes */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoChange}
        className="hidden"
      />

      {/* ── FINGERPRINT: scan UI (only while not yet confirmed) ── */}
      {mode === "fingerprint" && !confirmedWorker && (
        <div className="card flex flex-col items-center space-y-5 py-10">
          <div className={`w-40 h-40 rounded-full border-4 ${ringColor} flex items-center justify-center bg-gray-50 transition-all`}>
            {phase === PHASE.ERROR
              ? <XCircle className="w-20 h-20 text-red-400" />
              : <Fingerprint className={`w-20 h-20 ${phase === PHASE.IDLE ? "text-gray-200" : "text-brand-400"}`} />
            }
          </div>

          <p className="text-sm text-center text-gray-600 max-w-xs">{message}</p>

          {certError && (
            <div className="w-full p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-2">
              <p className="text-sm font-medium text-amber-700 flex items-center gap-2">
                <AlertTriangle size={14} /> Biometric proxy not running
              </p>
              <code className="block text-xs bg-amber-100 rounded p-2 text-amber-800 whitespace-pre">
                {"cd biometric-agent\npy -3 sgibiosrv_proxy.py"}
              </code>
            </div>
          )}

          {phase === PHASE.ERROR && !certError && (
            <div className="w-full p-3 bg-red-50 rounded-lg border border-red-200 flex gap-2">
              <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{message}</p>
            </div>
          )}

          <div className="flex gap-2">
            {(phase === PHASE.IDLE || phase === PHASE.ERROR) && (
              <button onClick={scan} className="btn-primary px-8 py-3 text-base">
                <Fingerprint size={20} /> Scan Fingerprint
              </button>
            )}
            {(phase === PHASE.SCANNING || phase === PHASE.MATCHING) && (
              <button onClick={reset} className="btn-secondary">
                <RefreshCw size={16} /> Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── MANUAL: worker search + list ── */}
      {mode === "manual" && !confirmedWorker && (
        <div className="card space-y-4">
          <p className="text-sm font-medium text-gray-700">Select worker deployed today:</p>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type worker name..."
              className="input pl-9"
            />
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-50 rounded-lg border border-gray-100">
            {assignedWorkers?.length === 0 && (
              <p className="text-center py-8 text-gray-400 text-sm">No workers deployed today.</p>
            )}
            {assignedWorkers?.map(w => (
              <button
                key={w.worker_id}
                onClick={() => setSel(w)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-brand-50 text-left"
              >
                {w.photo_url ? (
                  <img src={w.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-400">
                    {w.name?.[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{w.name}</p>
                  <p className="text-xs text-gray-400">{w.vendor}</p>
                </div>
                <span className={`badge ${w.pending_type === "IN" ? "badge-green" : "badge-blue"}`}>
                  {w.pending_type}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── CONFIRMED WORKER — same card for both modes ── */}
      {confirmedWorker && (
        <ConfirmedCard
          worker={confirmedWorker}
          score={matched?.score}
          photoPreview={photoPreview}
          onPhotoClick={() => fileRef.current?.click()}
          onConfirm={handleMark}
          onCancel={reset}
          isPending={markMutation.isPending}
        />
      )}
    </div>
  );
}
