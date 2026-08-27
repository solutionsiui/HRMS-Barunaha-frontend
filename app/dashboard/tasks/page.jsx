"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { fmtDate } from "@/lib/formatters";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";
import Pagination from "@/components/ui/Pagination";

const EMPTY_WORK_FORM = {
  task_name: "",
  completed_flag: false,
  completion_percent: 0,
  output_text: "",
  task_link: "",
  issue_text: "",
  hours_taken: "",
  remarks: "",
  notes: "",
  attached_file: null,
  picture_1: null,
  picture_2: null,
  picture_3: null,
  attachments: [],
};

export default function MyTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workModal, setWorkModal] = useState(null);
  const [workForm, setWorkForm] = useState(EMPTY_WORK_FORM);
  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 10;
  const [showToast, toastNode] = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch("/tasks/my"); setTasks(Array.isArray(d) ? d : []); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submitWork(taskId) {
    const completion = Number(workForm.completion_percent);
    const hours = Number(workForm.hours_taken);
    if (!workForm.task_name.trim()) return showToast("Task name is required", "error");
    if (!Number.isFinite(completion) || completion < 0 || completion > 100) return showToast("Completion percentage must be between 0 and 100", "error");
    if (!Number.isFinite(hours) || hours < 0) return showToast("Hours taken must be zero or greater", "error");
    if (!workForm.output_text.trim() && !workForm.attached_file && !(workForm.attachments || []).length) return showToast("Add output details or attach an output file", "error");
    if (workForm.task_link && !/^https?:\/\//i.test(workForm.task_link)) return showToast("Task link must start with http:// or https://", "error");
    const formData = new FormData();
    formData.append("date", new Date().toISOString().slice(0, 10));
    formData.append("task_name", workForm.task_name || workModal?.title || "");
    formData.append("completed_flag", String(!!workForm.completed_flag));
    formData.append("completion_percent", String(workForm.completion_percent || 0));
    formData.append("output_text", workForm.output_text || "");
    formData.append("task_link", workForm.task_link || "");
    formData.append("issue_text", workForm.issue_text || "");
    formData.append("hours_taken", String(workForm.hours_taken || 0));
    formData.append("remarks", workForm.remarks || "");
    formData.append("notes", workForm.notes || "");
    if (workForm.attached_file) formData.append("attached_file", workForm.attached_file);
    if (workForm.picture_1) formData.append("picture_1", workForm.picture_1);
    if (workForm.picture_2) formData.append("picture_2", workForm.picture_2);
    if (workForm.picture_3) formData.append("picture_3", workForm.picture_3);
    (workForm.attachments || []).forEach((file) => {
      if (file) formData.append("attachments", file);
    });
    
    try {
      // Note: Backend endpoint was updated to /{task_id}/revert to match HOD review flow
      await apiFetch(`/tasks/${taskId}/revert`, {
        method: "POST",
        body: formData,
        headers: {},
      });
      showToast("Work submitted for review!");
      setWorkModal(null);
      setWorkForm(EMPTY_WORK_FORM);
      load();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>My Tasks</h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>Track and manage your assigned tasks</p>
      </div>
      <div className="card">
        {loading ? <Loader /> : tasks.length === 0 ? <EmptyState icon="✓" title="No tasks" sub="Tasks will appear here" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Name of Task</th><th>Completed</th><th>Completion %</th><th>Output</th><th>Pictures</th><th>Review Status</th><th>Link</th><th>Issue</th><th>Hours</th><th>Remark</th><th>Actions</th></tr></thead>
              <tbody>
                {(() => {
                  const safePage = Math.min(currentPage, Math.max(1, Math.ceil(tasks.length / PER_PAGE)));
                  const paginatedTasks = tasks.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
                  return paginatedTasks.map((t, i) => {
                    const revCount = t.revision_count || (t.reverts?.length || 0);
                    const prevRejected = t.reverts?.find((r) => r.hod_status === "rejected" || r.tl_status === "rejected");
                    return (
                    <tr key={i}>
                      <td>{fmtDate(t.assigned_date || t.deadline)}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{t.title}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{t.description}</div>
                        {revCount > 1 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(245,158,11,0.15)", color: "#b45309", fontWeight: 600 }}>Revision {revCount}</span>}
                        {prevRejected?.rejection_reason && (
                          <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4, padding: "4px 8px", background: "rgba(220,38,38,0.06)", borderRadius: 8 }}>
                            ↩ Revision reason: {prevRejected.rejection_reason}
                          </div>
                        )}
                      </td>
                      <td>{t.revert?.completed_flag ? "Yes" : "No"}</td>
                      <td>{t.revert?.completion_percent ?? 0}%</td>
                      <td style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.revert?.output_text || "—"}</td>
                      <td>
                        {((t.revert?.image_urls?.length || 0) + (t.revert?.attachments?.length || 0)) || "—"}
                      </td>
                      <td>{t.revert ? <><div style={{ fontSize: 11 }}>TL: {t.revert.tl_status || "Skipped"}</div><div style={{ fontSize: 11 }}>HOD: {t.revert.hod_status || "Pending"}</div></> : "Not submitted"}</td>
                      <td>{t.revert?.task_link ? <a href={t.revert.task_link} target="_blank" rel="noreferrer">Open</a> : "—"}</td>
                      <td style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.revert?.issue_text || "—"}</td>
                      <td>{t.revert?.hours_taken ?? "—"}</td>
                      <td style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.revert?.remarks || t.revert?.employee_notes || "—"}</td>
                      <td>{t.status === "pending" && <button className="btn-primary" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => { const prev = t.revert || {}; setWorkModal(t); setWorkForm({ ...EMPTY_WORK_FORM, task_name: t.title, completed_flag: prev.completed_flag || false, completion_percent: prev.completion_percent || 0, output_text: prev.output_text || "", task_link: prev.task_link || "", issue_text: prev.issue_text || "", hours_taken: prev.hours_taken || "", remarks: prev.remarks || prev.employee_notes || "", notes: prev.notes || "" }); }}>{revCount > 0 ? "Submit Revision" : "Submit Work"}</button>}</td>
                    </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          currentPage={currentPage}
          totalItems={tasks.length}
          pageSize={PER_PAGE}
          onPageChange={(p) => setCurrentPage(p)}
        />
      </div>
      {workModal && (
        <Modal title={`Submit Work: ${workModal.title}`} onClose={() => setWorkModal(null)}
          footer={<><button className="btn-ghost" onClick={() => setWorkModal(null)}>Cancel</button><button className="btn-primary" onClick={() => submitWork(workModal.id)}>Submit</button></>}>
          <div className="form-row">
            <div className="form-group"><label className="label">Date</label><input className="input" value={fmtDate(new Date().toISOString().slice(0, 10))} disabled /></div>
            <div className="form-group"><label className="label">Name of Task <span style={{ color: "#ef4444" }}>*</span></label><input className="input" value={workForm.task_name} readOnly style={{ background: "var(--bg-secondary)", cursor: "default" }} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="label">Completed or Not <span style={{ color: "#ef4444" }}>*</span></label><select className="input" value={workForm.completed_flag ? "yes" : "no"} onChange={(e) => setWorkForm((form) => ({ ...form, completed_flag: e.target.value === "yes" }))}><option value="no">No</option><option value="yes">Yes</option></select></div>
            <div className="form-group"><label className="label">Completion % <span style={{ color: "#ef4444" }}>*</span></label><input className="input" required type="number" min="0" max="100" value={workForm.completion_percent} onChange={(e) => setWorkForm((form) => ({ ...form, completion_percent: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Hours Taken <span style={{ color: "#ef4444" }}>*</span></label><input className="input" required type="number" min="0" step="0.5" value={workForm.hours_taken} onChange={(e) => setWorkForm((form) => ({ ...form, hours_taken: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label className="label">Output <span style={{ color: "#ef4444" }}>*</span> <span style={{ fontWeight: 400, color: "var(--muted)" }}>(or attach an output file)</span></label><textarea className="input" rows={3} value={workForm.output_text} onChange={(e) => setWorkForm((form) => ({ ...form, output_text: e.target.value }))} /></div>
          <div className="form-row">
            <div className="form-group"><label className="label">Link of Task</label><input className="input" value={workForm.task_link} onChange={(e) => setWorkForm((form) => ({ ...form, task_link: e.target.value }))} /></div>
            <div className="form-group"><label className="label">Issue</label><input className="input" value={workForm.issue_text} onChange={(e) => setWorkForm((form) => ({ ...form, issue_text: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label className="label">Remark</label><textarea className="input" rows={3} value={workForm.remarks} onChange={(e) => setWorkForm((form) => ({ ...form, remarks: e.target.value }))} /></div>
          <div className="form-group"><label className="label">Notes</label><textarea className="input" rows={3} value={workForm.notes} onChange={(e) => setWorkForm((form) => ({ ...form, notes: e.target.value }))} /></div>
          <div className="form-row">
            <div className="form-group"><label className="label">Output File</label><input type="file" className="input" onChange={(e) => setWorkForm((form) => ({ ...form, attached_file: e.target.files?.[0] || null }))} /></div>
            <div className="form-group"><label className="label">Picture 1</label><input type="file" accept="image/*" className="input" onChange={(e) => setWorkForm((form) => ({ ...form, picture_1: e.target.files?.[0] || null }))} /></div>
            <div className="form-group"><label className="label">Picture 2</label><input type="file" accept="image/*" className="input" onChange={(e) => setWorkForm((form) => ({ ...form, picture_2: e.target.files?.[0] || null }))} /></div>
            <div className="form-group"><label className="label">Picture 3</label><input type="file" accept="image/*" className="input" onChange={(e) => setWorkForm((form) => ({ ...form, picture_3: e.target.files?.[0] || null }))} /></div>
          </div>
          <div className="form-group">
            <label className="label">Other Attachments (PDF / video / image / doc — up to 50MB each)</label>
            <input
              type="file"
              multiple
              accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf"
              className="input"
              onChange={(e) => setWorkForm((form) => ({ ...form, attachments: Array.from(e.target.files || []) }))}
            />
            {workForm.attachments?.length ? (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                Selected: {workForm.attachments.map((file) => file.name).join(", ")}
              </div>
            ) : null}
          </div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
