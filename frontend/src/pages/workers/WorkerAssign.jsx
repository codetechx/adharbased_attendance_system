import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useAuth } from "@/contexts/AuthContext";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Plus, Lock, Unlock, X, Calendar, Building2 } from "lucide-react";

const STATUS_COLORS = {
  active:    "badge-green",
  cancelled: "badge-red",
  completed: "badge-gray",
};

export default function WorkerAssign() {
  const queryClient   = useQueryClient();
  const { user }      = useAuth();
  const isVendorAdmin = ["vendor_admin", "vendor_operator"].includes(user?.role);

  const today = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState({
    worker_id: "", company_id: "", start_date: today, end_date: "", shift: "general", notes: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState("current"); // current | previous | all

  // My workers (vendor-scoped) — active ones only for deployment
  const { data: workers } = useQuery({
    queryKey: ["workers-active"],
    queryFn:  () => api.get("/workers", { params: { status: "active", per_page: 200 } }).then(r => r.data.data),
    enabled:  isVendorAdmin,
  });

  // Approved companies for this vendor
  const { data: companiesRaw } = useQuery({
    queryKey: ["vendor-available-companies", user?.vendor_id],
    queryFn:  () => api.get(`/vendors/${user.vendor_id}/available-companies`).then(r => r.data),
    enabled:  !!user?.vendor_id,
  });
  const approvedCompanies = companiesRaw?.filter(c => c.request_status === "approved") ?? [];

  const tabParams = {
    current:  { deployment: "current" },
    previous: { deployment: "previous" },
    all:      {},
  };

  // All my deployments (assignments)
  const { data: assignments, isLoading } = useQuery({
    queryKey: ["assignments", tab],
    queryFn:  () => api.get("/assignments", { params: { ...tabParams[tab], per_page: 100 } }).then(r => r.data),
  });

  const deploy = useMutation({
    mutationFn: (d) => api.post("/assignments", d),
    onSuccess: () => {
      toast.success("Worker deployed successfully.");
      queryClient.invalidateQueries(["assignments"]);
      setForm({ worker_id: "", company_id: "", start_date: today, end_date: "", shift: "general", notes: "" });
      setShowForm(false);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? "Deployment failed."),
  });

  const cancel = useMutation({
    mutationFn: (id) => api.delete(`/assignments/${id}`),
    onSuccess: () => {
      toast.success("Deployment cancelled.");
      queryClient.invalidateQueries(["assignments"]);
    },
    onError: (err) => toast.error(err.response?.data?.message ?? "Cannot cancel."),
  });

  const f = (k) => ({ value: form[k], onChange: (e) => setForm(p => ({ ...p, [k]: e.target.value })) });

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Worker Deployments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Assign workers to companies for a date range</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary">
          <Plus size={16} />
          New Deployment
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">New Deployment</h2>
            <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Worker *</label>
              <select {...f("worker_id")} className="input">
                <option value="">Select worker...</option>
                {workers?.map(w => (
                  <option key={w.id} value={w.id}>{w.name} — {w.vendor?.name}</option>
                ))}
              </select>
              {!workers?.length && (
                <p className="text-xs text-amber-600 mt-1">No active workers. Workers need fingerprint enrolled first.</p>
              )}
            </div>

            <div>
              <label className="label">Company *</label>
              <select {...f("company_id")} className="input">
                <option value="">Select company...</option>
                {approvedCompanies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {!approvedCompanies.length && (
                <p className="text-xs text-amber-600 mt-1">No approved companies. Request company access first.</p>
              )}
            </div>

            <div>
              <label className="label">Start Date *</label>
              <input type="date" {...f("start_date")} className="input" min={today} />
            </div>

            <div>
              <label className="label">End Date *</label>
              <input type="date" {...f("end_date")} className="input"
                min={form.start_date || today} />
            </div>

            <div>
              <label className="label">Shift</label>
              <select {...f("shift")} className="input">
                <option value="general">General</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="night">Night</option>
              </select>
            </div>

            <div>
              <label className="label">Notes</label>
              <input {...f("notes")} className="input" placeholder="Optional notes..." />
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => deploy.mutate(form)}
              disabled={!form.worker_id || !form.company_id || !form.start_date || !form.end_date || deploy.isPending}
              className="btn-primary"
            >
              {deploy.isPending ? "Deploying..." : "Deploy Worker"}
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: "current",  label: "Current" },
          { key: "previous", label: "Previous" },
          { key: "all",      label: "All" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Deployments table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Worker</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Company</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Period</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Lock</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="py-3 px-5">
                    <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                  </td>
                </tr>
              ))
            ) : assignments?.data?.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-gray-400">No deployments found.</td>
              </tr>
            ) : assignments?.data?.map(a => (
              <tr key={a.id} className="hover:bg-gray-50/50">
                <td className="px-5 py-3">
                  <p className="font-medium text-gray-900">{a.worker?.name}</p>
                  <p className="text-xs text-gray-400">{a.vendor?.name}</p>
                </td>
                <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                  <div className="flex items-center gap-1.5">
                    <Building2 size={13} className="text-gray-400" />
                    {a.company?.name}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Calendar size={12} className="text-gray-400" />
                    <span>{a.start_date && format(new Date(a.start_date), "dd MMM")}</span>
                    <span className="text-gray-400">→</span>
                    <span>{a.end_date && format(new Date(a.end_date), "dd MMM yyyy")}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`badge ${STATUS_COLORS[a.status] ?? "badge-gray"}`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {a.is_locked ? (
                    <span title="Attendance recorded — dates locked">
                      <Lock size={15} className="text-amber-500 inline" />
                    </span>
                  ) : (
                    <span title="No attendance yet — dates can be edited">
                      <Unlock size={15} className="text-gray-300 inline" />
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {a.status === "active" && (
                    <button
                      onClick={() => cancel.mutate(a.id)}
                      disabled={cancel.isPending}
                      className="text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
