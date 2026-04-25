import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, Eye, EyeOff, RefreshCw, Copy } from "lucide-react";

const ALL_ROLES = [
  { value: "super_admin",      label: "Super Admin" },
  { value: "company_admin",    label: "Company Admin" },
  { value: "company_gate",     label: "Company Gate" },
  { value: "vendor_admin",     label: "Vendor Admin" },
  { value: "vendor_operator",  label: "Vendor Operator" },
];

const ROLE_BADGE = {
  super_admin:     "bg-purple-100 text-purple-700",
  company_admin:   "bg-blue-100 text-blue-700",
  company_gate:    "bg-cyan-100 text-cyan-700",
  vendor_admin:    "bg-orange-100 text-orange-700",
  vendor_operator: "bg-yellow-100 text-yellow-700",
};

function genPassword() {
  const a = "abcdefghijkmnpqrstuvwxyz", A = "ABCDEFGHJKLMNPQRSTUVWXYZ", n = "23456789";
  const all = a + A + n;
  let p = A[Math.floor(Math.random() * A.length)] + n[Math.floor(Math.random() * n.length)];
  for (let i = 0; i < 8; i++) p += all[Math.floor(Math.random() * all.length)];
  return p.split("").sort(() => Math.random() - 0.5).join("");
}

const EMPTY = { name: "", email: "", password: "", role: "", company_id: "", vendor_id: "", phone: "" };

