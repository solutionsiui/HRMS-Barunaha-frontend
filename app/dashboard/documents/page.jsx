"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { apiFetch, getToken } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";
import Modal from "@/components/ui/Modal";

const DOC_TYPES = [
  { id: "resume_cv", label: "Resume / CV", icon: "📄" },
  { id: "aadhar_card", label: "Aadhar Card", icon: "🆔" },
  { id: "pan_card_doc", label: "PAN Card", icon: "💳" },
  { id: "tenth_mark", label: "10th Marksheet", icon: "🎓" },
  { id: "twelfth_mark", label: "12th Marksheet", icon: "📜" },
  { id: "graduation", label: "Graduation Degree", icon: "🧑‍🎓" },
  { id: "experience_letter", label: "Experience Letter", icon: "💼" },
  { id: "passbook", label: "Bank Passbook", icon: "🏦" },
  { id: "master_photo", label: "Master Photo", icon: "📸" },
];

const DOC_STATUS_STYLES = {
  missing: { background: "rgba(100,116,139,0.12)", color: "#475569" },
  pending_review: { background: "rgba(245,158,11,0.14)", color: "#b45309" },
  approved: { background: "rgba(16,185,129,0.14)", color: "#047857" },
};

const OVERALL_STATUS_STYLES = {
  not_started: { background: "rgba(100,116,139,0.12)", color: "#475569" },
  incomplete: { background: "rgba(239,68,68,0.12)", color: "#b91c1c" },
  review_pending: { background: "rgba(245,158,11,0.14)", color: "#b45309" },
  completed: { background: "rgba(16,185,129,0.14)", color: "#047857" },
};

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sanitizeFileName(value) {
  return String(value || "document").replace(/[^a-z0-9-_]+/gi, "_");
}

function triggerDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function toProxyUrl(path) {
  if (!path) return null;
  return path.startsWith("/api/proxy") ? path : `/api/proxy${path}`;
}

function getFileNameFromDisposition(headerValue, fallback) {
  if (!headerValue) return fallback;
  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {}
  }
  const simpleMatch = headerValue.match(/filename="?([^"]+)"?/i);
  return simpleMatch?.[1] || fallback;
}

