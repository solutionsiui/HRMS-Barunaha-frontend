"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { fmtDate } from "@/lib/formatters";
import Modal from "@/components/ui/Modal";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import Loader from "@/components/ui/Loader";
import { useAuth } from "@/lib/auth-context";

export default function GrievancesHRPage() {
  const { role } = useAuth();
  const canRespond = role === "admin";
  const [grievances, setGrievances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [respondModal, setRespondModal] = useState(null);
  const [responseForm, setResponseForm] = useState({ admin_notes: "", is_resolved: false });
  const [currentPage, setCurrentPage] = useState(1);
  const PER_PAGE = 10;
  const [showToast, toastNode] = useToast();

  const safePage = Math.min(currentPage, Math.max(1, Math.ceil(grievances.length / PER_PAGE)));
  const paginatedGrievances = grievances.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch("/grievances/all"); setGrievances(Array.isArray(d) ? d : []); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function respond(id) {
    try { await apiFetch(`/grievances/${id}/update`, { method: "POST", body: JSON.stringify(responseForm) }); showToast("Response saved"); setRespondModal(null); load(); } catch (e) { showToast(e.message, "error"); }
  }

  const open = grievances.filter((g) => !g.is_resolved).length;
  const resolved = grievances.filter((g) => g.is_resolved).length;

  return (
    <div>
      <div className="page-header"><h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>{canRespond ? "Admin Grievance Management" : "All Grievances"}</h1><p style={{ color: "var(--muted)", marginTop: 4 }}>{canRespond ? "Confidential grievance management" : "Read-only grievance review; final responses are managed by Admin"}</p></div>
      <div className="grid-stats" style={{ marginBottom: 24 }}>
        <StatCard icon="📋" label="Total Filed" value={grievances.length} />
        <StatCard icon="⏳" label="Open" value={open} accent="#f59e0b" />
        <StatCard icon="✅" label="Resolved" value={resolved} accent="#10b981" />
      </div>
      <div className="card">
        {loading ? <Loader /> : grievances.length === 0 ? <EmptyState icon="🛡" title="No grievances filed yet" /> : (
          <div>
            <div>{paginatedGrievances.map((g, i) => (
              <div key={i} style={{ padding: 24, borderBottom: "1px solid var(--border)", display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: "#ef4444", minWidth: 40 }}>#{(safePage - 1) * PER_PAGE + i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700 }}>{g.subject}</span>
                    <span className="chip">{g.category}</span>
                    {g.is_anonymous || !g.submitted_by_name || g.submitted_by_name === "Anonymous" ? (
                      <span className="chip" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", fontWeight: 700, border: "1px solid rgba(239,68,68,0.3)" }}>🕵️ ANONYMOUS GRIEVANCE 🔒</span>
                    ) : null}
                    <StatusBadge status={g.is_resolved ? "resolved" : "open"} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                    👤 {g.is_anonymous || g.submitted_by_name === "Anonymous" ? "Anonymous Employee" : (g.submitted_by_name || "Anonymous")} · 📅 {fmtDate(g.submitted_on)}
                  </div>
                  <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>{g.description}</div>
                  {g.admin_notes && <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(16,185,129,0.1)", borderRadius: 8, fontSize: 13, color: "#10b981" }}>💬 Admin Response{g.responded_by_name ? ` by ${g.responded_by_name}` : ""}: {g.admin_notes}</div>}
                </div>
                {canRespond && !g.is_resolved && <button className="btn-ghost" style={{ padding: "8px 16px", fontSize: 13, flexShrink: 0 }} onClick={() => { setRespondModal(g); setResponseForm({ admin_notes: g.admin_notes || "", is_resolved: false }); }}>Respond</button>}
              </div>
            ))}</div>
            <Pagination
              currentPage={safePage}
              totalItems={grievances.length}
              pageSize={PER_PAGE}
              onPageChange={(p) => setCurrentPage(p)}
            />
          </div>
        )}
      </div>
      {respondModal && (
        <Modal title={`Respond: ${respondModal.subject}`} onClose={() => setRespondModal(null)}
          footer={<><button className="btn-ghost" onClick={() => setRespondModal(null)}>Cancel</button><button className="btn-primary" onClick={() => respond(respondModal.id)}>Save Response</button></>}>
          <div style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>{respondModal.description}</div>
          <div className="form-group"><label className="label">Response / Notes</label><textarea className="input" rows={3} value={responseForm.admin_notes} onChange={(e) => setResponseForm((f) => ({ ...f, admin_notes: e.target.value }))} /></div>
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 14 }}><input type="radio" checked={!responseForm.is_resolved} onChange={() => setResponseForm((f) => ({ ...f, is_resolved: false }))} /> Keep Open</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 14 }}><input type="radio" checked={responseForm.is_resolved} onChange={() => setResponseForm((f) => ({ ...f, is_resolved: true }))} /> Mark Resolved</label>
          </div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
