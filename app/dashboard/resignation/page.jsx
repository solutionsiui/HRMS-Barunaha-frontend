"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getToken } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { fmtDate } from "@/lib/formatters";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";


const EMPTY_RESIGN_FORM = { subject: "", description: "", applied_date: "" };

export default function ResignationPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_RESIGN_FORM);
  const [attachment, setAttachment] = useState(null);
  const [showToast, toastNode] = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/resignation/my");
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!form.subject.trim()) return showToast("Subject is required", "error");
    if (!form.applied_date) return showToast("Applied date is required", "error");
    if (!form.description.trim()) return showToast("Reason / description is required", "error");
    if (!attachment) return showToast("Attach a PDF, JPG, or PNG file", "error");
    if (attachment.size > 10 * 1024 * 1024) return showToast("Attachment cannot exceed 10MB", "error");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(attachment.type)) return showToast("Only PDF, JPG, and PNG files are allowed", "error");
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("subject", form.subject);
      body.append("description", form.description);
      body.append("applied_date", form.applied_date);
      if (attachment) body.append("attachment", attachment);
      await apiFetch("/resignation/submit", { method: "POST", body, headers: {} });
      showToast("Resignation submitted");
      setShowModal(false);
      setForm(EMPTY_RESIGN_FORM);
      setAttachment(null);
      load();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function openAttachment(path) {
    const popup = window.open("", "_blank");
    try {
      const response = await fetch(`/api/proxy${path}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error("Unable to open attachment");
      const blobUrl = URL.createObjectURL(await response.blob());
      if (popup) popup.location.replace(blobUrl);
      else window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
      if (popup) popup.close();
      showToast(error.message, "error");
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Resignation</h1>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>Submit a request and track HR notice period updates.</p>
        </div>
        <button className="btn-danger" onClick={() => { setForm(EMPTY_RESIGN_FORM); setAttachment(null); setShowModal(true); }}>Submit Resignation</button>
      </div>

      <div className="card">
        {loading ? <Loader /> : items.length === 0 ? (
          <EmptyState icon="🚪" title="No resignations yet" subtitle="Your resignation history will appear here." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Applied</th>
                  <th>Notice Period Ends</th>
                  <th>HR Email</th>
                  <th>Attachment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{item.subject}</div>
                      <div style={{ color: "var(--muted)", fontSize: 12, maxWidth: 280 }}>{item.description}</div>
                    </td>
                    <td>{fmtDate(item.applied_date)}</td>
                    <td>{item.notice_period_end_date ? fmtDate(item.notice_period_end_date) : "Pending approval"}</td>
                    <td>{item.hr_email || "Pending"}</td>
                    <td>{item.attached_file ? <button type="button" className="btn-ghost" onClick={() => openAttachment(item.attached_file)}>View</button> : "No file"}</td>
                    <td><StatusBadge status={(item.status || "pending_hr").toLowerCase()} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <Modal
          title="Submit Resignation"
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button
                className="btn-danger"
                onClick={submit}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </>
          }
        >
          <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.1)", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#fca5a5" }}>
            HR approval will set your notice period end date and the contact email for offboarding.
          </div>
          <div className="form-group">
            <label className="label">Subject <span style={{ color: "#ef4444" }}>*</span></label>
            <input className="input" value={form.subject} onChange={(e) => setForm((current) => ({ ...current, subject: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Applied Date <span style={{ color: "#ef4444" }}>*</span></label>
            <input className="input" type="date" min={new Date().toISOString().split("T")[0]} value={form.applied_date} onChange={(e) => setForm((current) => ({ ...current, applied_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Reason / Description <span style={{ color: "#ef4444" }}>*</span></label>
            <textarea className="input" rows={4} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">Attachment <span style={{ color: "#ef4444" }}>*</span></label>
            <input className="input" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setAttachment(e.target.files?.[0] || null)} />
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>PDF, JPG, or PNG · maximum 10MB</div>
          </div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
