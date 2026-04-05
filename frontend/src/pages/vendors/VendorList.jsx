import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { Search, Plus } from "lucide-react";

export default function VendorList() {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", contact_person: "", contact_email: "", contact_phone: "", city: "", state: "", address: "", pin: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["vendors", search],
    queryFn:  () => api.get("/vendors", { params: { search } }).then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: (d) => api.post("/vendors", d),
    onSuccess: () => { toast.success("Vendor created."); queryClient.invalidateQueries(["vendors"]); setShowCreate(false); },
    onError: (err) => toast.error(Object.values(err.response?.data?.errors ?? {})[0]?.[0] ?? "Error"),
  });

  const requestAccess = useMutation({
    mutationFn: ({ vendorId, companyId }) => api.post(`/vendors/${vendorId}/request-company/${companyId}`),
    onSuccess: () => toast.success("Access request sent."),
    onError: (err) => toast.error(err.response?.data?.message ?? "Error"),
  });

  const isSuperAdmin = user?.role === "super_admin";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vendors</h1>
          <p className="text-sm text-gray-500 mt-0.5">Registered vendor companies</p>
        </div>
        {isSuperAdmin && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Add Vendor
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
        <input
          type="text" placeholder="Search vendors..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="input pl-9"
        />
      </div>

      {showCreate && (
        <div className="card space-y-4">
          <h2 className="font-semibold">New Vendor</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.keys(form).map((k) => (
              <div key={k}>
                <label className="label capitalize">{k.replace("_", " ")} {["name","code","contact_person","contact_email","contact_phone","address"].includes(k) && "*"}</label>
                <input className="input" value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => create.mutate(form)} disabled={create.isPending}>Save</button>
            <button className="btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? [...Array(6)].map((_, i) => <div key={i} className="card animate-pulse h-32 bg-gray-100" />)
          : data?.data?.map((v) => (
            <div key={v.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{v.name}</h3>
                  <p className="text-xs text-gray-400 font-mono">{v.code}</p>
                </div>
                <span className={`badge ${v.status === "active" ? "badge-green" : "badge-gray"}`}>{v.status}</span>
              </div>
              <p className="text-sm text-gray-500">{v.contact_person}</p>
              <p className="text-xs text-gray-400">{v.contact_email}</p>
              <p className="text-xs text-gray-400">{v.city}, {v.state}</p>
            </div>
          ))}
      </div>
    </div>
  );
}
