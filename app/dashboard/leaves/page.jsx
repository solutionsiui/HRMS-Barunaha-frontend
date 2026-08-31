"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { fmtDate } from "@/lib/formatters";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import Loader from "@/components/ui/Loader";


const EMPTY_LEAVE_FORM = { subject: "", description: "", start_date: "", end_date: "", leave_type: "Casual Leave" };

export default function LeavesPage() {
  const [leaves, setLeaves] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_LEAVE_FORM);
  const [files, setFiles] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 10;
  const [showToast, toastNode] = useToast();

  const safePage = Math.min(currentPage, Math.max(1, Math.ceil(leaves.length / PER_PAGE)));
  const paginatedLeaves = leaves.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const ALLOWED_EXT = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif"];
  const MAX_FILES = 5;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const currentYear = new Date().getFullYear();
      const [d, b, holidayData] = await Promise.all([
        apiFetch("/leave/my"),
        apiFetch("/leave/balance").catch(() => null),
        apiFetch(`/attendance/holidays?year=${currentYear}`).catch(() => ({ holidays: [] })),
      ]);
      setLeaves(Array.isArray(d) ? [...d].sort((a, b) => String(b.submitted_on || b.created_at || b.start_date || "").localeCompare(String(a.submitted_on || a.created_at || a.start_date || ""))) : []);
      if (b) setBalance(b);
      setHolidays(Array.isArray(holidayData?.holidays) ? holidayData.holidays : []);
    } catch (error) {
      setLeaves([]);
      setLoadError(error.message || "Leaves could not be loaded");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function applyLeave(e) {
    e.preventDefault(); setSubmitting(true);
    if (!form.subject.trim()) { showToast("Subject is required", "error"); setSubmitting(false); return; }
    if (!form.start_date || !form.end_date) { showToast("Please select both start and end dates", "error"); setSubmitting(false); return; }
    if (form.end_date < form.start_date) { showToast("End date cannot be before start date", "error"); setSubmitting(false); return; }
    try {
      const fd = new FormData();
      fd.append("subject", form.subject || `${form.leave_type} request`);
      fd.append("leave_type", form.leave_type);
      fd.append("description", form.description || "Leave requested");
      fd.append("start_date", form.start_date);
      fd.append("end_date", form.end_date);
      files.forEach((f) => fd.append("attachments", f));
      await apiFetch("/leave/apply", { method: "POST", body: fd });
      showToast("Leave application submitted!");
      setShowModal(false);
      setForm(EMPTY_LEAVE_FORM);
      setFiles([]);
      load();
    } catch (e) { showToast(e.message, "error"); } finally { setSubmitting(false); }
  }

  function handleFileChange(e) {
    const selected = Array.from(e.target.files || []);
    const valid = selected.filter((f) => {
      const ext = "." + f.name.split(".").pop().toLowerCase();
      return ALLOWED_EXT.includes(ext);
    });
    if (valid.length !== selected.length) showToast("Some files were skipped (only PDF & images allowed)", "error");
    if (files.length + valid.length > MAX_FILES) {
      showToast(`Maximum ${MAX_FILES} attachments allowed. Remove a file before adding another.`, "error");
      e.target.value = "";
      return;
    }
    setFiles([...files, ...valid]);
    e.target.value = "";
  }

  async function cancelLeave(id) {
    if (!window.confirm("Are you sure you want to cancel this pending leave request?")) return;
    try {
      await apiFetch(`/leave/${id}/cancel`, { method: "POST" });
      showToast("Leave request cancelled");
      load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  const quotas = balance?.annual_quotas;
  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>My Leaves</h1>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>Annual Quotas: {quotas?.casual?.total ?? 10} Casual Leaves, {quotas?.sick?.total ?? 12} Sick Leaves & {quotas?.privileged?.total ?? 15} Privileged Leaves per year</p>
        </div>
        <button className="btn-primary" onClick={() => { setForm(EMPTY_LEAVE_FORM); setFiles([]); setShowModal(true); }}>+ Apply Leave</button>
      </div>

      <div className="grid-stats" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>CASUAL LEAVE (CL)</div>
          <div className="syne" style={{ fontSize: 24, fontWeight: 800, color: "#10b981", marginTop: 4 }}>
            {quotas?.casual?.remaining ?? 10} <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>/ {quotas?.casual?.total ?? 10} days left</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            Used: {quotas?.casual?.used ?? 0} days{(quotas?.casual?.deduction ?? 0) > 0 && <span> · HR Adjusted: −{quotas.casual.deduction}</span>}
          </div>
        </div>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>SICK LEAVE (SL)</div>
          <div className="syne" style={{ fontSize: 24, fontWeight: 800, color: "#6366f1", marginTop: 4 }}>
            {quotas?.sick?.remaining ?? 12} <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>/ {quotas?.sick?.total ?? 12} days left</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            Used: {quotas?.sick?.used ?? 0} days{(quotas?.sick?.deduction ?? 0) > 0 && <span> · HR Adjusted: −{quotas.sick.deduction}</span>}
          </div>
        </div>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>PRIVILEGED LEAVE (PL)</div>
          <div className="syne" style={{ fontSize: 24, fontWeight: 800, color: "#f59e0b", marginTop: 4 }}>
            {quotas?.privileged?.remaining ?? 15} <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>/ {quotas?.privileged?.total ?? 15} days left</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            Used: {quotas?.privileged?.used ?? 0} days{(quotas?.privileged?.deduction ?? 0) > 0 && <span> · HR Adjusted: −{quotas.privileged.deduction}</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
          <h2 className="syne" style={{ fontSize: 16, fontWeight: 700 }}>Leave History</h2>
        </div>
        {loading ? <Loader /> : loadError ? <EmptyState icon="⚠️" title="Leaves could not be loaded" sub={loadError} /> : leaves.length === 0 ? <EmptyState icon="📅" title="No leaves yet" sub="Apply for your first leave" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>From</th><th>To</th><th>Category</th><th>Subject</th><th>Description</th><th>Attachments</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {paginatedLeaves.map((l, i) => (
                  <tr key={i}>
                    <td>{fmtDate(l.start_date)}</td><td>{fmtDate(l.end_date)}</td>
                    <td><span className="chip" style={{ fontWeight: 600 }}>{l.leave_type || "Casual Leave"}</span></td>
                    <td><span className="chip">{l.subject}</span></td>
                    <td style={{ maxWidth: 240, minWidth: 160, whiteSpace: "normal", overflowWrap: "anywhere" }}>{l.description}</td>
                    <td>
                      {(l.attachments?.length > 0) ? l.attachments.map((url, j) => (
                        <a key={j} href={url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginRight: 6, fontSize: 12, color: "var(--accent)" }}>
                          📎 File {j + 1}
                        </a>
                      )) : <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>}
                    </td>
                    <td>
                      <StatusBadge status={l.status} />
                      {l.action_by_name && (
                        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                          by {l.action_by_name} {l.action_by_role ? `(${l.action_by_role})` : ""}
                        </div>
                      )}
                    </td>
                    <td>
                      {l.status === "Pending" ? (
                        <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12, color: "#ef4444" }} onClick={() => cancelLeave(l.id)}>
                          Cancel
                        </button>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          currentPage={safePage}
          totalItems={leaves.length}
          pageSize={PER_PAGE}
          onPageChange={(p) => setCurrentPage(p)}
        />
      </div>
      {showModal && (
        <Modal title="Apply for Leave" onClose={() => setShowModal(false)}
          footer={<><button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-primary" onClick={applyLeave} disabled={submitting}>{submitting ? "Submitting…" : "Apply Leave"}</button></>}>
          <div className="form-group"><label className="label">Leave Category</label>
            <select className="input" value={form.leave_type} onChange={(e) => setForm((f) => ({ ...f, leave_type: e.target.value }))}>
              <option value="Casual Leave">Casual Leave (CL - 10/yr)</option>
              <option value="Sick Leave">Sick Leave (SL - 12/yr)</option>
              <option value="Privileged Leave">Privileged Leave (PL - 15/yr)</option>
            </select>
          </div>
          <div className="form-group"><label className="label">Subject <span style={{ color: "#ef4444" }}>*</span></label><input className="input" placeholder="e.g. Family function, Medical, etc." value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} required /></div>
          <div className="form-row">
            <div className="form-group"><label className="label">Start Date <span style={{ color: "#ef4444" }}>*</span></label><input className="input" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} required /></div>
            <div className="form-group"><label className="label">End Date <span style={{ color: "#ef4444" }}>*</span></label><input className="input" type="date" min={form.start_date || undefined} value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} required /></div>
          </div>
          {(() => {
            const warn = [];
            if (form.start_date) { const d = new Date(form.start_date + "T00:00:00"); if (d.getDay() === 0) warn.push("Start date is a Sunday"); else if (d.getDay() === 6) warn.push("Start date is a Saturday"); }
            if (form.end_date) { const d = new Date(form.end_date + "T00:00:00"); if (d.getDay() === 0) warn.push("End date is a Sunday"); else if (d.getDay() === 6) warn.push("End date is a Saturday"); }
            const startHoliday = holidays.find((item) => item.date === form.start_date);
            const endHoliday = holidays.find((item) => item.date === form.end_date && item.date !== form.start_date);
            if (startHoliday) warn.push(`Start date is ${startHoliday.name || "a holiday"}`);
            if (endHoliday) warn.push(`End date is ${endHoliday.name || "a holiday"}`);
            return warn.length > 0 ? <div style={{ padding: "8px 12px", background: "rgba(245,158,11,0.15)", borderRadius: 8, fontSize: 13, color: "#f59e0b", marginBottom: 8 }}>⚠️ {warn.join(" · ")} — weekends may not count as working days</div> : null;
          })()}
          <div className="form-group"><label className="label">Description</label><textarea className="input" rows={3} placeholder="Reason for leave…" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          <div className="form-group">
            <label className="label">Attachments <span style={{ fontWeight: 400, color: "var(--muted)" }}>(max 5 — PDF, JPG, PNG only)</span></label>
            <label className="btn-ghost" style={{ display: "inline-flex", cursor: files.length >= MAX_FILES ? "not-allowed" : "pointer", opacity: files.length >= MAX_FILES ? 0.6 : 1 }}>
              Choose files ({files.length}/{MAX_FILES})
              <input type="file" multiple disabled={files.length >= MAX_FILES} accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" onChange={handleFileChange} style={{ display: "none" }} />
            </label>
            {files.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {files.map((f, i) => (
                  <span key={i} className="chip" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    📎 {f.name}
                    <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