export default function UserList() {
  const { user: authUser } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal]       = useState(null); // null | "create" | user-object
  const [form, setForm]         = useState(EMPTY);
  const [showPass, setShowPass] = useState(false);

  const isCompanyAdmin = authUser?.role === "company_admin";
  // company_admin can only manage gate users; super_admin manages all
  const availableRoles = isCompanyAdmin
    ? [{ value: "company_gate", label: "Company Gate" }]
    : ALL_ROLES;

  const { data: usersData, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn:  () => api.get("/users").then(r => r.data),
  });
  const users = usersData?.data ?? usersData ?? [];

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-simple"],
    queryFn:  () => api.get("/companies").then(r => r.data?.data ?? r.data),
    enabled:  !isCompanyAdmin,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors-simple"],
    queryFn:  () => api.get("/vendors").then(r => r.data?.data ?? r.data),
    enabled:  !isCompanyAdmin,
  });

  const openCreate = () => {
    setForm({ ...EMPTY, role: isCompanyAdmin ? "company_gate" : "" });
    setShowPass(false);
    setModal("create");
  };
  const openEdit = (u) => {
    setForm({ name: u.name, email: u.email, password: "", role: u.role,
              company_id: u.company_id ?? "", vendor_id: u.vendor_id ?? "", phone: u.phone ?? "" });
    setShowPass(false);
    setModal(u);
  };
  const close = () => setModal(null);

  const needsCompany = !isCompanyAdmin && ["company_admin", "company_gate"].includes(form.role);
  const needsVendor  = !isCompanyAdmin && ["vendor_admin", "vendor_operator"].includes(form.role);

  const createMutation = useMutation({
    mutationFn: (data) => api.post("/users", data),
    onSuccess: () => { toast.success("User created!"); qc.invalidateQueries(["users"]); close(); },
    onError:   (e) => toast.error(e.response?.data?.message || "Create failed."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/users/${id}`, data),
    onSuccess: () => { toast.success("User updated!"); qc.invalidateQueries(["users"]); close(); },
    onError:   (e) => toast.error(e.response?.data?.message || "Update failed."),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.put(`/users/${id}`, { is_active }),
    onSuccess: () => { toast.success("Status updated."); qc.invalidateQueries(["users"]); },
    onError:   () => toast.error("Failed to update status."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onSuccess: () => { toast.success("User deleted."); qc.invalidateQueries(["users"]); },
    onError:   () => toast.error("Delete failed."),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...form };
    if (!payload.password) delete payload.password;
    if (!payload.company_id) delete payload.company_id;
    if (!payload.vendor_id)  delete payload.vendor_id;
    if (!payload.phone)      delete payload.phone;

    if (modal === "create") {
      createMutation.mutate(payload);
    } else {
      updateMutation.mutate({ id: modal.id, data: payload });
    }
  };

  const field = (k) => ({
    value:    form[k],
    onChange: (e) => setForm(f => ({ ...f, [k]: e.target.value })),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isCompanyAdmin ? "Gate Users" : "User Management"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isCompanyAdmin
              ? "Manage gate users who mark attendance at your company"
              : "Create logins for company admins, gate users, and vendor staff"}
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={16} /> {isCompanyAdmin ? "Add Gate User" : "Add User"}
        </button>
      </div>

      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-400">Loading…</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                {!isCompanyAdmin && <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>}
                {!isCompanyAdmin && <th className="text-left px-4 py-3 font-medium text-gray-600">Linked To</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  {!isCompanyAdmin && (
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                        {u.role?.replace(/_/g, " ")}
                      </span>
                    </td>
                  )}
                  {!isCompanyAdmin && (
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {u.company?.name ?? u.vendor?.name ?? <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleMutation.mutate({ id: u.id, is_active: !u.is_active })}
                      className={`flex items-center gap-1 text-xs font-medium ${u.is_active ? "text-green-600" : "text-gray-400"}`}
                    >
                      {u.is_active
                        ? <><ToggleRight size={18} className="text-green-500" /> Active</>
                        : <><ToggleLeft  size={18} /> Inactive</>}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => openEdit(u)} className="p-1 hover:text-brand-600 text-gray-400" title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Delete ${u.name}?`)) deleteMutation.mutate(u.id); }}
                        className="p-1 hover:text-red-500 text-gray-400" title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan={isCompanyAdmin ? 4 : 6} className="px-4 py-8 text-center text-gray-400">
                    {isCompanyAdmin ? "No gate users yet. Add one to allow attendance marking." : "No users yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">
                {modal === "create"
                  ? (isCompanyAdmin ? "Add Gate User" : "Add User")
                  : "Edit User"}
              </h2>
              <button onClick={close}><X size={18} className="text-gray-400" /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input className="input" placeholder="e.g. Ramesh Kumar" required {...field("name")} />
              </div>

              <div>
                <label className="label">Email</label>
                <input className="input" type="email" placeholder="gate@company.com" required {...field("email")} />
              </div>

              <div>
                <label className="label">
                  {modal === "create" ? "Password" : "New Password (leave blank to keep)"}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      className="input pr-10 font-mono"
                      type={showPass ? "text" : "password"}
                      placeholder="Min 8 chars, letters + numbers"
                      required={modal === "create"}
                      {...field("password")}
                    />
                    <button type="button" onClick={() => setShowPass(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button type="button" title="Generate"
                    onClick={() => { setForm(f => ({ ...f, password: genPassword() })); setShowPass(true); }}
                    className="btn-secondary px-3">
                    <RefreshCw size={15} />
                  </button>
                  {form.password && (
                    <button type="button" title="Copy"
                      onClick={() => { navigator.clipboard.writeText(form.password); toast.success("Copied!"); }}
                      className="btn-secondary px-3">
                      <Copy size={15} />
                    </button>
                  )}
                </div>
                {form.password && <p className="text-xs text-amber-600 mt-1">Save this password — it won't be shown again.</p>}
              </div>

              {/* Role selector — hidden for company_admin (always company_gate) */}
              {!isCompanyAdmin && (
                <div>
                  <label className="label">Role</label>
                  <select className="input" required {...field("role")}>
                    <option value="">Select role…</option>
                    {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              )}

              {needsCompany && (
                <div>
                  <label className="label">Company</label>
                  <select className="input" required {...field("company_id")}>
                    <option value="">Select company…</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {needsVendor && (
                <div>
                  <label className="label">Vendor</label>
                  <select className="input" required {...field("vendor_id")}>
                    <option value="">Select vendor…</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="label">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
                <input className="input" placeholder="+91 98765 43210" {...field("phone")} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="btn-primary flex-1 justify-center">
                  {createMutation.isPending || updateMutation.isPending
                    ? "Saving…"
                    : modal === "create" ? (isCompanyAdmin ? "Create Gate User" : "Create User") : "Save Changes"}
                </button>
                <button type="button" onClick={close} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
