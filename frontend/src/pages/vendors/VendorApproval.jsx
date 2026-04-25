import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { CheckCircle, XCircle, Clock, AlertTriangle, PauseCircle, PlayCircle } from "lucide-react";

function StatusBadge({ status }) {
  const map = {
    pending:   <span className="badge badge-yellow flex items-center gap-1"><Clock size={10} />Pending</span>,
    approved:  <span className="badge badge-green flex items-center gap-1"><CheckCircle size={10} />Approved</span>,
    rejected:  <span className="badge badge-red flex items-center gap-1"><XCircle size={10} />Rejected</span>,
    suspended: <span className="badge badge-gray flex items-center gap-1"><PauseCircle size={10} />Suspended</span>,
  };
  return map[status] ?? <span className="badge badge-gray">{status}</span>;
}

function VendorRow({ vendor, companyId, onRefresh }) {
  const [rejectText, setRejectText] = useState("");
  const [showReject, setShowReject] = useState(false);

  const status = vendor.pivot?.status;

  const act = (path, body) =>
    api.post(`/companies/${companyId}/vendors/${vendor.id}/${path}`, body ?? {})
      .then(() => { toast.success("Done."); onRefresh(); })
      .catch((e) => toast.error(e.response?.data?.message ?? "Error"));

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      status === "pending"   ? "border-yellow-200 bg-yellow-50" :
      status === "approved"  ? "border-green-100 bg-green-50"  :
      status === "suspended" ? "border-gray-200 bg-gray-50"    :
      "border-red-100 bg-red-50"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{vendor.name}
            <span className="text-xs font-mono text-gray-400 ml-2">{vendor.code}</span>
          </p>
          <p className="text-sm text-gray-500">{vendor.contact_person} · {vendor.contact_email}</p>
          <p className="text-xs text-gray-400">{[vendor.city, vendor.state].filter(Boolean).join(", ")}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="flex flex-wrap gap-2">
        {status === "pending" && (
          <>
            <button onClick={() => act("approve")} className="btn-success text-sm">
              <CheckCircle size={14} /> Approve
            </button>
            <button onClick={() => setShowReject(s => !s)} className="btn-danger text-sm">
              <XCircle size={14} /> Reject
            </button>
          </>
        )}
        {status === "approved" && (
          <button onClick={() => act("suspend")} className="btn-secondary text-sm text-amber-600 border-amber-200">
            <PauseCircle size={14} /> Suspend
          </button>
        )}
        {(status === "rejected" || status === "suspended") && (
          <button onClick={() => act("approve")} className="btn-success text-sm">
            <PlayCircle size={14} /> Re-approve
          </button>
        )}
      </div>

      {showReject && (
        <div className="flex gap-2">
          <input
            className="input text-sm flex-1"
            placeholder="Reason for rejection…"
            value={rejectText}
            onChange={e => setRejectText(e.target.value)}
          />
          <button
            className="btn-danger text-sm"
            onClick={() => {
              if (!rejectText.trim()) { toast.error("Enter a reason."); return; }
              act("reject", { reason: rejectText }).then(() => { setShowReject(false); setRejectText(""); });
            }}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

export default function VendorApproval() {
  const { user }    = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("pending");

  // Super admin picks a company; company_admin uses their own
  const [selectedCompanyId, setSelectedCompanyId] = useState(user?.company_id ?? null);
  const companyId = user?.isSuperAdmin ? selectedCompanyId : user?.company_id;

  const { data: companies } = useQuery({
    queryKey: ["companies-list"],
    queryFn:  () => api.get("/companies").then(r => r.data?.data ?? r.data),
    enabled:  user?.role === "super_admin",
  });

  const { data: vendors, isLoading, refetch } = useQuery({
    queryKey: ["company-vendors", companyId],
    queryFn:  () => api.get(`/companies/${companyId}/vendors`).then(r => r.data),
    enabled:  !!companyId,
  });

  const filtered = (vendors ?? []).filter(v =>
    filter === "all" ? true : v.pivot?.status === filter
  );

  const counts = {
    pending:   (vendors ?? []).filter(v => v.pivot?.status === "pending").length,
    approved:  (vendors ?? []).filter(v => v.pivot?.status === "approved").length,
    rejected:  (vendors ?? []).filter(v => v.pivot?.status === "rejected").length,
    suspended: (vendors ?? []).filter(v => v.pivot?.status === "suspended").length,
  };

  const TABS = [
    { key: "pending",   label: "Pending",   count: counts.pending },
    { key: "approved",  label: "Approved",  count: counts.approved },
    { key: "rejected",  label: "Rejected",  count: counts.rejected },
    { key: "suspended", label: "Suspended", count: counts.suspended },
    { key: "all",       label: "All",       count: (vendors ?? []).length },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vendor Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">
          Approve or reject vendor access requests for your company
        </p>
      </div>

      {/* Super admin: company selector */}
      {user?.role === "super_admin" && (
        <div className="card">
          <label className="label">Select Company</label>
          <select
            className="input max-w-xs"
            value={selectedCompanyId ?? ""}
            onChange={e => setSelectedCompanyId(e.target.value || null)}
          >
            <option value="">— choose company —</option>
            {(companies ?? []).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {companyId && (
        <>
          {/* Status tabs */}
          <div className="flex gap-1 flex-wrap">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === t.key
                    ? "bg-brand-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    filter === t.key ? "bg-white/20" : "bg-gray-200"
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {isLoading && <div className="text-gray-400 text-sm">Loading…</div>}

          {!isLoading && filtered.length === 0 && (
            <div className="card text-center py-12 text-gray-400">
              <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-gray-200" />
              <p>No {filter === "all" ? "" : filter} vendor requests.</p>
              {filter === "pending" && (
                <p className="text-sm mt-1">Vendors will appear here after they request access.</p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {filtered.map(v => (
              <VendorRow
                key={v.id}
                vendor={v}
                companyId={companyId}
                onRefresh={() => queryClient.invalidateQueries(["company-vendors", companyId])}
              />
            ))}
          </div>
        </>
      )}

      {!companyId && user?.role === "super_admin" && (
        <div className="card text-center py-12 text-gray-400">
          <p>Select a company above to manage its vendor requests.</p>
        </div>
      )}
    </div>
  );
}
