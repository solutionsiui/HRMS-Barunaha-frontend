"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { fmtDate } from "@/lib/formatters";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";
import Pagination from "@/components/ui/Pagination";

const FILTERS = [
  { id: "", label: "All Leaves" },
  { id: "pending", label: "Pending" },
  { id: "paid", label: "Paid Approved" },
  { id: "unpaid", label: "Unpaid Approved" },
  { id: "rejected", label: "Rejected" },
];

export default function LeaveApprovalsPage() {
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const canEditLeaveQuotas = isAdmin || role === "hr";
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 10;
  const [showToast, toastNode] = useToast();
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [selectedBalance, setSelectedBalance] = useState(null);
  const [editedLeaveType, setEditedLeaveType] = useState("");
  const [editedStartDate, setEditedStartDate] = useState("");
  const [editedEndDate, setEditedEndDate] = useState("");
  const [balances, setBalances] = useState([]);
  const [quotaEditor, setQuotaEditor] = useState(null);
  const [quotaForm, setQuotaForm] = useState({
    cl_quota: "", sl_quota: "", pl_quota: "",
    cl_taken: "", sl_taken: "", pl_taken: "",
  });
  const [quotaSaving, setQuotaSaving] = useState(false);

  function openQuotaEditor(row) {
    setQuotaEditor(row);
    setQuotaForm({
      cl_quota: String(row.casual.total),
      sl_quota: String(row.sick.total),
      pl_quota: String(row.privileged.total),
      cl_taken: String(row.casual.used),
      sl_taken: String(row.sick.used),
      pl_taken: String(row.privileged.used),
    });
  }

  async function saveLeaveQuotas() {
    if (!quotaEditor) return;
    const quotaVals = [quotaForm.cl_quota, quotaForm.sl_quota, quotaForm.pl_quota].map(Number);
    const takenVals = [quotaForm.cl_taken, quotaForm.sl_taken, quotaForm.pl_taken].map(Number);
    if ([...quotaVals, ...takenVals].some((value) => !Number.isInteger(value) || value < 0)) {
      showToast("Quotas and taken leaves must be whole numbers of zero or more", "error");
      return;
    }
    setQuotaSaving(true);
    try {
      await apiFetch(`/leave/quota/${quotaEditor.emp_id}`, {
        method: "PUT",
        body: JSON.stringify({
          cl_quota: quotaVals[0],
          sl_quota: quotaVals[1],
          pl_quota: quotaVals[2],
          cl_taken: takenVals[0],
          sl_taken: takenVals[1],
          pl_taken: takenVals[2],
        }),
      });
      showToast(`Leave quotas updated for ${quotaEditor.name || quotaEditor.emp_id}`);
      setQuotaEditor(null);
      await load();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setQuotaSaving(false);
    }
  }

  useEffect(() => {
    if (selectedLeave) {
      setEditedLeaveType(selectedLeave.leave_type || "Casual Leave");
      setEditedStartDate(selectedLeave.start_date ? selectedLeave.start_date.split("T")[0] : "");
      setEditedEndDate(selectedLeave.end_date ? selectedLeave.end_date.split("T")[0] : "");
      apiFetch(`/leave/balance?emp_id=${selectedLeave.emp_id || selectedLeave.employee_id}`)
        .then(data => setSelectedBalance(data))
        .catch(e => console.error(e));
    } else {
      setSelectedBalance(null);
      setEditedLeaveType("");
      setEditedStartDate("");
      setEditedEndDate("");
    }
  }, [selectedLeave]);

  async function handleUpdateLeaveType() {
    try {
      await apiFetch(`/leave/${selectedLeave.id}/update`, { 
        method: "POST", 
        body: JSON.stringify({ action: "update_type", leave_type: editedLeaveType }) 
      });
      showToast("Leave type updated");
      load();
      setSelectedLeave(prev => ({ ...prev, leave_type: editedLeaveType }));
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function handleUpdateDates() {
    if (!editedStartDate || !editedEndDate) {
      showToast("Please select valid start and end dates", "error");
      return;
    }
    if (editedEndDate < editedStartDate) {
      showToast("End date cannot be before start date", "error");
      return;
    }
    try {
      await apiFetch(`/leave/${selectedLeave.id}/update`, {
        method: "POST",
        body: JSON.stringify({
          action: "update_dates",
          start_date: editedStartDate,
          end_date: editedEndDate,
        }),
      });
      showToast("Leave dates updated successfully");
      load();
      setSelectedLeave(prev => ({
        ...prev,
        start_date: editedStartDate,
        end_date: editedEndDate,
      }));
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingData, allData, balanceData] = await Promise.all([
        apiFetch("/leave/pending").catch(() => []),
        apiFetch(filter ? `/leave/all?leave_type=${filter}` : "/leave/all").catch(() => []),
        apiFetch("/leave/balances").catch(() => ({ balances: [] })),
      ]);
      setPending(Array.isArray(pendingData) ? pendingData : []);
      setHistory(Array.isArray(allData) ? allData : []);
      setBalances(Array.isArray(balanceData?.balances) ? balanceData.balances : []);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [filter, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateLeave(item, action) {
    const actionLabel = action === "approve_paid" ? "Paid" : action === "approve_unpaid" ? "Unpaid" : "Rejected";
    const empName = item.name || item.emp_id || "Employee";
    const subject = item.subject || "No Subject";
    if (!confirm(`Are you sure you want to mark this leave as ${actionLabel} for ${empName} (Subject: ${subject})?`)) {
      return;
    }
    try {
      await apiFetch(`/leave/${item.id}/update`, { method: "POST", body: JSON.stringify({ action }) });
      showToast("Leave updated");
      load();
      if (selectedLeave && selectedLeave.id === item.id) {
        setSelectedLeave(prev => ({
          ...prev,
          status: action === "reject" ? "Rejected" : "Approved",
          is_paid: action === "approve_paid",
        }));
      }
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  const filteredPending = pending.filter((item) => {
    if (!user) return true;
    if (item.employee_id && user.id && String(item.employee_id) === String(user.id)) return false;
    if (item.emp_id && user.emp_id && item.emp_id === user.emp_id) return false;
    return true;
  });

  const filteredHistory = history.filter((item) => {
    if (!user) return true;
    if (item.employee_id && user.id && String(item.employee_id) === String(user.id)) return false;
    if (item.emp_id && user.emp_id && item.emp_id === user.emp_id) return false;
    return true;
  });

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Leave Approvals</h1>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>
            {isAdmin ? "Admin can review the full leave ledger and pending approvals." : "Review requests, classify approvals as paid or unpaid, modify dates, or reject/re-approve leaves."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((item) => (
            <button
              key={item.id || "all"}
              className={filter === item.id ? "btn-primary" : "btn-ghost"}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <h2 className="syne" style={{ fontSize: 16, fontWeight: 700 }}>Leave Balancing Sheet</h2>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4 }}>Current-year quota, usage, and remaining balance for every active employee.</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Department</th><th>Casual (Taken / Total)</th><th>Sick (Taken / Total)</th><th>Privileged (Taken / Total)</th>{canEditLeaveQuotas ? <th>Action</th> : null}</tr></thead>
            <tbody>
              {balances.map((row) => <tr key={row.emp_id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <b>{row.name}</b>
                    {row.is_in_probation ? (
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(245,158,11,0.15)", color: "#f59e0b", fontWeight: 600 }}>
                        Probation
                      </span>
                    ) : null}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 11 }}>{row.emp_id}</div>
                </td>
                <td>{row.department || "—"}</td>
                <td><b>{row.casual.used} / {row.casual.total}</b></td>
                <td><b>{row.sick.used} / {row.sick.total}</b></td>
                <td><b>{row.privileged.used} / {row.privileged.total}</b></td>
                {canEditLeaveQuotas ? <td><button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => openQuotaEditor(row)}>Edit Quotas</button></td> : null}
              </tr>)}
              {!loading && balances.length === 0 ? <tr><td colSpan={canEditLeaveQuotas ? 6 : 5} style={{ color: "var(--muted)" }}>No employee balances available.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {filteredPending.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
            <h2 className="syne" style={{ fontSize: 16, fontWeight: 700 }}>Pending Approvals ({filteredPending.length})</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Subject</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Description</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPending.map((item) => (
                  <tr key={item.id} onClick={() => setSelectedLeave(item)} style={{ cursor: "pointer" }}>
                    <td><b>{item.name || item.emp_id}</b></td>
                    <td><span className="chip">{item.subject}</span></td>
                    <td>{fmtDate(item.start_date)}</td>
                    <td>{fmtDate(item.end_date)}</td>
                    <td style={{ maxWidth: 220 }}>{item.description}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button className="btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={(e) => { e.stopPropagation(); updateLeave(item, "approve_paid"); }}>Paid</button>
                        <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={(e) => { e.stopPropagation(); updateLeave(item, "approve_unpaid"); }}>Unpaid</button>
                        <button className="btn-danger" style={{ padding: "6px 12px", fontSize: 12 }} onClick={(e) => { e.stopPropagation(); updateLeave(item, "reject"); }}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <h2 className="syne" style={{ fontSize: 16, fontWeight: 700 }}>All Leave History</h2>
        </div>
        {loading ? <Loader /> : filteredHistory.length === 0 ? (
          <EmptyState icon="📅" title="No leave records" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Leave Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th>Action By</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const safePage = Math.min(currentPage, Math.max(1, Math.ceil(filteredHistory.length / PER_PAGE)));
                  const paginated = filteredHistory.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
                  return paginated.map((item) => (
                    <tr key={item.id} onClick={() => setSelectedLeave(item)} style={{ cursor: "pointer" }}>
                      <td><b>{item.name || item.emp_id}</b></td>
                      <td>{item.status === "Approved" ? (item.is_paid ? "Paid" : "Unpaid") : "—"}</td>
                      <td>{item.leave_type || "Casual Leave"}</td>
                      <td>{fmtDate(item.start_date)}</td>
                      <td>{fmtDate(item.end_date)}</td>
                      <td>{item.subject}</td>
                      <td><StatusBadge status={item.status} /></td>
                      <td>
                        {item.action_by_name ? (
                          <span style={{ fontSize: 12, color: "var(--muted)" }}>
                            {item.action_by_name} {item.action_by_role ? `(${item.action_by_role})` : ""}
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {item.status === "Approved" ? (
                            <button
                              className="btn-danger"
                              style={{ padding: "4px 8px", fontSize: 11 }}
                              onClick={(e) => { e.stopPropagation(); updateLeave(item, "reject"); }}
                            >
                              Reject
                            </button>
                          ) : item.status === "Rejected" ? (
                            <>
                              <button
                                className="btn-primary"
                                style={{ padding: "4px 8px", fontSize: 11 }}
                                onClick={(e) => { e.stopPropagation(); updateLeave(item, "approve_paid"); }}
                              >
                                Paid
                              </button>
                              <button
                                className="btn-ghost"
                                style={{ padding: "4px 8px", fontSize: 11 }}
                                onClick={(e) => { e.stopPropagation(); updateLeave(item, "approve_unpaid"); }}
                              >
                                Unpaid
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="btn-primary"
                                style={{ padding: "4px 8px", fontSize: 11 }}
                                onClick={(e) => { e.stopPropagation(); updateLeave(item, "approve_paid"); }}
                              >
                                Paid
                              </button>
                              <button
                                className="btn-ghost"
                                style={{ padding: "4px 8px", fontSize: 11 }}
                                onClick={(e) => { e.stopPropagation(); updateLeave(item, "approve_unpaid"); }}
                              >
                                Unpaid
                              </button>
                              <button
                                className="btn-danger"
                                style={{ padding: "4px 8px", fontSize: 11 }}
                                onClick={(e) => { e.stopPropagation(); updateLeave(item, "reject"); }}
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          currentPage={currentPage}
          totalItems={filteredHistory.length}
          pageSize={PER_PAGE}
          onPageChange={(p) => setCurrentPage(p)}
        />
      </div>

      {quotaEditor && (
        <div className="modal-overlay" onClick={() => !quotaSaving && setQuotaEditor(null)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center", padding: 16 }}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()} style={{ background: "var(--card-bg, var(--surface))", padding: 24, borderRadius: 12, width: "100%", maxWidth: 560, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
            <h2 className="syne" style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Edit Leave Quotas & Taken Count</h2>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>{quotaEditor.name} ({quotaEditor.emp_id}) · {quotaEditor.department || "No department"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                ["Casual Leave", "cl_quota", "cl_taken", quotaEditor.casual],
                ["Sick Leave", "sl_quota", "sl_taken", quotaEditor.sick],
                ["Privileged Leave", "pl_quota", "pl_taken", quotaEditor.privileged],
              ].map(([label, qField, tField, balance]) => {
                const total = Number(quotaForm[qField]) || 0;
                const taken = Number(quotaForm[tField]) || 0;
                const left = Math.max(0, total - taken);
                return (
                  <div key={label} style={{ padding: 12, borderRadius: 8, border: "1px solid var(--border)", background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        Display: <b style={{ color: "var(--foreground)" }}>{taken} / {total}</b>
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="label" style={{ fontSize: 11 }}>Total Quota</label>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="1"
                          value={quotaForm[qField]}
                          onChange={(event) => setQuotaForm((current) => ({ ...current, [qField]: event.target.value }))}
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="label" style={{ fontSize: 11 }}>Taken Leaves</label>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="1"
                          value={quotaForm[tField]}
                          onChange={(event) => setQuotaForm((current) => ({ ...current, [tField]: event.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 12 }}>Editing Taken Leaves increases used leaves (e.g. 4/10) without deducting total annual entitlement.</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button className="btn-ghost" disabled={quotaSaving} onClick={() => setQuotaEditor(null)}>Cancel</button>
              <button className="btn-primary" disabled={quotaSaving} onClick={saveLeaveQuotas}>{quotaSaving ? "Saving…" : "Save Quotas"}</button>
            </div>
          </div>
        </div>
      )}

      {selectedLeave && (
        <div className="modal-overlay" onClick={() => setSelectedLeave(null)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ background: "var(--card-bg, #fff)", padding: 24, borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
            <h2 className="syne" style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Leave Details & Actions</h2>
            
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: "var(--muted, #666)", fontSize: 12, display: "block" }}>Employee</span>
              <strong>{selectedLeave.name || selectedLeave.emp_id}</strong>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <span style={{ color: "var(--muted, #666)", fontSize: 12, display: "block" }}>Leave Type</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    value={editedLeaveType}
                    onChange={(e) => setEditedLeaveType(e.target.value)}
                    style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", fontSize: 14 }}
                  >
                    <option value="Casual Leave">Casual Leave</option>
                    <option value="Sick Leave">Sick Leave</option>
                    <option value="Privileged Leave">Privileged Leave</option>
                  </select>
                  {editedLeaveType !== (selectedLeave.leave_type || "Casual Leave") && (
                    <button className="btn-primary" onClick={handleUpdateLeaveType} style={{ padding: "6px 12px", fontSize: 12 }}>Update</button>
                  )}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--muted, #666)", fontSize: 12, display: "block" }}>Current Status</span>
                <StatusBadge status={selectedLeave.status} />
              </div>
            </div>

            {selectedBalance && selectedBalance.annual_quotas && (
              <div style={{ marginBottom: 16, padding: "12px", background: "var(--bg, #f9fafb)", borderRadius: 8, border: "1px solid var(--border)" }}>
                <span style={{ color: "var(--muted, #666)", fontSize: 12, display: "block", marginBottom: 8, fontWeight: 600 }}>Leave Balances (Remaining)</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  <div style={{ textAlign: "center", background: "#fff", padding: "8px", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>Casual</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedBalance.annual_quotas.casual.remaining}</div>
                  </div>
                  <div style={{ textAlign: "center", background: "#fff", padding: "8px", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>Sick</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedBalance.annual_quotas.sick.remaining}</div>
                  </div>
                  <div style={{ textAlign: "center", background: "#fff", padding: "8px", borderRadius: 6, border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>Privileged</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedBalance.annual_quotas.privileged.remaining}</div>
                  </div>
                </div>
              </div>
            )}
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
              <div>
                <span style={{ color: "var(--muted, #666)", fontSize: 12, display: "block" }}>From Date</span>
                <input
                  type="date"
                  value={editedStartDate}
                  onChange={(e) => setEditedStartDate(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", fontSize: 13 }}
                />
              </div>
              <div>
                <span style={{ color: "var(--muted, #666)", fontSize: 12, display: "block" }}>To Date</span>
                <input
                  type="date"
                  value={editedEndDate}
                  min={editedStartDate}
                  onChange={(e) => setEditedEndDate(e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--fg)", fontSize: 13 }}
                />
              </div>
            </div>
            {(editedStartDate !== (selectedLeave.start_date ? selectedLeave.start_date.split("T")[0] : "") ||
              editedEndDate !== (selectedLeave.end_date ? selectedLeave.end_date.split("T")[0] : "")) && (
              <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
                <button className="btn-primary" onClick={handleUpdateDates} style={{ padding: "6px 12px", fontSize: 12 }}>
                  Save Date Changes
                </button>
              </div>
            )}
            
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: "var(--muted, #666)", fontSize: 12, display: "block" }}>Subject</span>
              <strong>{selectedLeave.subject}</strong>
            </div>
            
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: "var(--muted, #666)", fontSize: 12, display: "block" }}>Description</span>
              <p style={{ margin: "4px 0 0 0", fontSize: 14 }}>{selectedLeave.description || "—"}</p>
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <span style={{ color: "var(--muted, #666)", fontSize: 12, display: "block", marginBottom: 4 }}>Attachments</span>
              {(selectedLeave.attachments?.length > 0) ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selectedLeave.attachments.map((url, j) => (
                    <a key={j} href={url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", padding: "6px 12px", background: "var(--bg, #f3f4f6)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 6, fontSize: 12, color: "var(--accent, #3b82f6)", textDecoration: "none" }}>
                      📎 Attachment {j + 1}
                    </a>
                  ))}
                </div>
              ) : <span style={{ color: "var(--muted, #666)", fontSize: 14 }}>No attachments</span>}
            </div>
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {selectedLeave.status === "Approved" ? (
                  <button className="btn-danger" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => updateLeave(selectedLeave, "reject")}>
                    Reject Leave
                  </button>
                ) : selectedLeave.status === "Rejected" ? (
                  <>
                    <button className="btn-primary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => updateLeave(selectedLeave, "approve_paid")}>
                      Approve as Paid
                    </button>
                    <button className="btn-ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => updateLeave(selectedLeave, "approve_unpaid")}>
                      Approve as Unpaid
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn-primary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => updateLeave(selectedLeave, "approve_paid")}>
                      Approve (Paid)
                    </button>
                    <button className="btn-ghost" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => updateLeave(selectedLeave, "approve_unpaid")}>
                      Approve (Unpaid)
                    </button>
                    <button className="btn-danger" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => updateLeave(selectedLeave, "reject")}>
                      Reject
                    </button>
                  </>
                )}
              </div>
              <button className="btn-ghost" onClick={() => setSelectedLeave(null)} style={{ padding: "6px 16px", borderRadius: 6 }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {toastNode}
    </div>
  );
}
