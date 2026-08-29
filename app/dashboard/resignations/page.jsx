"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getToken } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { fmtDate } from "@/lib/formatters";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";
import Modal from "@/components/ui/Modal";

export default function ResignationsPage() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const isHR = role === "hr";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalState, setModalState] = useState(null);
  const [hrEmail, setHrEmail] = useState("");
  const [comment, setComment] = useState("");
  const [showToast, toastNode] = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/resignation/all");
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

  async function process(payload) {
    try {
      await apiFetch(`/resignation/${modalState.id}/process`, { method: "POST", body: JSON.stringify(payload) });
      showToast(`Resignation ${payload.action}d`);
      setModalState(null);
      setHrEmail("");
      setComment("");
      load();
    } catch (error) {
      showToast(error.message, "error");
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

  function actionButtons(item) {
    if (isHR && item.hr_status === "PENDING_HR") {
      return (
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setModalState({ ...item, action: "approve" })}>HR Approve</button>
          <button className="btn-danger" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setModalState({ ...item, action: "reject" })}>HR Reject</button>
        </div>
      );
    }
    if (isAdmin && item.hr_status === "APPROVED_HR" && item.admin_status === "PENDING_ADMIN") {
      return (
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setModalState({ ...item, action: "approve" })}>Admin Approve</button>
          <button className="btn-danger" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setModalState({ ...item, action: "reject" })}>Admin Reject</button>
        </div>
      );
    }
    return "Resolved";
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Resignations</h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>HR reviews first with comments, then Admin gives the final decision with comments.</p>
      </div>
      <div className="card">
        {loading ? <Loader /> : items.length === 0 ? (
          <EmptyState icon="🚪" title="No resignations" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Applied</th>
                  <th>Attachment</th>
                  <th>HR Review</th>
                  <th>Admin Review</th>
                  <th>Notice Period Ends</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{item.employee_name || item.emp_id}</div>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>{item.subject}</div>
                    </td>
                    <td>{fmtDate(item.applied_date)}</td>
                    <td>{item.attached_file ? <button type="button" className="btn-ghost" onClick={() => openAttachment(item.attached_file)}>Open</button> : "Required"}</td>
                    <td>
                      <StatusBadge status={(item.hr_status || "pending_hr").toLowerCase()} />
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{item.hr_comment || item.hr_rejection_reason || "Pending"}</div>
                    </td>
                    <td>
                      <StatusBadge status={(item.admin_status || "pending_admin").toLowerCase()} />
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{item.admin_comment || "Pending"}</div>
                    </td>
                    <td>{item.admin_status === "APPROVED_ADMIN" && item.notice_period_end_date ? fmtDate(item.notice_period_end_date) : "Final approval pending"}</td>
                    <td>{actionButtons(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalState ? (
        <Modal
          title={`${isAdmin ? "Admin" : "HR"} ${modalState.action === "approve" ? "Approval" : "Rejection"}`}
          onClose={() => setModalState(null)}
          footer={
            <>
              <button className="btn-ghost" onClick={() => setModalState(null)}>Cancel</button>
              <button
                className={modalState.action === "approve" ? "btn-primary" : "btn-danger"}
                disabled={!comment.trim() || (isHR && modalState.action === "approve" && !hrEmail.trim())}
                onClick={() => process({ action: modalState.action, comment, hr_email: isHR && modalState.action === "approve" ? hrEmail : undefined })}
              >
                Confirm
              </button>
            </>
          }
        >
          {isHR && modalState.action === "approve" ? (
            <div className="form-group">
              <label className="label">HR Contact Email</label>
              <input className="input" type="email" value={hrEmail} onChange={(e) => setHrEmail(e.target.value)} />
            </div>
          ) : null}
          <div className="form-group">
            <label className="label">Comment</label>
            <textarea className="input" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </Modal>
      ) : null}
      {toastNode}
    </div>
  );
}
