"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { fmtDate } from "@/lib/formatters";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";

const EMPTY_GRIEVANCE_FORM = { subject: "", description: "", category: "General", is_anonymous: false };

export default function GrievancePage() {
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_GRIEVANCE_FORM);
  const [showToast, toastNode] = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch("/grievances/my"); setGrievances(Array.isArray(d) ? d : []); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit(e) {
    e.preventDefault();
    if (!form.subject.trim()) return showToast("Subject is required", "error");
    if (!form.description.trim()) return showToast("Description is required", "error");
    try { await apiFetch("/grievances/submit", { method: "POST", body: JSON.stringify(form) }); showToast("Grievance submitted confidentially"); setShowModal(false); setForm(EMPTY_GRIEVANCE_FORM); load(); } catch (e) { showToast(e.message, "error"); }
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>POSH / Grievance</h1><p style={{ color: "var(--muted)", marginTop: 4 }}>Confidential grievance submission & tracking</p></div>
        <button className="btn-primary" onClick={() => { setForm(EMPTY_GRIEVANCE_FORM); setShowModal(true); }}>+ New Grievance</button>
      </div>
      <div className="card">
        {loading ? <Loader /> : grievances.length === 0 ? <EmptyState icon="🛡" title="No grievances" sub="Submit a grievance to get started" /> : (
          <div>{grievances.map((g, i) => (
            <div key={i} style={{ padding: 24, borderBottom: "1px solid var(--border)", display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#ef4444", minWidth: 40 }}>#{grievances.length - i}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700 }}>{g.subject}</span>
                  <span className="chip">{g.category}</span>
                  {g.is_anonymous ? (
                    <span className="chip" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", fontWeight: 700, border: "1px solid rgba(239,68,68,0.3)" }}>
                      🕵️ ANONYMOUS GRIEVANCE 🔒
                    </span>
                  ) : null}
                  <StatusBadge status={g.is_resolved ? "resolved" : "open"} />
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                  👤 {g.is_anonymous ? "Anonymous Employee" : "Submitted by You"} · 📅 {fmtDate(g.submitted_on)}
                </div>
                <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>{g.description}</div>
                {g.admin_notes && <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(16,185,129,0.1)", borderRadius: 8, fontSize: 13, color: "#10b981" }}>💬 Admin Response{g.responded_by_name ? ` by ${g.responded_by_name}` : ""}: {g.admin_notes}</div>}
              </div>
            </div>
          ))}</div>
        )}
      </div>
      {showModal && (
        <Modal title="Submit Grievance" onClose={() => setShowModal(false)}
          footer={<><button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-primary" onClick={submit}>Submit Confidentially</button></>}>
          <div style={{ padding: "12px 16px", background: "rgba(99,102,241,0.1)", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#a5b4fc" }}>🔒 Your submission is strictly confidential.</div>
          <div className="form-group"><label className="label">Subject <span style={{ color: "#ef4444" }}>*</span></label><input className="input" placeholder="Brief subject…" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} /></div>
          <div className="form-group"><label className="label">Category</label><select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}><option>General</option><option>Payroll</option><option>Harassment</option><option>Other</option></select></div>
          <div className="form-group"><label className="label">Description <span style={{ color: "#ef4444" }}>*</span></label><textarea className="input" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}><input type="checkbox" checked={form.is_anonymous} onChange={(e) => setForm((f) => ({ ...f, is_anonymous: e.target.checked }))} /> Submit anonymously</label>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
