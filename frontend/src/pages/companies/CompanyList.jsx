import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import {
  Plus, Building2, Eye, EyeOff, RefreshCw, Copy,
  Pencil, ToggleLeft, ToggleRight, X, MoreVertical,
} from "lucide-react";

const COMPANY_FIELDS = [
  "name", "code", "address", "city", "state", "pin",
  "contact_person", "contact_email", "contact_phone", "gst_number",
];
const COMPANY_INIT = Object.fromEntries(COMPANY_FIELDS.map(k => [k, ""]));
const ADMIN_INIT   = { name: "", email: "", password: "" };

function genPassword() {
  const a = "abcdefghijkmnpqrstuvwxyz", A = "ABCDEFGHJKLMNPQRSTUVWXYZ", n = "23456789";
  const all = a + A + n;
  let p = A[Math.floor(Math.random() * A.length)] + n[Math.floor(Math.random() * n.length)];
  for (let i = 0; i < 8; i++) p += all[Math.floor(Math.random() * all.length)];
  return p.split("").sort(() => Math.random() - 0.5).join("");
}

const LABELS = {
  name: "Company Name", code: "Company Code", gst_number: "GST Number",
  contact_person: "Contact Person", contact_email: "Contact Email", contact_phone: "Contact Phone",
};
const label = (k) => LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

/* Dropdown menu on each card */
function CardMenu({ company, onEdit, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
      >
        <MoreVertical size={17} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1 text-sm">
          <button
            onClick={() => { onEdit(); setOpen(false); }}
            className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 text-gray-700"
          >
            <Pencil size={14} /> Edit
          </button>
          <button
            onClick={() => { onToggle(); setOpen(false); }}
            className={`flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 ${
              company.status === "active" ? "text-amber-600" : "text-green-600"
            }`}
          >
            {company.status === "active"
              ? <><ToggleLeft size={14} /> Deactivate</>
              : <><ToggleRight size={14} /> Activate</>}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CompanyList() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]             = useState(COMPANY_INIT);
  const [admin, setAdmin]           = useState(ADMIN_INIT);
  const [showPass, setShowPass]     = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn:  () => api.get("/companies").then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const company = await api.post("/companies", form).then(r => r.data);
      if (admin.name && admin.email && admin.password) {
        await api.post("/users", { ...admin, role: "company_admin", company_id: company.id });
      }
    },
    onSuccess: () => {
      toast.success("Company created!");
      queryClient.invalidateQueries(["companies"]);
      setShowCreate(false); setForm(COMPANY_INIT); setAdmin(ADMIN_INIT);
    },
    onError: (e) => toast.error(Object.values(e.response?.data?.errors ?? {})[0]?.[0] ?? "Error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/companies/${id}`, data),
    onSuccess: () => {
      toast.success("Company updated!");
      queryClient.invalidateQueries(["companies"]);
      setEditTarget(null);
    },
    onError: (e) => toast.error(Object.values(e.response?.data?.errors ?? {})[0]?.[0] ?? "Update failed"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }) => api.put(`/companies/${id}`, { status }),
    onSuccess: () => { toast.success("Status updated."); queryClient.invalidateQueries(["companies"]); },
    onError: () => toast.error("Failed to update status."),
  });

  const openEdit = (c) => {
    setForm(Object.fromEntries(COMPANY_FIELDS.map(k => [k, c[k] ?? ""])));
    setEditTarget(c);
  };

  const f  = (k) => ({ value: form[k], onChange: (e) => setForm(p => ({ ...p, [k]: e.target.value })) });
  const af = (k) => ({ value: admin[k], onChange: (e) => setAdmin(p => ({ ...p, [k]: e.target.value })) });

  const companies = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-sm text-gray-500 mt-0.5">Client companies using the attendance system</p>
        </div>
        <button className="btn-primary" onClick={() => { setShowCreate(true); setForm(COMPANY_INIT); setAdmin(ADMIN_INIT); }}>
          <Plus size={16} /> Add Company
        </button>
      </div>

      {/* ── Create form ─────────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="card space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">New Company</h2>
            <button onClick={() => setShowCreate(false)}><X size={18} className="text-gray-400" /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {COMPANY_FIELDS.map(k => (
              <div key={k}>
                <label className="label">{label(k)}</label>
                <input className="input" {...f(k)} />
              </div>
            ))}
          </div>

          {/* Admin login */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">
              Company Admin Login
              <span className="text-xs font-normal text-gray-400 ml-2">(optional — admin can later create gate users)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Admin Name</label>
                <input className="input" placeholder="e.g. John (Admin)" {...af("name")} />
              </div>
              <div>
                <label className="label">Login Email</label>
                <input className="input" type="email" placeholder="admin@company.com" {...af("email")} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Password</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input className="input pr-10 font-mono" type={showPass ? "text" : "password"}
                      placeholder="Min 8 chars, letters + numbers" {...af("password")} />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button type="button" onClick={() => { setAdmin(a => ({ ...a, password: genPassword() })); setShowPass(true); }}
                    className="btn-secondary px-3" title="Generate"><RefreshCw size={15} /></button>
                  {admin.password && (
                    <button type="button" onClick={() => { navigator.clipboard.writeText(admin.password); toast.success("Copied!"); }}
                      className="btn-secondary px-3" title="Copy"><Copy size={15} /></button>
                  )}
                </div>
                {admin.password && <p className="text-xs text-amber-600 mt-1">Save this password — it won't be shown again.</p>}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Create Company"}
            </button>
            <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Cards ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? [...Array(3)].map((_, i) => <div key={i} className="card h-36 animate-pulse bg-gray-100" />)
          : companies.map(c => (
            <div key={c.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 size={20} className="text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{c.name}</h3>
                    <p className="text-xs text-gray-400 font-mono">{c.code}</p>
                  </div>
                </div>
                {/* ⋮ menu */}
                <CardMenu
                  company={c}
                  onEdit={() => openEdit(c)}
                  onToggle={() => toggleMutation.mutate({ id: c.id, status: c.status === "active" ? "inactive" : "active" })}
                />
              </div>

              <div className="mt-3 space-y-0.5">
                <p className="text-sm text-gray-600">{c.contact_person}</p>
                <p className="text-xs text-gray-400">{c.contact_email}</p>
                <p className="text-xs text-gray-400">{[c.city, c.state, c.pin].filter(Boolean).join(", ")}</p>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className={`badge ${c.status === "active" ? "badge-green" : "badge-gray"}`}>{c.status}</span>
                {c.gst_number && <span className="text-xs text-gray-400 font-mono">{c.gst_number}</span>}
              </div>
            </div>
          ))}
        {!isLoading && !companies.length && (
          <p className="text-gray-400 text-sm col-span-3 text-center py-10">No companies yet. Click Add Company to create one.</p>
        )}
      </div>

      {/* ── Edit modal ───────────────────────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-gray-900">Edit — {editTarget.name}</h2>
              <button onClick={() => setEditTarget(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {COMPANY_FIELDS.map(k => (
                  <div key={k}>
                    <label className="label">{label(k)}</label>
                    <input className="input" {...f(k)} />
                  </div>
                ))}
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={form.status ?? editTarget.status}
                    onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button className="btn-primary flex-1 justify-center" disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: editTarget.id, data: { ...form } })}>
                  {updateMutation.isPending ? "Saving…" : "Save Changes"}
                </button>
                <button className="btn-secondary" onClick={() => setEditTarget(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
