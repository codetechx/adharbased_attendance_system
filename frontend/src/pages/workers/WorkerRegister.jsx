import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import AadhaarFlow from "@/components/AadhaarFlow";
import FingerprintCapture from "@/components/FingerprintCapture";
import {
  CheckCircle, Circle, ChevronRight, User, FileText, Fingerprint, Save
} from "lucide-react";

const schema = z.object({
  name:    z.string().min(2, "Name is required"),
  dob:     z.string().min(1, "Date of birth is required"),
  gender:  z.enum(["M", "F", "O"], { required_error: "Gender is required" }),
  address: z.string().min(5, "Address is required"),
  city:    z.string().optional(),
  state:   z.string().optional(),
  pin:     z.string().regex(/^\d{6}$/, "Enter valid 6-digit PIN").optional().or(z.literal("")),
  phone:   z.string().optional(),
});

const STEPS = [
  { id: "aadhaar",      label: "Aadhaar",     icon: FileText },
  { id: "details",      label: "Details",     icon: User },
  { id: "fingerprint",  label: "Fingerprint", icon: Fingerprint },
  { id: "confirm",      label: "Confirm",     icon: CheckCircle },
];

export default function WorkerRegister() {
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();
  const [step, setStep]           = useState(0); // 0=aadhaar, 1=details, 2=fingerprint, 3=confirm
  const [aadhaarData, setAadhaar] = useState(null);
  const [aadhaarPdf, setAadhaarPdf] = useState(null);
  const [fingerprint, setFingerprint] = useState(null);
  const [savedWorker, setSavedWorker] = useState(null);

  const { register, handleSubmit, setValue, getValues, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  // ─── Aadhaar extracted ──────────────────────────────────────────────────────
  const handleAadhaarExtracted = (data, file) => {
    setAadhaar(data);
    setAadhaarPdf(file);

    // Auto-fill form from extracted data
    if (data.name)    setValue("name", data.name);
    if (data.dob)     setValue("dob", data.dob);
    if (data.gender)  setValue("gender", data.gender);
    if (data.address) setValue("address", data.address);
    if (data.city)    setValue("city", data.city ?? "");
    if (data.state)   setValue("state", data.state ?? "");
    if (data.pin)     setValue("pin", data.pin ?? "");

    setStep(1);
    toast.success("Aadhaar data extracted and auto-filled. Please review before saving.");
  };

  // ─── Step 1 submit (details) → save worker draft ─────────────────────────
  const createWorker = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        aadhaar_number_masked:  aadhaarData?.aadhaar_number_masked,
        aadhaar_data_extracted: aadhaarData,
      };
      return api.post("/workers", payload).then((r) => r.data);
    },
    onSuccess: async (worker) => {
      setSavedWorker(worker);

      // Upload Aadhaar PDF if available
      if (aadhaarPdf) {
        const form = new FormData();
        form.append("pdf", aadhaarPdf);
        form.append("aadhaar_number_masked", aadhaarData?.aadhaar_number_masked ?? "");
        await api.post(`/aadhaar/upload/${worker.id}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        }).catch(() => {}); // non-fatal
      }

      setStep(2);
    },
    onError: (err) => {
      const errors = err.response?.data?.errors;
      if (errors) {
        toast.error(Object.values(errors).flat()[0]);
      } else {
        toast.error("Failed to save worker details.");
      }
    },
  });

  // ─── Fingerprint enrolled ────────────────────────────────────────────────
  const handleFingerprintCaptured = async (template, quality) => {
    if (!savedWorker) return;
    try {
      await api.post(`/workers/${savedWorker.id}/fingerprint`, { template, quality });
      setFingerprint({ template, quality });
      toast.success("Fingerprint enrolled!");
      setStep(3);
    } catch (err) {
      toast.error("Fingerprint enrollment failed. Please retry.");
    }
  };

  // ─── Final confirm ───────────────────────────────────────────────────────
  const handleFinish = () => {
    queryClient.invalidateQueries(["workers"]);
    toast.success("Worker registered successfully!");
    navigate("/workers");
  };

  const formValues = watch();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Register Worker</h1>
        <p className="text-gray-500 text-sm mt-1">Complete all steps: Aadhaar → Details → Fingerprint</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1 last:flex-none">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              i === step       ? "bg-brand-600 text-white" :
              i < step         ? "bg-green-100 text-green-700" :
              "text-gray-400"
            }`}>
              {i < step
                ? <CheckCircle size={16} />
                : <s.icon size={16} />
              }
              <span className="hidden sm:block">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* ── Step 0: Aadhaar ────────────────────────────────────────────────── */}
      {step === 0 && (
        <AadhaarFlow
          onExtracted={handleAadhaarExtracted}
          onSkip={() => setStep(1)}
        />
      )}

      {/* ── Step 1: Details Form ───────────────────────────────────────────── */}
      {step === 1 && (
        <form onSubmit={handleSubmit((data) => createWorker.mutate(data))}>
          <div className="card space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Worker Details</h2>
              {aadhaarData && (
                <span className="badge badge-green">
                  <CheckCircle size={12} className="mr-1" />
                  Aadhaar data loaded
                </span>
              )}
            </div>

            {/* Photo preview from Aadhaar */}
            {aadhaarData?.photo_base64 && (
              <div className="flex items-center gap-4 p-4 bg-brand-50 rounded-lg">
                <img
                  src={`data:image/png;base64,${aadhaarData.photo_base64}`}
                  alt="Aadhaar photo"
                  className="w-20 h-24 object-cover rounded-lg border-2 border-brand-200"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700">Photo extracted from Aadhaar</p>
                  <p className="text-xs text-gray-500">This will be used as the worker profile photo.</p>
                  {aadhaarData.aadhaar_number_masked && (
                    <p className="text-xs text-brand-600 mt-1 font-mono">
                      Aadhaar: {aadhaarData.aadhaar_number_masked}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Full Name *</label>
                <input {...register("name")} className={`input ${errors.name ? "input-error" : ""}`} placeholder="As on Aadhaar" />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <label className="label">Date of Birth *</label>
                <input {...register("dob")} type="date" className={`input ${errors.dob ? "input-error" : ""}`} />
                {errors.dob && <p className="text-red-500 text-xs mt-1">{errors.dob.message}</p>}
              </div>

              <div>
                <label className="label">Gender *</label>
                <select {...register("gender")} className={`input ${errors.gender ? "input-error" : ""}`}>
                  <option value="">Select</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
                {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender.message}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="label">Address *</label>
                <textarea {...register("address")} rows={3} className={`input resize-none ${errors.address ? "input-error" : ""}`} placeholder="Full address as on Aadhaar" />
                {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>}
              </div>

              <div>
                <label className="label">City</label>
                <input {...register("city")} className="input" placeholder="City" />
              </div>

              <div>
                <label className="label">State</label>
                <input {...register("state")} className="input" placeholder="State" />
              </div>

              <div>
                <label className="label">PIN Code</label>
                <input {...register("pin")} className="input" placeholder="6-digit PIN" maxLength={6} />
                {errors.pin && <p className="text-red-500 text-xs mt-1">{errors.pin.message}</p>}
              </div>

              <div>
                <label className="label">Mobile Number</label>
                <input {...register("phone")} type="tel" className="input" placeholder="10-digit mobile" />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setStep(0)}>
                Back
              </button>
              <button
                type="submit"
                disabled={createWorker.isPending}
                className="btn-primary"
              >
                {createWorker.isPending ? "Saving..." : "Save & Continue to Fingerprint"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Step 2: Fingerprint ────────────────────────────────────────────── */}
      {step === 2 && savedWorker && (
        <FingerprintCapture
          worker={savedWorker}
          onCaptured={handleFingerprintCaptured}
          onSkip={() => setStep(3)}
        />
      )}

      {/* ── Step 3: Confirmation ───────────────────────────────────────────── */}
      {step === 3 && savedWorker && (
        <div className="card text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Worker Registered!</h2>
          <div className="text-left bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <p><span className="text-gray-500">Name:</span> <strong>{savedWorker.name}</strong></p>
            <p><span className="text-gray-500">Vendor:</span> <strong>{savedWorker.vendor?.name}</strong></p>
            <p><span className="text-gray-500">Aadhaar:</span> <strong>{savedWorker.aadhaar_number_masked || "Not provided"}</strong></p>
            <p><span className="text-gray-500">Fingerprint:</span> {" "}
              <strong className={fingerprint ? "text-green-600" : "text-yellow-600"}>
                {fingerprint ? `Enrolled (Quality: ${fingerprint.quality}%)` : "Not enrolled yet"}
              </strong>
            </p>
            <p><span className="text-gray-500">Status:</span>{" "}
              <span className={`badge ${savedWorker.status === "active" ? "badge-green" : "badge-yellow"}`}>
                {savedWorker.status}
              </span>
            </p>
          </div>
          {!fingerprint && (
            <p className="text-yellow-700 bg-yellow-50 rounded-lg p-3 text-sm">
              Fingerprint not enrolled. Worker status is pending.
              You can enroll fingerprint later from the worker profile.
            </p>
          )}
          <div className="flex gap-3 justify-center">
            <button className="btn-secondary" onClick={() => navigate("/workers/register")}>
              Register Another
            </button>
            <button className="btn-primary" onClick={handleFinish}>
              <Save size={16} />
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
