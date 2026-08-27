"use client";

import { useState, useMemo } from "react";

/**
 * AttendanceCalendar - Premium, responsive monthly attendance calendar
 * @param {Array} attendance - List of attendance records
 * @param {Array} holidays - List of company holidays [{ date: "YYYY-MM-DD", name: "..." }]
 * @param {Function} onDayClick - Optional callback when a valid day is clicked
 */
export default function AttendanceCalendar({
  attendance = [],
  holidays = [],
  onDayClick,
}) {
  const [viewDate, setViewDate] = useState(new Date());

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-indexed

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const monthName = viewDate.toLocaleString("en-US", { month: "long" });

  function prevMonth() {
    setViewDate(new Date(year, month - 1, 1));
  }
  function nextMonth() {
    setViewDate(new Date(year, month + 1, 1));
  }
  function jumpToToday() {
    setViewDate(new Date());
  }

  // Days calculations
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Create fast lookup maps for current month & year
  const attMap = useMemo(() => {
    const map = {};
    if (Array.isArray(attendance)) {
      attendance.forEach((a) => {
        if (!a || !a.date) return;
        const dateStr = String(a.date).trim();
        const parts = dateStr.split("T")[0].split("-");
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const d = parseInt(parts[2], 10);
          if (y === year && m === month) {
            map[d] = a;
          }
        }
      });
    }
    return map;
  }, [attendance, year, month]);

  const holMap = useMemo(() => {
    const map = {};
    if (Array.isArray(holidays)) {
      holidays.forEach((h) => {
        if (!h || !h.date) return;
        const dateStr = String(h.date).trim();
        const parts = dateStr.split("T")[0].split("-");
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1;
          const d = parseInt(parts[2], 10);
          if (y === year && m === month) {
            map[d] = h;
          }
        }
      });
    }
    return map;
  }, [holidays, year, month]);

  // Status helper
  function getDayStatus(d) {
    if (!d) return null;
    const hol = holMap[d];
    if (hol) return { type: "holiday", name: hol.name || "Holiday" };

    const att = attMap[d];
    if (!att) return null;

    const rawStatus = String(att.status || "").toLowerCase();
    if (rawStatus === "present" || rawStatus === "p") {
      return { type: "present", time: att.check_in || att.punch_in };
    }
    if (rawStatus === "late" || rawStatus === "l" || rawStatus === "half_day") {
      return { type: "late", time: att.check_in || att.punch_in };
    }
    if (rawStatus === "leave") {
      return { type: "leave" };
    }
    if (rawStatus === "pending_leave") {
      return { type: "pending_leave" };
    }
    if (rawStatus === "absent" || rawStatus === "a") {
      return { type: "absent" };
    }
    return { type: "recorded" };
  }

  // Monthly stats count
  const monthStats = useMemo(() => {
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      if (dateObj > today && !attMap[d]) continue; // don't count future days as absent

      const statusObj = getDayStatus(d);
      if (!statusObj) {
        const isSun = dateObj.getDay() === 0;
        if (!isSun && dateObj < today) absentCount++;
        continue;
      }
      if (statusObj.type === "present") presentCount++;
      else if (statusObj.type === "late") lateCount++;
      else if (statusObj.type === "absent") absentCount++;
    }

    return { presentCount, lateCount, absentCount };
  }, [attMap, holMap, year, month, daysInMonth]);

  // Construct Calendar Days Grid
  const calendarCells = [];

  // 1. Previous Month Padding Days
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    calendarCells.push({
      dayNum: daysInPrevMonth - i,
      isCurrentMonth: false,
      isPrevMonth: true,
    });
  }

  // 2. Current Month Days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dateIso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isToday = dateIso === todayStr;
    const isFuture = dateObj > today;
    const isSunday = dateObj.getDay() === 0;

    calendarCells.push({
      dayNum: d,
      dateIso,
      isCurrentMonth: true,
      isToday,
      isFuture,
      isSunday,
      status: getDayStatus(d),
      attRecord: attMap[d],
      holRecord: holMap[d],
    });
  }

  // 3. Next Month Padding Days
  const totalCellsSoFar = calendarCells.length;
  const targetTotal = totalCellsSoFar > 35 ? 42 : 35;
  for (let d = 1; d <= targetTotal - totalCellsSoFar; d++) {
    calendarCells.push({
      dayNum: d,
      isCurrentMonth: false,
      isNextMonth: true,
    });
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="attendance-calendar-box" style={{ padding: "20px 22px" }}>
      {/* Top Header Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h3 className="syne" style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>
              {monthName} <span style={{ color: "var(--primary)", fontWeight: 700 }}>{year}</span>
            </h3>
            <button
              onClick={jumpToToday}
              className="btn-ghost"
              type="button"
              style={{
                padding: "3px 9px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                background: "rgba(99, 102, 241, 0.1)",
                color: "var(--primary)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
                cursor: "pointer",
              }}
            >
              Today
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0 0" }}>
            Monthly attendance summary & holiday schedule
          </p>
        </div>

        {/* Quick Month Stats Chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: "rgba(16, 185, 129, 0.12)",
              color: "#10b981",
              border: "1px solid rgba(16, 185, 129, 0.2)",
            }}
          >
            Present: {monthStats.presentCount}
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: "rgba(245, 158, 11, 0.12)",
              color: "#f59e0b",
              border: "1px solid rgba(245, 158, 11, 0.2)",
            }}
          >
            Late: {monthStats.lateCount}
          </span>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              background: "rgba(239, 68, 68, 0.12)",
              color: "#ef4444",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            Absent: {monthStats.absentCount}
          </span>

          {/* Nav Controls */}
          <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
            <button
              className="btn-ghost"
              type="button"
              onClick={prevMonth}
              title="Previous Month"
              style={{
                width: 34,
                height: 34,
                padding: 0,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ‹
            </button>
            <button
              className="btn-ghost"
              type="button"
              onClick={nextMonth}
              title="Next Month"
              style={{
                width: 34,
                height: 34,
                padding: 0,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Weekday Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
          marginBottom: 6,
          textAlign: "center",
        }}
      >
        {weekdays.map((w, idx) => (
          <div
            key={w}
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: idx === 0 ? "rgba(239, 68, 68, 0.7)" : "var(--muted)",
              paddingBottom: 6,
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
        }}
      >
        {calendarCells.map((cell, idx) => {
          if (!cell.isCurrentMonth) {
            // Muted padding cells for previous/next month
            return (
              <div
                key={`pad-${idx}`}
                style={{
                  minHeight: 44,
                  maxHeight: 54,
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  color: "var(--muted)",
                  opacity: 0.25,
                  userSelect: "none",
                  border: "1px dashed transparent",
                }}
              >
                {cell.dayNum}
              </div>
            );
          }

          const { dayNum, dateIso, isToday, isFuture, isSunday, status } = cell;

          // Determine day card styling
          let bg = "var(--surface2)";
          let border = "1px solid var(--border)";
          let textColor = "var(--text)";
          let badgeColor = null;
          let badgeText = null;

          if (isToday) {
            border = "2px solid var(--primary)";
            bg = "rgba(99, 102, 241, 0.08)";
          }

          if (status?.type === "holiday") {
            bg = "rgba(59, 130, 246, 0.12)";
            border = "1px solid rgba(59, 130, 246, 0.35)";
            textColor = "#3b82f6";
            badgeText = status.name || "Holiday";
            badgeColor = "#3b82f6";
          } else if (status?.type === "present") {
            bg = "rgba(16, 185, 129, 0.12)";
            border = "1px solid rgba(16, 185, 129, 0.3)";
            textColor = "#10b981";
            badgeColor = "#10b981";
          } else if (status?.type === "late") {
            bg = "rgba(245, 158, 11, 0.12)";
            border = "1px solid rgba(245, 158, 11, 0.3)";
            textColor = "#f59e0b";
            badgeColor = "#f59e0b";
          } else if (status?.type === "leave") {
            bg = "rgba(139, 92, 246, 0.12)";
            border = "1px solid rgba(139, 92, 246, 0.3)";
            textColor = "#8b5cf6";
            badgeText = "Leave";
            badgeColor = "#8b5cf6";
          } else if (status?.type === "pending_leave") {
            bg = "rgba(245, 158, 11, 0.12)";
            border = "1px solid rgba(245, 158, 11, 0.3)";
            textColor = "#f59e0b";
            badgeText = "Pending";
            badgeColor = "#f59e0b";
          } else if (status?.type === "absent" || (!status && !isFuture && !isSunday)) {
            bg = "rgba(239, 68, 68, 0.08)";
            border = "1px solid rgba(239, 68, 68, 0.2)";
            textColor = "#ef4444";
            badgeColor = "#ef4444";
          } else if (isSunday) {
            textColor = "var(--muted)";
            bg = "rgba(255, 255, 255, 0.02)";
          }

          return (
            <div
              key={dateIso}
              onClick={() => onDayClick && onDayClick(dateIso)}
              title={
                status?.type === "holiday"
                  ? `Holiday: ${status.name}`
                  : status?.type === "present"
                  ? `Present ${status.time ? `(${status.time})` : ""}`
                  : status?.type === "late"
                  ? `Late Arrival ${status.time ? `(${status.time})` : ""}`
                  : isToday
                  ? "Today"
                  : `Date: ${dateIso}`
              }
              style={{
                minHeight: 44,
                maxHeight: 54,
                borderRadius: 10,
                padding: "4px 6px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                cursor: onDayClick ? "pointer" : "default",
                transition: "all 0.15s ease",
                background: bg,
                border: border,
                color: textColor,
                boxShadow: isToday ? "0 0 10px rgba(99, 102, 241, 0.25)" : "none",
              }}
            >
              {/* Day Number */}
              <div
                style={{
                  fontSize: 14,
                  fontWeight: isToday || status ? 800 : 600,
                  lineHeight: 1,
                }}
              >
                {dayNum}
              </div>

              {/* Status Indicator Dot or Mini Text */}
              {badgeText ? (
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    marginTop: 3,
                    maxWidth: "92%",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    opacity: 0.9,
                  }}
                >
                  {badgeText}
                </div>
              ) : badgeColor ? (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: badgeColor,
                    marginTop: 4,
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Legend Footer */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 18,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--muted)",
          flexWrap: "wrap",
          justifyContent: "center",
          borderTop: "1px solid var(--border)",
          paddingTop: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#10b981" }} /> Present
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#f59e0b" }} /> Late / Half Day
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ef4444" }} /> Absent
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#8b5cf6" }} /> Leave
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#3b82f6" }} /> Holiday
        </div>
      </div>
    </div>
  );
}
