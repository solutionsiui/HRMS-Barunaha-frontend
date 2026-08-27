"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/formatters";
import { useToast } from "@/hooks/useToast";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";
import Modal from "@/components/ui/Modal";

function formatInputDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseInputDate(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function weekStartFor(value) {
  const base = parseInputDate(value) || new Date();
  const copy = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const offset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return formatInputDate(copy);
}

function weekEndFor(value) {
  const start = parseInputDate(weekStartFor(value));
  start.setDate(start.getDate() + 6);
  return formatInputDate(start);
}

function todayInputValue() {
  return formatInputDate(new Date());
}

function fmtDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatTile({ accent, icon, label, value, sub }) {
  return (
    <div className="stat-card" style={{ "--accent": accent }}>
      <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
      <div className="syne" style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{label}</div>
      {sub ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>{sub}</div> : null}
    </div>
  );
}

function buildEntryPayload(form) {
  return {
    employee_emp_id: form.employee_emp_id,
    entry_date: form.entry_date,
    task_text: form.task_text.trim(),
    completion_mode: form.completion_mode,
    completion_percent: form.completion_mode === "percent" ? Number(form.completion_percent || 0) : null,
    is_completed: form.completion_mode === "completed",
    output: form.output.trim(),
    hours_worked: Number(form.hours_worked || 0),
    issue: form.issue.trim(),
    remarks: form.remarks.trim(),
  };
}

function HODMISView() {
  const [weekStart, setWeekStart] = useState(weekStartFor(todayInputValue()));
  const [assignmentOptions, setAssignmentOptions] = useState({ employees: [], departments: [], total_employees: 0 });
  const [misData, setMisData] = useState({ entries: [], employee_summaries: [], totals: {}, submission: null, is_submitted: false, week_label: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [entryModal, setEntryModal] = useState(null);
  const [submitModal, setSubmitModal] = useState(false);
  const [submissionRemarks, setSubmissionRemarks] = useState("");
  const [showToast, toastNode] = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const normalizedWeekStart = weekStartFor(weekStart);
      const [options, dailyData] = await Promise.all([
        apiFetch("/mis/assignment-options"),
        apiFetch(`/mis/daily?week_start=${normalizedWeekStart}`),
      ]);
      setAssignmentOptions({
        employees: Array.isArray(options?.employees) ? options.employees : [],
        departments: Array.isArray(options?.departments) ? options.departments : [],
        total_employees: Number(options?.total_employees || 0),
      });
      setMisData({
        entries: Array.isArray(dailyData?.entries) ? dailyData.entries : [],
        employee_summaries: Array.isArray(dailyData?.employee_summaries) ? dailyData.employee_summaries : [],
        totals: dailyData?.totals || {},
        submission: dailyData?.submission || null,
        is_submitted: !!dailyData?.is_submitted,
        week_label: dailyData?.week_label || "",
      });
      if (normalizedWeekStart !== weekStart) {
        setWeekStart(normalizedWeekStart);
      }
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast, weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const employees = Array.isArray(assignmentOptions.employees) ? assignmentOptions.employees : [];
  const departments = Array.isArray(assignmentOptions.departments) ? assignmentOptions.departments : [];

  const employeesByDepartment = useMemo(() => (
    departments.map((department) => ({
      ...department,
      employees: employees.filter((employee) => employee.department_id === department.id),
    })).filter((department) => department.employees.length > 0)
  ), [departments, employees]);

  const selectedEmployee = employees.find((employee) => employee.emp_id === entryModal?.form?.employee_emp_id) || null;

  function openNewEntry() {
    setEntryModal({
      mode: "create",
      id: null,
      form: {
        target_mode: "single",
        employee_emp_id: "",
        selected_emp_ids: [],
        entry_date: todayInputValue(),
        task_text: "",
        completion_mode: "percent",
        completion_percent: "0",
        output: "",
        hours_worked: "",
        issue: "",
        remarks: "",
      },
    });
  }

  function openEditEntry(entry) {
    setEntryModal({
      mode: "edit",
      id: entry.id,
      form: {
        target_mode: "single",
        employee_emp_id: entry.employee_emp_id || "",
        selected_emp_ids: entry.employee_emp_id ? [entry.employee_emp_id] : [],
        entry_date: entry.entry_date || todayInputValue(),
        task_text: entry.task_text || "",
        completion_mode: entry.completion_mode || (entry.is_completed ? "completed" : "percent"),
        completion_percent: entry.completion_percent != null ? String(entry.completion_percent) : "0",
        output: entry.output || "",
        hours_worked: entry.hours_worked != null ? String(entry.hours_worked) : "",
        issue: entry.issue || "",
        remarks: entry.remarks || "",
      },
    });
  }

  async function saveEntry() {
    if (!entryModal) return;

    let targetEmpIds = [];
    if (entryModal.form.target_mode === "all") {
      targetEmpIds = employees.map((emp) => emp.emp_id);
    } else if (entryModal.form.target_mode === "multiple") {
      targetEmpIds = entryModal.form.selected_emp_ids;
    } else {
      if (entryModal.form.employee_emp_id) {
        targetEmpIds = [entryModal.form.employee_emp_id];
      }
    }

    if (targetEmpIds.length === 0 || !entryModal.form.task_text.trim()) {
      showToast("Please select employee(s) and provide a task description", "error");
      return;
    }

    setSaving(true);
    try {
      if (entryModal.mode === "edit" && entryModal.id) {
        const payload = buildEntryPayload({ ...entryModal.form, employee_emp_id: targetEmpIds[0] });
        await apiFetch(`/mis/daily/${entryModal.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await Promise.all(
          targetEmpIds.map((empId) => {
            const payload = buildEntryPayload({ ...entryModal.form, employee_emp_id: empId });
            return apiFetch("/mis/daily", {
              method: "POST",
              body: JSON.stringify(payload),
            });
          })
        );
      }
      setEntryModal(null);
      await load();
      showToast(`MIS entry saved for ${targetEmpIds.length} employee(s)`);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function submitWeeklyReport() {
    setSubmitting(true);
    try {
      await apiFetch("/mis/weekly/submit", {
        method: "POST",
        body: JSON.stringify({
          week_start: weekStart,
          remarks: submissionRemarks,
        }),
      });
      setSubmitModal(false);
      setSubmissionRemarks("");
      await load();
      showToast("Weekly MIS submitted");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const isCurrentOrFutureWeek = weekStart >= weekStartFor(todayInputValue());

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>MIS Workspace</h1>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>Create daily team MIS entries and submit the weekly report to HR/Admin.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "6px 12px", fontSize: 13 }}
            onClick={() => {
              const dt = parseInputDate(weekStart);
              if (dt) {
                dt.setDate(dt.getDate() - 7);
                setWeekStart(weekStartFor(formatInputDate(dt)));
              }
            }}
          >
            ◀ Prev Week
          </button>
          <input
            className="input"
            type="date"
            max={todayInputValue()}
            value={weekStart}
            onChange={(e) => {
              const val = e.target.value;
              if (val > todayInputValue()) return;
              setWeekStart(weekStartFor(val));
            }}
            style={{ minWidth: 160 }}
          />
          <input className="input" type="date" value={weekEndFor(weekStart)} readOnly aria-label="Week end" title="Week end" style={{ minWidth: 160 }} />
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "6px 12px", fontSize: 13 }}
            disabled={isCurrentOrFutureWeek}
            onClick={() => {
              const dt = parseInputDate(weekStart);
              if (dt) {
                dt.setDate(dt.getDate() + 7);
                const nextStr = formatInputDate(dt);
                if (nextStr <= todayInputValue()) {
                  setWeekStart(weekStartFor(nextStr));
                }
              }
            }}
          >
            Next Week ▶
          </button>
          <button className="btn-ghost" onClick={load}>Refresh</button>
          <button className="btn-primary" onClick={openNewEntry} disabled={misData.is_submitted}>+ Daily Entry</button>
          <button className="btn-primary" onClick={() => { setSubmissionRemarks(""); setSubmitModal(true); }} disabled={misData.is_submitted || !misData.entries.length}>
            Submit Weekly MIS
          </button>
        </div>
      </div>

      <div className="grid-stats" style={{ marginBottom: 20 }}>
        <StatTile icon="👥" label="Managed Employees" value={assignmentOptions.total_employees || 0} accent="#8b5cf6" />
        <StatTile icon="🏢" label="Managed Departments" value={departments.length} accent="#6366f1" />
        <StatTile icon="🗂" label="Daily Entries This Week" value={misData.totals?.task_count || 0} accent="#10b981" sub={misData.week_label || "Current week"} />
        <StatTile icon="📊" label="Average Efficiency" value={`${misData.totals?.average_efficiency || 0}%`} accent="#f59e0b" />
      </div>

      {misData.submission ? (
        <div className="card" style={{ padding: 20, marginBottom: 20, border: "1px solid rgba(16,185,129,0.22)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <div className="syne" style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Weekly MIS Submitted</div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>
                {misData.submission.week_label} · Submitted on {fmtDateTime(misData.submission.submitted_at)}
              </div>
            </div>
            <div style={{
              padding: "8px 14px",
              borderRadius: 999,
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
              color: "#10b981",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}>
              Locked for editing
            </div>
          </div>
          {misData.submission.remarks ? (
            <div style={{ marginTop: 14, padding: "14px 16px", background: "var(--hover-bg)", border: "1px solid var(--border)", borderRadius: 14 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Submission remarks</div>
              <div>{misData.submission.remarks}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? <Loader /> : (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h3 className="syne" style={{ fontSize: 16, fontWeight: 700 }}>Weekly Employee Summary</h3>
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Auto-generated from daily MIS rows for {misData.week_label || "the selected week"}.</div>
              </div>
            </div>
            {misData.employee_summaries.length === 0 ? <EmptyState icon="🗂" title="No MIS rows yet" sub="Create your first daily entry for this week." /> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Tasks</th>
                      <th>Completed</th>
                      <th>Efficiency</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {misData.employee_summaries.map((summary) => (
                      <tr key={summary.employee_id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{summary.employee_name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{summary.employee_emp_id} · {summary.department || "—"}</div>
                        </td>
                        <td>{summary.tasks_count}</td>
                        <td>{summary.completed_count}/{summary.tasks_count} · {summary.completed_percent_average}%</td>
                        <td>{summary.efficiency}%</td>
                        <td style={{ maxWidth: 240 }}>{summary.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h3 className="syne" style={{ fontSize: 16, fontWeight: 700 }}>Daily MIS Entries</h3>
                <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Daily agenda, completion, output, hours, issue, and remarks.</div>
              </div>
            </div>
            {misData.entries.length === 0 ? <EmptyState icon="📋" title="No daily entries" sub="Use the Daily Entry button to add the first row." /> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Name</th>
                      <th>Task</th>
                      <th>Completion</th>
                      <th>Output</th>
                      <th>Hours</th>
                      <th>Issue</th>
                      <th>Remarks</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {misData.entries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{fmtDate(entry.entry_date)}</td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{entry.employee_name}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{entry.employee_emp_id}</div>
                        </td>
                        <td style={{ maxWidth: 240 }}>{entry.task_text}</td>
                        <td>{entry.completion_display}</td>
                        <td style={{ maxWidth: 180 }}>{entry.output || "—"}</td>
                        <td>{entry.hours_worked || 0}</td>
                        <td style={{ maxWidth: 180 }}>{entry.issue || "—"}</td>
                        <td style={{ maxWidth: 180 }}>{entry.remarks || "—"}</td>
                        <td>
                          <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => openEditEntry(entry)} disabled={misData.is_submitted}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {entryModal ? (
        <Modal
          title={entryModal.mode === "edit" ? "Edit Daily MIS Entry" : "Create Daily MIS Entry"}
          onClose={() => setEntryModal(null)}
          footer={(
            <>
              <button className="btn-ghost" onClick={() => setEntryModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveEntry} disabled={saving}>{saving ? "Saving..." : "Save Entry"}</button>
            </>
          )}
        >
          <div className="form-row">
            <div className="form-group">
              <label className="label">Entry Mode / Employee Selection {entryModal.mode === "edit" ? "(Locked)" : ""}</label>
              <select
                className="input"
                disabled={entryModal.mode === "edit"}
                value={entryModal.form.target_mode}
                onChange={(e) => {
                  const mode = e.target.value;
                  setEntryModal((current) => ({
                    ...current,
                    form: {
                      ...current.form,
                      target_mode: mode,
                      employee_emp_id: mode === "all" ? "ALL" : (mode === "single" ? (employees[0]?.emp_id || "") : ""),
                      selected_emp_ids: mode === "all" ? employees.map((emp) => emp.emp_id) : (mode === "single" && current.form.employee_emp_id ? [current.form.employee_emp_id] : []),
                    },
                  }));
                }}
              >
                <option value="single">Single Employee</option>
                <option value="all">All Managed Employees ({employees.length})</option>
                <option value="multiple">Multiple Employees Select</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">Date</label>
              <input
                className="input"
                type="date"
                max={todayInputValue()}
                value={entryModal.form.entry_date}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val > todayInputValue()) return;
                  setEntryModal((current) => ({
                    ...current,
                    form: { ...current.form, entry_date: val },
                  }));
                }}
              />
            </div>
          </div>

          {entryModal.form.target_mode === "single" ? (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="label">Select Employee {entryModal.mode === "edit" ? "(Locked for Edit)" : ""}</label>
              <select
                className="input"
                disabled={entryModal.mode === "edit"}
                value={entryModal.form.employee_emp_id}
                onChange={(e) => setEntryModal((current) => ({
                  ...current,
                  form: {
                    ...current.form,
                    employee_emp_id: e.target.value,
                    selected_emp_ids: [e.target.value],
                  },
                }))}
              >
                <option value="">Select employee</option>
                {employeesByDepartment.map((department) => (
                  <optgroup key={department.id} label={department.name}>
                    {department.employees.map((employee) => (
                      <option key={employee.emp_id} value={employee.emp_id}>
                        {employee.emp_id} - {employee.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          ) : null}

          {entryModal.form.target_mode === "all" ? (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", marginBottom: 16, fontSize: 13, color: "var(--text)" }}>
              👥 <b>Bulk Action:</b> Entry will be created for all <b>{employees.length} managed employees</b> simultaneously.
            </div>
          ) : null}

          {entryModal.form.target_mode === "multiple" ? (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="label">Select Multiple Employees ({entryModal.form.selected_emp_ids.length} selected)</label>
              <div style={{ maxHeight: 150, overflowY: "auto", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--hover-bg)" }}>
                {employees.map((emp) => {
                  const checked = entryModal.form.selected_emp_ids.includes(emp.emp_id);
                  return (
                    <label key={emp.emp_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", cursor: "pointer", fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          setEntryModal((current) => {
                            const prev = current.form.selected_emp_ids;
                            const next = isChecked ? [...prev, emp.emp_id] : prev.filter((id) => id !== emp.emp_id);
                            return {
                              ...current,
                              form: { ...current.form, selected_emp_ids: next },
                            };
                          });
                        }}
                      />
                      <span><b>{emp.emp_id}</b> - {emp.name} ({emp.department_name || "Dept"})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {entryModal.form.target_mode === "single" ? (
            <div className="form-row">
              <div className="form-group">
                <label className="label">Auto-fetched Name</label>
                <div className="input" style={{ minHeight: 46, display: "flex", alignItems: "center" }}>
                  {selectedEmployee?.name || "Select an employee"}
                </div>
              </div>
              <div className="form-group">
                <label className="label">Auto-fetched Employee ID</label>
                <div className="input" style={{ minHeight: 46, display: "flex", alignItems: "center" }}>
                  {selectedEmployee?.emp_id || "Select an employee"}
                </div>
              </div>
            </div>
          ) : null}

          <div className="form-group">
            <label className="label">Task</label>
            <textarea
              className="input"
              rows={3}
              value={entryModal.form.task_text}
              onChange={(e) => setEntryModal((current) => ({
                ...current,
                form: { ...current.form, task_text: e.target.value },
              }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="label">Completion Mode</label>
              <select
                className="input"
                value={entryModal.form.completion_mode}
                onChange={(e) => setEntryModal((current) => ({
                  ...current,
                  form: {
                    ...current.form,
                    completion_mode: e.target.value,
                    completion_percent: e.target.value === "completed" ? "100" : current.form.completion_percent,
                  },
                }))}
              >
                <option value="percent">Completion (%)</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">Completion Value</label>
              {entryModal.form.completion_mode === "completed" ? (
                <div className="input" style={{ minHeight: 46, display: "flex", alignItems: "center" }}>Completed</div>
              ) : (
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="100"
                  value={entryModal.form.completion_percent}
                  onChange={(e) => setEntryModal((current) => ({
                    ...current,
                    form: { ...current.form, completion_percent: e.target.value },
                  }))}
                />
              )}
            </div>
            <div className="form-group">
              <label className="label">Hours Worked</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.5"
                value={entryModal.form.hours_worked}
                onChange={(e) => setEntryModal((current) => ({
                  ...current,
                  form: { ...current.form, hours_worked: e.target.value },
                }))}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Output</label>
            <textarea
              className="input"
              rows={2}
              value={entryModal.form.output}
              onChange={(e) => setEntryModal((current) => ({
                ...current,
                form: { ...current.form, output: e.target.value },
              }))}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="label">Issue</label>
              <textarea
                className="input"
                rows={2}
                value={entryModal.form.issue}
                onChange={(e) => setEntryModal((current) => ({
                  ...current,
                  form: { ...current.form, issue: e.target.value },
                }))}
              />
            </div>
            <div className="form-group">
              <label className="label">Remarks</label>
              <textarea
                className="input"
                rows={2}
                value={entryModal.form.remarks}
                onChange={(e) => setEntryModal((current) => ({
                  ...current,
                  form: { ...current.form, remarks: e.target.value },
                }))}
              />
            </div>
          </div>
        </Modal>
      ) : null}

      {submitModal ? (
        <Modal
          title="Submit Weekly MIS Report"
          onClose={() => { setSubmitModal(false); setSubmissionRemarks(""); }}
          footer={(
            <>
              <button className="btn-ghost" onClick={() => { setSubmitModal(false); setSubmissionRemarks(""); }}>Cancel</button>
              <button className="btn-primary" onClick={submitWeeklyReport} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit to HR/Admin"}
              </button>
            </>
          )}
        >
          <div style={{
            padding: "14px 16px",
            borderRadius: 14,
            border: "1px solid var(--border)",
            background: "var(--hover-bg)",
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Week</div>
            <div style={{ fontWeight: 700 }}>{misData.week_label || weekStart}</div>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="label">Employee Scope for Report Submission</label>
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", fontSize: 13, color: "var(--text)" }}>
              👥 Submitting report for <b>All {assignmentOptions.total_employees || employees.length} Managed Employees</b> ({misData.entries.length} daily entries recorded).
            </div>
          </div>

          <div className="form-group">
            <label className="label">Weekly Remarks</label>
            <textarea className="input" rows={4} value={submissionRemarks} onChange={(e) => setSubmissionRemarks(e.target.value)} placeholder="Summary of achievements, blockers or department notes..." />
          </div>
        </Modal>
      ) : null}

      {toastNode}
    </div>
  );
}

function HRAdminMISView() {
  const [weekStart, setWeekStart] = useState(weekStartFor(todayInputValue()));
  const [departmentId, setDepartmentId] = useState("");
  const [hodEmpId, setHodEmpId] = useState("");
  const [departments, setDepartments] = useState([]);
  const [hods, setHods] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showToast, toastNode] = useToast();

  async function openSubmission(submissionId) {
    try {
      const detail = await apiFetch(`/mis/weekly/${submissionId}`);
      setSelectedSubmission(detail);
    } catch (error) {
      showToast(error.message || "Unable to load MIS report", "error");
    }
  }

  const loadFilters = useCallback(async () => {
    try {
      const [departmentData, employeeData] = await Promise.all([
        apiFetch("/departments/").catch(() => []),
        apiFetch("/employees/").catch(() => []),
      ]);
      const employeeRows = Array.isArray(employeeData) ? employeeData : [];
      setDepartments(Array.isArray(departmentData) ? departmentData : []);
      setHods(employeeRows.filter((employee) => employee.is_hod));
    } catch (e) {
      showToast(e.message, "error");
    }
  }, [showToast]);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (weekStart) params.set("week_start", weekStartFor(weekStart));
      if (departmentId) params.set("department_id", departmentId);
      if (hodEmpId) params.set("hod_emp_id", hodEmpId);
      const data = await apiFetch(`/mis/weekly?${params.toString()}`);
      const rows = Array.isArray(data?.submissions) ? data.submissions : [];
      setSubmissions(rows);
      setSelectedSubmission((current) => {
        if (!current) return rows[0] || null;
        return rows.find((item) => item.id === current.id) || rows[0] || null;
      });
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [departmentId, hodEmpId, showToast, weekStart]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const totalTasks = submissions.reduce((sum, submission) => sum + Number(submission.task_count || 0), 0);
  const totalEmployees = submissions.reduce((sum, submission) => sum + Number(submission.employee_count || 0), 0);
  const averageEfficiency = submissions.length
    ? Math.round(submissions.reduce((sum, submission) => sum + Number(submission.average_efficiency || 0), 0) / submissions.length)
    : 0;

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>MIS Reports</h1>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>Review weekly MIS submissions sent by HODs.</p>
        </div>
        <button className="btn-ghost" onClick={loadSubmissions}>Refresh</button>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div className="form-row">
          <div className="form-group">
            <label className="label">Week Start</label>
            <input className="input" type="date" value={weekStart} onChange={(e) => setWeekStart(weekStartFor(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="label">Week End</label>
            <input className="input" type="date" value={weekEndFor(weekStart)} readOnly />
          </div>
          <div className="form-group">
            <label className="label">Department</label>
            <select className="input" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">HOD</label>
            <select className="input" value={hodEmpId} onChange={(e) => setHodEmpId(e.target.value)}>
              <option value="">All HODs</option>
              {hods.map((hod) => (
                <option key={hod.emp_id} value={hod.emp_id}>
                  {hod.emp_id} - {hod.first_name} {hod.last_name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ alignSelf: "end" }}>
            <button className="btn-ghost" onClick={() => { setDepartmentId(""); setHodEmpId(""); setWeekStart(weekStartFor(todayInputValue())); }}>
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="grid-stats" style={{ marginBottom: 20 }}>
        <StatTile icon="🗂" label="Weekly Submissions" value={submissions.length} accent="#6366f1" />
        <StatTile icon="📋" label="Tasks Covered" value={totalTasks} accent="#10b981" />
        <StatTile icon="👥" label="Employee Summaries" value={totalEmployees} accent="#8b5cf6" />
        <StatTile icon="📊" label="Average Efficiency" value={`${averageEfficiency}%`} accent="#f59e0b" />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3 className="syne" style={{ fontSize: 16, fontWeight: 700 }}>Submission Inbox</h3>
        </div>
        {loading ? <Loader /> : submissions.length === 0 ? <EmptyState icon="📊" title="No MIS submissions found" sub="Try changing the selected week or filters." /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Week</th>
                  <th>HOD</th>
                  <th>Departments</th>
                  <th>Tasks</th>
                  <th>Employees</th>
                  <th>Efficiency</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <tr key={submission.id}>
                    <td>{submission.week_label}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{submission.hod_name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{submission.hod_emp_id}</div>
                    </td>
                    <td style={{ maxWidth: 200 }}>{submission.departments?.join(", ") || "—"}</td>
                    <td>{submission.task_count}</td>
                    <td>{submission.employee_count}</td>
                    <td>{submission.average_efficiency}%</td>
                    <td>{fmtDateTime(submission.submitted_at)}</td>
                    <td>
                      <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => openSubmission(submission.id)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedSubmission ? (
        <div className="card">
          <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h3 className="syne" style={{ fontSize: 18, fontWeight: 700 }}>{selectedSubmission.week_label}</h3>
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                  {selectedSubmission.hod_name} ({selectedSubmission.hod_emp_id}) · Submitted {fmtDateTime(selectedSubmission.submitted_at)}
                </div>
              </div>
              <div style={{
                padding: "8px 14px",
                borderRadius: 999,
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.2)",
                color: "#6366f1",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}>
                HR/Admin View
              </div>
            </div>
            {selectedSubmission.remarks ? (
              <div style={{ marginTop: 14, padding: "14px 16px", background: "var(--hover-bg)", borderRadius: 14, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>HOD remarks</div>
                <div>{selectedSubmission.remarks}</div>
              </div>
            ) : null}
          </div>

          <div style={{ padding: 20, borderBottom: "1px solid var(--border)" }}>
            <h4 className="syne" style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Weekly Summary</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Tasks</th>
                    <th>Completed</th>
                    <th>Efficiency</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSubmission.employee_summaries?.map((summary) => (
                    <tr key={summary.employee_id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{summary.employee_name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{summary.employee_emp_id} · {summary.department || "—"}</div>
                      </td>
                      <td>{summary.tasks_count}</td>
                      <td>{summary.completed_count}/{summary.tasks_count} · {summary.completed_percent_average}%</td>
                      <td>{summary.efficiency}%</td>
                      <td style={{ maxWidth: 220 }}>{summary.remarks || "—"}</td>
                    </tr>
                  )) || null}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ padding: 20 }}>
            <h4 className="syne" style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Daily Detail</h4>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Name</th>
                    <th>Task</th>
                    <th>Completion</th>
                    <th>Output</th>
                    <th>Hours</th>
                    <th>Issue</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSubmission.daily_entries?.map((entry) => (
                    <tr key={entry.id}>
                      <td>{fmtDate(entry.entry_date)}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{entry.employee_name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{entry.employee_emp_id}</div>
                      </td>
                      <td style={{ maxWidth: 220 }}>{entry.task_text}</td>
                      <td>{entry.completion_display}</td>
                      <td style={{ maxWidth: 200 }}>{entry.output || "—"}</td>
                      <td>{entry.hours_worked || 0}</td>
                      <td style={{ maxWidth: 180 }}>{entry.issue || "—"}</td>
                      <td style={{ maxWidth: 180 }}>{entry.remarks || "—"}</td>
                    </tr>
                  )) || null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {toastNode}
    </div>
  );
}

export default function MISPage() {
  const { role } = useAuth();

  if (role === "hod") {
    return <HODMISView />;
  }

  if (role === "hr" || role === "admin") {
    return <HRAdminMISView />;
  }

  return (
    <div className="card">
      <EmptyState icon="🗂" title="MIS access is not available" sub="This section is only available to HOD, HR, and Admin roles." />
    </div>
  );
}
