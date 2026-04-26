import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import AadhaarFlow from "@/components/AadhaarFlow";
import FingerprintCapture from "@/components/FingerprintCapture";
import { useAuth } from "@/contexts/AuthContext";
import {
  CheckCircle, ChevronRight, User, CreditCard, Fingerprint,
  Upload, Camera, FileText, RefreshCw, AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

// ─── helpers ─────────────────────────────────────────────────────────────────

function base64ToFile(b64, filename, mime = "image/png") {
  const bytes = atob(b64);
  const arr   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

function toDateInput(val) {
  if (!val) return "";
  return String(val).slice(0, 10);
}

// ─── config ───────────────────────────────────────────────────────────────────

const schema = z.object({
  vendor_id: z.coerce.number().min(1, "Please select a vendor").optional().or(z.literal("")),
  name:      z.string().min(2, "Name is required"),
  dob:       z.string().optional(),
  gender:    z.enum(["M", "F", "O"]).optional().or(z.literal("")),
  address:   z.string().optional(),
  city:      z.string().optional(),
  state:     z.string().optional(),
  pin:       z.string().regex(/^\d{6}$/, "Enter valid 6-digit PIN").optional().or(z.literal("")),
  phone:     z.string().optional(),
});

const ID_TYPES = [
  { value: "aadhaar",         label: "Aadhaar Card"   },
  { value: "pan",             label: "PAN Card"        },
  { value: "driving_licence", label: "Driving Licence" },
  { value: "voter_id",        label: "Voter ID"        },
  { value: "passport",        label: "Passport"        },
  { value: "other",           label: "Other"           },
];

const STEPS = [
  { id: "id_doc",      label: "ID Document", icon: CreditCard  },
  { id: "details",     label: "Details",     icon: User        },
  { id: "fingerprint", label: "Fingerprint", icon: Fingerprint },
  { id: "photo",       label: "Photo",       icon: Camera      },
  { id: "confirm",     label: "Confirm",     icon: CheckCircle },
];

// ─── component ────────────────────────────────────────────────────────────────

export default function WorkerRegister() {
  const navigate    = useNavigate();
  const queryClient = useQueryClient();
  const { user }    = useAuth();
  const { id: workerId } = useParams();
  const isEdit      = !!workerId;
  const needsVendor = ["super_admin", "company_admin"].includes(user?.role);

  const docFileRef   = useRef(null);
  const photoFileRef = useRef(null);

  // ── wizard state ─────────────────────────────────────────────────────────
  const [step, setStep]             = useState(0);

  // Step 0
  const [idType, setIdType]         = useState("aadhaar");
  const [idNumber, setIdNumber]     = useState("");
  const [idFile, setIdFile]         = useState(null);
  const [aadhaarData, setAadhaar]   = useState(null);
  const [aadhaarPdf, setAadhaarPdf] = useState(null);
  const [changeDoc, setChangeDoc]   = useState(false); // edit: toggle to re-upload

  // Step 2
  const [reEnrollFP, setReEnrollFP] = useState(false); // edit: toggle to re-enroll

  // Step 3
  const [photoFile, setPhotoFile]           = useState(null);
  const [photoPreview, setPhotoPreview]     = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Shared
  const [fingerprint, setFP]    = useState(null);
  const [savedWorker, setSaved] = useState(null);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const { data: vendors } = useQuery({
    queryKey: ["vendors-list"],
    queryFn:  () => api.get("/vendors?per_page=100").then(r => r.data?.data ?? r.data),
    enabled:  needsVendor,
  });

  // ── Edit: fetch existing worker ───────────────────────────────────────────

  const { data: existingWorker, isLoading: loadingWorker } = useQuery({
    queryKey: ["worker", workerId],
    queryFn:  () => api.get(`/workers/${workerId}`).then(r => r.data),
    enabled:  isEdit,
  });

  useEffect(() => {
    if (!existingWorker) return;

    // Pre-fill form fields
    setValue("name",    existingWorker.name    ?? "");
    setValue("dob",     toDateInput(existingWorker.dob));
    setValue("gender",  existingWorker.gender  ?? "");
    setValue("address", existingWorker.address ?? "");
    setValue("city",    existingWorker.city    ?? "");
    setValue("state",   existingWorker.state   ?? "");
    setValue("pin",     existingWorker.pin     ?? "");
    setValue("phone",   existingWorker.phone   ?? existingWorker.mobile ?? "");
    if (existingWorker.vendor_id) setValue("vendor_id", existingWorker.vendor_id);

    // Existing photo — shown in step 3
    if (existingWorker.photo_url) setPhotoPreview(existingWorker.photo_url);

    // Existing fingerprint — shown in step 2
    if (existingWorker.fingerprint_enrolled_at) {
      setFP({ quality: existingWorker.fingerprint_quality ?? "?" });
    }

    // Primary ID document — shown in step 0
    const primaryDoc = existingWorker.idDocuments?.find(d => d.is_primary)
                    ?? existingWorker.idDocuments?.[0];
    if (primaryDoc) {
      setIdType(primaryDoc.id_type);
      setIdNumber(primaryDoc.id_number_masked ?? "");
    } else if (existingWorker.aadhaar_number_masked) {
      setIdType("aadhaar");
    }

    setSaved(existingWorker);
    // Stay on step 0 so the user reviews existing data before continuing
  }, [existingWorker, setValue]);

  // ── Step 0 helpers ────────────────────────────────────────────────────────

  const handleAadhaarExtracted = (data, file) => {
    setAadhaar(data);
    setAadhaarPdf(file);
    if (data.name)                 setValue("name", data.name);
    if (data.dob)                  setValue("dob", data.dob);
    if (data.gender)               setValue("gender", data.gender);
    if (data.address)              setValue("address", data.address);
    if (data.city)                 setValue("city", data.city ?? "");
    if (data.state)                setValue("state", data.state ?? "");
    if (data.pin)                  setValue("pin", data.pin ?? "");
    if (data.mobile || data.phone) setValue("phone", data.mobile ?? data.phone ?? "");
    if (data.photo_base64) {
      setPhotoFile(base64ToFile(data.photo_base64, "aadhaar_photo.png"));
      setPhotoPreview(`data:image/png;base64,${data.photo_base64}`);
    }
    setStep(1);
    toast.success("Aadhaar data auto-filled. Please review before saving.");
  };

  const handleIdDocNext = () => {
    if (!idNumber.trim()) { toast.error("Please enter the ID number."); return; }
    setStep(1);
  };

  // ── Step 1: save / update worker ─────────────────────────────────────────

  const createWorker = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        vendor_id:              data.vendor_id ? Number(data.vendor_id) : undefined,
        aadhaar_number_masked:  aadhaarData?.aadhaar_number_masked,
        aadhaar_data_extracted: aadhaarData ?? undefined,
      };
      if (isEdit) return api.put(`/workers/${workerId}`, payload).then(r => r.data);
      return api.post("/workers", payload).then(r => r.data);
    },
    onSuccess: async (worker) => {
      setSaved(worker);
      if (!isEdit) {
        if (aadhaarPdf) {
          const fd = new FormData();
          fd.append("pdf", aadhaarPdf);
          fd.append("aadhaar_number_masked", aadhaarData?.aadhaar_number_masked ?? "");
          await api.post(`/aadhaar/upload/${worker.id}`, fd, {
            headers: { "Content-Type": "multipart/form-data" },
          }).catch(() => {});
        }
        const docFd = new FormData();
        docFd.append("id_type", idType);
        docFd.append("id_number_masked", idType === "aadhaar"
          ? (aadhaarData?.aadhaar_number_masked ?? "") : idNumber);
        docFd.append("is_primary", "1");
        if (idFile) docFd.append("document_image", idFile);
        await api.post(`/workers/${worker.id}/id-documents`, docFd, {
          headers: { "Content-Type": "multipart/form-data" },
        }).catch(() => {});
      } else if (isEdit && changeDoc) {
        // User chose to replace the ID document
        const docFd = new FormData();
        docFd.append("id_type", idType);
        docFd.append("id_number_masked", idType === "aadhaar"
          ? (aadhaarData?.aadhaar_number_masked ?? "") : idNumber);
        docFd.append("is_primary", "1");
        if (idFile) docFd.append("document_image", idFile);
        await api.post(`/workers/${worker.id}/id-documents`, docFd, {
          headers: { "Content-Type": "multipart/form-data" },
        }).catch(() => {});
      }
      setStep(2);
    },
    onError: (err) => {
      const errs = err.response?.data?.errors;
      toast.error(errs ? Object.values(errs).flat()[0] : "Failed to save worker details.");
    },
  });

  // ── Step 2: fingerprint ───────────────────────────────────────────────────

  const handleFingerprintCaptured = async (template, quality) => {
    if (!savedWorker) return;
    try {
      await api.post(`/workers/${savedWorker.id}/fingerprint`, { template, quality });
      setFP({ quality });
      toast.success("Fingerprint enrolled!");
      setStep(3);
    } catch {
      toast.error("Fingerprint enrollment failed. Please retry.");
    }
  };

  // ── Step 3: photo ─────────────────────────────────────────────────────────

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handlePhotoContinue = async () => {
    if (photoFile && savedWorker) {
      setUploadingPhoto(true);
      const fd = new FormData();
      fd.append("photo", photoFile);
      await api.post(`/workers/${savedWorker.id}/photo`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      }).catch(() => {});
      setUploadingPhoto(false);
    }
    setStep(4);
  };

  // ── Step 4: finish ────────────────────────────────────────────────────────

  const handleFinish = () => {
    queryClient.invalidateQueries({ queryKey: ["workers"] });
    if (isEdit) queryClient.invalidateQueries({ queryKey: ["worker", workerId] });
    navigate("/workers");
  };

  // ── Loading skeleton while fetching existing worker ───────────────────────

  if (isEdit && loadingWorker) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-8 bg-gray-100 rounded w-48 animate-pulse" />
        <div className="card space-y-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Existing primary doc (for step 0 edit view)
  const primaryDoc = existingWorker?.idDocuments?.find(d => d.is_primary)
                  ?? existingWorker?.idDocuments?.[0];

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? "Edit Worker" : "Register Worker"}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {isEdit
            ? `Editing: ${existingWorker?.name ?? "…"}`
            : "ID Document → Details → Fingerprint → Photo → Confirm"}
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center flex-1 last:flex-none">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              i === step ? "bg-brand-600 text-white" :
              i < step   ? "bg-green-100 text-green-700" :
                           "text-gray-400"
            }`}>
              {i < step ? <CheckCircle size={16} /> : <s.icon size={16} />}
              <span className="hidden sm:block">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />}
          </div>
        ))}
      </div>

      {/* ── Step 0: ID Document ───────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="card space-y-5">
          <div>
            <h2 className="font-semibold text-gray-900">ID Document</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEdit ? "Review or replace the worker's identity document." : "Select the identity document for this worker."}
            </p>
          </div>

          {/* ── EDIT: show existing doc ── */}
          {isEdit && !changeDoc && (
            <div className="space-y-4">
              {primaryDoc ? (
                <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                    <CreditCard size={20} className="text-brand-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{primaryDoc.type_label}</p>
                    {primaryDoc.id_number_masked && (
                      <p className="text-sm text-gray-500 font-mono mt-0.5">{primaryDoc.id_number_masked}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      {primaryDoc.has_document ? (
                        <span className="badge badge-green text-xs">
                          <FileText size={10} className="mr-1" /> Document on file
                        </span>
                      ) : (
                        <span className="badge badge-gray text-xs">No document file</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <AlertCircle size={18} className="text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-700">No ID document on record.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={() => setStep(1)} className="btn-primary">
                  Keep & Continue
                </button>
                <button
                  type="button"
                  onClick={() => { setChangeDoc(true); setAadhaar(null); setIdNumber(""); setIdFile(null); }}
                  className="btn-secondary"
                >
                  <RefreshCw size={14} /> Change Document
                </button>
              </div>
            </div>
          )}

          {/* ── NEW or CHANGE: full doc form ── */}
          {(!isEdit || changeDoc) && (
            <>
              <div>
                <label className="label">Document Type *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ID_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => {
                        setIdType(t.value);
                        setIdNumber("");
                        setIdFile(null);
                        setAadhaar(null);
                        setPhotoFile(null);
                        setPhotoPreview(isEdit ? existingWorker?.photo_url ?? null : null);
                      }}
                      className={`px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-colors ${
                        idType === t.value
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {idType === "aadhaar" && (
                <AadhaarFlow onExtracted={handleAadhaarExtracted} onSkip={() => setStep(1)} />
              )}

              {idType !== "aadhaar" && (
                <div className="space-y-4">
                  <div>
                    <label className="label">ID Number *</label>
                    <input
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      className="input"
                      placeholder={idType === "pan" ? "ABCDE1234F" : "Enter ID number"}
                    />
                  </div>

                  <div>
                    <label className="label">
                      Document Scan / Photo{" "}
                      <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      ref={docFileRef}
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => setIdFile(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                    <button type="button" onClick={() => docFileRef.current?.click()} className="btn-secondary w-full">
                      <Upload size={15} />
                      {idFile ? idFile.name : "Upload document image"}
                    </button>
                  </div>

                  <div className="flex gap-3">
                    {isEdit && (
                      <button type="button" onClick={() => setChangeDoc(false)} className="btn-secondary">
                        Cancel
                      </button>
                    )}
                    <button type="button" onClick={handleIdDocNext} className="btn-primary">
                      Continue to Details
                    </button>
                  </div>
                </div>
              )}

              {/* Cancel back to existing-doc view in edit mode for Aadhaar */}
              {isEdit && changeDoc && idType === "aadhaar" && (
                <button type="button" onClick={() => setChangeDoc(false)} className="btn-secondary w-full">
                  Cancel — keep existing document
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Step 1: Details ───────────────────────────────────────────────────── */}
      {step === 1 && (
        <form onSubmit={handleSubmit((data) => createWorker.mutate(data))}>
          <div className="card space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold text-gray-900">Worker Details</h2>
              <div className="flex gap-2 flex-wrap">
                {aadhaarData && (
                  <span className="badge badge-green">
                    <CheckCircle size={12} className="mr-1" />Aadhaar auto-filled
                  </span>
                )}
                {(isEdit || idType !== "aadhaar") && (
                  <span className="badge badge-blue">
                    {ID_TYPES.find(t => t.value === idType)?.label}
                    {idNumber ? ` — ${idNumber}` : ""}
                  </span>
                )}
              </div>
            </div>

            {needsVendor && (
              <div>
                <label className="label">Vendor *</label>
                <select {...register("vendor_id")} className={`input ${errors.vendor_id ? "input-error" : ""}`}>
                  <option value="">— Select Vendor —</option>
                  {(vendors ?? []).map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                {errors.vendor_id && <p className="text-red-500 text-xs mt-1">{errors.vendor_id.message}</p>}
              </div>
            )}

            <div>
              <label className="label">Full Name *</label>
              <input
                {...register("name")}
                className={`input ${errors.name ? "input-error" : ""}`}
                placeholder="Worker's full name"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Date of Birth</label>
                <input {...register("dob")} type="date" className="input" />
              </div>
              <div>
                <label className="label">Gender</label>
                <select {...register("gender")} className="input">
                  <option value="">Select</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Address</label>
                <textarea {...register("address")} rows={3} className="input resize-none" placeholder="Full address" />
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
                <input {...register("phone")} type="tel" className="input" placeholder="Mobile number" />
              </div>
            </div>

            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button type="button" className="btn-secondary" onClick={() => setStep(0)}>Back</button>
              <button type="submit" disabled={createWorker.isPending} className="btn-primary">
                {createWorker.isPending ? "Saving..." : isEdit ? "Save Changes" : "Save & Continue"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Step 2: Fingerprint ───────────────────────────────────────────────── */}
      {step === 2 && savedWorker && (
        <>
          {/* Edit mode with existing fingerprint — show status + options */}
          {isEdit && existingWorker?.fingerprint_enrolled_at && !reEnrollFP ? (
            <div className="card space-y-5">
              <div>
                <h2 className="font-semibold text-gray-900">Fingerprint</h2>
                <p className="text-sm text-gray-500 mt-0.5">Worker already has a fingerprint enrolled.</p>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-xl bg-green-50 border border-green-200">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                  <Fingerprint size={20} className="text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-green-800">Fingerprint enrolled</p>
                  <p className="text-sm text-green-700 mt-0.5">
                    Quality: {existingWorker.fingerprint_quality ?? "?"}%
                  </p>
                  <p className="text-xs text-green-600 mt-0.5">
                    Enrolled: {format(new Date(existingWorker.fingerprint_enrolled_at), "dd MMM yyyy")}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button type="button" onClick={() => setStep(3)} className="btn-primary">
                  Keep & Continue
                </button>
                <button type="button" onClick={() => setReEnrollFP(true)} className="btn-secondary">
                  <RefreshCw size={14} /> Re-enroll
                </button>
              </div>
            </div>
          ) : (
            /* New registration or re-enroll */
            <FingerprintCapture
              worker={savedWorker}
              onCaptured={handleFingerprintCaptured}
              onSkip={() => setStep(3)}
            />
          )}
        </>
      )}

      {/* ── Step 3: Photo ─────────────────────────────────────────────────────── */}
      {step === 3 && savedWorker && (
        <div className="card space-y-6">
          <div>
            <h2 className="font-semibold text-gray-900">Worker Photo</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEdit && existingWorker?.photo_url
                ? "Existing photo shown. Select a new one to replace it, or continue to keep the current."
                : "A face photo helps gate staff visually verify the worker."}
            </p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => photoFileRef.current?.click()}
              title={photoPreview ? "Change photo" : "Add worker photo"}
              className="w-40 h-48 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50
                         flex items-center justify-center overflow-hidden
                         hover:border-brand-400 hover:bg-brand-50 transition-colors"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Worker" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center text-gray-400 gap-2 px-4 text-center">
                  <Camera size={32} />
                  <span className="text-sm leading-tight">Tap to take or upload photo</span>
                </div>
              )}
            </button>

            {photoPreview && (
              <button
                type="button"
                onClick={() => photoFileRef.current?.click()}
                className="text-sm text-brand-600 hover:underline"
              >
                Change Photo
              </button>
            )}

            <input
              ref={photoFileRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handlePhotoChange}
              className="hidden"
            />
          </div>

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setStep(2)}>Back</button>
            <button
              type="button"
              onClick={handlePhotoContinue}
              disabled={uploadingPhoto}
              className="btn-primary"
            >
              {uploadingPhoto ? "Uploading..." : photoFile ? "Save Photo & Continue" : "Keep & Continue"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Confirm ───────────────────────────────────────────────────── */}
      {step === 4 && savedWorker && (
        <div className="card text-center space-y-4">
          <div className="flex justify-center">
            {photoPreview ? (
              <img
                src={photoPreview}
                alt={savedWorker.name}
                className="w-24 h-28 rounded-xl object-cover border-4 border-green-200 shadow"
              />
            ) : (
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900">{savedWorker.name}</h2>
            <p className="text-gray-500 text-sm">
              {isEdit ? "Worker updated successfully" : "Worker registered successfully"}
            </p>
          </div>

          <div className="text-sm space-y-1">
            <p className="text-brand-600 font-medium">
              {ID_TYPES.find(t => t.value === idType)?.label}
              {idType !== "aadhaar" && idNumber ? ` — ${idNumber}` : ""}
            </p>
            {photoPreview
              ? <p className="text-green-600">✓ Photo {isEdit && !photoFile ? "(unchanged)" : "saved"}</p>
              : <p className="text-amber-500">⚠ No photo — can be added later from the worker list</p>
            }
            {fingerprint
              ? <p className="text-green-600 font-medium">✓ Fingerprint enrolled (quality: {fingerprint.quality}%)</p>
              : <p className="text-amber-500">⚠ Fingerprint not enrolled</p>
            }
          </div>

          <button onClick={handleFinish} className="btn-primary mx-auto">
            Go to Worker List
          </button>
        </div>
      )}
    </div>
  );
}
