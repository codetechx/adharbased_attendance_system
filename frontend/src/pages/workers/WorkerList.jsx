import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/lib/axios";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Search, Fingerprint, UserCheck, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";

const STATUS_BADGE = {
  active:   "badge-green",
  pending:  "badge-yellow",
  inactive: "badge-gray",
  blocked:  "badge-red",
};

export default function WorkerList() {
  const { user }           = useAuth();
  const queryClient        = useQueryClient();
  const [search, setSearch]  = useState("");
  const [status, setStatus]  = useState("");
  const [page, setPage]      = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["workers", search, status, page],
    queryFn:  () => api.get("/workers", { params: { search, status, page } }).then((r) => r.data),
    keepPreviousData: true,
  });

  const canRegister = ["super_admin", "vendor_admin", "vendor_operator"].includes(user?.role);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workers</h1>
          <p className="text-gray-500 text-sm mt-0.5">Registered labor / workers</p>
        </div>
        {canRegister && (
          <Link to="/workers/register" className="btn-primary">
            <Plus size={16} />
            Register Worker
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="input w-auto"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="card">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-4 border-b last:border-0 animate-pulse">
              <div className="w-10 h-10 bg-gray-100 rounded-full" />
              <div className="flex-1 space-y-1">
                <div className="h-4 bg-gray-100 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Worker</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Vendor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Aadhaar</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">FP</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.data?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-12">
                    No workers found. {canRegister && <Link to="/workers/register" className="text-brand-600 underline">Register one</Link>}
                  </td>
                </tr>
              ) : data?.data?.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm flex-shrink-0">
                        {w.name[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{w.name}</p>
                        <p className="text-xs text-gray-400">{w.gender === "M" ? "Male" : w.gender === "F" ? "Female" : "Other"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-gray-600 hidden md:table-cell">{w.vendor?.name ?? "—"}</td>
                  <td className="px-4 py-4 text-gray-500 font-mono text-xs hidden sm:table-cell">
                    {w.aadhaar_number_masked ?? <span className="text-gray-300">Not uploaded</span>}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {w.fingerprint_enrolled_at
                      ? <Fingerprint size={16} className="text-green-500 mx-auto" title="Enrolled" />
                      : <Fingerprint size={16} className="text-gray-200 mx-auto" title="Not enrolled" />
                    }
                  </td>
                  <td className="px-4 py-4">
                    <span className={`badge ${STATUS_BADGE[w.status] ?? "badge-gray"}`}>
                      {w.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      {canRegister && (
                        <Link to={`/workers/${w.id}/edit`} className="text-xs text-brand-600 hover:underline">
                          Edit
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {data?.last_page > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Showing {data.from}–{data.to} of {data.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                  className="btn-secondary py-1 text-xs"
                >
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, data.last_page))}
                  disabled={page === data.last_page}
                  className="btn-secondary py-1 text-xs"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
