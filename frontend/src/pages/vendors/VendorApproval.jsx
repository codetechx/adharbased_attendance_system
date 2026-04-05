import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";

export default function VendorApproval() {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState({});

  const companyId = user?.company_id;

  const { data: vendors, isLoading } = useQuery({
    queryKey: ["company-vendors", companyId],
    queryFn:  () => api.get(`/companies/${companyId}/vendors`).then((r) => r.data),
    enabled:  !!companyId,
  });

  const approve = useMutation({
    mutationFn: (vendorId) => api.post(`/companies/${companyId}/vendors/${vendorId}/approve`),
    onSuccess: () => {
      toast.success("Vendor approved!");
      queryClient.invalidateQueries(["company-vendors"]);
    },
  });

  const reject = useMutation({
    mutationFn: ({ vendorId, reason: r }) =>
      api.post(`/companies/${companyId}/vendors/${vendorId}/reject`, { reason: r }),
    onSuccess: () => {
      toast.success("Vendor rejected.");
      queryClient.invalidateQueries(["company-vendors"]);
    },
  });

  const pending   = vendors?.filter((v) => v.pivot?.status === "pending") ?? [];
  const approved  = vendors?.filter((v) => v.pivot?.status === "approved") ?? [];
  const others    = vendors?.filter((v) => !["pending", "approved"].includes(v.pivot?.status)) ?? [];

  const StatusBadge = ({ status }) => ({
    pending:   <span className="badge badge-yellow"><Clock size={10} className="mr-1" />Pending</span>,
    approved:  <span className="badge badge-green"><CheckCircle size={10} className="mr-1" />Approved</span>,
    rejected:  <span className="badge badge-red"><XCircle size={10} className="mr-1" />Rejected</span>,
    suspended: <span className="badge badge-gray">Suspended</span>,
  }[status] ?? <span className="badge badge-gray">{status}</span>);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vendor Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">Manage vendor access requests for your company</p>
      </div>

      {/* Pending requests */}
      {pending.length > 0 && (
        <div className="card space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-yellow-500" />
            <h2 className="font-semibold text-gray-900">Pending Requests ({pending.length})</h2>
          </div>
          <div className="space-y-4">
            {pending.map((v) => (
              <div key={v.id} className="border border-yellow-100 rounded-xl p-4 bg-yellow-50 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{v.name}</p>
                    <p className="text-sm text-gray-500">{v.contact_email} · {v.contact_phone}</p>
                    <p className="text-xs text-gray-400">{v.city}, {v.state}</p>
                  </div>
                  <StatusBadge status="pending" />
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => approve.mutate(v.id)}
                    disabled={approve.isPending}
                    className="btn-success text-sm"
                  >
                    <CheckCircle size={14} />
                    Approve
                  </button>

                  <div className="flex gap-2 flex-1">
                    <input
                      type="text"
                      placeholder="Rejection reason..."
                      value={reason[v.id] ?? ""}
                      onChange={(e) => setReason((p) => ({ ...p, [v.id]: e.target.value }))}
                      className="input text-sm flex-1"
                    />
                    <button
                      onClick={() => {
                        if (!reason[v.id]) { toast.error("Enter rejection reason."); return; }
                        reject.mutate({ vendorId: v.id, reason: reason[v.id] });
                      }}
                      disabled={reject.isPending}
                      className="btn-danger text-sm"
                    >
                      <XCircle size={14} />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved vendors */}
      {approved.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900">Approved Vendors ({approved.length})</h2>
          <div className="divide-y divide-gray-50">
            {approved.map((v) => (
              <div key={v.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium text-gray-900">{v.name}</p>
                  <p className="text-xs text-gray-400">{v.contact_email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status="approved" />
                  <button
                    onClick={() => api.post(`/companies/${companyId}/vendors/${v.id}/suspend`).then(() => {
                      toast.success("Suspended.");
                      queryClient.invalidateQueries(["company-vendors"]);
                    })}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Suspend
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && approved.length === 0 && !isLoading && (
        <div className="card text-center py-12 text-gray-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p>No vendor requests yet.</p>
          <p className="text-sm mt-1">Vendors will appear here after they request access.</p>
        </div>
      )}
    </div>
  );
}
