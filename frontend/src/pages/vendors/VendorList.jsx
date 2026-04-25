import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { Search, Plus, Eye, EyeOff, RefreshCw, Copy, Pencil, ToggleLeft, ToggleRight, X, MoreVertical } from "lucide-react";

function CardMenu({ vendor, onEdit, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
        <MoreVertical size={17} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1 text-sm">
          <button onClick={() => { onEdit(); setOpen(false); }}
            className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 text-gray-700">
            <Pencil size={14} /> Edit
          </button>
          <button onClick={() => { onToggle(); setOpen(false); }}
            className={`flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 ${vendor.status === "active" ? "text-amber-600" : "text-green-600"}`}>
            {vendor.status === "active" ? <><ToggleLeft size={14} /> Deactivate</> : <><ToggleRight size={14} /> Activate</>}
          </button>
        </div>
      )}
    </div>
  );
}

const VENDOR_FIELDS = [
  "name", "code", "contact_person", "contact_email",
  "contact_phone", "address", "city", "state", "pin",
];
const VENDOR_INIT = Object.fromEntries(VENDOR_FIELDS.map(k => [k, ""]));
const ADMIN_INIT  = { name: "", email: "", password: "" };

function genPassword() {
  const chars = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const nums  = "23456789";
  const all   = chars + upper + nums;
  let pwd = upper[Math.floor(Math.random() * upper.length)]
          + nums[Math.floor(Math.random() * nums.length)];
  for (let i = 0; i < 8; i++) pwd += all[Math.floor(Math.random() * all.length)];
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

function FieldLabel({ k }) {
  const labels = {
    name: "Vendor Name", code: "Vendor Code",
    contact_person: "Contact Person", contact_email: "Contact Email", contact_phone: "Contact Phone",
  };
  return <label className="label">{labels[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</label>;
}

export default function VendorList() {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch]       = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]           = useState(VENDOR_INIT);
  const [admin, setAdmin]         = useState(ADMIN_INIT);
  const [showPass, setShowPass]   = useState(false);

  const isSuperAdmin = user?.role === "super_admin";

  const { data, isLoading } = useQuery({
    queryKey: ["vendors", search],
    queryFn:  () => api.get("/vendors", { params: { search } }).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const vendor = await api.post("/vendors", form).then(r => r.data);
      if (admin.name && admin.email && admin.password) {
        await api.post("/users", { ...admin, role: "vendor_admin", vendor_id: vendor.id });
      }
      return vendor;
    },
    onSuccess: () => {
      toast.success("Vendor created!");
      queryClient.invalidateQueries(["vendors"]);
      setShowCreate(false);
      setForm(VENDOR_INIT);
      setAdmin(ADMIN_INIT);
    },
    onError: (e) => toast.error(Object.values(e.response?.data?.errors ?? {})[0]?.[0] ?? "Error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/vendors/${id}`, data),
    onSuccess: () => {
      toast.success("Vendor updated!");
      queryClient.invalidateQueries(["vendors"]);
      setEditTarget(null);
    },
    onError: (e) => toast.error(Object.values(e.response?.data?.errors ?? {})[0]?.[0] ?? "Update failed"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }) => api.put(`/vendors/${id}`, { status }),
    onSuccess: () => { toast.success("Status updated."); queryClient.invalidateQueries(["vendors"]); },
    onError: () => toast.error("Failed to update status."),
  });

  const openEdit = (v) => {
    setForm(Object.fromEntries(VENDOR_FIELDS.map(k => [k, v[k] ?? ""])));
    setEditTarget(v);
  };

  const copyPassword = () => { navigator.clipboard.writeText(admin.password); toast.success("Password copied!"); };
  const field = (k) => ({ value: form[k], onChange: (e) => setForm(p => ({ ...p, [k]: e.target.value })) });

  const vendors = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vendors</h1>
          <p className="text-sm text-gray-500 mt-0.5">Registered vendor companies</p>
        </div>
        {isSuperAdmin && (
          <button className="btn-primary" onClick={() => { setShowCreate(true); setForm(VENDOR_INIT); setAdmin(ADMIN_INIT); }}>
            <Plus size={16} /> Add Vendor
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input type="text" placeholder="Search vendors…" value={search}
          onChange={e => setSearch(e.target.value)} className="input pl-9" />
      </div>

      {/* ── Create form ─────────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="card space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">New Vendor</h2>
            <button onClick={() => setShowCreate(false)}><X size={18} className="text-gray-400" /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {VENDOR_FIELDS.map(k => (
              <div key={k}>
                <FieldLabel k={k} />
                <input className="input" {...field(k)} />
              </div>
            ))}
          </div>

          {/* Admin login — always visible */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-sm font-semibold text-gray-700">
              Vendor Admin Login <span className="text-xs text-gray-400 font-normal">(optional — vendor admin can register workers)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Admin Name</label>
                <input className="input" placeholder="e.g. Suresh (Admin)" value={admin.name}
                  onChange={e => setAdmin(a => ({ ...a, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Login Email</label>
                <input className="input" type="email" placeholder="admin@vendor.com" value={admin.email}
                  onChange={e => setAdmin(a => ({ ...a, email: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Password</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input className="input pr-10 font-mono" type={showPass ? "text" : "password"}
                      placeholder="Min 8 chars, letters + numbers" value={admin.password}
                      onChange={e => setAdmin(a => ({ ...a, password: e.target.value }))} />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button type="button" title="Generate password"
                    onClick={() => { setAdmin(a => ({ ...a, password: genPassword() })); setShowPass(true); }}
                    className="btn-secondary px-3"><RefreshCw size={15} /></button>
                  {admin.password && (
                    <button type="button" title="Copy password" onClick={copyPassword} className="btn-secondary px-3">
                      <Copy size={15} />
                    </button>
                  )}
                </div>
                {admin.password && <p className="text-xs text-amber-600 mt-1">Save this password — it won't be shown again.</p>}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Create Vendor"}
            </button>
            <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Vendor cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? [...Array(6)].map((_, i) => <div key={i} className="card animate-pulse h-32 bg-gray-100" />)
          : vendors.map(v => (
            <div key={v.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{v.name}</h3>
                  <p className="text-xs text-gray-400 font-mono">{v.code}</p>
                </div>
                {isSuperAdmin && (
                  <CardMenu
                    vendor={v}
                    onEdit={() => openEdit(v)}
                    onToggle={() => toggleMutation.mutate({ id: v.id, status: v.status === "active" ? "inactive" : "active" })}
                  />
                )}
              </div>
              <div className="mt-2 space-y-0.5">
                <p className="text-sm text-gray-500 truncate">{v.contact_person}</p>
                <p className="text-xs text-gray-400 truncate">{v.contact_email}</p>
                <p className="text-xs text-gray-400">{[v.city, v.state].filter(Boolean).join(", ")}</p>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className={`badge ${v.status === "active" ? "badge-green" : "badge-gray"}`}>{v.status}</span>
              </div>
            </div>
          ))}
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
                {VENDOR_FIELDS.map(k => (
                  <div key={k}>
                    <FieldLabel k={k} />
                    <input className="input" {...field(k)} />
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
                <button className="btn-primary flex-1 justify-center"
                  disabled={updateMutation.isPending}
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
