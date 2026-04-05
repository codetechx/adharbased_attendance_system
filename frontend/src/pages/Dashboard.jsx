import { useQuery } from "@tanstack/react-query";
import api from "@/lib/axios";
import { useAuth } from "@/contexts/AuthContext";
import {
  Users, Building2, UserCheck, Clock, AlertTriangle, CheckCircle, TrendingUp
} from "lucide-react";

function StatCard({ icon: Icon, label, value, color = "blue", sub }) {
  const colors = {
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    red:    "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
  };

  return (
    <div className="card flex items-start gap-4">
      <div className={`p-3 rounded-xl ${colors[color]}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value ?? "—"}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn:  () => api.get("/dashboard/stats").then((r) => r.data),
    refetchInterval: 60_000,
  });

  const { data: todayLogs } = useQuery({
    queryKey: ["today-attendance"],
    queryFn:  () => api.get("/dashboard/today-attendance").then((r) => r.data),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card animate-pulse h-24 bg-gray-100" />
        ))}
      </div>
    );
  }

  const renderSuperAdminStats = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      <StatCard icon={Building2}  label="Companies"        value={stats?.companies}        color="blue" />
      <StatCard icon={Users}      label="Vendors"          value={stats?.vendors}          color="purple" />
      <StatCard icon={UserCheck}  label="Active Workers"   value={stats?.active_workers}   color="green" sub={`${stats?.pending_workers} pending enrollment`} />
      <StatCard icon={AlertTriangle} label="Pending Approvals" value={stats?.pending_vendor_approvals} color="yellow" />
      <StatCard icon={Clock}      label="Today Assigned"   value={stats?.today_assignments} color="blue" />
      <StatCard icon={CheckCircle} label="Today IN"        value={stats?.today_in}          color="green" />
      <StatCard icon={TrendingUp}  label="Today OUT"       value={stats?.today_out}          color="purple" />
    </div>
  );

  const renderCompanyStats = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      <StatCard icon={Users}      label="Approved Vendors" value={stats?.approved_vendors}  color="blue" />
      <StatCard icon={Clock}      label="Today Assigned"   value={stats?.today_assignments} color="purple" />
      <StatCard icon={CheckCircle} label="Today IN"        value={stats?.today_in}           color="green" />
      <StatCard icon={AlertTriangle} label="Missing OUT"   value={stats?.pending_in}         color="red" />
      <StatCard icon={TrendingUp}  label="Today OUT"       value={stats?.today_out}           color="blue" />
      <StatCard icon={AlertTriangle} label="Pending Approvals" value={stats?.pending_approvals} color="yellow" />
    </div>
  );

  const renderVendorStats = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      <StatCard icon={Users}      label="Total Workers"    value={stats?.total_workers}     color="blue" />
      <StatCard icon={UserCheck}  label="Active Workers"   value={stats?.active_workers}    color="green" sub={`${stats?.pending_workers} pending`} />
      <StatCard icon={Building2}  label="Companies"        value={stats?.approved_companies} color="purple" />
      <StatCard icon={Clock}      label="Today Assigned"   value={stats?.today_assignments} color="yellow" />
      <StatCard icon={CheckCircle} label="Today Present"   value={stats?.today_present}     color="green" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {user?.role === "super_admin"   && renderSuperAdminStats()}
      {["company_admin", "company_gate"].includes(user?.role) && renderCompanyStats()}
      {["vendor_admin", "vendor_operator"].includes(user?.role) && renderVendorStats()}

      {/* Today's attendance feed */}
      {todayLogs?.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Today's Recent Activity</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {todayLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`badge ${log.type === "IN" ? "badge-green" : "badge-blue"}`}>{log.type}</span>
                  <span className="text-sm font-medium">{log.worker?.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{new Date(log.marked_at).toLocaleTimeString("en-IN")}</p>
                  <p className="text-xs text-gray-400">{log.marked_by?.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
