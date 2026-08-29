"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getToken } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import Loader from "@/components/ui/Loader";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import { fmtDate, fmtTime } from "@/lib/formatters";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FIXED_HOLIDAY_LABEL = "26 Jan, 15 Aug, 2 Oct";
const PAGE_SIZE = 40;

function toIsoDate(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isSaturdayIso(iso) {
  if (!iso) return false;
  const [y, m, d] = iso.split("-").map((value) => Number(value));
  if (!y || !m || !d) return false;
  return new Date(y, m - 1, d).getDay() === 6;
}

function methodBadgeStyle(method) {
  const value = (method || "").toLowerCase();
  if (value.includes("finger")) return { background: "#f59e0b22", color: "#d97706", border: "#f59e0b44" };
  if (value.includes("face")) return { background: "#3b82f622", color: "#2563eb", border: "#3b82f644" };
  if (value.includes("palm")) return { background: "#14b8a622", color: "#0f766e", border: "#14b8a644" };
  if (value.includes("vein")) return { background: "#8b5cf622", color: "#7c3aed", border: "#8b5cf644" };
  if (value.includes("qr")) return { background: "#ec489922", color: "#db2777", border: "#ec489944" };
  return { background: "#64748b22", color: "#475569", border: "#64748b44" };
}

function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function createInitialManualForm() {
  return { employee_emp_id: "", employee_emp_ids: [], apply_to_all: false, attendance_date: todayIsoDate(), in_time: "", out_time: "", reason: "" };
}

function createInitialManualLockState() {
  return { loading: false, selected_count: 0, editable_count: 0, locked_count: 0, locked_emp_ids: [], salary_month: "", error: "" };
}

function monthStartFromIso(iso) {
  if (!iso) return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [year, month] = iso.split("-").map((value) => Number(value));
  if (!year || !month) return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  return new Date(year, month - 1, 1);
}

function shiftMonth(monthDate, offset) {
  return new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1);
}

