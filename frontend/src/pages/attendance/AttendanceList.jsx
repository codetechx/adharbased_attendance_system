import { useState } from "react";
import PropTypes from "prop-types";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { format } from "date-fns";
import { LogIn, LogOut, Fingerprint, Camera, Shield, MapPin, Image } from "lucide-react";

const METHOD_BADGE = {
  fingerprint: { label: "Fingerprint", icon: Fingerprint, cls: "badge-green" },
  photo:       { label: "Photo",       icon: Camera,      cls: "badge-blue" },
  id_card:     { label: "ID Card",     icon: Shield,      cls: "badge-purple" },
  manual:      { label: "Manual",      icon: Shield,      cls: "badge-yellow" },
};

const SKELETON_KEYS = ["sk-a","sk-b","sk-c","sk-d","sk-e","sk-f","sk-g","sk-h"];

function MethodBadge({ method }) {
  const cfg  = METHOD_BADGE[method] ?? METHOD_BADGE.manual;
  const Icon = cfg.icon;
  return (
    <span className={`badge ${cfg.cls} text-xs`}>
      <Icon size={10} className="mr-1" />{cfg.label}
    </span>
  );
}

MethodBadge.propTypes = {
  method: PropTypes.string.isRequired,
};

function TypeBadge({ type }) {
  const isIn = type === "IN";
  const Icon = isIn ? LogIn : LogOut;
  return (
    <span className={`badge ${isIn ? "badge-green" : "badge-blue"}`}>
      <Icon size={10} className="mr-1" />{type}
    </span>
  );
}

TypeBadge.propTypes = {
  type: PropTypes.string.isRequired,
};

export default function AttendanceList() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["attendance", date, type, page],
    queryFn:  () => api.get("/attendance", { params: { date, type, page } }).then(r => r.data),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance Log</h1>
        <p className="text-sm text-gray-500 mt-0.5">All attendance records</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setPage(1); }}
          className="input w-auto"
        />
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="input w-auto"
        >
          <option value="">All Types</option>
          <option value="IN">IN</option>
          <option value="OUT">OUT</option>
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-gray-500">Worker</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Company</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Location</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Time</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Auth</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Proof</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && SKELETON_KEYS.map((key) => (
              <tr key={key}>
                <td colSpan={7} className="py-3 px-5">
                  <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
                </td>
              </tr>
            ))}
            {!isLoading && data?.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-400">No records for this date.</td>
              </tr>
            )}
            {!isLoading && data?.data?.map((log) => (
              <tr key={log.id} className="hover:bg-gray-50/50">
                <td className="px-5 py-3 font-medium text-gray-900">{log.worker?.name}</td>
                <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{log.company?.name}</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {log.location_name && (
                    <span className="flex items-center gap-1 text-gray-500 text-xs">
                      <MapPin size={11} className="text-gray-400" />
                      {log.location_name}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <TypeBadge type={log.type} />
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {format(new Date(log.marked_at), "hh:mm:ss a")}
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <MethodBadge method={log.method} />
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  {log.has_proof_photo ? (
                    <span title="Photo proof captured" className="inline-flex">
                      <Image size={15} className="text-brand-500" />
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data?.last_page > 1 && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
            <p className="text-xs text-gray-500">Showing {data.from}–{data.to} of {data.total}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1} className="btn-secondary py-1 text-xs">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page === data.last_page} className="btn-secondary py-1 text-xs">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
