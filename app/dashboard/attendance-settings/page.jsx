"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import Loader from "@/components/ui/Loader";

function fmtDateTime(value) {
  if (!value) return "Not updated yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not updated yet";
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AttendanceSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [savingCollector, setSavingCollector] = useState(false);
  const [showToast, toastNode] = useToast();

  const [wfhAssignments, setWfhAssignments] = useState([]);
  const [wfhForm, setWfhForm] = useState({
    date: new Date().toISOString().split("T")[0],
    target_type: "job_title",
    target_value: "",
    reason: "Work From Home Day",
  });
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [savingWfh, setSavingWfh] = useState(false);

  useEffect(() => {
    apiFetch("/attendance/settings")
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));

    loadWfh();
  }, []);

  const loadWfh = async () => {
    try {
      const [w, e, d] = await Promise.all([
        apiFetch("/attendance/wfh-assignment").catch(() => []),
        apiFetch("/employees/").catch(() => []),
        apiFetch("/departments/").catch(() => []),
      ]);
      setWfhAssignments(Array.isArray(w) ? w : []);
      const eligibleEmployees = (Array.isArray(e) ? e : []).filter(
        (employee) => employee.is_active !== false && !employee.is_superuser
      );
      const eligibleDepartmentNames = new Set(eligibleEmployees.map((employee) => employee.department).filter(Boolean));
      setEmployees(eligibleEmployees);
      setDepartments((Array.isArray(d) ? d : []).filter((department) => eligibleDepartmentNames.has(department.name)));

      setWfhForm((prev) => {
        if (prev.target_value !== "") return prev;
        const eList = eligibleEmployees;
        const dJC = Array.from(new Set(eList.map(emp => emp.job_title).filter(Boolean))).sort();
        if (prev.target_type === "job_title" && dJC.length > 0) {
          return { ...prev, target_value: dJC[0] };
        }
        return prev;
      });
    } catch {}
  };

  const dynamicJobCategories = Array.from(new Set(employees.map(emp => emp.job_title).filter(Boolean))).sort();

  async function createWfhAssignment() {
    if (!wfhForm.date || !wfhForm.target_value) {
      showToast("Please fill in date and target value", "error");
      return;
    }
    setSavingWfh(true);
    try {
      await apiFetch("/attendance/wfh-assignment", {
        method: "POST",
        body: JSON.stringify(wfhForm),
      });
      showToast("WFH Assignment created successfully!");
      loadWfh();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSavingWfh(false);
    }
  }

  async function deleteWfhAssignment(id) {
    if (!confirm("Are you sure you want to delete this WFH assignment?")) return;
    try {
      await apiFetch(`/attendance/wfh-assignment/${id}`, { method: "DELETE" });
      showToast("WFH assignment deleted");
      loadWfh();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function saveRules() {
    if (!settings) return;
    const requiredFields = ["shift_start", "late_after", "half_day_in_after", "absent_in_after", "early_leave_before", "half_day_out_before", "absent_out_before", "shift_end"];
    for (const f of requiredFields) {
      if (!settings[f] || !String(settings[f]).trim()) {
        showToast(`Please specify a valid time for ${f.replace(/_/g, " ")}`, "error");
        return;
      }
    }
    setSavingRules(true);
    try {
      const payload = {
        shift_start: (settings.shift_start || "").slice(0, 5),
        late_after: (settings.late_after || "").slice(0, 5),
        half_day_in_after: (settings.half_day_in_after || "").slice(0, 5),
        absent_in_after: (settings.absent_in_after || "").slice(0, 5),
        early_leave_before: (settings.early_leave_before || "").slice(0, 5),
        half_day_out_before: (settings.half_day_out_before || "").slice(0, 5),
        absent_out_before: (settings.absent_out_before || "").slice(0, 5),
        shift_end: (settings.shift_end || "").slice(0, 5),
        lunch_start: settings.lunch_start ? (settings.lunch_start || "").slice(0, 5) : null,
        lunch_end: settings.lunch_end ? (settings.lunch_end || "").slice(0, 5) : null,
        lates_per_half_day_deduction: settings.lates_per_half_day_deduction,
        early_leaves_per_half_day: settings.early_leaves_per_half_day,
        allow_web_punch: settings.allow_web_punch,
      };
      await apiFetch("/attendance/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      showToast("Attendance rules updated!");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSavingRules(false);
    }
  }

  async function saveCollector() {
    if (!settings) return;
    setSavingCollector(true);
    try {
      await apiFetch("/attendance/settings", {
        method: "PUT",
        body: JSON.stringify({
          log_collector_enabled: !!settings.log_collector_enabled,
        }),
      });
      showToast("Log collector setting updated!");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSavingCollector(false);
    }
  }

  if (loading) return <Loader />;

  return (
    <div>
      <div className="page-header">
        <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Attendance Settings</h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>
          Control machine log ingestion, shift rules, and Work From Home (WFH) grants.
        </p>
      </div>

      {/* ─── Work From Home (WFH) Management Section ────────────────── */}
      <div className="card" style={{ padding: 24, marginBottom: 28, border: "1px solid var(--accent-light, #06b6d4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <div className="syne" style={{ fontSize: 18, fontWeight: 800, color: "#06b6d4", display: "flex", alignItems: "center", gap: 8 }}>
              <span>🏠</span> Work From Home (WFH) Grant Engine
            </div>
            <p style={{ color: "var(--muted)", margin: "4px 0 0 0", fontSize: 13 }}>
              Assign WFH only to active HR-and-below employees. Super Admin and deactivated accounts are excluded. The 2nd Saturday is automatically WFH for eligible employees.
            </p>
          </div>
        </div>

        <div style={{ background: "var(--hover-bg)", padding: 18, borderRadius: 12, marginBottom: 20, border: "1px solid var(--border)" }}>
          <div className="form-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 14 }}>
            <div className="form-group">
              <label className="label" style={{ fontWeight: 700 }}>Date *</label>
              <input
                className="input"
                type="date"
                value={wfhForm.date}
                onChange={(e) => setWfhForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label className="label" style={{ fontWeight: 700 }}>Assign To (Target Type) *</label>
              <select
                className="input"
                value={wfhForm.target_type}
                onChange={(e) => {
                  const tt = e.target.value;
                  let defVal = dynamicJobCategories[0] || "";
                  if (tt === "employee" && employees.length) defVal = employees[0].emp_id;
                  if (tt === "department" && departments.length) defVal = departments[0].name;
                  if (tt === "all") defVal = "All Eligible Employees";
                  setWfhForm((f) => ({ ...f, target_type: tt, target_value: defVal }));
                }}
              >
                <option value="job_title">Job Category / Role (e.g. 2D Animator, Developer)</option>
                <option value="employee">Specific Employee</option>
                <option value="department">Entire Department</option>
                <option value="all">All Active Employees (excluding Super Admin)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="label" style={{ fontWeight: 700 }}>Target Value *</label>
              {wfhForm.target_type === "job_title" ? (
                <select
                  className="input"
                  value={wfhForm.target_value}
                  onChange={(e) => setWfhForm((f) => ({ ...f, target_value: e.target.value }))}
                >
                  {dynamicJobCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              ) : wfhForm.target_type === "employee" ? (
                <select
                  className="input"
                  value={wfhForm.target_value}
                  onChange={(e) => setWfhForm((f) => ({ ...f, target_value: e.target.value }))}
                >
                  {employees.map((emp) => (
                    <option key={emp.emp_id} value={emp.emp_id}>
                      {emp.emp_id} - {emp.first_name || emp.user?.first_name || ""} {emp.last_name || emp.user?.last_name || ""} ({emp.job_title || emp.department || "Employee"})
                    </option>
                  ))}
                </select>
              ) : wfhForm.target_type === "department" ? (
                <select
                  className="input"
                  value={wfhForm.target_value}
                  onChange={(e) => setWfhForm((f) => ({ ...f, target_value: e.target.value }))}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <input className="input" value="All Active Employees (excluding Super Admin)" disabled />
              )}
            </div>

            <div className="form-group">
              <label className="label" style={{ fontWeight: 700 }}>Reason / Note</label>
              <input
                className="input"
                placeholder="e.g. Special WFH Grant"
                value={wfhForm.reason}
                onChange={(e) => setWfhForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            <button className="btn-primary" onClick={createWfhAssignment} disabled={savingWfh} style={{ background: "#06b6d4", borderColor: "#06b6d4" }}>
              {savingWfh ? "Assigning..." : "Assign WFH"}
            </button>
          </div>
        </div>

        {/* List of active WFH Assignments */}
        <div className="syne" style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Active & Past WFH Grants</div>
        {wfhAssignments.length === 0 ? (
          <div style={{ padding: 16, color: "var(--muted)", textAlign: "center", fontSize: 13, background: "var(--hover-bg)", borderRadius: 8 }}>
            No custom WFH grants created yet. (2nd Saturdays automatically grant WFH to everyone).
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Target Type</th>
                  <th>Target Value</th>
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {wfhAssignments.map((a) => (
                  <tr key={a.id}>
                    <td><strong style={{ color: "#06b6d4" }}>{a.date}</strong></td>
                    <td style={{ textTransform: "capitalize" }}>{a.target_type?.replace("_", " ")}</td>
                    <td><span className="badge" style={{ background: "rgba(6,182,212,0.12)", color: "#06b6d4" }}>{a.target_value}</span></td>
                    <td>{a.reason || "Work From Home"}</td>
                    <td>
                      <button className="btn-ghost" style={{ color: "#ef4444", padding: "4px 10px", fontSize: 12 }} onClick={() => deleteWfhAssignment(a.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Log Collector Card ────────────────────────────── */}
      <div className="card" style={{ padding: 24, marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ maxWidth: 680 }}>
            <div className="syne" style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Log Collector</div>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Attendance device pushes are written into HRMS only when this collector is enabled. Device heartbeat and biometric sync continue even while log collection is off.
            </p>
          </div>
          <div style={{
            padding: "8px 14px",
            borderRadius: 999,
            border: `1px solid ${settings?.log_collector_enabled ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.2)"}`,
            background: settings?.log_collector_enabled ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
            color: settings?.log_collector_enabled ? "#10b981" : "#ef4444",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>
            {settings?.log_collector_enabled ? "Collector On" : "Collector Off"}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 14, marginTop: 18 }}>
          <div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--hover-bg)" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Last changed</div>
            <div style={{ fontWeight: 700 }}>{fmtDateTime(settings?.log_collector_enabled_at)}</div>
          </div>
          <div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--hover-bg)" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Changed by</div>
            <div style={{ fontWeight: 700 }}>{settings?.log_collector_enabled_by_name || "Not recorded yet"}</div>
          </div>
          <div style={{ padding: "14px 16px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--hover-bg)" }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Behavior while off</div>
            <div style={{ fontWeight: 700 }}>ATTLOG pushes are ignored</div>
          </div>
        </div>

        <div style={{
          marginTop: 18,
          padding: "14px 16px",
          borderRadius: 14,
          border: "1px solid rgba(245,158,11,0.18)",
          background: "rgba(245,158,11,0.08)",
          color: "#f59e0b",
          fontSize: 13,
          lineHeight: 1.55,
        }}>
          Keep this off when you do not want attendance imports. Machine logs sent during that period are not stored in HRMS.
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginTop: 20, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!settings?.log_collector_enabled}
              onChange={(e) => setSettings((current) => ({ ...current, log_collector_enabled: e.target.checked }))}
            />
            Collect machine attendance logs
          </label>
          <button className="btn-primary" onClick={saveCollector} disabled={savingCollector}>
            {savingCollector ? "Saving..." : "Save Collector"}
          </button>
        </div>
      </div>

      {/* ─── Attendance Rule Engine Card ────────────────────── */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div className="syne" style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Attendance Rule Engine</div>
            <p style={{ color: "var(--muted)", margin: 0 }}>Edit shift timings and deduction thresholds without redeploying code.</p>
          </div>
        </div>

        <div className="form-row">
          {["shift_start", "late_after", "half_day_in_after", "absent_in_after", "early_leave_before", "half_day_out_before", "absent_out_before", "shift_end", "lunch_start", "lunch_end"].map((field) => (
            <div className="form-group" key={field}>
              <label className="label" style={{ fontWeight: 700, textTransform: "capitalize", color: "var(--text)" }}>
                {field.replace(/_/g, " ")} <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                className="input"
                type="time"
                step="60"
                style={{ background: "var(--surface)", color: "var(--text)" }}
                value={(settings?.[field] || "").slice(0, 5)}
                onChange={(e) => setSettings((item) => ({ ...item, [field]: e.target.value }))}
                required
              />
            </div>
          ))}
          <div className="form-group">
            <label className="label" style={{ fontWeight: 700, color: "var(--text)" }}>Lates Per Half-Day Deduction</label>
            <input
              className="input"
              type="number"
              min={0}
              style={{ background: "var(--surface)", color: "var(--text)" }}
              value={settings?.lates_per_half_day_deduction ?? 0}
              onChange={(e) => setSettings((item) => ({ ...item, lates_per_half_day_deduction: Math.max(0, +e.target.value) }))}
            />
          </div>
          <div className="form-group">
            <label className="label" style={{ fontWeight: 700, color: "var(--text)" }}>Early Leaves Per Half-Day</label>
            <input
              className="input"
              type="number"
              min={0}
              style={{ background: "var(--surface)", color: "var(--text)" }}
              value={settings?.early_leaves_per_half_day ?? 0}
              onChange={(e) => setSettings((item) => ({ ...item, early_leaves_per_half_day: Math.max(0, +e.target.value) }))}
            />
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <input
            type="checkbox"
            checked={settings?.allow_web_punch || false}
            onChange={(e) => setSettings((item) => ({ ...item, allow_web_punch: e.target.checked }))}
          />
          Allow web punch
        </label>

        <button className="btn-primary" onClick={saveRules} disabled={savingRules}>
          {savingRules ? "Saving..." : "Save Rules"}
        </button>
      </div>

      {toastNode}
    </div>
  );
}