function formatLongDate(iso) {
  if (!iso) return "No date selected";
  const [year, month, day] = iso.split("-").map((value) => Number(value));
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function paginateItems(items, page, pageSize = PAGE_SIZE) {
  const safePage = Math.max(1, page || 1);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function PaginationControls({ page, totalItems, pageSize = PAGE_SIZE, onPageChange, label = "records" }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = totalItems === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 20px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        {totalItems === 0 ? `No ${label} to show.` : `Showing ${start}-${end} of ${totalItems} ${label}`}
      </div>
      {totalItems > pageSize ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn-ghost" type="button" style={{ padding: "6px 12px", fontSize: 12 }} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Prev
          </button>
          <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 72, textAlign: "center" }}>
            Page {page} / {totalPages}
          </span>
          <button className="btn-ghost" type="button" style={{ padding: "6px 12px", fontSize: 12 }} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ManualAttendanceCalendar({ monthDate, selectedIso, onSelect, onMonthChange }) {
  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const currentMonth = new Date();
  const isCurrentMonth = year === currentMonth.getFullYear() && monthIndex === currentMonth.getMonth();
  const cells = [];

  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) cells.push(day);

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
        <button className="btn-ghost" type="button" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => onMonthChange(shiftMonth(monthDate, -1))}>
          Prev
        </button>
        <div style={{ fontWeight: 800 }}>{MONTH_NAMES[monthIndex]} {year}</div>
        <button
          className="btn-ghost"
          type="button"
          style={{ padding: "6px 12px", fontSize: 12 }}
          disabled={isCurrentMonth}
          onClick={() => onMonthChange(shiftMonth(monthDate, 1))}
        >
          Next
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {WEEKDAYS.map((item) => <div key={item} style={{ fontSize: 10, textAlign: "center", color: "var(--muted)", fontWeight: 700 }}>{item}</div>)}
        {cells.map((day, index) => {
          const iso = day ? toIsoDate(year, monthIndex, day) : null;
          const isFuture = Boolean(iso && iso > todayIsoDate());
          const isSelected = iso === selectedIso;
          const isToday = iso === todayIsoDate();
          return (
            <button
              key={`${year}-${monthIndex}-${index}`}
              type="button"
              disabled={!day || isFuture}
              onClick={() => iso && !isFuture && onSelect(iso)}
              style={{
                minHeight: 40,
                borderRadius: 10,
                border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: isSelected ? "color-mix(in srgb, var(--accent) 14%, var(--surface2))" : "var(--surface2)",
                color: isFuture ? "var(--muted)" : (isToday ? "var(--accent)" : "var(--text)"),
                cursor: !day || isFuture ? "not-allowed" : "pointer",
                fontSize: 12,
                fontWeight: isSelected || isToday ? 700 : 500,
                opacity: !day ? 0 : (isFuture ? 0.45 : 1),
              }}
              title={isFuture ? "Future dates are locked" : (iso || "")}
            >
              <span>{day || ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({ year, monthIndex, holidays, canSelect, includeSaturdays, onPick }) {
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) cells.push(day);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 12 }}>{MONTH_NAMES[monthIndex]} {year}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {WEEKDAYS.map((item) => <div key={item} style={{ fontSize: 10, textAlign: "center", color: "var(--muted)", fontWeight: 700 }}>{item}</div>)}
        {cells.map((day, index) => {
          const dateValue = day ? new Date(year, monthIndex, day) : null;
          const iso = day ? toIsoDate(year, monthIndex, day) : null;
          const weekday = dateValue ? dateValue.getDay() : -1;
          const isSunday = weekday === 0;
          const isSaturday = weekday === 6;
          const holiday = iso ? holidays.find((item) => item.date === iso) : null;
          const holidayName = String(holiday?.name || "").toLowerCase();
          const isWfhMarker = Boolean(holiday && (holiday.day_type === "wfh" || holiday.is_wfh || holidayName.includes("wfh") || holidayName === "saturday week-off"));
          const isSaturdayWeekOffHoliday = Boolean(holiday && holiday.name === "Saturday Week-Off");
          const showHoliday = Boolean(holiday) && !isWfhMarker && !(isSaturdayWeekOffHoliday && !includeSaturdays);
          const showWfh = Boolean(holiday) && isWfhMarker;
          const isDefaultSunday = !holiday && isSunday;
          const isSaturdayMarker = includeSaturdays && !showHoliday && !isSunday && isSaturday;
          const bg = showWfh
            ? "rgba(6,182,212,0.12)"
            : showHoliday
            ? "rgba(59,130,246,0.12)"
            : isDefaultSunday
              ? "rgba(234,88,12,0.14)"
              : isSaturdayMarker
                ? "rgba(99,102,241,0.10)"
                : "var(--surface2)";
          const fg = showWfh
            ? "#0891b2"
            : showHoliday
            ? "#2563eb"
            : isDefaultSunday
              ? "#c2410c"
              : isSaturdayMarker
                ? "#4f46e5"
                : "var(--text)";
          return (
            <button
              key={`${monthIndex}-${index}`}
              type="button"
              disabled={!day}
              onClick={() => iso && canSelect && onPick(iso)}
              title={showWfh ? `Work From Home: ${holiday.name}` : (showHoliday ? holiday.name : (isDefaultSunday ? "Sunday (Default Week-Off)" : (isSaturdayMarker ? "Saturday (Selected)" : (isSaturday ? "Saturday" : ""))))}
              style={{
                minHeight: 42,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: bg,
                color: fg,
                cursor: day && canSelect ? "pointer" : "default",
                fontSize: 12,
                fontWeight: (showWfh || showHoliday || isDefaultSunday) ? 700 : 500,
              }}
            >
              <span>{day || ""}</span>
              {showWfh ? <span style={{ display: "block", fontSize: 8, marginTop: 2 }}>WFH</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AttendanceHRPage() {
  const router = useRouter();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const isHR = role === "hr";
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all_logs");
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState([]);
  const [machineLogs, setMachineLogs] = useState([]);
  const [machineEmployees, setMachineEmployees] = useState([]);
  const [machineMode, setMachineMode] = useState("monthly");
  const [machineMonth, setMachineMonth] = useState(new Date().getMonth() + 1);
  const [machineDay, setMachineDay] = useState(todayIsoDate());
  const [machineEmpId, setMachineEmpId] = useState("");
  const [allLogs, setAllLogs] = useState([]);
  const [allLogsMode, setAllLogsMode] = useState("monthly");
  const [allLogsMonth, setAllLogsMonth] = useState(new Date().getMonth() + 1);
  const [allLogsDay, setAllLogsDay] = useState(todayIsoDate());
  const [allLogsEmpId, setAllLogsEmpId] = useState("");
  const [allLogsStatus, setAllLogsStatus] = useState("");
  const [allLogsPage, setAllLogsPage] = useState(1);
  const [editedRecords, setEditedRecords] = useState([]);
  const [notPunchedRecords, setNotPunchedRecords] = useState([]);
  const [editedPage, setEditedPage] = useState(1);
  const [notPunchedPage, setNotPunchedPage] = useState(1);
  const [machinePage, setMachinePage] = useState(1);
  const [employees, setEmployees] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [holidayName, setHolidayName] = useState("");
  const [includeSaturdays, setIncludeSaturdays] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [manualSearch, setManualSearch] = useState("");
  const [manualPick, setManualPick] = useState("");
  const [manualCalendarMonth, setManualCalendarMonth] = useState(() => monthStartFromIso(todayIsoDate()));
  const [manualForm, setManualForm] = useState(createInitialManualForm);
  const [manualLockState, setManualLockState] = useState(createInitialManualLockState);
  const [fixForm, setFixForm] = useState({ attendance_id: null, employee: "", date: "", in_time: "", out_time: "", note: "" });
  const [detailRecord, setDetailRecord] = useState(null);
  const [showToast, toastNode] = useToast();

  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => index), []);
  const filteredEmployees = useMemo(() => {
    const query = manualSearch.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) => `${employee.emp_id || ""} ${employee.first_name || ""} ${employee.last_name || ""} ${employee.department || ""}`.toLowerCase().includes(query));
  }, [employees, manualSearch]);

  const load = useCallback(async (options = {}) => {
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    try {
      const machineParams = new URLSearchParams();
      if (machineEmpId) machineParams.set("emp_id", machineEmpId);
      if (machineMode === "daily" && machineDay) {
        machineParams.set("day", machineDay);
      } else {
        machineParams.set("month", String(machineMonth));
        machineParams.set("year", String(year));
      }

      const allLogsParams = new URLSearchParams();
      if (allLogsEmpId) allLogsParams.set("emp_id", allLogsEmpId);
      if (allLogsStatus) allLogsParams.set("status", allLogsStatus);
      if (allLogsMode === "daily" && allLogsDay) {
        allLogsParams.set("day", allLogsDay);
      } else if (allLogsMode === "monthly") {
        allLogsParams.set("month", String(allLogsMonth));
        allLogsParams.set("year", String(year));
      }

      const requests = [
        apiFetch(`/attendance/holidays?year=${year}`),
        apiFetch(`/attendance/machine-logs?${machineParams.toString()}`),
        apiFetch("/employees/").catch(() => []),
        apiFetch("/employees/me").catch(() => null),
        apiFetch(`/attendance/all?${allLogsParams.toString()}`).catch(() => []),
      ];
      if (isAdmin || isHR) {
        requests.push(apiFetch(`/attendance/edited-records?year=${year}&source=manual`));
        requests.push(apiFetch(`/attendance/not-punched?year=${year}`));
      }
      const responses = await Promise.all(requests);
      const holidayRes = responses[0] || {};
      const machineRes = responses[1] || {};
      const employeeRes = responses[2] || [];
      const meRes = responses[3] || null;
      const allLogsRes = responses[4] || [];
      let editedRes = [];
      let notPunchedRes = [];
      if (isAdmin || isHR) {
        editedRes = responses[5] || [];
        notPunchedRes = responses[6] || [];
      }
      const loadedHolidays = Array.isArray(holidayRes.holidays) ? holidayRes.holidays : [];
      setHolidays(loadedHolidays);
      setIncludeSaturdays(
        loadedHolidays.some((item) => item.name === "Saturday Week-Off" && isSaturdayIso(item.date))
      );
      setMachineLogs(machineRes.logs || []);
      setAllLogs(Array.isArray(allLogsRes) ? allLogsRes : []);
      const baseEmployees = Array.isArray(employeeRes) ? employeeRes : [];
      const mergedEmployees = [...baseEmployees];
      if (meRes?.emp_id && !mergedEmployees.some((employee) => employee.emp_id === meRes.emp_id)) {
        mergedEmployees.push({
          emp_id: meRes.emp_id,
          first_name: meRes.first_name || "",
          last_name: meRes.last_name || "",
          department: meRes.department || "",
          is_superuser: !!meRes.is_superuser,
          is_active: true,
        });
      }
      const activeMachineEmployees = mergedEmployees
        .filter((employee) => employee.is_active !== false)
        .sort((a, b) => String(a.emp_id || "").localeCompare(String(b.emp_id || "")));
      setMachineEmployees(activeMachineEmployees);
      setEmployees(mergedEmployees.filter((employee) => employee.is_active !== false && !employee.is_superuser));
      setEditedRecords(Array.isArray(editedRes) ? editedRes : []);
      setNotPunchedRecords(Array.isArray(notPunchedRes) ? notPunchedRes : []);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [allLogsDay, allLogsEmpId, allLogsMode, allLogsMonth, allLogsStatus, isAdmin, isHR, machineDay, machineEmpId, machineMode, machineMonth, showToast, year]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load({ silent: true }), 60000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  useEffect(() => {
    setEditedPage(1);
    setNotPunchedPage(1);
  }, [year]);

  useEffect(() => {
    setMachinePage(1);
  }, [machineMode, machineMonth, machineDay, machineEmpId, year]);

  const editedTotalPages = Math.max(1, Math.ceil(editedRecords.length / PAGE_SIZE));
  const notPunchedTotalPages = Math.max(1, Math.ceil(notPunchedRecords.length / PAGE_SIZE));
  const machineTotalPages = Math.max(1, Math.ceil(machineLogs.length / PAGE_SIZE));

  useEffect(() => {
    setEditedPage((current) => Math.min(current, editedTotalPages));
  }, [editedTotalPages]);

  useEffect(() => {
    setNotPunchedPage((current) => Math.min(current, notPunchedTotalPages));
  }, [notPunchedTotalPages]);

  useEffect(() => {
    setMachinePage((current) => Math.min(current, machineTotalPages));
  }, [machineTotalPages]);

  useEffect(() => {
    if (!manualOpen || !manualForm.attendance_date) return;
    const targetMonth = monthStartFromIso(manualForm.attendance_date);
    setManualCalendarMonth((current) => (
      current.getFullYear() === targetMonth.getFullYear() && current.getMonth() === targetMonth.getMonth()
        ? current
        : targetMonth
    ));
  }, [manualForm.attendance_date, manualOpen]);

  useEffect(() => {
    if (!manualOpen) return;
    const hasSelection = manualForm.apply_to_all || manualForm.employee_emp_ids.length > 0 || Boolean(manualForm.employee_emp_id);
    if (!manualForm.attendance_date || !hasSelection) {
      setManualLockState(createInitialManualLockState());
      return;
    }

    let cancelled = false;
    setManualLockState((current) => ({ ...current, loading: true, error: "" }));

    apiFetch("/attendance/manual-entry/check", {
      method: "POST",
      body: JSON.stringify({
        employee_emp_id: manualForm.employee_emp_id,
        employee_emp_ids: manualForm.employee_emp_ids,
        apply_to_all: manualForm.apply_to_all,
        attendance_date: manualForm.attendance_date,
      }),
    })
      .then((data) => {
        if (cancelled) return;
        setManualLockState({
          loading: false,
          selected_count: Number(data?.selected_count || 0),
          editable_count: Number(data?.editable_count || 0),
          locked_count: Number(data?.locked_count || 0),
          locked_emp_ids: Array.isArray(data?.locked_emp_ids) ? data.locked_emp_ids : [],
          salary_month: data?.salary_month || "",
          error: "",
        });
        if (data && !manualForm.apply_to_all && (manualForm.employee_emp_ids.length === 1 || (!manualForm.employee_emp_ids.length && manualForm.employee_emp_id))) {
          setManualForm((current) => ({
            ...current,
            in_time: data.existing_check_in || "",
            out_time: data.existing_check_out || "",
          }));
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setManualLockState({
          ...createInitialManualLockState(),
          error: error.message,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [manualForm.apply_to_all, manualForm.attendance_date, manualForm.employee_emp_id, manualForm.employee_emp_ids, manualOpen]);

  function handlePickDay(iso) {
    if (!isAdmin) return;
    setSelectedDay(iso);
    setHolidayName(holidays.find((item) => item.date === iso)?.name || "");
  }

  function openManualModal() {
    setManualSearch("");
    setManualPick("");
    setManualCalendarMonth(monthStartFromIso(todayIsoDate()));
    setManualForm(createInitialManualForm());
    setManualLockState(createInitialManualLockState());
    setManualOpen(true);
  }

  async function saveHoliday() {
    const cleanName = holidayName.trim();
    if (!cleanName) {
      showToast("Holiday name is required", "error");
      return;
    }
    if (!/^[A-Za-z0-9 &'.-]+$/.test(cleanName)) {
      showToast("Holiday name contains unsupported symbols", "error");
      return;
    }
    try {
      await apiFetch("/attendance/holidays", { method: "POST", body: JSON.stringify({ date: selectedDay, name: cleanName }) });
      await load();
      showToast("Holiday saved");
      setSelectedDay(null);
      setHolidayName("");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function applyYearDefaults() {
    try {
      const query = `year=${year}&include_saturdays=${includeSaturdays ? "true" : "false"}`;
      const data = await apiFetch(`/attendance/holidays/year-defaults?${query}`, { method: "POST" });
      const added = Number(data?.added || 0);
      const updated = Number(data?.updated || 0);
      const removed = Number(data?.removed || 0);
      showToast(`Year defaults applied (${added} added, ${updated} updated, ${removed} removed).`);
      await load();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function deleteHoliday() {
    const holiday = holidays.find((item) => item.date === selectedDay);
    if (!holiday) return;
    try {
      await apiFetch(`/attendance/holidays/${holiday.id}`, { method: "DELETE" });
      await load();
      showToast("Holiday removed");
      setSelectedDay(null);
      setHolidayName("");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function saveManualEntry() {
    try {
      const data = await apiFetch("/attendance/manual-entry", { method: "POST", body: JSON.stringify(manualForm) });
      await load();
      showToast(data?.message || "Manual attendance saved", data?.skipped_locked_count ? "warn" : "success");
      setManualOpen(false);
      setManualSearch("");
      setManualPick("");
      setManualCalendarMonth(monthStartFromIso(todayIsoDate()));
      setManualForm(createInitialManualForm());
      setManualLockState(createInitialManualLockState());
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function openFixModal(record) {
    setFixForm({
      attendance_id: record.id,
      employee: `${record.employee_name || ""} ${record.emp_id ? `(${record.emp_id})` : ""}`.trim(),
      date: record.date || "",
      in_time: (record.check_in || "").slice(0, 5),
      out_time: (record.check_out || "").slice(0, 5),
      note: "",
    });
    setFixOpen(true);
  }

  async function saveNotPunchedFix() {
    const note = (fixForm.note || "").trim();
    if (!note) {
      showToast("HR note is required", "error");
      return;
    }
    if (fixForm.out_time <= fixForm.in_time) {
      showToast("Out Time must be later than In Time", "error");
      return;
    }

    try {
      await apiFetch("/attendance/not-punched/fix", {
        method: "POST",
        body: JSON.stringify({
          attendance_id: fixForm.attendance_id,
          in_time: fixForm.in_time,
          out_time: fixForm.out_time,
          note,
        }),
      });
      await load();
      showToast("Not punched record fixed");
      setFixOpen(false);
      setFixForm({ attendance_id: null, employee: "", date: "", in_time: "", out_time: "", note: "" });
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function revertManualEntry(attendanceId) {
    if (!confirm("Are you sure you want to delete or revert this manual entry?")) {
      return;
    }
    try {
      await apiFetch(`/attendance/manual-entry/${attendanceId}`, {
        method: "DELETE",
      });
      showToast("Manual entry deleted/reverted successfully");
      setDetailRecord(null);
      await load();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function exportMachineLogsXlsx() {
    try {
      const machineParams = new URLSearchParams();
      if (machineEmpId) machineParams.set("emp_id", machineEmpId);
      if (machineMode === "daily" && machineDay) {
        machineParams.set("day", machineDay);
      } else {
        machineParams.set("month", String(machineMonth));
        machineParams.set("year", String(year));
      }

      const token = getToken();
      const response = await fetch(`/api/proxy/attendance/machine-logs/export?${machineParams.toString()}`, {
        method: "GET",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const detail = errorData?.detail;
        const message = typeof detail === "string" ? detail : "Machine logs export failed";
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
      const fileName = filenameMatch?.[1] || "Machine_Logs.xlsx";

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Machine logs exported: ${fileName}`);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function toggleEmployee(empId) {
    setManualForm((current) => {
      const exists = current.employee_emp_ids.includes(empId);
      const nextIds = exists ? current.employee_emp_ids.filter((item) => item !== empId) : [...current.employee_emp_ids, empId];
      return {
        ...current,
        apply_to_all: false,
        employee_emp_id: nextIds[0] || "",
        employee_emp_ids: nextIds,
      };
    });
  }

  function addPickedEmployee() {
    if (!manualPick) return;
    toggleEmployee(manualPick);
    setManualPick("");
  }

  const selectedEmployees = useMemo(
    () => employees.filter((employee) => manualForm.employee_emp_ids.includes(employee.emp_id)),
    [employees, manualForm.employee_emp_ids]
  );
  const paginatedAllLogs = useMemo(
    () => paginateItems(allLogs, allLogsPage),
    [allLogs, allLogsPage]
  );

  async function exportAllLogsXlsx() {
    try {
      const allLogsParams = new URLSearchParams();
      if (allLogsEmpId) allLogsParams.set("emp_id", allLogsEmpId);
      if (allLogsStatus) allLogsParams.set("status", allLogsStatus);
      if (allLogsMode === "daily" && allLogsDay) {
        allLogsParams.set("day", allLogsDay);
      } else if (allLogsMode === "monthly") {
        allLogsParams.set("month", String(allLogsMonth));
        allLogsParams.set("year", String(year));
      }

      const token = getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/attendance/all?${allLogsParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to export attendance logs");
      const blob = await response.blob();
      const fileName = `Attendance_Logs_${allLogsMode === "daily" ? allLogsDay : `${MONTH_NAMES[allLogsMonth - 1]}_${year}`}.xlsx`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Exported: ${fileName}`);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  const paginatedEditedRecords = useMemo(
    () => paginateItems(editedRecords, editedPage),
    [editedPage, editedRecords]
  );
  const paginatedNotPunchedRecords = useMemo(
    () => paginateItems(notPunchedRecords, notPunchedPage),
    [notPunchedPage, notPunchedRecords]
  );
  const paginatedMachineLogs = useMemo(
    () => paginateItems(machineLogs, machinePage),
    [machineLogs, machinePage]
  );
  const hasInvalidFixRange = Boolean(fixForm.in_time && fixForm.out_time && fixForm.out_time <= fixForm.in_time);
  const manualEntryLocked = manualLockState.selected_count > 0 && manualLockState.editable_count === 0 && manualLockState.locked_count > 0;
  const manualEntryDisabled = (
    (!manualForm.apply_to_all && manualForm.employee_emp_ids.length === 0)
    || !manualForm.reason.trim()
    || !manualForm.attendance_date
    || manualLockState.loading
    || Boolean(manualLockState.error)
    || manualEntryLocked
  );

  if (loading) return <Loader />;

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Attendance Management</h1>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>
            {isAdmin ? "Admin reviews system-wide attendance, manual edits, and manages holidays." : "HR handles system attendance, manual edits, and device logs."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="input" style={{ width: "auto" }} value={year} onChange={(e) => setYear(+e.target.value)}>
            {[2025, 2026, 2027].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          {isHR ? (
            <>
              <button className="btn-primary" onClick={openManualModal}>Manual Entry</button>
              <button className="btn-primary" type="button" style={{ background: "#06b6d4", borderColor: "#06b6d4" }} onClick={() => router.push("/dashboard/attendance-settings")}>🏠 Grant WFH</button>
            </>
          ) : null}
          <div style={{ display: "flex", background: "var(--hover-bg)", padding: 4, borderRadius: 10, flexWrap: "wrap" }}>
            {(isAdmin || isHR) ? <button className="btn-ghost" onClick={() => setTab("all_logs")} style={{ padding: "6px 14px", fontSize: 13, background: tab === "all_logs" ? "var(--surface2)" : "transparent" }}>All Attendance Logs</button> : null}
            {(isAdmin || isHR) ? <button className="btn-ghost" onClick={() => setTab("edited")} style={{ padding: "6px 14px", fontSize: 13, background: tab === "edited" ? "var(--surface2)" : "transparent" }}>Manual Edit Records</button> : null}
            {(isAdmin || isHR) ? <button className="btn-ghost" onClick={() => setTab("not_punched")} style={{ padding: "6px 14px", fontSize: 13, background: tab === "not_punched" ? "var(--surface2)" : "transparent" }}>Not Punched</button> : null}
            <button className="btn-ghost" onClick={() => setTab("calendar")} style={{ padding: "6px 14px", fontSize: 13, background: tab === "calendar" ? "var(--surface2)" : "transparent" }}>Holiday Calendar</button>
            <button className="btn-ghost" onClick={() => setTab("machine")} style={{ padding: "6px 14px", fontSize: 13, background: tab === "machine" ? "var(--surface2)" : "transparent" }}>Machine Logs</button>
          </div>
        </div>
      </div>

      {tab === "all_logs" && (isAdmin || isHR) ? (
        <div className="card">
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 className="syne" style={{ fontSize: 16, fontWeight: 700 }}>SYSTEM-WIDE ATTENDANCE LOGS</h2>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                Complete attendance history across Web, Mobile App, Biometric Machine & Manual Entries
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", background: "var(--hover-bg)", padding: 3, borderRadius: 8 }}>
                <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12, background: allLogsMode === "monthly" ? "var(--surface2)" : "transparent" }} onClick={() => setAllLogsMode("monthly")}>Monthly</button>
                <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12, background: allLogsMode === "daily" ? "var(--surface2)" : "transparent" }} onClick={() => setAllLogsMode("daily")}>Daily</button>
                <button className="btn-ghost" style={{ padding: "4px 10px", fontSize: 12, background: allLogsMode === "all" ? "var(--surface2)" : "transparent" }} onClick={() => setAllLogsMode("all")}>All</button>
              </div>

              {allLogsMode === "monthly" ? (
                <select className="input" style={{ width: "auto" }} value={allLogsMonth} onChange={(e) => setAllLogsMonth(+e.target.value)}>
                  {MONTH_NAMES.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
                </select>
              ) : null}

              {allLogsMode === "daily" ? (
                <input type="date" className="input" style={{ width: "auto" }} value={allLogsDay} onChange={(e) => setAllLogsDay(e.target.value)} />
              ) : null}

              <select className="input" style={{ width: "auto" }} value={allLogsEmpId} onChange={(e) => setAllLogsEmpId(e.target.value)}>
                <option value="">All Employees</option>
                {machineEmployees.map((emp) => (
                  <option key={emp.emp_id} value={emp.emp_id}>{emp.first_name} {emp.last_name} ({emp.emp_id})</option>
                ))}
              </select>

              <select className="input" style={{ width: "auto" }} value={allLogsStatus} onChange={(e) => setAllLogsStatus(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
                <option value="paid_leave">Paid Leave</option>
              </select>

              <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={load}>Refresh</button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>EMPLOYEE</th>
                  <th>DEPARTMENT</th>
                  <th>PUNCH IN</th>
                  <th>PUNCH OUT</th>
                  <th>PUNCH METHOD</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAllLogs.map((record) => (
                  <tr key={record.id} onClick={() => setDetailRecord(record)} style={{ cursor: "pointer" }}>
                    <td><b>{fmtDate(record.date)}</b></td>
                    <td><b>{record.employee_name || record.emp_id}</b><div style={{ fontSize: 12, color: "var(--muted)" }}>{record.emp_id}</div></td>
                    <td>{record.department || "—"}</td>
                    <td>{record.punch_in ? <span style={{ color: "#10b981", fontWeight: 600 }}>{fmtTime(record.punch_in)}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td>{record.punch_out ? <span>{fmtTime(record.punch_out)}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td>
                      <span className="badge" style={methodBadgeStyle(record.punch_method || (record.is_machine_punch ? "fingerprint" : "web"))}>
                        {record.punch_method || (record.is_machine_punch ? "Biometric Machine" : "Web / Portal")}
                      </span>
                    </td>
                    <td><StatusBadge status={record.status} /></td>
                  </tr>
                ))}
                {allLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                      No attendance records found for the selected filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <PaginationControls page={allLogsPage} totalItems={allLogs.length} onPageChange={setAllLogsPage} label="attendance records" />
        </div>
      ) : null}

      {tab === "edited" && (isAdmin || isHR) ? (
        <div className="card">
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
            <h2 className="syne" style={{ fontSize: 16, fontWeight: 700 }}>Manual Attendance Edit Records</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Date</th><th>Check In</th><th>Check Out</th><th>Status</th><th>Reason</th></tr></thead>
              <tbody>
                {paginatedEditedRecords.map((record) => (
                  <tr key={record.id} onClick={() => setDetailRecord(record)} style={{ cursor: "pointer" }}>
                    <td><b>{record.employee_name}</b><div style={{ fontSize: 12, color: "var(--muted)" }}>{record.emp_id}</div></td>
                    <td>{fmtDate(record.date)}</td>
                    <td>{record.check_in || "—"}</td>
                    <td>{record.check_out || "—"}</td>
                    <td><StatusBadge status={record.status} /></td>
                    <td>{record.edit_reason || "—"}</td>
                  </tr>
                ))}
                {editedRecords.length === 0 ? <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No manual attendance edits found for {year}.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <PaginationControls page={editedPage} totalItems={editedRecords.length} onPageChange={setEditedPage} label="manual edit records" />
        </div>
      ) : null}

      {tab === "calendar" ? (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 18, fontSize: 14, color: "var(--muted)" }}>
            {isAdmin ? "Select any date in the year to add or edit a holiday." : "Holiday management is handled by Admin. HR can review the full-year calendar here."}
          </div>
          {isAdmin ? (
            <div className="card" style={{ padding: 14, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--text)" }}>
                  <input type="checkbox" checked readOnly disabled />
                  Sundays (default week-off)
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--text)" }}>
                  <input type="checkbox" checked readOnly disabled />
                  Fixed holidays ({FIXED_HOLIDAY_LABEL})
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--text)" }}>
                  <input type="checkbox" checked={includeSaturdays} onChange={(e) => setIncludeSaturdays(e.target.checked)} />
                  Select all Saturdays
                </label>
                <button className="btn-primary" onClick={applyYearDefaults}>Apply Year Pattern</button>
              </div>
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {months.map((monthIndex) => (
              <MonthGrid
                key={monthIndex}
                year={year}
                monthIndex={monthIndex}
                holidays={holidays}
                canSelect={isAdmin}
                includeSaturdays={includeSaturdays}
                onPick={handlePickDay}
              />
            ))}
          </div>
        </div>
      ) : null}

      {tab === "not_punched" && (isAdmin || isHR) ? (
        <div className="card">
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
            <h2 className="syne" style={{ fontSize: 16, fontWeight: 700 }}>Not Punched Records (Auto Closed at 11:30 PM)</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Date</th><th>In Time</th><th>Auto Out Time</th><th>Note</th><th>Actions</th></tr></thead>
              <tbody>
                {paginatedNotPunchedRecords.map((record) => (
                  <tr key={record.id}>
                    <td><b>{record.employee_name}</b><div style={{ fontSize: 12, color: "var(--muted)" }}>{record.emp_id}</div></td>
                    <td>{fmtDate(record.date)}</td>
                    <td>{record.check_in ? String(record.check_in).slice(0, 5) : "—"}</td>
                    <td>{record.check_out ? String(record.check_out).slice(0, 5) : "23:30"}</td>
                    <td>{record.auto_punch_out_note || record.edit_reason || "Auto closed due to missing punch-out"}</td>
                    <td>
                      <div style={{ display: "grid", gap: 6 }}>
                        <button
                          className="btn-ghost"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          disabled={record.payroll_locked}
                          onClick={() => openFixModal(record)}
                        >
                          {record.payroll_locked ? "Salary Generated" : "Fix Timing"}
                        </button>
                        {record.payroll_locked ? (
                          <div style={{ fontSize: 11, color: "#dc2626", lineHeight: 1.35 }}>
                            {record.payroll_lock_reason || "Attendance locked after salary generation."}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {notPunchedRecords.length === 0 ? <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No not-punched records for {year}.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <PaginationControls page={notPunchedPage} totalItems={notPunchedRecords.length} onPageChange={setNotPunchedPage} label="not punched records" />
        </div>
      ) : null}

      {tab === "machine" ? (
        <div className="card">
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h2 className="syne" style={{ fontSize: 16, fontWeight: 700 }}>Device Audit Logs</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", background: "var(--hover-bg)", padding: 4, borderRadius: 10 }}>
                  <button className="btn-ghost" onClick={() => setMachineMode("monthly")} style={{ padding: "6px 12px", fontSize: 12, background: machineMode === "monthly" ? "var(--surface2)" : "transparent" }}>Monthly</button>
                  <button className="btn-ghost" onClick={() => setMachineMode("daily")} style={{ padding: "6px 12px", fontSize: 12, background: machineMode === "daily" ? "var(--surface2)" : "transparent" }}>Daily</button>
                </div>

                {machineMode === "monthly" ? (
                  <select className="input" style={{ width: "auto" }} value={machineMonth} onChange={(e) => setMachineMonth(Number(e.target.value))}>
                    {MONTH_NAMES.map((name, idx) => <option key={name} value={idx + 1}>{name}</option>)}
                  </select>
                ) : (
                  <input className="input" type="date" value={machineDay} onChange={(e) => setMachineDay(e.target.value)} />
                )}

                <select className="input" style={{ width: "min(100%, 240px)" }} value={machineEmpId} onChange={(e) => setMachineEmpId(e.target.value)}>
                  <option value="">All Employees</option>
                  {machineEmployees.map((employee) => (
                    <option key={employee.emp_id} value={employee.emp_id}>
                      {employee.emp_id} - {employee.first_name} {employee.last_name}
                    </option>
                  ))}
                </select>

                <button className="btn-ghost" onClick={load} style={{ padding: "6px 12px", fontSize: 12 }}>Refresh</button>
                <button className="btn-primary" onClick={exportMachineLogsXlsx} style={{ padding: "6px 12px", fontSize: 12 }}>Export XLSX</button>
              </div>
            </div>
            <div style={{ color: "var(--muted)", marginTop: 8, fontSize: 12 }}>
              {machineMode === "monthly"
                ? `Showing ${MONTH_NAMES[machineMonth - 1]} ${year}${machineEmpId ? ` for ${machineEmpId}` : " for all employees"}.`
                : `Showing ${machineDay || "selected day"}${machineEmpId ? ` for ${machineEmpId}` : " for all employees"}.`}
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Time In</th><th>Time Out</th><th>Employee</th><th>Device SN</th><th>Status</th></tr></thead>
              <tbody>
                {paginatedMachineLogs.map((log, index) => (
                  (() => {
                    const inMethodStyle = methodBadgeStyle(log.time_in_method);
                    const outMethodStyle = methodBadgeStyle(log.time_out_method);
                    return (
                      <tr key={`${log.emp_id}-${log.date}-${index}`}>
                        <td>{fmtDate(log.date)}</td>
                        <td>
                          <div>{log.time_in || "—"}</div>
                          {log.time_in_method ? (
                            <div style={{ marginTop: 4 }}>
                              <span
                                className="badge"
                                style={{
                                  background: inMethodStyle.background,
                                  color: inMethodStyle.color,
                                  boxShadow: `inset 0 0 0 1px ${inMethodStyle.border}`,
                                  fontSize: 11,
                                }}
                              >
                                {log.time_in_method}
                              </span>
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <div>{log.time_out || "—"}</div>
                          {log.time_out_method ? (
                            <div style={{ marginTop: 4 }}>
                              <span
                                className="badge"
                                style={{
                                  background: outMethodStyle.background,
                                  color: outMethodStyle.color,
                                  boxShadow: `inset 0 0 0 1px ${outMethodStyle.border}`,
                                  fontSize: 11,
                                }}
                              >
                                {log.time_out_method}
                              </span>
                            </div>
                          ) : null}
                        </td>
                        <td><b>{log.name}</b><div style={{ fontSize: 12, color: "var(--muted)" }}>{log.emp_id}</div></td>
                        <td><code style={{ fontSize: 11 }}>{log.device_sn || "—"}</code></td>
                        <td>
                          <StatusBadge
                            status={log.attendance_status || "present"}
                            label={log.attendance_status_label || "Present"}
                          />
                          {log.is_hr_edited ? (
                            <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>
                              HR Edit{log.edit_reason ? `: ${log.edit_reason}` : ""}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })()
                ))}
                {machineLogs.length === 0 ? <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No machine logs found for selected filters.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <PaginationControls page={machinePage} totalItems={machineLogs.length} onPageChange={setMachinePage} label="machine log records" />
        </div>
      ) : null}

      {selectedDay ? (
        <Modal
          title={`${holidays.some((item) => item.date === selectedDay) ? "Edit" : "Add"} Holiday · ${formatLongDate(selectedDay)}`}
          onClose={() => setSelectedDay(null)}
          footer={
            <>
              {holidays.find((item) => item.date === selectedDay) ? <button className="btn-danger" onClick={deleteHoliday}>Delete</button> : null}
              <button className="btn-ghost" onClick={() => setSelectedDay(null)}>Cancel</button>
              <button className="btn-primary" disabled={!holidayName.trim()} onClick={saveHoliday}>Save</button>
            </>
          }
        >
          <div className="form-group">
            <label className="label">Holiday Name *</label>
            <input className="input" required value={holidayName} onChange={(e) => setHolidayName(e.target.value)} />
          </div>
        </Modal>
      ) : null}

      {manualOpen ? (
        <Modal
          title="Manual Attendance Entry"
          onClose={() => setManualOpen(false)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setManualOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={manualEntryDisabled} onClick={saveManualEntry}>
                {manualLockState.loading ? "Checking..." : "Save Entry"}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="label">Attendance Date</label>
            <div style={{ marginBottom: 10, fontSize: 13, color: "var(--muted)" }}>
              {formatLongDate(manualForm.attendance_date)}. Past and current dates only.
            </div>
            <ManualAttendanceCalendar
              monthDate={manualCalendarMonth}
              selectedIso={manualForm.attendance_date}
              onSelect={(iso) => setManualForm((current) => ({ ...current, attendance_date: iso }))}
              onMonthChange={setManualCalendarMonth}
            />
          </div>
          <div className="form-group">
            <label className="label">Employee Selection</label>
            <input className="input" placeholder="Search by employee ID, name, or department" value={manualSearch} onChange={(e) => setManualSearch(e.target.value)} />
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <select
                className="input"
                value={manualPick}
                disabled={manualForm.apply_to_all}
                onChange={(e) => setManualPick(e.target.value)}
              >
                <option value="">Select employee from filtered list</option>
                {filteredEmployees.map((employee) => (
                  <option key={employee.emp_id} value={employee.emp_id}>
                    {employee.emp_id} - {employee.first_name} {employee.last_name}
                  </option>
                ))}
              </select>
              <button className="btn-ghost" type="button" disabled={!manualPick || manualForm.apply_to_all} onClick={addPickedEmployee}>Add</button>
            </div>
            <div className="card" style={{ marginTop: 12, maxHeight: 220, overflow: "auto", padding: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", fontWeight: 700, borderBottom: "1px solid var(--border)" }}>
                <input
                  type="checkbox"
                  checked={manualForm.apply_to_all}
                  onChange={(e) => setManualForm((current) => ({
                    ...current,
                    apply_to_all: e.target.checked,
                    employee_emp_id: "",
                    employee_emp_ids: e.target.checked ? [] : current.employee_emp_ids,
                  }))}
                />
                All Employees
              </label>
              {selectedEmployees.map((employee) => (
                <div key={employee.emp_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 4px", borderTop: "1px solid var(--border)" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{employee.emp_id} - {employee.first_name} {employee.last_name}</div>
                    <div style={{ color: "var(--muted)", fontSize: 12 }}>{employee.department || "No department"}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    disabled={manualForm.apply_to_all}
                    onClick={() => toggleEmployee(employee.emp_id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {!manualForm.apply_to_all && selectedEmployees.length === 0 ? <div style={{ padding: "10px 4px", color: "var(--muted)", fontSize: 13 }}>No employees selected yet. Search and add from dropdown.</div> : null}
            </div>
          </div>
          {manualLockState.error ? (
            <div className="card" style={{ padding: 12, marginBottom: 16, background: "#ef444412", borderColor: "#ef444444", color: "#dc2626" }}>
              {manualLockState.error}
            </div>
          ) : null}
          {!manualLockState.error && manualLockState.locked_count > 0 ? (
            <div
              className="card"
              style={{
                padding: 12,
                marginBottom: 16,
                background: manualEntryLocked ? "#ef444412" : "#f59e0b12",
                borderColor: manualEntryLocked ? "#ef444444" : "#f59e0b44",
                color: manualEntryLocked ? "#dc2626" : "#b45309",
              }}
            >
              {manualEntryLocked
                ? `Salary already generated for ${manualLockState.salary_month}. Attendance is locked for ${manualLockState.locked_emp_ids.slice(0, 4).join(", ")}${manualLockState.locked_emp_ids.length > 4 ? ` +${manualLockState.locked_emp_ids.length - 4} more` : ""}.`
                : `${manualLockState.locked_count} selected employee(s) are locked for ${manualLockState.salary_month}. Saving will skip those employees and update the remaining ${manualLockState.editable_count}.`}
            </div>
          ) : null}
          {!manualLockState.error && manualLockState.selected_count > 0 && manualLockState.locked_count === 0 ? (
            <div style={{ marginBottom: 16, fontSize: 12, color: "var(--muted)" }}>
              Manual edit will apply to {manualLockState.editable_count} employee{manualLockState.editable_count !== 1 ? "s" : ""} on {fmtDate(manualForm.attendance_date)}.
            </div>
          ) : null}
          <div className="form-row">
            <div className="form-group"><label className="label">In Time</label><input className="input" type="time" step="1" value={manualForm.in_time} onChange={(e) => setManualForm((current) => ({ ...current, in_time: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Out Time</label><input className="input" type="time" step="1" value={manualForm.out_time} onChange={(e) => setManualForm((current) => ({ ...current, out_time: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label className="label">Reason</label><textarea className="input" rows={3} value={manualForm.reason} onChange={(e) => setManualForm((current) => ({ ...current, reason: e.target.value }))} /></div>
        </Modal>
      ) : null}

      {fixOpen ? (
        <Modal
          title="Fix Not Punched Timing"
          onClose={() => setFixOpen(false)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setFixOpen(false)}>Cancel</button>
              <button className="btn-primary" disabled={!fixForm.in_time || !fixForm.out_time || !fixForm.note.trim() || hasInvalidFixRange} onClick={saveNotPunchedFix}>Save Fix</button>
            </>
          }
        >
          <div style={{ marginBottom: 12, color: "var(--muted)", fontSize: 13 }}>
            <div><b>Employee:</b> {fixForm.employee || "—"}</div>
            <div><b>Date:</b> {fixForm.date ? fmtDate(fixForm.date) : "—"}</div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="label">In Time</label><input className="input" type="time" value={fixForm.in_time} onChange={(e) => setFixForm((current) => ({ ...current, in_time: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Out Time</label><input className="input" type="time" value={fixForm.out_time} onChange={(e) => setFixForm((current) => ({ ...current, out_time: e.target.value }))} /></div>
          </div>
          {hasInvalidFixRange ? <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 10 }}>Out Time must be later than In Time.</div> : null}
          <div className="form-group">
            <label className="label">HR Note</label>
            <textarea className="input" rows={3} value={fixForm.note} onChange={(e) => setFixForm((current) => ({ ...current, note: e.target.value }))} placeholder="Explain why this timing was corrected." />
          </div>
        </Modal>
      ) : null}

      {detailRecord ? (
        <Modal
          title="Manual Edit Details"
          onClose={() => setDetailRecord(null)}
          footer={
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <button className="btn-danger" onClick={() => revertManualEntry(detailRecord.id)}>
                Delete / Revert Record
              </button>
              <button className="btn-primary" onClick={() => setDetailRecord(null)}>Close</button>
            </div>
          }
        >
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{detailRecord.employee_name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{detailRecord.emp_id}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(detailRecord.date)}</div>
                <div><StatusBadge status={detailRecord.status} /></div>
              </div>
            </div>
            
            {(() => {
              const wasInEdited = detailRecord.original_punch_in !== detailRecord.punch_in;
              const originalIn = wasInEdited ? detailRecord.original_punch_in : detailRecord.punch_in;
              const editedIn = wasInEdited ? detailRecord.punch_in : "—";

              const wasOutEdited = detailRecord.original_punch_out !== detailRecord.punch_out;
              const originalOut = wasOutEdited ? detailRecord.original_punch_out : detailRecord.punch_out;
              const editedOut = wasOutEdited ? detailRecord.punch_out : "—";

              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="card" style={{ padding: 12, background: "var(--hover-bg)" }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>Original Timings</div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}><b>Punch In:</b> {originalIn || "—"}</div>
                    <div style={{ fontSize: 13 }}><b>Punch Out:</b> {originalOut || "—"}</div>
                  </div>
                  <div className="card" style={{ padding: 12, background: "color-mix(in srgb, var(--accent) 6%, var(--surface2))", borderColor: "color-mix(in srgb, var(--accent) 20%, var(--border))" }}>
                    <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>Edited Timings</div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}><b>Punch In:</b> {editedIn || "—"}</div>
                    <div style={{ fontSize: 13 }}><b>Punch Out:</b> {editedOut || "—"}</div>
                  </div>
                </div>
              );
            })()}

            <div className="form-group">
              <label className="label" style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>Edit Reason</label>
              <div style={{ fontSize: 14, background: "var(--surface2)", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
                {detailRecord.edit_reason || "No reason provided."}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {toastNode}
    </div>
  );
}
