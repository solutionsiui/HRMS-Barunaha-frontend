"use client";

import { useState, useEffect } from "react";
import { apiFetch, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/useToast";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";

export default function BGVPage() {
  const { role, user } = useAuth();
  const canManageOthers = role === "hr" || role === "admin";
  const canDelete = role === "admin";
  const [bgv, setBgv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [form, setForm] = useState({ ref_name: "", ref_post: "", ref_organization: "", ref_phone: "", dependents: [{ name: "", relation: "", phone: "" }] });
  const [showToast, toastNode] = useToast();

  async function loadBGV(targetEmpId = selectedEmpId) {
    try {
      const query = canManageOthers && targetEmpId ? `?emp_id=${encodeURIComponent(targetEmpId)}` : "";
      const data = await apiFetch(`/bgv/me${query}`);
      setBgv(data);
      setForm({
        ref_name: data?.ref_name || "",
        ref_post: data?.ref_post || "",
        ref_organization: data?.ref_organization || "",
        ref_phone: data?.ref_phone || "",
        dependents: data?.dependents?.length ? data.dependents : [{ name: "", relation: "", phone: "" }],
      });
    } catch (error) {
      showToast(error.message, "error");
    }
    setLoading(false);
  }

  async function loadEmployeeOptions() {
    if (!canManageOthers) return;
    setLoadingEmployees(true);
    try {
      const data = await apiFetch("/bgv/employees");
      const list = Array.isArray(data?.employees) ? data.employees : [];
      setEmployees(list);
      const preferred = selectedEmpId || user?.emp_id || list[0]?.emp_id || "";
      if (preferred) setSelectedEmpId(preferred);
      return preferred;
    } catch (error) {
      showToast(error.message, "error");
      return "";
    } finally {
      setLoadingEmployees(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    async function init() {
      setLoading(true);
      if (canManageOthers) {
        const preferred = await loadEmployeeOptions();
        if (!mounted) return;
        await loadBGV(preferred || selectedEmpId);
        return;
      }
      await loadBGV("");
    }
    init();
    return () => { mounted = false; };
  }, [canManageOthers]);

  useEffect(() => {
    if (!canManageOthers || !selectedEmpId) return;
    setLoading(true);
    loadBGV(selectedEmpId);
  }, [canManageOthers, selectedEmpId]);

  function removeDependent(i) {
    setForm((f) => ({
      ...f,
      dependents: f.dependents.filter((_, idx) => idx !== i),
    }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.ref_name.trim()) {
      showToast("Reference Name is required", "error");
      return;
    }
    if (!form.ref_organization.trim()) {
      showToast("Reference Organization is required", "error");
      return;
    }
    const cleanPhone = (form.ref_phone || "").replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      showToast("Reference Phone must be a 10-digit numeric number", "error");
      return;
    }

    const dependents = (form.dependents || [])
      .map((dep) => ({
        name: (dep.name || "").trim(),
        relation: (dep.relation || "").trim(),
        phone: (dep.phone || "").replace(/\D/g, "").slice(0, 10),
        dob: dep.dob || null,
      }))
      .filter((dep) => dep.name || dep.relation || dep.phone || dep.dob)
      .slice(0, 3);

    const payload = {
      ref_name: (form.ref_name || "").trim(),
      ref_post: (form.ref_post || "").trim(),
      ref_organization: (form.ref_organization || "").trim(),
      ref_phone: cleanPhone,
      dependents,
    };

    const query = canManageOthers && selectedEmpId ? `?emp_id=${encodeURIComponent(selectedEmpId)}` : "";
    try {
      await apiFetch(`/bgv/submit${query}`, { method: "POST", body: JSON.stringify(payload) });
      showToast("BGV submitted successfully!");
      setShowModal(false);
      await loadBGV(selectedEmpId);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function addDependent() {
    if (form.dependents.length >= 3) return;
    setForm((f) => ({ ...f, dependents: [...f.dependents, { name: "", relation: "", phone: "" }] }));
  }
  function updateDep(i, k, v) { setForm((f) => ({ ...f, dependents: f.dependents.map((d, j) => j === i ? { ...d, [k]: v } : d) })); }

  function openBGVModal() {
    setForm({
      ref_name: bgv?.ref_name || "",
      ref_post: bgv?.ref_post || "",
      ref_organization: bgv?.ref_organization || "",
      ref_phone: bgv?.ref_phone || "",
      dependents: bgv?.dependents?.length
        ? bgv.dependents.map((item) => ({ ...item }))
        : [{ name: "", relation: "", phone: "" }],
    });
    setShowModal(true);
  }

  async function deleteBGV() {
    if (!selectedEmpId || !window.confirm(`Delete all BGV and dependent details for ${selectedEmpId}?`)) return;
    try {
      await apiFetch(`/bgv/${encodeURIComponent(selectedEmpId)}`, { method: "DELETE" });
      showToast("BGV and dependent details deleted");
      await loadBGV(selectedEmpId);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function downloadBGV(mode = "selected") {
    const token = getToken();
    const query = mode === "all"
      ? "department=All"
      : `emp_id=${encodeURIComponent(selectedEmpId)}&department=All`;
    try {
      const response = await fetch(`/api/proxy/exports/bgv?${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("content-disposition") || "";
      const match = contentDisposition.match(/filename="?([^"]+)"?/i);
      const suggestedName = match?.[1] || (mode === "all" ? "BGV_allemp.pdf" : "BGV_report.pdf");
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = suggestedName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast("BGV download started");
    } catch (error) {
      showToast(error.message || "Download failed", "error");
    }
  }

  const selectedEmployeeMeta = employees.find((employee) => employee.emp_id === selectedEmpId);

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>BGV & Dependents</h1>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>
            {canManageOthers
              ? "HR/Admin can manage BGV records for any employee and download selected or all reports."
              : "Background verification & dependent details"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canManageOthers ? (
            <>
              <button className="btn-ghost" onClick={() => downloadBGV("all")}>⬇ Download All BGV</button>
              <button className="btn-ghost" disabled={!selectedEmpId} onClick={() => downloadBGV("selected")}>⬇ Download Selected BGV</button>
            </>
          ) : null}
          {canDelete && selectedEmpId ? <button className="btn-danger" onClick={deleteBGV}>Delete BGV</button> : null}
          <button className="btn-primary" onClick={openBGVModal}>{bgv ? "Update BGV" : "+ Submit BGV"}</button>
        </div>
      </div>
      {canManageOthers ? (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="form-row">
            <div className="form-group">
              <label className="label">Select Employee (Emp ID - Name)</label>
              <select
                className="input"
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                disabled={loadingEmployees}
              >
                {employees.map((employee) => (
                  <option key={employee.emp_id} value={employee.emp_id}>
                    {employee.emp_id} - {employee.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {selectedEmployeeMeta ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
              Viewing: <strong style={{ color: "var(--text)" }}>{selectedEmployeeMeta.emp_id} - {selectedEmployeeMeta.name}</strong>
            </div>
          ) : null}
        </div>
      ) : null}
      {loading ? <Loader /> : !bgv ? <EmptyState icon="🛡" title="BGV not submitted" sub="Submit your background verification details to proceed" /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16 }}>
          <div className="card" style={{ padding: 24 }}>
            <h3 className="syne" style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📋 Reference Details</h3>
            {[["Name", bgv.ref_name], ["Post", bgv.ref_post], ["Organization", bgv.ref_organization], ["Phone", bgv.ref_phone]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
                <span style={{ color: "var(--muted)" }}>{k}</span><span style={{ fontWeight: 600 }}>{v || "—"}</span>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 24 }}>
            <h3 className="syne" style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>👨‍👩‍👧 Dependents</h3>
            {bgv.dependents?.length ? bgv.dependents.map((d, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
                <div style={{ fontWeight: 700 }}>{d.name} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({d.relation})</span></div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>Phone: {d.phone || "—"}</div>
              </div>
            )) : <div style={{ color: "var(--muted)", fontSize: 14 }}>No dependents added</div>}
          </div>
        </div>
      )}
      {showModal && (
        <Modal title="BGV Submission" onClose={() => setShowModal(false)}
          footer={<><button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button><button className="btn-primary" onClick={submit}>Submit BGV</button></>}>
          <div className="card" style={{ padding: 16, marginBottom: 16, background: "rgba(255,255,255,0.02)" }}>
            <h4 style={{ fontWeight: 700, marginBottom: 12, fontSize: 14, color: "var(--text)" }}>📋 Reference Contact</h4>
            <div className="form-row">
              <div className="form-group">
                <label className="label" style={{ fontWeight: 700, color: "var(--text)" }}>Name <span style={{ color: "#ef4444" }}>*</span></label>
                <input className="input" placeholder="e.g. Rahul Sharma" value={form.ref_name} onChange={(e) => setForm((f) => ({ ...f, ref_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label" style={{ fontWeight: 700, color: "var(--text)" }}>Designation</label>
                <input className="input" placeholder="e.g. Engineering Manager" value={form.ref_post} onChange={(e) => setForm((f) => ({ ...f, ref_post: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label" style={{ fontWeight: 700, color: "var(--text)" }}>Organization <span style={{ color: "#ef4444" }}>*</span></label>
                <input className="input" placeholder="e.g. Tech Corp" value={form.ref_organization} onChange={(e) => setForm((f) => ({ ...f, ref_organization: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="label" style={{ fontWeight: 700, color: "var(--text)" }}>Phone Number (10 digits) <span style={{ color: "#ef4444" }}>*</span></label>
                <input className="input" maxLength={10} placeholder="e.g. 9876543210" value={form.ref_phone} onChange={(e) => setForm((f) => ({ ...f, ref_phone: e.target.value.replace(/\D/g, "") }))} />
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 16, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", margin: 0 }}>👨‍👩‍👧 Dependents (max 3)</h4>
              {form.dependents.length < 3 && (
                <button type="button" className="btn-ghost" onClick={addDependent} style={{ fontSize: 12, padding: "4px 10px" }}>
                  + Add Dependent
                </button>
              )}
            </div>
            {form.dependents.map((d, i) => (
              <div key={i} style={{ padding: 12, background: "rgba(255,255,255,0.03)", borderRadius: 8, marginBottom: 10, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>Dependent #{i + 1}</span>
                  {form.dependents.length > 1 && (
                    <button type="button" className="btn-danger" onClick={() => removeDependent(i)} style={{ fontSize: 11, padding: "2px 8px" }}>
                      - Remove
                    </button>
                  )}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="label" style={{ fontWeight: 700, color: "var(--text)" }}>Name</label>
                    <input className="input" placeholder="e.g. Sunita Devi" value={d.name} onChange={(e) => updateDep(i, "name", e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label" style={{ fontWeight: 700, color: "var(--text)" }}>Relation</label>
                    <input className="input" placeholder="e.g. Mother / Spouse" value={d.relation} onChange={(e) => updateDep(i, "relation", e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="label" style={{ fontWeight: 700, color: "var(--text)" }}>Phone Number</label>
                    <input className="input" type="tel" maxLength={10} placeholder="e.g. 9876543210" value={d.phone} onChange={(e) => updateDep(i, "phone", e.target.value.replace(/\D/g, ""))} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {toastNode}
    </div>
  );
}
