"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { fmtDate, fmtTime, fmtINR } from "@/lib/formatters";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";
import AttendanceCalendar from "@/components/ui/AttendanceCalendar";
import Modal from "@/components/ui/Modal";
import { Hand } from "lucide-react";

const EMPTY_LEAVE_FORM = { subject: "", description: "", start_date: "", end_date: "", leave_type: "Casual Leave" };
const PRESENT_ATTENDANCE_STATUSES = new Set(["present", "p", "late", "l", "half_day", "h", "early_leave", "e"]);
const EXCUSED_ATTENDANCE_STATUSES = new Set(["wfh", "work_from_home", "f", "r", "holiday", "o", "week_off", "wo", "leave", "paid_leave"]);

function isPresentAttendance(record) {
  return PRESENT_ATTENDANCE_STATUSES.has(String(record?.status || "").toLowerCase()) || Boolean(record?.punch_in);
}

function isAbsentAttendance(record) {
  const status = String(record?.status || "").toLowerCase();
  return !isPresentAttendance(record) && !EXCUSED_ATTENDANCE_STATUSES.has(status);
}

// ─── Employee Dashboard ───────────────────────────────────────
function EmployeeDashboard({ user, showToast }) {
  const [attendance, setAttendance] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState(EMPTY_LEAVE_FORM);
  const [selectedLeave, setSelectedLeave] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [a, h, t, n, l] = await Promise.all([
          apiFetch("/attendance/me").catch(() => []),
          apiFetch("/attendance/holidays").catch(() => []),
          apiFetch("/tasks/my").catch(() => []),
          apiFetch("/notifications/").catch(() => []),
          apiFetch("/leave/my").catch(() => []),
        ]);
        setAttendance(Array.isArray(a?.records) ? a.records : Array.isArray(a) ? a : []);
        setHolidays(Array.isArray(h?.holidays) ? h.holidays : Array.isArray(h) ? h : []);
        setTasks(Array.isArray(t) ? t : []);
        setNotifications(Array.isArray(n?.notifications) ? n.notifications : Array.isArray(n) ? n : []);
        setLeaves(Array.isArray(l) ? l : []);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  async function submitQuickLeave() {
    if (!leaveForm.subject.trim()) { showToast("Subject is required", "error"); return; }
    if (!leaveForm.start_date || !leaveForm.end_date) { showToast("Please select both start and end dates", "error"); return; }
    if (leaveForm.end_date < leaveForm.start_date) { showToast("End date cannot be before start date", "error"); return; }
    try {
      const body = new FormData();
      body.append("subject", leaveForm.subject.trim());
      body.append("description", leaveForm.description.trim() || "Leave requested");
      body.append("start_date", leaveForm.start_date);
      body.append("end_date", leaveForm.end_date);
      body.append("leave_type", leaveForm.leave_type);
      await apiFetch("/leave/apply", {
        method: "POST",
        body,
      });
      showToast("Leave applied!");
      setLeaveModal(false);
      setLeaveForm({ subject: "", description: "", start_date: "", end_date: "", leave_type: "Casual Leave" });
      const refreshedLeaves = await apiFetch("/leave/my").catch(() => []);
      setLeaves(Array.isArray(refreshedLeaves) ? refreshedLeaves : []);
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  const presents = attendance.filter((r) => r.status === "present" || r.status === "half_day").length;
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const today = attendance.find((r) => r.date === new Date().toISOString().split("T")[0]);
  const unread = notifications.filter((n) => !n.is_read).length;
  const calendarAttendance = [...attendance];
  leaves.filter((leave) => ["pending", "approved"].includes(String(leave.status || "").toLowerCase())).forEach((leave) => {
    const cursor = new Date(`${leave.start_date}T00:00:00`);
    const end = new Date(`${leave.end_date}T00:00:00`);
    while (cursor <= end) {
      const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      calendarAttendance.push({ date, status: String(leave.status).toLowerCase() === "approved" ? "leave" : "pending_leave" });
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  function openQuickLeave(dateStr = "") {
    const existingLeave = leaves.find((leave) => {
      const status = String(leave.status || "").toLowerCase();
      return ["pending", "approved"].includes(status) && dateStr >= leave.start_date && dateStr <= leave.end_date;
    });
    if (existingLeave) {
      setSelectedLeave(existingLeave);
      return;
    }
    setLeaveForm({ ...EMPTY_LEAVE_FORM, start_date: dateStr, end_date: dateStr });
    setLeaveModal(true);
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="syne" style={{ fontSize: 28, fontWeight: 800, display: "flex", alignItems: "center", gap: 10 }}>Welcome back, {user?.first_name || "there"} <Hand size={28} aria-label="Welcome" /></h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="grid-stats" style={{ marginBottom: 28 }}>
        <div className="stat-card" style={{ "--accent": "var(--accent)" }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>⏱</div>
          <div className="syne" style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.04em" }}>
            {today?.punch_in ? `In at ${fmtTime(today.punch_in)}` : "Not recorded yet"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 6 }}>
            {today?.punch_out ? `Out at ${fmtTime(today.punch_out)}` : "Awaiting out-time"}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 12, padding: "8px 10px", background: "rgba(0,200,150,0.06)", borderRadius: 8, border: "1px solid rgba(0,200,150,0.14)" }}>
            Mark attendance at the biometric terminal
          </div>
        </div>
        <StatCard icon="✅" label="Days Present" value={presents} accent="#10b981" sub={`of ${attendance.length} tracked`} />
        <StatCard icon="📋" label="Pending Tasks" value={pendingTasks} accent="#f59e0b" />
        <StatCard icon="🔔" label="Notifications" value={unread} accent="#8b5cf6" />
      </div>

      {loading ? <Loader /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 20 }}>
          <div className="card">
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <h3 className="syne" style={{ fontSize: 15, fontWeight: 700 }}>Recent Attendance</h3>
            </div>
            {attendance.slice(0, 5).map((r, i) => (
              <div key={i} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
                <span style={{ color: "var(--muted)" }}>{fmtDate(r.date)}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {r.punch_in && <span style={{ fontSize: 12 }}>{fmtTime(r.punch_in)}</span>}
                  <StatusBadge status={r.status || "absent"} />
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <h3 className="syne" style={{ fontSize: 15, fontWeight: 700 }}>My Tasks</h3>
            </div>
            {tasks.length === 0 ? <EmptyState icon="✓" title="No tasks assigned" /> : tasks.slice(0, 5).map((t, i) => (
              <div key={i} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{t.title}</div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <AttendanceCalendar
              attendance={calendarAttendance}
              holidays={holidays}
              onDayClick={(dateStr) => {
                openQuickLeave(dateStr);
              }}
            />
          </div>
          <div className="card" style={{ gridColumn: "1 / -1" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <h3 className="syne" style={{ fontSize: 15, fontWeight: 700 }}>🔔 Notifications</h3>
            </div>
            {notifications.length === 0 ? <EmptyState icon="🔔" title="All caught up!" /> : notifications.slice(0, 6).map((n, i) => (
              <div key={i} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "center", fontSize: 14, opacity: n.is_read ? 0.6 : 1 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: n.is_read ? "var(--muted)" : "var(--accent)", flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{n.message}</span>
                <span style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>{n.time || (n.created_at ? fmtDate(n.created_at) : "Now")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {leaveModal && (
        <Modal title="Apply for Leave" onClose={() => { setLeaveModal(false); setLeaveForm(EMPTY_LEAVE_FORM); }}
          footer={<><button className="btn-ghost" onClick={() => setLeaveModal(false)}>Cancel</button><button className="btn-primary" onClick={submitQuickLeave}>Apply</button></>}>
          <div className="form-group"><label className="label">Leave Category</label>
            <select className="input" value={leaveForm.leave_type} onChange={(e) => setLeaveForm((form) => ({ ...form, leave_type: e.target.value }))}>
              <option value="Casual Leave">Casual Leave (CL)</option>
              <option value="Sick Leave">Sick Leave (SL)</option>
              <option value="Privileged Leave">Privileged Leave (PL)</option>
            </select>
          </div>
          <div className="form-group"><label className="label">Subject <span style={{ color: "#ef4444" }}>*</span></label><input className="input" required value={leaveForm.subject} onChange={(e) => setLeaveForm((form) => ({ ...form, subject: e.target.value }))} /></div>
          <div className="form-row">
            <div className="form-group"><label className="label">Start Date <span style={{ color: "#ef4444" }}>*</span></label><input className="input" type="date" required value={leaveForm.start_date} onChange={(e) => setLeaveForm((form) => ({ ...form, start_date: e.target.value }))} /></div>
            <div className="form-group"><label className="label">End Date <span style={{ color: "#ef4444" }}>*</span></label><input className="input" type="date" required min={leaveForm.start_date || undefined} value={leaveForm.end_date} onChange={(e) => setLeaveForm((form) => ({ ...form, end_date: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label className="label">Description</label><textarea className="input" rows={3} value={leaveForm.description} onChange={(e) => setLeaveForm((form) => ({ ...form, description: e.target.value }))} /></div>
        </Modal>
      )}
      {selectedLeave && (
        <Modal
          title="Leave Details"
          onClose={() => setSelectedLeave(null)}
          footer={<button className="btn-primary" onClick={() => setSelectedLeave(null)}>Close</button>}
        >
          <div style={{ display: "grid", gap: 14 }}>
            <div><span className="label">Status</span><div style={{ marginTop: 6 }}><StatusBadge status={selectedLeave.status} /></div></div>
            <div><span className="label">Subject</span><div style={{ marginTop: 6 }}>{selectedLeave.subject || "Leave Request"}</div></div>
            <div className="form-row">
              <div><span className="label">Start Date</span><div style={{ marginTop: 6 }}>{fmtDate(selectedLeave.start_date)}</div></div>
              <div><span className="label">End Date</span><div style={{ marginTop: 6 }}>{fmtDate(selectedLeave.end_date)}</div></div>
            </div>
            <div><span className="label">Description</span><div style={{ marginTop: 6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selectedLeave.description || "—"}</div></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── HR Dashboard ─────────────────────────────────────────
function HRDashboard({ showToast }) {
  const [today, setToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    apiFetch("/attendance/today").then((d) => { const recs = d?.records || d; setToday(Array.isArray(recs) ? recs : []); }).catch(() => {}).finally(() => setLoading(false));
    const t = setInterval(() => { apiFetch("/attendance/today").then((d) => { const recs = d?.records || d; setToday(Array.isArray(recs) ? recs : []); }).catch(() => {}); }, 60000);
    return () => clearInterval(t);
  }, []);

  const present = today.filter(isPresentAttendance).length;
  const wfh = today.filter((t) => (t.status || "").toLowerCase() === "wfh" || (t.status || "").toLowerCase() === "work_from_home").length;
  const absent = today.filter(isAbsentAttendance).length;
  const totalEmployees = today.length;

  const filteredToday = today.filter((t) => {
    const st = (t.status || "").toLowerCase();
    const isPresent = isPresentAttendance(t);
    const isWfh = st === "wfh" || st === "work_from_home";
    if (filterType === "present") return isPresent;
    if (filterType === "wfh") return isWfh;
    if (filterType === "absent") return isAbsentAttendance(t);
    return true;
  });

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Live Monitoring</h1>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>Today&apos;s real-time attendance overview</p>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 14px", borderRadius: 999,
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.25)",
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: "#10B981",
            boxShadow: "0 0 6px #10B981, 0 0 12px rgba(16,185,129,0.5)",
            animation: "pulse 2s infinite",
            display: "inline-block",
          }} />
          <span style={{ fontSize: 12, color: "#10B981", fontWeight: 700, letterSpacing: "0.05em" }} className="syne">Live</span>
        </div>
      </div>
      <div className="grid-stats" style={{ marginBottom: 24 }}>
        <StatCard
          icon="✅"
          label="Present Today"
          value={`${present}/${totalEmployees || 0}`}
          accent="#10b981"
          onClick={() => setFilterType("present")}
          style={{
            border: filterType === "present" ? "1px solid #10b981" : "1px solid var(--border)",
            boxShadow: filterType === "present" ? "0 0 16px rgba(16, 185, 129, 0.25)" : "none",
            transition: "all 0.2s ease",
          }}
        />
        <StatCard
          icon="🏠"
          label="Work From Home"
          value={wfh}
          accent="#06b6d4"
          onClick={() => setFilterType("wfh")}
          style={{
            border: filterType === "wfh" ? "1px solid #06b6d4" : "1px solid var(--border)",
            boxShadow: filterType === "wfh" ? "0 0 16px rgba(6, 182, 212, 0.25)" : "none",
            transition: "all 0.2s ease",
          }}
        />
        <StatCard
          icon="✗"
          label="Absent / Not Punched"
          value={absent}
          accent="#ef4444"
          onClick={() => setFilterType("absent")}
          style={{
            border: filterType === "absent" ? "1px solid #ef4444" : "1px solid var(--border)",
            boxShadow: filterType === "absent" ? "0 0 16px rgba(239, 68, 68, 0.25)" : "none",
            transition: "all 0.2s ease",
          }}
        />
        <StatCard
          icon="👥"
          label="Total Employees"
          value={totalEmployees}
          onClick={() => setFilterType("all")}
          style={{
            border: filterType === "all" ? "1px solid var(--accent)" : "1px solid var(--border)",
            boxShadow: filterType === "all" ? "0 0 16px rgba(124, 58, 237, 0.25)" : "none",
            transition: "all 0.2s ease",
          }}
        />
      </div>
      <div className="card">
        {loading ? <Loader /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Department</th><th>Punch In</th><th>Punch Out</th><th>Status</th></tr></thead>
              <tbody>
                {filteredToday.map((e, i) => (
                  <tr key={i}>
                    <td><div style={{ fontWeight: 600 }}>{e.employee_name}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{e.emp_id}</div></td>
                    <td>{e.department}</td>
                    <td>{e.punch_in ? <span style={{ color: "#10b981" }}>{fmtTime(e.punch_in)}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td>{e.punch_out ? fmtTime(e.punch_out) : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td><StatusBadge status={e.status || (e.punch_in ? "present" : "absent")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Admin Dashboard ──────────────────────────────────────
function AdminDashboard({ showToast }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const router = useRouter();

  const loadStats = async () => {
    try {
      const [emp, att, perf, departments] = await Promise.all([
        apiFetch("/employees/").catch(() => []),
        apiFetch("/attendance/today").catch(() => ({})),
        apiFetch("/performance/dashboard").catch(() => null),
        apiFetch("/departments/").catch(() => []),
      ]);
      const attRecs = att?.records || att;
      setStats({
        employees: Array.isArray(emp) ? emp : [],
        attendance: Array.isArray(attRecs) ? attRecs : [],
        perf,
        departments: Array.isArray(departments) ? departments : [],
      });
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 60000);
    return () => clearInterval(interval);
  }, []);

  const allRawEmployees = Array.isArray(stats?.employees) ? stats.employees : [];
  const employees = allRawEmployees.filter((emp) => emp.is_active !== false && emp.status !== "Inactive");
  const attendance = Array.isArray(stats?.attendance) ? stats.attendance : [];
  const departments = Array.isArray(stats?.departments) ? stats.departments : [];

  const activeEmpUserIds = new Set(employees.map((e) => e.user_id || e.id));
  const activeEmpIds = new Set(employees.map((e) => e.emp_id).filter(Boolean));

  const totalEmployees = employees.length;

  const activeAttendance = attendance.filter((item) => {
    if (!item.emp_id && !item.employee_profile_id && !item.user_id) return true;
    return (
      (item.employee_profile_id && activeEmpUserIds.has(item.employee_profile_id)) ||
      (item.emp_id && activeEmpIds.has(item.emp_id)) ||
      (item.user_id && activeEmpUserIds.has(item.user_id))
    );
  });

  const presentCount = activeAttendance.filter(isPresentAttendance).length;
  const absentCount = activeAttendance.filter(isAbsentAttendance).length;

  const filteredAttendance = activeAttendance.filter((item) => {
    const isPresent = isPresentAttendance(item);
    if (filterType === "present") return isPresent;
    if (filterType === "absent") return isAbsentAttendance(item);
    return true;
  });

  const departmentCounts = departments.length
    ? departments.map((dept) => ({
        name: dept.name,
        count: Number(dept.employee_count || 0),
      }))
    : [...new Set(employees.map((item) => item.department).filter(Boolean))].map((dept) => ({
        name: dept,
        count: employees.filter((item) => item.department === dept).length,
      }));

  const avgPerformance = typeof stats?.perf?.company_avg_score === "number"
    ? stats.perf.company_avg_score.toFixed(1)
    : "—";
  const ratedCount = Number(stats?.perf?.employees_rated || 0);

  const quickActions = [
    ["Approve Increments", "💹", "#10b981", "/dashboard/appraisal"],
    ["Absent / Not Punched Today", "⏱", "#ef4444", "/dashboard/attendance-hr?tab=not_punched"],
    ["View All Grievances", "⚠", "#ef4444", "/dashboard/grievances-hr"],
    ["Export Reports", "⬇", "#00C896", "/dashboard/exports"],
    ["Notice Board", "📢", "#f59e0b", "/dashboard/notices"],
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Admin Overview</h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>System-wide metrics and real-time attendance monitoring</p>
      </div>
      {loading ? <Loader /> : (
        <>
          <div className="grid-stats" style={{ marginBottom: 28 }}>
            <StatCard
              icon="👥"
              label="Total Active Employees"
              value={totalEmployees}
              accent="#00C896"
              onClick={() => setFilterType("all")}
              style={{
                cursor: "pointer",
                border: filterType === "all" ? "1px solid #00C896" : "1px solid var(--border)",
                boxShadow: filterType === "all" ? "0 0 16px rgba(0, 200, 150, 0.25)" : "none",
                transition: "all 0.2s ease",
              }}
            />
            <StatCard
              icon="✅"
              label="Present Today"
              value={`${presentCount}/${totalEmployees || 0}`}
              accent="#10b981"
              onClick={() => setFilterType("present")}
              style={{
                cursor: "pointer",
                border: filterType === "present" ? "1px solid #10b981" : "1px solid var(--border)",
                boxShadow: filterType === "present" ? "0 0 16px rgba(16, 185, 129, 0.25)" : "none",
                transition: "all 0.2s ease",
              }}
            />
            <StatCard
              icon="✗"
              label="Absent / Not Punched Today"
              value={absentCount}
              accent="#ef4444"
              onClick={() => setFilterType("absent")}
              style={{
                cursor: "pointer",
                border: filterType === "absent" ? "1px solid #ef4444" : "1px solid var(--border)",
                boxShadow: filterType === "absent" ? "0 0 16px rgba(239, 68, 68, 0.25)" : "none",
                transition: "all 0.2s ease",
              }}
            />
            <StatCard icon="🏢" label="Departments" value={departmentCounts.length} accent="#00A87E" />
            <StatCard icon="⭐" label="Avg Performance" value={avgPerformance} accent="#f59e0b" sub={ratedCount > 0 ? "/ 5.0" : "No ratings yet"} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 20, marginBottom: 32 }}>
            <div className="card">
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                <h3 className="syne" style={{ fontSize: 15, fontWeight: 700 }}>👥 Departments</h3>
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>{departmentCounts.length} total departments</div>
              </div>
              <div style={{ padding: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {departmentCounts.map((dept) => (
                  <span key={dept.name} className="badge" style={{ background: "var(--hover-bg)", color: "var(--text)" }}>{dept.name}</span>
                ))}
              </div>
            </div>
            <div className="card">
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                <h3 className="syne" style={{ fontSize: 15, fontWeight: 700 }}>⚡ Quick Actions</h3>
              </div>
              {quickActions.map(([label, icon, color, href], i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => router.push(href)}
                  style={{
                    width: "calc(100% - 24px)",
                    padding: "14px 20px",
                    border: "1px solid rgba(0,200,150,0.2)",
                    background: "rgba(0,200,150,0.04)",
                    borderRadius: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 14,
                    cursor: "pointer",
                    color: "var(--text)",
                    transition: "all 0.18s",
                    margin: "12px",
                    boxShadow: "none",
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.borderColor = "rgba(0,200,150,0.45)";
                    event.currentTarget.style.boxShadow = "0 0 16px rgba(0,200,150,0.15)";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.borderColor = "rgba(0,200,150,0.2)";
                    event.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{icon}</span>
                    <span>{label}</span>
                  </span>
                  <span style={{ color, fontWeight: 700 }}>→</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── LIVE MONITORING REAL-TIME ATTENDANCE OVERVIEW FOR ADMIN ── */}
          <div>
            <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div>
                <h2 className="syne" style={{ fontSize: 22, fontWeight: 800 }}>LIVE MONITORING</h2>
                <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>Today&apos;s real-time attendance overview</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={filterType === "all" ? "btn-primary" : "btn-ghost"}
                  style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600 }}
                  onClick={() => setFilterType("all")}
                >
                  All ({activeAttendance.length})
                </button>
                <button
                  type="button"
                  className={filterType === "present" ? "btn-primary" : "btn-ghost"}
                  style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: filterType === "present" ? "#fff" : "#10b981" }}
                  onClick={() => setFilterType("present")}
                >
                  Present ({presentCount})
                </button>
                <button
                  type="button"
                  className={filterType === "absent" ? "btn-primary" : "btn-ghost"}
                  style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: filterType === "absent" ? "#fff" : "#ef4444" }}
                  onClick={() => setFilterType("absent")}
                >
                  Absent / Not Punched ({absentCount})
                </button>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 999,
                  background: "rgba(16,185,129,0.08)",
                  border: "1px solid rgba(16,185,129,0.25)",
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "#10B981",
                    boxShadow: "0 0 6px #10B981, 0 0 12px rgba(16,185,129,0.5)",
                    animation: "pulse 2s infinite",
                    display: "inline-block",
                  }} />
                  <span style={{ fontSize: 12, color: "#10B981", fontWeight: 700 }} className="syne">LIVE</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>EMPLOYEE</th>
                      <th>DEPARTMENT</th>
                      <th>PUNCH IN</th>
                      <th>PUNCH OUT</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAttendance.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                          No attendance records found matching filter &quot;{filterType}&quot;
                        </td>
                      </tr>
                    ) : (
                      filteredAttendance.map((e, i) => (
                        <tr key={i}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{e.employee_name || `${e.first_name || ""} ${e.last_name || ""}`}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{e.emp_id}</div>
                          </td>
                          <td>{e.department || "—"}</td>
                          <td>{e.punch_in ? <span style={{ color: "#10b981", fontWeight: 600 }}>{fmtTime(e.punch_in)}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                          <td>{e.punch_out ? <span style={{ color: "var(--text)" }}>{fmtTime(e.punch_out)}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                          <td><StatusBadge status={e.status || (e.punch_in ? "present" : "absent")} /></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── HOD Dashboard ────────────────────────────────────────
function HODDashboard({ showToast }) {
  const router = useRouter();
  const [team, setTeam] = useState([]);
  const [managedDepartments, setManagedDepartments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(true);

  // Live monitoring state
  const [today, setToday] = useState([]);
  const [loadingToday, setLoadingToday] = useState(true);
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    const load = async () => {
      try {
        const [assignmentData, taskData] = await Promise.all([
          apiFetch("/tasks/assignment-options").catch(() => ({})),
          apiFetch("/tasks/team").catch(() => ({})),
        ]);
        const employees = Array.isArray(assignmentData?.employees) ? assignmentData.employees : [];
        const departments = Array.isArray(assignmentData?.departments) ? assignmentData.departments : [];
        setTeam(employees);
        setManagedDepartments(departments);
        setTasks(Array.isArray(taskData?.active_tasks) ? taskData.active_tasks : Array.isArray(taskData) ? taskData : []);
        setPendingApprovals(Array.isArray(taskData?.pending_approvals) ? taskData.pending_approvals : []);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    apiFetch("/attendance/today").then((d) => {
      const recs = d?.records || d;
      setToday(Array.isArray(recs) ? recs : []);
    }).catch(() => {}).finally(() => setLoadingToday(false));

    const t = setInterval(() => {
      apiFetch("/attendance/today").then((d) => {
        const recs = d?.records || d;
        setToday(Array.isArray(recs) ? recs : []);
      }).catch(() => {});
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const openTasks = tasks.filter((task) => (task.status || "").toLowerCase() !== "completed").length;

  const present = today.filter(isPresentAttendance).length;
  const absent = today.filter(isAbsentAttendance).length;
  const totalEmployees = today.length;

  const filteredToday = today.filter((t) => {
    const isPresent = isPresentAttendance(t);
    if (filterType === "present") return isPresent;
    if (filterType === "absent") return isAbsentAttendance(t);
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Team Dashboard</h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>Overview for your managed departments</p>
      </div>
      <div className="grid-stats" style={{ marginBottom: 24 }}>
        <StatCard icon="👥" label="Team Members" value={team.length} accent="#8b5cf6" />
        <StatCard icon="🏢" label="Departments Managed" value={managedDepartments.length} accent="#6366f1" />
        <StatCard icon="⏳" label="Pending Approvals" value={pendingApprovals.length} accent="#f59e0b" />
        <StatCard icon="📋" label="Open Tasks" value={openTasks} accent="#10b981" />
      </div>
      {loading ? <Loader /> : (
        managedDepartments.length === 0 ? (
          <div className="card">
            <EmptyState icon="🏢" title="No managed departments found" sub="Ask HR/Admin to map departments to this HOD profile." />
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 20 }}>
              <div className="card">
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                  <h3 className="syne" style={{ fontSize: 15, fontWeight: 700 }}>Managed Departments</h3>
                  <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>Employee count by department</div>
                </div>
                <div style={{ padding: 20, display: "grid", gap: 12 }}>
                  {managedDepartments.map((department) => (
                    <div key={department.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 14, background: "var(--hover-bg)" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{department.name}</div>
                        <div style={{ color: "var(--muted)", fontSize: 12 }}>Managed team</div>
                      </div>
                      <div className="syne" style={{ fontSize: 24, fontWeight: 800 }}>{department.employee_count || 0}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                  <h3 className="syne" style={{ fontSize: 15, fontWeight: 700 }}>Task Assignment</h3>
                  <div style={{ marginTop: 4, fontSize: 12, color: "var(--muted)" }}>Assign to the full team, a department, or one employee</div>
                </div>
                <div style={{ padding: 20, display: "grid", gap: 14 }}>
                  <div style={{ padding: "14px 16px", borderRadius: 14, background: "var(--hover-bg)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Coverage</div>
                    <div className="syne" style={{ fontSize: 18, fontWeight: 800 }}>{team.length} employees across {managedDepartments.length} departments</div>
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: 14, background: "var(--hover-bg)", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Pending Reviews</div>
                    <div className="syne" style={{ fontSize: 18, fontWeight: 800 }}>{pendingApprovals.length} task submissions waiting for action</div>
                  </div>
                  <button className="btn-primary" onClick={() => router.push("/dashboard/tasks-assign")}>Open Task Manager</button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 40 }}>
              <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h1 className="syne" style={{ fontSize: 24, fontWeight: 800 }}>Team Live Monitoring</h1>
                  <p style={{ color: "var(--muted)", marginTop: 4 }}>Today&apos;s real-time attendance overview for your managed department team</p>
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 14px", borderRadius: 999,
                  background: "rgba(16,185,129,0.08)",
                  border: "1px solid rgba(16,185,129,0.25)",
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: "#10B981",
                    boxShadow: "0 0 6px #10B981, 0 0 12px rgba(16,185,129,0.5)",
                    animation: "pulse 2s infinite",
                    display: "inline-block",
                  }} />
                  <span style={{ fontSize: 12, color: "#10B981", fontWeight: 700, letterSpacing: "0.05em" }} className="syne">Live</span>
                </div>
              </div>
              <div className="grid-stats" style={{ marginBottom: 24 }}>
                <StatCard
                  icon="✅"
                  label="Present Today"
                  value={`${present}/${totalEmployees || 0}`}
                  accent="#10b981"
                  onClick={() => setFilterType("present")}
                  style={{
                    border: filterType === "present" ? "1px solid #10b981" : "1px solid var(--border)",
                    boxShadow: filterType === "present" ? "0 0 16px rgba(16, 185, 129, 0.25)" : "none",
                    transition: "all 0.2s ease",
                  }}
                />
                <StatCard
                  icon="✗"
                  label="Absent / Not Punched"
                  value={absent}
                  accent="#ef4444"
                  onClick={() => setFilterType("absent")}
                  style={{
                    border: filterType === "absent" ? "1px solid #ef4444" : "1px solid var(--border)",
                    boxShadow: filterType === "absent" ? "0 0 16px rgba(239, 68, 68, 0.25)" : "none",
                    transition: "all 0.2s ease",
                  }}
                />
                <StatCard
                  icon="👥"
                  label="Total Employees"
                  value={totalEmployees}
                  onClick={() => setFilterType("all")}
                  style={{
                    border: filterType === "all" ? "1px solid var(--accent)" : "1px solid var(--border)",
                    boxShadow: filterType === "all" ? "0 0 16px rgba(124, 58, 237, 0.25)" : "none",
                    transition: "all 0.2s ease",
                  }}
                />
              </div>
              <div className="card">
                {loadingToday ? <Loader /> : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Employee</th><th>Department</th><th>Punch In</th><th>Punch Out</th><th>Status</th></tr></thead>
                      <tbody>
                        {filteredToday.map((e, i) => (
                          <tr key={i}>
                            <td><div style={{ fontWeight: 600 }}>{e.employee_name}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>{e.emp_id}</div></td>
                            <td>{e.department}</td>
                            <td>{e.punch_in ? <span style={{ color: "#10b981" }}>{fmtTime(e.punch_in)}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                            <td>{e.punch_out ? fmtTime(e.punch_out) : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                            <td><StatusBadge status={e.status || (e.punch_in ? "present" : "absent")} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}

// ─── Accounts Dashboard ──────────────────────────────────
function AccountsDashboard({ showToast }) {
  const [stats, setStats] = useState({ payroll: [], compOff: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [p, s] = await Promise.all([
          apiFetch(`/payroll/summary?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`).catch(() => []),
          apiFetch("/sunday-work/pending-extra-pay").catch(() => []),
        ]);
        setStats({ payroll: Array.isArray(p) ? p : [], compOff: Array.isArray(s) ? s : [] });
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const totalPayroll = stats.payroll.reduce((s, e) => s + (e.net_salary || 0), 0);
  const extraPay = stats.compOff.reduce((s, e) => s + (e.extra_pay_amount || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Accounts Overview</h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>Financial overview & payroll summary</p>
      </div>
      <div className="grid-stats" style={{ marginBottom: 24 }}>
        <StatCard icon="💰" label="Monthly Payroll" value={fmtINR(totalPayroll)} accent="#f59e0b" />
        <StatCard icon="👥" label="Employees" value={stats.payroll.length} accent="#6366f1" />
        <StatCard icon="☀" label="Extra Pay Pending" value={fmtINR(extraPay)} accent="#10b981" />
        <StatCard icon="📊" label="Avg Salary" value={stats.payroll.length ? fmtINR(Math.round(totalPayroll / stats.payroll.length)) : "—"} />
      </div>
      {loading ? <Loader /> : (
        <div className="card">
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}><h3 className="syne" style={{ fontSize: 15, fontWeight: 700 }}>This Month&apos;s Payroll Preview</h3></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Department</th><th>Base</th><th>Net Payable</th></tr></thead>
              <tbody>
                {stats.payroll.slice(0, 8).map((e, i) => (
                  <tr key={i}>
                    <td><b>{e.employee_name}</b></td>
                    <td>{e.department}</td>
                    <td>{fmtINR(e.base_salary)}</td>
                    <td><span style={{ fontWeight: 700, color: "#10b981" }}>{fmtINR(e.net_salary)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard Page ──────────────────────────────────
export default function DashboardPage() {
  const { role, user } = useAuth();
  const [showToast, toastNode] = useToast();

  const props = { showToast, user };

  return (
    <>
      {role === "admin" && <AdminDashboard {...props} />}
      {role === "hr" && <HRDashboard {...props} />}
      {role === "accounts" && <AccountsDashboard {...props} />}
      {role === "tl" && <HODDashboard {...props} />}
      {role === "hod" && <HODDashboard {...props} />}
      {role === "employee" && <EmployeeDashboard {...props} />}
      {toastNode}
    </>
  );
}
