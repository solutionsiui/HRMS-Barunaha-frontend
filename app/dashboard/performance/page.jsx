"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, BellRing, CalendarRange, Star } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";

const VIEW_OPTIONS = [
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "half_yearly", label: "Half Yearly" },
  { id: "yearly", label: "Yearly" },
];

function viewLabel(viewId) {
  return VIEW_OPTIONS.find((option) => option.id === viewId)?.label || "Weekly";
}

function roleForEmployee(emp) {
  if (emp.is_superuser) return "admin";
  if (emp.is_accounts) return "accounts";
  if (emp.is_hr) return "hr";
  if (emp.is_tl) return "tl";
  if (emp.is_hod) return "hod";
  return "employee";
}

function resolveMode(raterRole, targetRole) {
  if (targetRole === "accounts") return raterRole === "admin" ? "detailed" : null;
  if (raterRole === "admin") return targetRole === "admin" ? null : "detailed";
  if (raterRole === "hr") return targetRole === "employee" ? "detailed" : "single";
  if (raterRole === "hod") return targetRole === "employee" ? "detailed" : "single";
  if (raterRole === "tl") return targetRole === "employee" ? "detailed" : "single";
  if (raterRole === "employee") return ["admin", "hr", "hod", "tl"].includes(targetRole) ? "single" : null;
  return null;
}

function getCurrentWeekRange() {
  const today = new Date();
  const normalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const mondayOffset = (normalized.getDay() + 6) % 7;
  const start = new Date(normalized);
  start.setDate(normalized.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function toIso(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
}

function formatDate(dateValue, options = { day: "2-digit", month: "short", year: "numeric" }) {
  return new Intl.DateTimeFormat("en-IN", options).format(new Date(dateValue));
}

function weekLabel(startDate, endDate) {
  if (!startDate || !endDate) return "Current Week";
  return `${formatDate(startDate, { day: "2-digit", month: "short" })} - ${formatDate(endDate, { day: "2-digit", month: "short", year: "numeric" })}`;
}

function StarRow({ value = 0, onChange, readOnly = false, size = 18 }) {
  const safeValue = Math.max(0, Math.min(5, Number(value || 0)));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= safeValue;
        const icon = (
          <Star
            size={size}
            strokeWidth={1.9}
            style={{
              color: filled ? "#f59e0b" : "rgba(148,163,184,0.42)",
              fill: filled ? "#f59e0b" : "transparent",
            }}
          />
        );
        if (readOnly) {
          return <span key={star} style={{ display: "inline-flex" }}>{icon}</span>;
        }
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange?.(star)}
            aria-label={`Rate ${star} out of 5`}
            style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", display: "inline-flex" }}
          >
            {icon}
          </button>
        );
      })}
      <span style={{ fontSize: 12, color: "var(--muted)" }}>{safeValue}/5</span>
    </div>
  );
}

function RatingInput({ label, value, comment, onScoreChange, onCommentChange }) {
  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <StarRow value={value} onChange={onScoreChange} />
      <textarea
        className="input"
        rows={2}
        style={{ marginTop: 12 }}
        value={comment}
        placeholder={`Add ${label.toLowerCase()} comment`}
        onChange={(event) => onCommentChange(event.target.value)}
      />
    </div>
  );
}

