import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { Plus, Building2 } from "lucide-react";

const INIT = {
  name: "", code: "", address: "", city: "", state: "", pin: "",
  contact_person: "", contact_email: "", contact_phone: "", gst_number: "",
};

export default function CompanyList() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INIT);

  const { data, isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn:  () => api.get("/companies").then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: (d) => api.post("/companies", d),
    onSuccess: () => { toast.success("Company created."); queryClient.invalidateQueries(["companies"]); setShowForm(false); setForm(INIT); },
    onError: (err) => toast.error(Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? "Error creating company"),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Companies</h1>
          <p className="text-sm text-gray-500 mt-0.5">Client companies that use the attendance system</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Add Company
        </button>
      </div>

      {showForm && (
        <div className="card space-y-4">
          <h2 className="font-semibold">New Company</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.keys(INIT).map((k) => (
              <div key={k}>
                <label className="label capitalize">{k.replace(/_/g, " ")}</label>
                <input
                  className="input"
                  value={form[k]}
                  onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => create.mutate(form)} disabled={create.isPending}>
              {create.isPending ? "Saving..." : "Create Company"}
            </button>
            <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? [...Array(3)].map((_, i) => <div key={i} className="card h-36 animate-pulse bg-gray-100" />)
          : data?.data?.map((c) => (
            <div key={c.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center">
                  <Building2 size={20} className="text-brand-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{c.name}</h3>
                  <p className="text-xs text-gray-400 font-mono">{c.code}</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">{c.contact_person}</p>
              <p className="text-xs text-gray-400">{c.contact_email}</p>
              <p className="text-xs text-gray-400">{c.city}, {c.state} - {c.pin}</p>
              <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                <span className={`badge ${c.status === "active" ? "badge-green" : "badge-gray"}`}>{c.status}</span>
                {c.gst_number && <span className="text-xs text-gray-400 font-mono">{c.gst_number}</span>}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
