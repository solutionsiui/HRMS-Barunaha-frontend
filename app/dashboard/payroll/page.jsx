"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { fmtDate, fmtDateTime, fmtINR } from "@/lib/formatters";
import Modal from "@/components/ui/Modal";
import Loader from "@/components/ui/Loader";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function StatusChip({ status }) {
  const map = {
    Draft: { bg: "rgba(148,163,184,0.15)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.3)" },
    Pending: { bg: "rgba(251,146,60,0.12)", color: "#f59e0b", border: "1px solid rgba(251,146,60,0.3)" },
    Approved: { bg: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" },
    Rejected: { bg: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" },
  };
  const s = map[status] || map.Draft;
  return (
    <span style={{ display: "inline-block", padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: s.bg, color: s.color, border: s.border }}>
      {status || "Draft"}
    </span>
  );
}

export default function PayrollPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const isAccounts = role === "accounts";
  const canUploadPayslip = role === "hr";
  const showSalary = isAdmin || isAccounts;
  const [payroll, setPayroll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState([]);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [editModal, setEditModal] = useState(null);
  const [uploadModal, setUploadModal] = useState(null);
  const [salaryForm, setSalaryForm] = useState({ base_salary: "", bank_account: "", ifsc_code: "" });
  const [selfServiceSettings, setSelfServiceSettings] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [showToast, toastNode] = useToast();

  // Filters
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("All Departments");
  const [filterStatus, setFilterStatus] = useState("All Status");
  const [filterPayslip, setFilterPayslip] = useState("Payslip Status");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const requests = [apiFetch(`/payroll/summary?month=${month}&year=${year}`)];
      if (isAdmin) requests.push(apiFetch("/payroll/approval-queue"));
      if (isAdmin) requests.push(apiFetch("/auth/self-service-settings"));
      const [data, queueData, settingsData] = await Promise.all(requests);
      setPayroll(Array.isArray(data) ? data : []);
      setQueue(Array.isArray(queueData) ? queueData : []);
      setSelfServiceSettings(settingsData || null);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [month, showToast, year]);

  useEffect(() => {
    load();
  }, [load]);

  // Derived data
  const departments = useMemo(() => {
    const depts = new Set(payroll.map((r) => r.department).filter(Boolean));
    return ["All Departments", ...Array.from(depts).sort()];
  }, [payroll]);

  const filtered = useMemo(() => {
    let list = payroll;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => (r.employee_name || "").toLowerCase().includes(q) || (r.emp_id || "").toLowerCase().includes(q));
    }
    if (filterDept !== "All Departments") {
      list = list.filter((r) => r.department === filterDept);
    }
    if (filterStatus !== "All Status") {
      list = list.filter((r) => (r.status || "Draft") === filterStatus);
    }
    if (filterPayslip === "Generated") {
      list = list.filter((r) => r.uploaded_payslip_url);
    } else if (filterPayslip === "Not Generated") {
      list = list.filter((r) => !r.uploaded_payslip_url);
    }
    return list;
  }, [payroll, search, filterDept, filterStatus, filterPayslip]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated = filtered.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  useEffect(() => { setCurrentPage(1); }, [search, filterDept, filterStatus, filterPayslip, rowsPerPage]);

  // Stats
  const activeCount = payroll.filter((r) => r.is_active !== false).length;
  const inactiveCount = payroll.length - activeCount;
  const paidEmployees = payroll.filter((r) => (r.base_salary || 0) > 0);
  const totalPayroll = paidEmployees.reduce((sum, r) => sum + (r.base_salary || 0), 0);
  const avgSalary = paidEmployees.length ? Math.round(totalPayroll / paidEmployees.length) : 0;
  const pendingApprovals = queue.length;
  const payslipsUploaded = payroll.filter((r) => r.uploaded_payslip_url).length;

  async function updateEmployee(empId) {
    try {
      await apiFetch(`/payroll/update-employee/${empId}`, {
        method: "POST",
        body: JSON.stringify({
          base_salary: salaryForm.base_salary ? +salaryForm.base_salary : undefined,
          bank_account: salaryForm.bank_account || undefined,
          ifsc_code: salaryForm.ifsc_code || undefined,
        }),
      });
      showToast("Payroll details updated");
      setEditModal(null);
      load();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function uploadPayslip() {
    if (!uploadModal || !uploadFile) return;
    const body = new FormData();
    body.append("file", uploadFile);
    try {
      await apiFetch(`/payroll/uploaded-payslip/${uploadModal.emp_id}?month=${month}&year=${year}`, {
        method: "POST",
        body,
        headers: {},
      });
      showToast("Payslip uploaded");
      setUploadModal(null);
      setUploadFile(null);
      load();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function decideRequest(kind, id, decision) {
    try {
      await apiFetch(`/payroll/approval-queue/${kind}/${id}/decide?decision=${decision}`, { method: "POST" });
      showToast(`Request ${decision}d`);
      load();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function saveSelfServiceSettings() {
    try {
      await apiFetch("/auth/self-service-settings", { method: "PUT", body: JSON.stringify(selfServiceSettings) });
      showToast("Payslip visibility updated");
      load();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function exportExcel() {
    const header = ["EMP ID", "Name", "Department", "Base Salary", "Net Salary", "Status", "Uploaded Payslip"];
    const rows = filtered.map((r) => [r.emp_id, r.employee_name, r.department || "", r.base_salary || 0, r.net_salary || 0, r.status || "Draft", r.uploaded_payslip_url ? "Generated" : "Not Generated"]);
    const csvContent = [header, ...rows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll_summary_${MONTHS[month - 1]}_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const statCards = [
    { icon: "👥", iconBg: "rgba(99,102,241,0.12)", iconColor: "#6366f1", value: payroll.length, label: "Employees", sub: `Active: ${activeCount}  •  Inactive: ${inactiveCount}` },
    { icon: "💰", iconBg: "rgba(16,185,129,0.12)", iconColor: "#10b981", value: fmtINR(totalPayroll), label: "Total Payroll", sub: "Total Base Salary" },
    { icon: "📊", iconBg: "rgba(59,130,246,0.12)", iconColor: "#3b82f6", value: fmtINR(avgSalary), label: "Avg Salary", sub: "Average Base Salary" },
    { icon: "⏳", iconBg: "rgba(251,146,60,0.12)", iconColor: "#f59e0b", value: pendingApprovals, label: "Pending Approvals", sub: "Payroll change requests" },
    { icon: "📄", iconBg: "rgba(139,92,246,0.12)", iconColor: "#8b5cf6", value: payslipsUploaded, label: "Payslips Uploaded", sub: "This Month" },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8, display: "flex", gap: 6, alignItems: "center" }}>
        <a href="/dashboard" style={{ color: "var(--primary, #6366f1)", textDecoration: "none" }}>Home</a>
        <span>›</span>
        <span>Payroll</span>
      </div>

      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 className="syne" style={{ fontSize: 26, fontWeight: 800, margin: 0, textTransform: "uppercase", letterSpacing: "0.02em" }}>Payroll Summary</h1>
          <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 13, maxWidth: 600 }}>
            {isAdmin
              ? "Manage and review employee payroll details. Admin can review payroll and approve increments."
              : "Review employee payroll details, including comp-off extra pay and final payable salary."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select className="input" style={{ width: "auto", minWidth: 70 }} value={month} onChange={(e) => setMonth(+e.target.value)}>
            {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
          </select>
          <select className="input" style={{ width: "auto", minWidth: 80 }} value={year} onChange={(e) => setYear(+e.target.value)}>
            {[2024, 2025, 2026, 2027].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <button className="btn-primary" onClick={load}>Load</button>
        </div>
      </div>

      {/* Stat Cards Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        {statCards.map((card) => (
          <div key={card.label} className="card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: card.iconBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              {card.icon}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: card.iconColor, letterSpacing: "-0.02em" }}>{card.value}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{card.label}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Admin: Payslip Visibility */}
      {isAdmin && selfServiceSettings && (
        <div className="card" style={{ padding: 18, marginBottom: 24 }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>My Payslip Visibility</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
            {[
              ["show_employee_payslip", "Employee"],
              ["show_hr_payslip", "HR"],
              ["show_hod_payslip", "HOD"],
              ["show_accounts_payslip", "Accounts"],
            ].map(([field, label]) => (
              <label key={field} className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" checked={selfServiceSettings[field]} onChange={(event) => setSelfServiceSettings((current) => ({ ...current, [field]: event.target.checked }))} />
                <span>{label} can see `My Payslip`</span>
              </label>
            ))}
          </div>
          <button className="btn-primary" onClick={saveSelfServiceSettings}>Save Visibility</button>
        </div>
      )}

      {/* Admin: Pending Approvals */}
      {isAdmin && queue.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
            <h2 className="syne" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Pending Payroll Approvals</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Request Type</th><th>Details</th><th>Requested On</th><th>Action</th></tr></thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={`${item.kind}-${item.id}`}>
                    <td><b>{item.employee_name}</b><div style={{ fontSize: 12, color: "var(--muted)" }}>{item.emp_id} · {item.is_active === false ? "Inactive" : "Active"}</div></td>
                    <td>{item.kind === "salary" ? "Salary Change" : "Payroll Update"}</td>
                    <td style={{ maxWidth: 320 }}>
                      {item.proposed_base_salary !== null && item.proposed_base_salary !== undefined ? <div>Base Salary: {fmtINR(item.current_base_salary)} → {fmtINR(item.proposed_base_salary)}</div> : null}
                      {item.proposed_bank_account ? <div>Bank: {item.proposed_bank_account}</div> : null}
                      {item.proposed_ifsc_code ? <div>IFSC: {item.proposed_ifsc_code}</div> : null}
                    </td>
                    <td>{fmtDateTime(item.requested_on)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => decideRequest(item.kind, item.id, "approve")}>Approve</button>
                        <button className="btn-danger" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => decideRequest(item.kind, item.id, "reject")}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Search / Filter Bar */}
      <div className="card" style={{ marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: "1px solid var(--border)" }}>
        <div style={{ padding: "16px 20px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 280 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 14 }}>🔍</span>
            <input
              className="input"
              placeholder="Search by Name or EMP ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 36, width: "100%" }}
            />
          </div>
          <select className="input" style={{ width: "auto", minWidth: 160 }} value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="input" style={{ width: "auto", minWidth: 120 }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="All Status">All Status</option>
            <option value="Draft">Draft</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <select className="input" style={{ width: "auto", minWidth: 140 }} value={filterPayslip} onChange={(e) => setFilterPayslip(e.target.value)}>
            <option value="Payslip Status">Payslip Status</option>
            <option value="Generated">Generated</option>
            <option value="Not Generated">Not Generated</option>
          </select>
          <button
            className="btn-ghost"
            style={{ padding: "8px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => { setSearch(""); setFilterDept("All Departments"); setFilterStatus("All Status"); setFilterPayslip("Payslip Status"); }}
          >
            🔄 Reset
          </button>
          <div style={{ marginLeft: "auto" }}>
            <button className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", fontSize: 13 }} onClick={exportExcel}>
              📥 Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="card" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: "none" }}>
        {loading ? <div style={{ padding: 40 }}><Loader /></div> : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No payroll data</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Load a month to review payroll.</div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>EMP ID</th>
                    <th>NAME</th>
                    <th>DEPARTMENT</th>
                    {showSalary && <th>BASE SALARY</th>}
                    {showSalary && <th>EXTRA PAY</th>}
                    {showSalary && <th>NET SALARY</th>}
                    <th>EFFECTIVE FROM</th>
                    <th>STATUS</th>
                    <th>UPLOADED PAYSLIP</th>
                    <th>LAST UPDATED</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((row) => (
                    <tr key={row.emp_id}>
                      <td><span className="chip">{row.emp_id}</span></td>
                      <td style={{ fontWeight: 600 }}>{row.employee_name}</td>
                      <td>{row.department || "—"}</td>
                      {showSalary && (
                        <td>
                          <div style={{ fontWeight: 600 }}>{fmtINR(row.base_salary)}</div>
                          {row.calculation_error && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>{row.calculation_error}</div>}
                        </td>
                      )}
                      {showSalary && <td style={{ fontWeight: 600, color: (row.extra_pay_addition || 0) > 0 ? "#10b981" : "var(--muted)" }}>{fmtINR(row.extra_pay_addition || 0)}</td>}
                      {showSalary && <td style={{ fontWeight: 700 }}>{fmtINR(row.net_salary || row.base_salary || 0)}</td>}
                      <td style={{ color: row.effective_from ? "var(--text)" : "var(--muted)" }}>
                        {row.effective_from ? fmtDate(row.effective_from) : "—"}
                      </td>
                      <td><StatusChip status={row.status || "Draft"} /></td>
                      <td>
                        {row.uploaded_payslip_url ? (
                          <a href={row.uploaded_payslip_url} target="_blank" rel="noreferrer" style={{ color: "var(--primary, #6366f1)", fontWeight: 600, fontSize: 13 }}>
                            Generated
                          </a>
                        ) : (
                          <span style={{ color: "#f59e0b", fontWeight: 500, fontSize: 13 }}>Not Generated</span>
                        )}
                      </td>
                      <td>
                        {row.last_updated ? (
                          <div>
                            <div style={{ fontSize: 13 }}>{fmtDateTime(row.last_updated)}</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{role}</div>
                          </div>
                        ) : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {canUploadPayslip && (
                            <button
                              className="btn-ghost"
                              style={{ padding: "6px 14px", fontSize: 12, borderRadius: 6 }}
                              onClick={() => setUploadModal(row)}
                            >
                              {row.uploaded_payslip_url ? "Replace" : "Upload"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                Showing {Math.min((currentPage - 1) * rowsPerPage + 1, filtered.length)} to {Math.min(currentPage * rowsPerPage, filtered.length)} of {filtered.length} entries
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  className="btn-ghost"
                  style={{ padding: "6px 10px", fontSize: 13, borderRadius: 6 }}
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
                  Math.max(0, currentPage - 3),
                  currentPage + 2
                ).map((page) => (
                  <button
                    key={page}
                    className={page === currentPage ? "btn-primary" : "btn-ghost"}
                    style={{ padding: "6px 12px", fontSize: 13, borderRadius: 6, minWidth: 36 }}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  className="btn-ghost"
                  style={{ padding: "6px 10px", fontSize: 13, borderRadius: 6 }}
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  ›
                </button>
                <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 12 }}>Rows per page:</span>
                <select className="input" style={{ width: "auto", minWidth: 60, padding: "4px 8px", fontSize: 13 }} value={rowsPerPage} onChange={(e) => setRowsPerPage(+e.target.value)}>
                  {[10, 25, 50, 100].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Information & Statuses Footer */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
          <div className="card" style={{ padding: "18px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>ℹ️</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--primary, #6366f1)" }}>Information</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>
              <li>First payroll change can be saved directly.</li>
              <li>Any subsequent change will require Admin approval.</li>
            </ul>
          </div>
          <div className="card" style={{ padding: "18px 22px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Statuses</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {[
                { color: "#94a3b8", label: "Draft: Not submitted" },
                { color: "#f59e0b", label: "Pending: Awaiting approval" },
                { color: "#10b981", label: "Approved: Change approved" },
                { color: "#ef4444", label: "Rejected: Change rejected" },
              ].map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, display: "inline-block" }} />
                  {s.label}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <Modal
          title={`Edit Payroll: ${editModal.employee_name}`}
          onClose={() => setEditModal(null)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setEditModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={() => updateEmployee(editModal.emp_id)}>Update</button>
            </>
          }
        >
          <div className="card" style={{ padding: 14, marginBottom: 16, background: "rgba(59,130,246,0.08)" }}>
            {editModal.payroll_edit_count ? "This employee already used the first direct payroll edit. Saving now will create an admin approval request." : "This is the first payroll edit for this employee, so Accounts can save it directly."}
          </div>
          <div className="form-group">
            <label className="label">Base Salary</label>
            <input className="input" type="number" value={salaryForm.base_salary} onChange={(e) => setSalaryForm((current) => ({ ...current, base_salary: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Bank Account</label>
            <input className="input" inputMode="numeric" pattern="[0-9]*" placeholder="Enter account number (digits only)" value={salaryForm.bank_account} onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setSalaryForm((current) => ({ ...current, bank_account: v })); }} />
          </div>
          <div className="form-group">
            <label className="label">IFSC Code</label>
            <input className="input" value={salaryForm.ifsc_code} onChange={(e) => setSalaryForm((current) => ({ ...current, ifsc_code: e.target.value }))} />
          </div>
        </Modal>
      )}

      {/* Upload Modal */}
      {uploadModal && (
        <Modal
          title={`Upload Payslip: ${uploadModal.employee_name}`}
          onClose={() => setUploadModal(null)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setUploadModal(null)}>Cancel</button>
              <button className="btn-primary" disabled={!uploadFile} onClick={uploadPayslip}>Upload</button>
            </>
          }
        >
          <div className="form-group">
            <label className="label">Payslip File</label>
            <input className="input" type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
          </div>
        </Modal>
      )}

      {toastNode}
    </div>
  );
}
