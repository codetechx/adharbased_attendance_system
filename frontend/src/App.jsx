import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import MainLayout from "@/components/layout/MainLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import CompanyList from "@/pages/companies/CompanyList";
import VendorList from "@/pages/vendors/VendorList";
import VendorApproval from "@/pages/vendors/VendorApproval";
import WorkerList from "@/pages/workers/WorkerList";
import WorkerRegister from "@/pages/workers/WorkerRegister";
import WorkerAssign from "@/pages/workers/WorkerAssign";
import AttendanceMark from "@/pages/attendance/AttendanceMark";
import AttendanceList from "@/pages/attendance/AttendanceList";
import AttendanceExceptions from "@/pages/attendance/AttendanceExceptions";

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />

      <Route path="/" element={<PrivateRoute><MainLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />

        {/* Companies — super admin only */}
        <Route path="companies" element={
          <PrivateRoute roles={["super_admin"]}>
            <CompanyList />
          </PrivateRoute>
        } />

        {/* Vendors */}
        <Route path="vendors" element={<VendorList />} />
        <Route path="vendors/approval" element={
          <PrivateRoute roles={["super_admin", "company_admin"]}>
            <VendorApproval />
          </PrivateRoute>
        } />

        {/* Workers */}
        <Route path="workers" element={<WorkerList />} />
        <Route path="workers/register" element={
          <PrivateRoute roles={["super_admin", "vendor_admin", "vendor_operator"]}>
            <WorkerRegister />
          </PrivateRoute>
        } />
        <Route path="workers/:id/edit" element={
          <PrivateRoute roles={["super_admin", "vendor_admin", "vendor_operator"]}>
            <WorkerRegister />
          </PrivateRoute>
        } />
        <Route path="workers/assign" element={
          <PrivateRoute roles={["super_admin", "vendor_admin"]}>
            <WorkerAssign />
          </PrivateRoute>
        } />

        {/* Attendance */}
        <Route path="attendance" element={<AttendanceList />} />
        <Route path="attendance/mark" element={
          <PrivateRoute roles={["super_admin", "company_admin", "company_gate"]}>
            <AttendanceMark />
          </PrivateRoute>
        } />
        <Route path="attendance/exceptions" element={<AttendanceExceptions />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}
