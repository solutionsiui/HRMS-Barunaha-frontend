"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/formatters";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/hooks/useToast";

export default function PoliciesPage() {
  const { role } = useAuth();
  const isHROrAdmin = role === "hr" || role === "admin";
  const isAdmin = role === "admin";
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("general");
  const [open, setOpen] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ title: "", category: "General", content: "" });
  const [showToast, toastNode] = useToast();

  async function load() {
    apiFetch("/policies/").then((d) => setPolicies(Array.isArray(d) ? d : [])).catch(() => setPolicies([])).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const general = policies.filter((p) => p.category !== "POSH");
  const posh = policies.filter((p) => p.category === "POSH");
  const list = tab === "posh" ? posh : general;

  async function createPolicy() {
    if (!form.title.trim()) return showToast("Policy title is required", "error");
    if (!form.content.trim()) return showToast("Policy content is required", "error");
    try {
      await apiFetch("/policies/", { method: "POST", body: JSON.stringify(form) });
      showToast("Policy created!");
      setShowAdd(false);
      setForm({ title: "", category: "General", content: "" });
      load();
    } catch (e) { showToast(e.message, "error"); }
  }

  async function updatePolicy() {
    if (!String(editItem?.title || "").trim()) return showToast("Policy title is required", "error");
    if (!String(editItem?.content || "").trim()) return showToast("Policy content is required", "error");
    try {
      await apiFetch(`/policies/${editItem.id}`, { method: "PUT", body: JSON.stringify(editItem) });
      showToast("Policy updated!");
      setEditItem(null);
      load();
    } catch (e) { showToast(e.message, "error"); }
  }

  async function deletePolicy(id) {
    if (!confirm("Delete this policy?")) return;
    try {
      await apiFetch(`/policies/${id}`, { method: "DELETE" });
      showToast("Policy deleted");
      load();
    } catch (e) { showToast(e.message, "error"); }
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Company Policies</h1><p style={{ color: "var(--muted)", marginTop: 4 }}>Guidelines and compliance documents</p></div>{isHROrAdmin && <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Policy</button>}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button className={`btn-${tab === "general" ? "primary" : "ghost"}`} onClick={() => setTab("general")}>📋 Company Policies</button>
        <button className={`btn-${tab === "posh" ? "primary" : "ghost"}`} style={tab === "posh" ? { background: "#ef4444" } : {}} onClick={() => setTab("posh")}>🚨 POSH Guidelines</button>
      </div>
      {tab === "posh" && (
        <div style={{ padding: "16px 20px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, marginBottom: 20, fontSize: 14, color: "#fca5a5" }}>
          🚨 The POSH Act, 2013 mandates a safe, respectful workplace for all. These policies are strictly enforced.
        </div>
      )}
      {loading ? <Loader /> : list.length === 0 ? <EmptyState icon="📋" title="No policies added yet" /> :
        list.map((p, i) => (
          <div key={i} className="card" style={{ marginBottom: 10, overflow: "hidden", borderColor: tab === "posh" ? "rgba(239,68,68,0.2)" : "var(--border)" }}>
            <div onClick={() => setOpen(open === i ? null : i)} style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{tab === "posh" ? "🚨 " : "📄 "}{p.title}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  👤 Added By: {p.created_by_name || "HR Admin"} ({p.created_by_role || "Admin/HR"}) · 📅 Published: {fmtDate(p.created_at || p.updated_at)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {isHROrAdmin && <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12 }} onClick={(e) => { e.stopPropagation(); setEditItem(p); }}>Edit</button>}
                {isAdmin && <button className="btn-ghost" style={{ padding: "4px 8px", fontSize: 12, color: "var(--danger)" }} onClick={(e) => { e.stopPropagation(); deletePolicy(p.id); }}>Delete</button>}
                <span style={{ color: "var(--muted)", fontSize: 20, transform: open === i ? "rotate(90deg)" : "", transition: "transform 0.2s" }}>›</span>
              </div>
            </div>
            {open === i && (
              <div style={{ padding: "0 24px 24px", fontSize: 14, color: "var(--muted)", lineHeight: 1.8, borderTop: "1px solid var(--border)", paddingTop: 16, whiteSpace: "pre-wrap" }}>
                {p.content}
              </div>
            )}
          </div>
        ))
      }
      {showAdd && (
        <Modal title="Add Policy" onClose={() => setShowAdd(false)}
          footer={<><button className="btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn-primary" onClick={createPolicy}>Create</button></>}>
          <div className="form-group"><label className="label">Title <span style={{ color: "#ef4444" }}>*</span></label><input className="input" required value={form.title} onChange={(e) => setForm((item) => ({ ...item, title: e.target.value }))} /></div>
          <div className="form-group"><label className="label">Category <span style={{ color: "#ef4444" }}>*</span></label><select className="input" required value={form.category} onChange={(e) => setForm((item) => ({ ...item, category: e.target.value }))}><option value="General">General</option><option value="POSH">POSH</option><option value="Leave">Leave</option></select></div>
          <div className="form-group"><label className="label">Content <span style={{ color: "#ef4444" }}>*</span></label><textarea className="input" required rows={6} value={form.content} onChange={(e) => setForm((item) => ({ ...item, content: e.target.value }))} /></div>
        </Modal>
      )}
      {editItem && (
        <Modal title={`Edit: ${editItem.title}`} onClose={() => setEditItem(null)}
          footer={<><button className="btn-ghost" onClick={() => setEditItem(null)}>Cancel</button><button className="btn-primary" onClick={updatePolicy}>Save</button></>}>
          <div className="form-group"><label className="label">Title <span style={{ color: "#ef4444" }}>*</span></label><input className="input" required value={editItem.title} onChange={(e) => setEditItem((item) => ({ ...item, title: e.target.value }))} /></div>
          <div className="form-group"><label className="label">Category</label><select className="input" value={editItem.category} onChange={(e) => setEditItem((item) => ({ ...item, category: e.target.value }))}><option value="General">General</option><option value="POSH">POSH</option><option value="Leave">Leave</option></select></div>
          <div className="form-group"><label className="label">Content <span style={{ color: "#ef4444" }}>*</span></label><textarea className="input" required rows={6} value={editItem.content || ""} onChange={(e) => setEditItem((item) => ({ ...item, content: e.target.value }))} /></div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