function displayScore(item) {
  if (item.overall_score !== undefined && item.overall_score !== null) return Number(item.overall_score);
  if (item.overall_score_single !== undefined && item.overall_score_single !== null) return Number(item.overall_score_single);
  const values = [
    item.task_completion_score,
    item.attendance_score,
    item.punctuality_score,
    item.behavior_score,
  ].map((value) => Number(value || 0)).filter((value) => value > 0);
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function canSubmitForm(mode, form) {
  if (!form.employee_emp_id || !mode) return false;
  if (mode === "single") return Boolean(form.overall_comment.trim());
  return [form.task_comment, form.attendance_comment, form.punctuality_comment, form.behavior_comment].every((value) => value.trim());
}

function bucketForView(item, view) {
  const ratingDate = item.week_start_date || `${item.rating_year}-${String(item.rating_month || 1).padStart(2, "0")}-01`;
  const baseDate = new Date(ratingDate);
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth() + 1;
  if (view === "weekly") return item.period_label || weekLabel(item.week_start_date, item.week_end_date);
  if (view === "monthly") return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(baseDate);
  if (view === "quarterly") return `Q${Math.ceil(month / 3)} ${year}`;
  if (view === "half_yearly") return `${month <= 6 ? "H1" : "H2"} ${year}`;
  return String(year);
}

function periodOptionForView(item, view) {
  const ratingDate = item.week_start_date || `${item.rating_year}-${String(item.rating_month || 1).padStart(2, "0")}-01`;
  const baseDate = new Date(ratingDate);
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth() + 1;

  if (view === "weekly") {
    const key = item.week_start_date || `${year}-${String(month).padStart(2, "0")}-01`;
    return {
      key,
      label: item.period_label || weekLabel(item.week_start_date, item.week_end_date),
      order: baseDate.getTime(),
    };
  }
  if (view === "monthly") {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    return {
      key,
      label: new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(baseDate),
      order: year * 100 + month,
    };
  }
  if (view === "quarterly") {
    const quarter = Math.ceil(month / 3);
    return {
      key: `${year}-Q${quarter}`,
      label: `Q${quarter} ${year}`,
      order: year * 10 + quarter,
    };
  }
  if (view === "half_yearly") {
    const half = month <= 6 ? 1 : 2;
    return {
      key: `${year}-H${half}`,
      label: `H${half} ${year}`,
      order: year * 10 + half,
    };
  }
  return {
    key: String(year),
    label: String(year),
    order: year,
  };
}

function buildSeries(ratings, view) {
  const groups = new Map();
  ratings.forEach((item) => {
    const key = bucketForView(item, view);
    const current = groups.get(key) || { label: key, total: 0, count: 0, stars: 0 };
    const score = displayScore(item);
    current.total += score;
    current.stars += Math.round(score);
    current.count += 1;
    groups.set(key, current);
  });
  return Array.from(groups.values()).map((item) => ({
    ...item,
    average: item.count ? item.total / item.count : 0,
    starAverage: item.count ? item.stars / item.count : 0,
  })).slice(-8);
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function StarStrip({ value, total = 5, size = 16 }) {
  return (
    <span style={{ color: "#f59e0b", fontSize: size, letterSpacing: 1 }}>
      {"★".repeat(Math.min(total, Math.max(0, value)))}
      <span style={{ color: "rgba(148,163,184,0.42)" }}>{"★".repeat(Math.max(0, total - value))}</span>
    </span>
  );
}

function BarMeter({ label, value, max = 5, color = "#6366f1", suffix = "/5" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700 }}>{value}{suffix}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "rgba(148,163,184,0.14)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function AttendanceDonut({ present, late, halfDay, earlyLeave, absent, paidLeave }) {
  const total = Math.max(1, present + late + halfDay + earlyLeave + absent + paidLeave);
  const segments = [
    { label: "Present", value: present, color: "#16a34a" },
    { label: "Late", value: late, color: "#f59e0b" },
    { label: "Half Day", value: halfDay, color: "#7c3aed" },
    { label: "Early Leave", value: earlyLeave, color: "#ea580c" },
    { label: "Paid Leave", value: paidLeave, color: "#0ea5e9" },
    { label: "Absent", value: absent, color: "#dc2626" },
  ];
  let cursor = 0;
  const stops = segments.map((segment) => {
    const start = (cursor / total) * 360;
    cursor += segment.value;
    const end = (cursor / total) * 360;
    return `${segment.color} ${start}deg ${end}deg`;
  }).join(", ");
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{
        width: 130, height: 130, borderRadius: "50%",
        background: `conic-gradient(${stops})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "inset 0 0 0 18px var(--surface, #fff)",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{Math.round((present / total) * 100)}%</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Present</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 4, flex: "1 1 200px" }}>
        {segments.map((segment) => (
          <div key={segment.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: segment.color, display: "inline-block" }} />
            <span style={{ color: "var(--muted)" }}>{segment.label}</span>
            <span style={{ marginLeft: "auto", fontWeight: 700 }}>{segment.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PerformancePage() {
  const { role, user } = useAuth();
  const canRate = role !== "accounts";
  const [employees, setEmployees] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [employeeAverages, setEmployeeAverages] = useState([]);
  const [attendanceRatings, setAttendanceRatings] = useState({ employees: [], month: new Date().getMonth() + 1, year: new Date().getFullYear(), month_working_days: 0, month_name: "" });
  const [attMonth, setAttMonth] = useState(new Date().getMonth() + 1);
  const [attYear, setAttYear] = useState(new Date().getFullYear());
  const [attEmpFilter, setAttEmpFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [showRate, setShowRate] = useState(false);
  const [autoPreview, setAutoPreview] = useState(null);
  const [view, setView] = useState("weekly");
  const [selectedPeriodKey, setSelectedPeriodKey] = useState("ALL");
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState("ALL");
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideScore, setOverrideScore] = useState("3");
  const [form, setForm] = useState({
    employee_emp_id: "",
    rating_month: new Date().getMonth() + 1,
    rating_year: new Date().getFullYear(),
    attendance_score: 3,
    punctuality_score: 3,
    behavior_score: 3,
    task_completion_score: 3,
    overall_score_single: 3,
    attendance_comment: "",
    punctuality_comment: "",
    behavior_comment: "",
    task_comment: "",
    overall_comment: "",
  });
  const [showToast, toastNode] = useToast();

  const currentWeek = useMemo(() => getCurrentWeekRange(), []);
  const currentWeekLabel = useMemo(() => weekLabel(currentWeek.start, currentWeek.end), [currentWeek]);

  const selectedEmployee = useMemo(
    () => employees.find((item) => item.emp_id === form.employee_emp_id),
    [employees, form.employee_emp_id]
  );

  const selectedMode = useMemo(() => {
    const targetRole = selectedEmployee ? roleForEmployee(selectedEmployee) : null;
    return targetRole ? resolveMode(role, targetRole) : null;
  }, [selectedEmployee, role]);

  const availableTargets = useMemo(() => {
    return employees
      .filter((item) => item.emp_id !== user?.emp_id)
      .filter((item) => resolveMode(role, roleForEmployee(item)));
  }, [employees, role, user?.emp_id]);

  const canSubmit = useMemo(() => canSubmitForm(selectedMode, form), [form, selectedMode]);
  const visibleRatings = useMemo(() => {
    if (selectedEmployeeFilter === "ALL") return ratings;
    return ratings.filter((item) => item.emp_id === selectedEmployeeFilter);
  }, [ratings, selectedEmployeeFilter]);
  const ratingsByView = useMemo(() => {
    // Weekly view must strictly show weekly records only.
    if (view === "weekly") return visibleRatings.filter((item) => (item.period_type || "monthly") === "weekly");
    return visibleRatings;
  }, [view, visibleRatings]);
  const periodOptions = useMemo(() => {
    const map = new Map();
    ratingsByView.forEach((item) => {
      const option = periodOptionForView(item, view);
      if (!map.has(option.key)) map.set(option.key, option);
    });
    return Array.from(map.values()).sort((a, b) => b.order - a.order);
  }, [ratingsByView, view]);
  const selectedPeriodLabel = useMemo(() => {
    if (selectedPeriodKey === "ALL") return "All";
    return periodOptions.find((option) => option.key === selectedPeriodKey)?.label || "All";
  }, [periodOptions, selectedPeriodKey]);
  const ratingsForAppliedView = useMemo(() => {
    if (selectedPeriodKey === "ALL") return ratingsByView;
    return ratingsByView.filter((item) => periodOptionForView(item, view).key === selectedPeriodKey);
  }, [ratingsByView, selectedPeriodKey, view]);
  const analytics = useMemo(() => buildSeries(ratingsForAppliedView, view), [ratingsForAppliedView, view]);
  const ratingsThisWeek = useMemo(() => ratingsForAppliedView.filter((item) => item.week_start_date === toIso(currentWeek.start)), [ratingsForAppliedView, currentWeek]);
  const averageInView = useMemo(() => {
    if (!ratingsForAppliedView.length) return 0;
    return ratingsForAppliedView.reduce((sum, item) => sum + displayScore(item), 0) / ratingsForAppliedView.length;
  }, [ratingsForAppliedView]);
  const activeFilterLabel = useMemo(() => viewLabel(view), [view]);

  useEffect(() => {
    setSelectedPeriodKey("ALL");
  }, [selectedEmployeeFilter, view]);

  useEffect(() => {
    if (selectedPeriodKey !== "ALL" && !periodOptions.some((option) => option.key === selectedPeriodKey)) {
      setSelectedPeriodKey("ALL");
    }
  }, [periodOptions, selectedPeriodKey]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [employeeData, ratingData, averagesData, attendanceData] = await Promise.all([
        apiFetch("/performance/targets"),
        apiFetch("/performance/ratings?include_all=true"),
        apiFetch("/performance/employee-averages").catch(() => []),
        apiFetch(`/performance/attendance-ratings?month=${attMonth}&year=${attYear}`).catch(() => null),
      ]);
      setEmployees(Array.isArray(employeeData) ? employeeData : []);
      setRatings(Array.isArray(ratingData) ? ratingData : []);
      setEmployeeAverages(Array.isArray(averagesData) ? averagesData : []);
      if (attendanceData && Array.isArray(attendanceData.employees)) {
        setAttendanceRatings(attendanceData);
      }
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [attMonth, attYear, role, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setAutoPreview(null);
  }, [form.employee_emp_id]);

  function selectRatingEmployee(employeeEmpId) {
    setAutoPreview(null);
    setForm((current) => ({
      ...current,
      employee_emp_id: employeeEmpId,
      attendance_score: 3,
      punctuality_score: 3,
      behavior_score: 3,
      task_completion_score: 3,
      overall_score_single: 3,
      attendance_comment: "",
      punctuality_comment: "",
      behavior_comment: "",
      task_comment: "",
      overall_comment: "",
    }));
  }

  function closeRateModal() {
    setShowRate(false);
    selectRatingEmployee("");
  }

  async function loadAutoScores() {
    if (!form.employee_emp_id) return;
    try {
      const data = await apiFetch(`/performance/auto-scores/${form.employee_emp_id}`);
      setAutoPreview(data);
      setForm((current) => ({
        ...current,
        attendance_score: data.attendance_score,
        punctuality_score: data.punctuality_score,
        behavior_score: data.behavior_score,
        task_completion_score: data.task_completion_score,
      }));
      showToast("Auto scores loaded for this week");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function submitRating() {
    // Duplicate check: prevent rating same employee twice in same week
    const alreadyRated = ratingsThisWeek.find(
      (r) => r.emp_id === form.employee_emp_id && r.rated_by_emp_id === user?.emp_id
    );
    if (alreadyRated) {
      showToast("You have already rated this employee this week", "error");
      return;
    }
    try {
      await apiFetch("/performance/rate", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          rating_mode: selectedMode,
        }),
      });
      showToast("Weekly rating submitted");
      closeRateModal();
      load();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function overrideAverage() {
    if (!overrideTarget) return;
    try {
      await apiFetch(`/performance/employee-averages/${overrideTarget.emp_id}/override?score=${Number(overrideScore)}`, { method: "POST" });
      showToast("Average rating updated");
      setOverrideTarget(null);
      load();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Weekly Ratings</h1>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>Ratings are submitted for the current week only. Historical views below regroup the same ratings into weekly, monthly, quarterly, half-yearly, and yearly summaries.</p>
        </div>
        {canRate ? <button className="btn-primary" onClick={() => { selectRatingEmployee(""); setShowRate(true); }}>Give Weekly Rating</button> : null}
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 20, background: "rgba(245,158,11,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, marginBottom: 6 }}>
          <BellRing size={18} color="#f59e0b" />
          Current Rating Window
        </div>
        <div style={{ color: "var(--muted)", fontSize: 14 }}>
          Weekly cycle: <b>{currentWeekLabel}</b>. A reminder notification appears on Saturday after 6:00 PM for users who can rate.
        </div>
      </div>

      <div className="grid-stats" style={{ marginBottom: 24 }}>
        <div className="stat-card" style={{ "--accent": "#f59e0b" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⭐</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{averageInView.toFixed(1)}/5</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Average in {activeFilterLabel.toLowerCase()} view</div>
        </div>
        <div className="stat-card" style={{ "--accent": "#10b981" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{ratingsForAppliedView.length}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{activeFilterLabel} ratings in view</div>
        </div>
        <div className="stat-card" style={{ "--accent": "#6366f1" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{availableTargets.length}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Eligible targets for you</div>
        </div>
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
            <BarChart3 size={18} />
            Rating Analytics
          </div>
          <select className="input" style={{ width: "min(100%, 240px)" }} value={selectedEmployeeFilter} onChange={(event) => setSelectedEmployeeFilter(event.target.value)}>
            <option value="ALL">All Employees</option>
            {employeeAverages.map((item) => <option key={item.emp_id} value={item.emp_id}>{item.emp_id} - {item.name}</option>)}
          </select>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.id}
                className="btn-ghost"
                onClick={() => setView(option.id)}
                style={{ background: view === option.id ? "var(--surface2)" : "transparent", padding: "6px 12px" }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select className="input" style={{ width: "min(100%, 240px)" }} value={selectedPeriodKey} onChange={(event) => setSelectedPeriodKey(event.target.value)}>
            <option value="ALL">All {activeFilterLabel} periods</option>
            {periodOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14, fontSize: 13, color: "var(--muted)" }}>
          Applied Filter: <b style={{ color: "var(--text)" }}>{activeFilterLabel}</b>
          {selectedPeriodKey !== "ALL" ? <span> · <b style={{ color: "var(--text)" }}>{selectedPeriodLabel}</b></span> : null}
          {view === "weekly" ? " (showing only weekly records)" : " (regrouped trend view)"}
        </div>

        {analytics.length === 0 ? (
          <EmptyState icon="📈" title={`No ${activeFilterLabel.toLowerCase()} data`} subtitle={view === "weekly" ? "Submit weekly ratings to populate weekly analytics." : "Submit ratings to populate trend views."} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 18 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Average Score Graph</div>
              <div style={{ display: "grid", gap: 10 }}>
                {analytics.map((item) => (
                  <div key={item.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                      <span>{item.label}</span>
                      <span style={{ color: "#b45309", fontWeight: 700 }}>{item.average.toFixed(1)}/5</span>
                    </div>
                    <div style={{ height: 10, borderRadius: 999, background: "rgba(148,163,184,0.14)", overflow: "hidden" }}>
                      <div style={{ width: `${(item.average / 5) * 100}%`, height: "100%", background: "linear-gradient(90deg, #f59e0b, #f97316)", borderRadius: 999 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Star Graph</div>
              <div style={{ display: "grid", gap: 12 }}>
                {analytics.map((item) => (
                  <div key={`${item.label}-stars`}>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{item.label}</div>
                    <StarRow value={Math.round(item.starAverage)} readOnly />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
              <BarChart3 size={18} /> Attendance &amp; Punctuality Performance
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              Auto-computed from punches. {attendanceRatings.month_name} {attendanceRatings.year} · {attendanceRatings.month_working_days} working days.
              Attendance star: 25/25 → 5★, 23–24 → 4★, 20–22 → 3★, 18–19 → 2★, &lt;18 → 1★.
              Punctuality star: 0 lates → 5★, 1–3 → 4★, 4–5 → 3★, 6–8 → 2★, 9+ → 1★.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="input" style={{ width: "auto" }} value={attMonth} onChange={(event) => setAttMonth(Number(event.target.value))}>
              {MONTH_LABELS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
            <select className="input" style={{ width: "auto" }} value={attYear} onChange={(event) => setAttYear(Number(event.target.value))}>
              {[attYear - 1, attYear, attYear + 1].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select className="input" style={{ width: "min(100%, 240px)" }} value={attEmpFilter} onChange={(event) => setAttEmpFilter(event.target.value)}>
              <option value="ALL">All employees</option>
              {attendanceRatings.employees.map((item) => <option key={item.emp_id} value={item.emp_id}>{item.emp_id} - {item.name}</option>)}
            </select>
          </div>
        </div>
        {attendanceRatings.employees.length === 0 ? (
          <EmptyState icon="📈" title="No attendance data" subtitle="No employee attendance found for this month yet." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
            {attendanceRatings.employees
              .filter((item) => attEmpFilter === "ALL" || item.emp_id === attEmpFilter)
              .map((item) => (
              <div key={item.emp_id} className="card" style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{item.name}{item.is_tl ? <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(99,102,241,0.15)", color: "#4338ca" }}>TL</span> : null}{item.is_hod ? <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(245,158,11,0.15)", color: "#b45309" }}>HOD</span> : null}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{item.emp_id} · {item.department || "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#b45309" }}>{item.overall_star}/5</div>
                    <StarStrip value={Math.round(item.overall_star)} />
                  </div>
                </div>
                <AttendanceDonut
                  present={item.present}
                  late={item.late}
                  halfDay={item.half_day}
                  earlyLeave={item.early_leave}
                  absent={item.absent}
                  paidLeave={item.paid_leave}
                />
                <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                  <BarMeter label="Attendance" value={item.attendance_star} color="#16a34a" />
                  <BarMeter label="Punctuality" value={item.punctuality_star} color="#f59e0b" />
                </div>
                <div style={{ marginTop: 12, display: "grid", gap: 4, fontSize: 12, color: "var(--muted)" }}>
                  <div>Present-equivalent: <b style={{ color: "var(--text)" }}>{item.present_equivalent}/{item.working_days}</b></div>
                  <div>Late punches: <b style={{ color: "var(--text)" }}>{item.late}</b> · Absences: <b style={{ color: "var(--text)" }}>{item.absent}</b></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
          <h2 className="syne" style={{ fontSize: 16, fontWeight: 700 }}>Employee Average Ratings</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Department</th><th>Average</th><th>Override</th><th>Action</th></tr></thead>
            <tbody>
              {employeeAverages.filter((item) => selectedEmployeeFilter === "ALL" || item.emp_id === selectedEmployeeFilter).map((item) => (
                <tr key={item.emp_id}>
                  <td><b>{item.name}</b><div style={{ fontSize: 12, color: "var(--muted)" }}>{item.emp_id}</div></td>
                  <td>{item.department || "—"}</td>
                  <td><StarRow value={Math.round(item.average_score || 0)} readOnly size={16} /></td>
                  <td>{item.override_value ? `${Number(item.override_value).toFixed(2)}/5` : "Not used"}</td>
                  <td>
                    {role === "admin" ? (
                      <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} disabled={item.override_used} onClick={() => { setOverrideTarget(item); setOverrideScore(String(item.average_score || 3)); }}>
                        {item.override_used ? "Used" : "Edit Once"}
                      </button>
                    ) : "View only"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        {loading ? <Loader /> : ratingsForAppliedView.length === 0 ? (
          <EmptyState icon="📈" title={`No ${activeFilterLabel.toLowerCase()} ratings yet`} subtitle={view === "weekly" ? "Weekly ratings will appear here once submitted." : "No ratings found for the selected trend filter."} />
        ) : ratingsForAppliedView.slice().sort((a, b) => {
          const aKey = String(a.week_start_date || `${a.rating_year}-${String(a.rating_month || 1).padStart(2, "0")}-01`);
          const bKey = String(b.week_start_date || `${b.rating_year}-${String(b.rating_month || 1).padStart(2, "0")}-01`);
          return bKey.localeCompare(aKey);
        }).map((item) => (
          <div key={item.id} className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{item.name || item.emp_id}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{item.period_label || currentWeekLabel} · {item.rating_mode === "single" ? "Single rating" : "Detailed rating"}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{item.rated_by_name ? `Rated by ${item.rated_by_name}${item.rated_by_emp_id ? ` (${item.rated_by_emp_id})` : ""}` : "Rater identity hidden"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#b45309" }}>{displayScore(item).toFixed(1)}</div>
                <StarRow value={Math.round(displayScore(item))} readOnly size={16} />
              </div>
            </div>

            {item.rating_mode === "single" ? (
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{item.overall_comment || "No comment provided"}</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div><b>Tasks:</b> {item.aspect_comments?.task_comment || "—"}</div>
                <div><b>Attendance:</b> {item.aspect_comments?.attendance_comment || "—"}</div>
                <div><b>Punctuality:</b> {item.aspect_comments?.punctuality_comment || "—"}</div>
                <div><b>Behaviour:</b> {item.aspect_comments?.behavior_comment || "—"}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showRate ? (
        <Modal
          title="Give Weekly Rating"
          onClose={closeRateModal}
          footer={
            <>
              <button className="btn-ghost" onClick={closeRateModal}>Cancel</button>
              <button className="btn-primary" disabled={!canSubmit} onClick={submitRating}>Submit</button>
            </>
          }
        >
          <div className="card" style={{ padding: 14, marginBottom: 16, background: "rgba(59,130,246,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, marginBottom: 6 }}>
              <CalendarRange size={16} />
              Current Rating Week
            </div>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>{currentWeekLabel}</div>
          </div>

          <div className="form-group">
            <label className="label">Employee (search by ID, name, or department)</label>
            <input className="input" list="rating-employee-options" placeholder="Start typing to search…" value={form.employee_emp_id} onChange={(event) => selectRatingEmployee(event.target.value)} />
            <datalist id="rating-employee-options">
              {availableTargets.map((item) => <option key={item.emp_id} value={item.emp_id}>{item.first_name} {item.last_name} · {item.department || "No department"} · {roleForEmployee(item).toUpperCase()}</option>)}
            </datalist>
          </div>

          {selectedMode ? (
            <div className="card" style={{ padding: 14, marginBottom: 16, background: "rgba(16,185,129,0.08)" }}>
              This week uses <b>{selectedMode === "detailed" ? "detailed mode" : "single mode"}</b> for the selected employee.
            </div>
          ) : (
            <div style={{ color: "var(--muted)", marginBottom: 16 }}>Select an eligible employee to continue.</div>
          )}

          {selectedMode === "detailed" ? (
            <>
              <button className="btn-ghost" style={{ marginBottom: 16 }} onClick={loadAutoScores}>Load Auto-Suggested Scores</button>
              {autoPreview ? <div className="card" style={{ padding: 14, marginBottom: 16, background: "rgba(245,158,11,0.08)" }}>Suggested scores loaded from this week&apos;s available attendance and task data.</div> : null}
              <RatingInput label="Tasks Completion" value={form.task_completion_score} comment={form.task_comment} onScoreChange={(value) => setForm((current) => ({ ...current, task_completion_score: value }))} onCommentChange={(value) => setForm((current) => ({ ...current, task_comment: value }))} />
              <RatingInput label="Attendance" value={form.attendance_score} comment={form.attendance_comment} onScoreChange={(value) => setForm((current) => ({ ...current, attendance_score: value }))} onCommentChange={(value) => setForm((current) => ({ ...current, attendance_comment: value }))} />
              <RatingInput label="Punctuality" value={form.punctuality_score} comment={form.punctuality_comment} onScoreChange={(value) => setForm((current) => ({ ...current, punctuality_score: value }))} onCommentChange={(value) => setForm((current) => ({ ...current, punctuality_comment: value }))} />
              <RatingInput label="Behaviour" value={form.behavior_score} comment={form.behavior_comment} onScoreChange={(value) => setForm((current) => ({ ...current, behavior_score: value }))} onCommentChange={(value) => setForm((current) => ({ ...current, behavior_comment: value }))} />
            </>
          ) : selectedMode === "single" ? (
            <RatingInput label="Overall Rating" value={form.overall_score_single} comment={form.overall_comment} onScoreChange={(value) => setForm((current) => ({ ...current, overall_score_single: value }))} onCommentChange={(value) => setForm((current) => ({ ...current, overall_comment: value }))} />
          ) : null}
        </Modal>
      ) : null}

      {overrideTarget ? (
        <Modal
          title={`Edit Average Rating: ${overrideTarget.name}`}
          onClose={() => setOverrideTarget(null)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setOverrideTarget(null)}>Cancel</button>
              <button className="btn-primary" onClick={overrideAverage}>Save Once</button>
            </>
          }
        >
          <div className="card" style={{ padding: 14, marginBottom: 16, background: "rgba(239,68,68,0.08)" }}>
            Admin can override the displayed average rating for this employee only once.
          </div>
          <div className="form-group">
            <label className="label">Average Score</label>
            <input className="input" type="number" min={1} max={5} step="0.1" value={overrideScore} onChange={(event) => setOverrideScore(event.target.value)} />
          </div>
        </Modal>
      ) : null}

      {toastNode}
    </div>
  );
}
