import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import toast from "react-hot-toast";
import { format, addDays } from "date-fns";
import { Plus } from "lucide-react";

export default function WorkerAssign() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    worker_id: "", company_id: "", assignment_date: format(addDays(new Date(), 1), "yyyy-MM-dd"),
    shift: "general", gate: "", notes: "",
  });

  const { data: workers } = useQuery({
    queryKey: ["workers-active"],
    queryFn:  () => api.get("/workers", { params: { status: "active", per_page: 200 } }).then((r) => r.data.data),
  });

  const { data: companies } = useQuery({
    queryKey: ["companies-approved"],
    queryFn:  () => api.get("/companies").then((r) => r.data.data),
  });

  const assign = useMutation({
    mutationFn: (d) => api.post("/assignments", d),
    onSuccess: () => {
      toast.success("Worker assigned successfully.");
      queryClient.invalidateQueries(["assignments"]);
      setForm((p) => ({ ...p, worker_id: "", notes: "" }));
    },
    onError: (err) => toast.error(err.response?.data?.message ?? "Assignment failed."),
  });

  const f = (k) => ({ value: form[k], onChange: (e) => setForm((p) => ({ ...p, [k]: e.target.value })) });

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Assign Worker</h1>
        <p className="text-sm text-gray-500 mt-0.5">Assign a worker to a company for a specific date</p>
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label">Worker *</label>
          <select {...f("worker_id")} className="input">
            <option value="">Select worker...</option>
            {workers?.map((w) => (
              <option key={w.id} value={w.id}>{w.name} — {w.vendor?.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Company *</label>
          <select {...f("company_id")} className="input">
            <option value="">Select company...</option>
            {companies?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Date *</label>
            <input type="date" {...f("assignment_date")} className="input" min={format(new Date(), "yyyy-MM-dd")} />
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
        </div>

        <div>
          <label className="label">Gate / Location</label>
          <input {...f("gate")} className="input" placeholder="e.g. Main Gate, Gate 2..." />
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea {...f("notes")} rows={2} className="input resize-none" placeholder="Optional notes..." />
        </div>

        <button
          onClick={() => assign.mutate(form)}
          disabled={!form.worker_id || !form.company_id || !form.assignment_date || assign.isPending}
          className="btn-primary w-full justify-center py-2.5"
        >
          <Plus size={16} />
          {assign.isPending ? "Assigning..." : "Assign Worker"}
        </button>
      </div>
    </div>
  );
}