function renderPreviewLoading(previewWindow, label) {
  if (!previewWindow) return;
  previewWindow.document.write(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Opening ${label}</title>
        <style>
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #f8fafc;
            color: #0f172a;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          .card {
            width: min(420px, calc(100vw - 32px));
            padding: 28px 24px;
            border-radius: 18px;
            background: #ffffff;
            border: 1px solid rgba(148, 163, 184, 0.24);
            box-shadow: 0 18px 45px rgba(15, 23, 42, 0.12);
            text-align: center;
          }
          .spinner {
            width: 40px;
            height: 40px;
            margin: 0 auto 16px;
            border-radius: 999px;
            border: 3px solid rgba(15, 23, 42, 0.12);
            border-top-color: #10b981;
            animation: spin 0.8s linear infinite;
          }
          h1 {
            margin: 0 0 8px;
            font-size: 18px;
          }
          p {
            margin: 0;
            font-size: 14px;
            color: #475569;
            line-height: 1.5;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="spinner"></div>
          <h1>Opening ${label}</h1>
          <p>The file is loading in this tab. Please wait.</p>
        </div>
      </body>
    </html>
  `);
  previewWindow.document.close();
}

export default function DocumentsPage() {
  const { user, role } = useAuth();
  const isHR = role === "hr";
  const isAdmin = role === "admin";
  const isAccounts = role === "accounts";
  const [teamEmployees, setTeamEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [documentData, setDocumentData] = useState(null);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [mode, setMode] = useState("team");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFiles, setBulkFiles] = useState({});
  const [showToast, toastNode] = useToast();

  const canSeeTeam = isHR || isAdmin || isAccounts;
  const canToggleOwnView = isHR || isAccounts;
  const teamViewActive = canSeeTeam && mode !== "mine";

  const loadTeamSummary = useCallback(async () => {
    if (!canSeeTeam) return;
    setLoadingTeam(true);
    try {
      const res = await apiFetch("/documents/team-summary");
      setTeamEmployees(Array.isArray(res?.employees) ? res.employees : []);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setLoadingTeam(false);
    }
  }, [canSeeTeam, showToast]);

  const loadDocs = useCallback(async (empId) => {
    if (!empId) return;
    setLoadingDocs(true);
    try {
      const res = await apiFetch(`/documents/${empId}`);
      setDocumentData(res);
    } catch (error) {
      showToast(error.message, "error");
      setDocumentData(null);
    } finally {
      setLoadingDocs(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadTeamSummary();
  }, [loadTeamSummary]);

  useEffect(() => {
    if (isAccounts) {
      setMode((current) => (current === "team" ? "mine" : current));
    }
  }, [isAccounts]);

  useEffect(() => {
    if (!user) return;

    if (!canSeeTeam) {
      setSelectedEmp(user);
      return;
    }

    if ((isHR || isAccounts) && mode === "mine") {
      setSelectedEmp(user);
      return;
    }

    setSelectedEmp((current) => {
      if (current?.emp_id) {
        const existing = teamEmployees.find((employee) => employee.emp_id === current.emp_id);
        if (existing) return existing;
      }
      return teamEmployees[0] || null;
    });
  }, [canSeeTeam, isAccounts, isHR, mode, teamEmployees, user]);

  useEffect(() => {
    const selectedEmpId = selectedEmp?.emp_id;
    if (selectedEmpId) {
      loadDocs(selectedEmpId);
    } else {
      setDocumentData(null);
    }
  }, [loadDocs, selectedEmp?.emp_id]);

  const visibleDocTypes = useMemo(() => {
    if (!documentData?.docs) {
      return isAccounts ? DOC_TYPES.filter((doc) => doc.id === "passbook") : DOC_TYPES;
    }
    return DOC_TYPES.filter((doc) => documentData.docs[doc.id]);
  }, [documentData, isAccounts]);

  const uploadedDocs = useMemo(
    () => visibleDocTypes
      .map((doc) => ({ ...doc, meta: documentData?.docs?.[doc.id] }))
      .filter((doc) => doc.meta?.url),
    [documentData, visibleDocTypes]
  );

  const pendingDocs = useMemo(
    () => visibleDocTypes
      .map((doc) => ({ ...doc, meta: documentData?.docs?.[doc.id] }))
      .filter((doc) => doc.meta?.status === "pending_review"),
    [documentData, visibleDocTypes]
  );
  const bulkEligibleDocTypes = useMemo(
    () => visibleDocTypes.filter((doc) => {
      const meta = documentData?.docs?.[doc.id];
      return isHR || selectedEmp?.emp_id !== user?.emp_id || meta?.status !== "approved";
    }),
    [documentData, isHR, selectedEmp?.emp_id, user?.emp_id, visibleDocTypes]
  );

  const detailName = documentData?.employee
    ? `${documentData.employee.first_name || ""} ${documentData.employee.last_name || ""}`.trim()
    : `${selectedEmp?.first_name || ""} ${selectedEmp?.last_name || ""}`.trim();
  const canUpload = Boolean(documentData?.can_upload && selectedEmp?.emp_id);
  const canReview = Boolean(documentData?.can_review && selectedEmp?.emp_id);

  async function refreshAfterMutation(empId) {
    await loadDocs(empId);
    if (canSeeTeam) {
      await loadTeamSummary();
    }
  }

  async function handleUpload(docType, file) {
    if (!file || !selectedEmp?.emp_id) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("Document cannot exceed 5MB", "error");
      return;
    }
    setUploading(docType);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await apiFetch(`/documents/${selectedEmp.emp_id}/upload/${docType}`, {
        method: "POST",
        body: formData,
        headers: {},
      });
      showToast(res?.message || "Document uploaded");
      await refreshAfterMutation(selectedEmp.emp_id);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setUploading(null);
    }
  }

  async function handleBulkUpload() {
    if (!selectedEmp?.emp_id) return;
    const entries = Object.entries(bulkFiles).filter(([, file]) => file);
    if (entries.length === 0) {
      showToast("Select at least one document", "error");
      return;
    }
    if (entries.some(([, file]) => file.size > 5 * 1024 * 1024)) {
      showToast("Each document must be 5MB or smaller", "error");
      return;
    }

    setUploading("bulk");
    const formData = new FormData();
    entries.forEach(([docType, file]) => {
      formData.append(docType, file);
    });

    try {
      const res = await apiFetch(`/documents/${selectedEmp.emp_id}/upload-batch`, {
        method: "POST",
        body: formData,
        headers: {},
      });
      showToast(res?.message || "Documents uploaded");
      setBulkOpen(false);
      setBulkFiles({});
      await refreshAfterMutation(selectedEmp.emp_id);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setUploading(null);
    }
  }

  async function handleDelete(docType, label = "document") {
    if (!selectedEmp?.emp_id) return;
    if (!window.confirm(`Are you sure you want to delete ${label}? This action cannot be undone.`)) return;
    try {
      const res = await apiFetch(`/documents/${selectedEmp.emp_id}/${docType}`, { method: "DELETE" });
      showToast(res?.message || "Document deleted");
      await refreshAfterMutation(selectedEmp.emp_id);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function handleApprove(docType) {
    if (!selectedEmp?.emp_id) return;
    setReviewing(docType);
    try {
      const res = await apiFetch(`/documents/${selectedEmp.emp_id}/review/${docType}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      showToast(res?.message || "Document marked as completed");
      await refreshAfterMutation(selectedEmp.emp_id);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setReviewing(null);
    }
  }

  async function handleApproveAll() {
    if (!selectedEmp?.emp_id) return;
    setReviewing("all");
    try {
      const res = await apiFetch(`/documents/${selectedEmp.emp_id}/review-all`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      showToast(res?.message || "All documents marked as completed");
      await refreshAfterMutation(selectedEmp.emp_id);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setReviewing(null);
    }
  }

  async function fetchProtectedDocument(path) {
    const proxyUrl = toProxyUrl(path);
    const token = getToken();
    const response = await fetch(proxyUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload?.detail || "Unable to open document");
    }
    return response;
  }

  async function handleViewDocument(meta) {
    if (!meta?.url) return;
    const previewWindow = window.open("", "_blank");
    renderPreviewLoading(previewWindow, meta.file_name || "document");
    try {
      const response = await fetchProtectedDocument(meta.url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (previewWindow) {
        previewWindow.location.replace(objectUrl);
      } else {
        window.location.assign(objectUrl);
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }
      showToast(error.message, "error");
    }
  }

  async function handleDownloadDocument(meta, label) {
    if (!meta?.download_url && !meta?.url) return;
    try {
      const response = await fetchProtectedDocument(meta.download_url || `${meta.url}?download=1`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const fallbackName = `${sanitizeFileName(selectedEmp?.emp_id)}_${sanitizeFileName(label)}`;
      const fileName = getFileNameFromDisposition(response.headers.get("content-disposition"), fallbackName);
      triggerDownload(objectUrl, fileName);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function handleDownloadAll() {
    if (!selectedEmp?.emp_id) return;
    for (const doc of uploadedDocs) {
      // Keep downloads sequential so the browser does not suppress them as spam.
      // eslint-disable-next-line no-await-in-loop
      await handleDownloadDocument(doc.meta, doc.label);
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Document Vault</h1>
          <p style={{ color: "var(--muted)", marginTop: 4 }}>
            {isAdmin
              ? "Admin has read-only visibility into employee document progress."
              : isHR
                ? "HR can upload, review, complete, and download documents for every employee."
                : isAccounts
                  ? "Accounts can upload their own passbook, and can switch to team passbook audit when needed."
                  : "Upload your documents one by one or submit multiple documents together for HR review."}
          </p>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#60a5fa" }}>
            ℹ️ <b>Allowed File Types:</b> PDF, DOCX, PNG, JPG &nbsp;·&nbsp; <b>Max File Size:</b> 5 MB per document
          </div>
        </div>
        {selectedEmp?.emp_id && documentData ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span
              className="chip"
              style={{
                background: OVERALL_STATUS_STYLES[documentData.overall_status]?.background,
                color: OVERALL_STATUS_STYLES[documentData.overall_status]?.color,
                fontWeight: 700,
              }}
            >
              {documentData.overall_status_label}
            </span>
            {uploadedDocs.length > 0 ? (
              <button className="btn-ghost" onClick={handleDownloadAll}>Download Uploaded</button>
            ) : null}
            {canUpload && bulkEligibleDocTypes.length > 0 ? (
              <button className="btn-primary" onClick={() => setBulkOpen(true)}>Upload Multiple</button>
            ) : null}
            {canReview && pendingDocs.length > 0 ? (
              <button className="btn-primary" onClick={handleApproveAll} disabled={reviewing === "all"}>
                {reviewing === "all" ? "Completing..." : "Complete All Pending"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {isAdmin ? (
        <div className="card" style={{ padding: 18, marginBottom: 24, background: "rgba(59,130,246,0.08)" }}>
          Admin view is read-only here. HR owns uploads and document review.
        </div>
      ) : null}

      {canToggleOwnView ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <button className={mode === "team" ? "btn-primary" : "btn-ghost"} onClick={() => setMode("team")}>Team Documents</button>
          <button className={mode === "mine" ? "btn-primary" : "btn-ghost"} onClick={() => setMode("mine")}>My Documents</button>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: teamViewActive ? "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" : "1fr", gap: 24, alignItems: "start" }}>
        {teamViewActive ? (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>Employees</h3>
              {loadingTeam ? <span style={{ fontSize: 12, color: "var(--muted)" }}>Loading...</span> : null}
            </div>
            {loadingTeam ? (
              <Loader />
            ) : teamEmployees.length === 0 ? (
              <EmptyState icon="📁" title="No employees" sub="No active employees found for document review." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {teamEmployees.map((employee) => (
                  <button
                    key={employee.emp_id}
                    onClick={() => setSelectedEmp(employee)}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: selectedEmp?.emp_id === employee.emp_id ? "color-mix(in srgb, var(--accent) 14%, var(--surface2))" : "transparent",
                      color: "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{employee.first_name} {employee.last_name}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{employee.emp_id} • {employee.department || "No department"}</div>
                      </div>
                      <span
                        className="chip"
                        style={{
                          background: OVERALL_STATUS_STYLES[employee.overall_status]?.background,
                          color: OVERALL_STATUS_STYLES[employee.overall_status]?.color,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {employee.overall_status_label}
                      </span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
                      {employee.counts?.approved || 0}/{employee.counts?.total_required || 0} completed
                      {employee.counts?.pending_review ? ` • ${employee.counts.pending_review} pending` : ""}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="card" style={{ padding: 24 }}>
          {loadingTeam && teamViewActive && !selectedEmp ? (
            <Loader />
          ) : !selectedEmp ? (
            <EmptyState icon="📁" title="Select an employee" sub="Choose an employee to view document details." />
          ) : loadingDocs ? (
            <Loader />
          ) : !documentData ? (
            <EmptyState icon="📄" title="No document data" sub="The document details could not be loaded." />
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h2 className="syne" style={{ fontSize: 18, fontWeight: 700 }}>{detailName || selectedEmp.emp_id}&apos;s Documents</h2>
                  <p style={{ color: "var(--muted)", marginTop: 4, fontSize: 13 }}>
                    {documentData.counts.approved} completed, {documentData.counts.pending_review} pending review, {documentData.counts.missing} missing
                  </p>
                </div>
                <span className="chip">{selectedEmp.emp_id}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 20 }}>
                {visibleDocTypes.map((type) => {
                  const meta = documentData.docs?.[type.id];
                  const docStatusStyle = DOC_STATUS_STYLES[meta?.status] || DOC_STATUS_STYLES.missing;
                  const uploadedAt = formatDateTime(meta?.uploaded_at);
                  const reviewedAt = formatDateTime(meta?.reviewed_at);
                  const selfLockedDoc = !isHR && selectedEmp?.emp_id === user?.emp_id && meta?.status === "approved";

                  return (
                    <div key={type.id} className="card" style={{ padding: 20, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
                        <div style={{ fontSize: 24 }}>{type.icon}</div>
                        <span
                          className="chip"
                          style={{
                            background: docStatusStyle.background,
                            color: docStatusStyle.color,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {meta?.status_label || "Not Uploaded"}
                        </span>
                      </div>

                      <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{type.label}</h4>
                      <div style={{ minHeight: 54, fontSize: 12, color: "var(--muted)", lineHeight: 1.45, marginBottom: 16 }}>
                        {!meta?.url ? "Not uploaded yet." : null}
                        {meta?.url && uploadedAt ? <div>Uploaded: {uploadedAt}</div> : null}
                        {meta?.status === "pending_review" ? <div>Waiting for HR confirmation.</div> : null}
                        {meta?.status === "approved" && reviewedAt ? <div>Completed: {reviewedAt}</div> : null}
                        {meta?.review_note ? <div>Note: {meta.review_note}</div> : null}
                      </div>

                      <div style={{ display: "grid", gap: 8 }}>
                        {meta?.url ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{ padding: "6px 10px", fontSize: 12 }}
                              onClick={() => handleViewDocument(meta)}
                            >
                              View
                            </button>
                            <button
                              className="btn-ghost"
                              style={{ padding: "6px 10px", fontSize: 12 }}
                              onClick={() => handleDownloadDocument(meta, type.label)}
                            >
                              Download
                            </button>
                            {canReview && meta.status === "pending_review" ? (
                              <button
                                className="btn-primary"
                                style={{ padding: "6px 10px", fontSize: 12 }}
                                onClick={() => handleApprove(type.id)}
                                disabled={reviewing === type.id}
                              >
                                {reviewing === type.id ? "Completing..." : "Complete"}
                              </button>
                            ) : null}
                            {canUpload && !selfLockedDoc ? (
                              <button
                                type="button"
                                onClick={() => handleDelete(type.id, type.label)}
                                className="btn-ghost"
                                style={{ padding: "6px 10px", fontSize: 12, color: "#dc2626" }}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        {canUpload && !selfLockedDoc ? (
                          <div style={{ position: "relative" }}>
                            <button className="btn-ghost" style={{ width: "100%", fontSize: 12, pointerEvents: "none" }}>
                              {uploading === type.id ? "Uploading..." : meta?.url ? "Replace File" : "Upload File"}
                            </button>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                              onChange={(event) => {
                                const f = event.target.files?.[0];
                                event.target.value = "";
                                if (f) handleUpload(type.id, f);
                              }}
                              disabled={uploading === type.id || uploading === "bulk"}
                            />
                          </div>
                        ) : null}
                        {selfLockedDoc ? (
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>
                            Completed by HR. Ask HR to replace this file.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {bulkOpen ? (
        <Modal
          title={`Upload Multiple Documents${selectedEmp?.emp_id ? `: ${selectedEmp.emp_id}` : ""}`}
          onClose={() => {
            setBulkOpen(false);
            setBulkFiles({});
          }}
          footer={
            <>
              <button className="btn-ghost" onClick={() => {
                setBulkOpen(false);
                setBulkFiles({});
              }}>Cancel</button>
              <button className="btn-primary" disabled={uploading === "bulk"} onClick={handleBulkUpload}>
                {uploading === "bulk" ? "Uploading..." : "Upload Selected"}
              </button>
            </>
          }
          className="modal-wide"
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {bulkEligibleDocTypes.map((type) => (
              <div key={type.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 22 }}>{type.icon}</div>
                  <div style={{ fontWeight: 700 }}>{type.label}</div>
                </div>
                <input
                  className="input"
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => setBulkFiles((current) => ({ ...current, [type.id]: event.target.files?.[0] || null }))}
                />
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
                  {bulkFiles[type.id]?.name || "No file selected"}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}

      {toastNode}
    </div>
  );
}
