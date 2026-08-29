"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, backendAssetUrl } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import PasswordInput from "@/components/ui/PasswordInput";
import StatusBadge from "@/components/ui/StatusBadge";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [showToast, toastNode] = useToast();
  const [form, setForm] = useState({
    first_name:       user?.first_name || "",
    last_name:        user?.last_name  || "",
    email:            user?.email      || "",
    current_password: "",
    new_password:     "",
    confirm_password: "",
  });
  const [saving, setSaving] = useState(false);
  const canRequestIncrement = user?.role === "hr";
  const [incrementTargets, setIncrementTargets] = useState([]);
  const [incrementRequests, setIncrementRequests] = useState([]);
  const [loadingIncrements, setLoadingIncrements] = useState(false);
  const [sendingIncrement, setSendingIncrement] = useState(false);
  const [incrementForm, setIncrementForm] = useState({
    employee_emp_id: "",
    increment_percent: "",
    justification: "",
    effective_from: "",
  });

  const roleLabel = user?.is_superuser ? "ADMIN" : (user?.role?.toUpperCase() || "EMPLOYEE");

  useEffect(() => {
    setForm((current) => ({
      ...current,
      first_name: user?.first_name || "",
      last_name: user?.last_name || "",
      email: user?.email || "",
    }));
  }, [user?.email, user?.first_name, user?.last_name]);

  async function save(e) {
    e.preventDefault();
    if (form.new_password && form.new_password !== form.confirm_password) {
      showToast("New passwords do not match", "error");
      return;
    }
    if (form.new_password && form.new_password.length < 6) {
      showToast("Password must be at least 6 characters", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name,
        last_name:  form.last_name,
        email:      form.email,
      };
      if (form.new_password) {
        payload.current_password = form.current_password;
        payload.new_password     = form.new_password;
      }
      await apiFetch("/auth/me", { method: "PUT", body: JSON.stringify(payload) });
      showToast("Profile updated successfully!");
      if (refreshUser) await refreshUser();
      // Clear password fields
      setForm((f) => ({ ...f, current_password: "", new_password: "", confirm_password: "" }));
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function uploadProfilePic(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Select a valid image file", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Profile picture cannot exceed 5MB", "error");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    try {
      await apiFetch("/auth/me/profile-pic", {
        method: "POST",
        body: formData,
        headers: {},
      });
      showToast("Profile picture updated!");
      if (refreshUser) await refreshUser();
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  const loadIncrementContext = useCallback(async () => {
    if (!canRequestIncrement) return;
    setLoadingIncrements(true);
    try {
      const [employeesData, requestsData] = await Promise.all([
        apiFetch("/employees"),
        apiFetch("/performance/increment-requests?status=all"),
      ]);

      const targets = (Array.isArray(employeesData) ? employeesData : []).filter((item) => !item.is_accounts && !item.is_superuser);
      setIncrementTargets(targets);

      if (!incrementForm.employee_emp_id && targets.length > 0) {
        setIncrementForm((current) => ({ ...current, employee_emp_id: targets[0].emp_id }));
      }

      const reqs = (Array.isArray(requestsData) ? requestsData : []).filter((item) => item.is_mine !== false);
      setIncrementRequests(reqs.slice(0, 8));
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoadingIncrements(false);
    }
  }, [canRequestIncrement, incrementForm.employee_emp_id, showToast]);

  useEffect(() => {
    loadIncrementContext();
  }, [loadIncrementContext]);

  async function submitIncrementRequest(e) {
    e.preventDefault();
    if (!incrementForm.employee_emp_id) {
      showToast("Select an employee", "error");
      return;
    }
    const percent = Number(incrementForm.increment_percent);
    if (!Number.isFinite(percent) || percent <= 0) {
      showToast("Enter a valid increment percentage", "error");
      return;
    }
    if (!incrementForm.justification.trim()) {
      showToast("Justification is required", "error");
      return;
    }

    setSendingIncrement(true);
    try {
      const payload = {
        employee_emp_id: incrementForm.employee_emp_id,
        increment_percent: percent,
        justification: incrementForm.justification.trim(),
      };
      if (incrementForm.effective_from) payload.effective_from = incrementForm.effective_from;

      await apiFetch("/performance/increment-request", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      showToast("Increment request submitted to Accounts");
      setIncrementForm((current) => ({
        ...current,
        increment_percent: "",
        justification: "",
        effective_from: "",
      }));
      loadIncrementContext();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSendingIncrement(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>My Profile</h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>Update your personal information and password</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 24, alignItems: "start" }}>

        {/* ── Account Info ── */}
        <div className="card" style={{ padding: 28 }}>
          <h2 className="syne" style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>👤 Account Information</h2>

          {/* Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 28, padding: 16, background: "rgba(255,255,255,0.03)", borderRadius: 12 }}>
            <div style={{ position: "relative" }}>
              <div style={{
                width: 64, height: 64, borderRadius: "50%",
                backgroundImage: user?.profile_pic ? `url(${backendAssetUrl(user.profile_pic)})` : "var(--accent-gradient)",
                backgroundSize: "cover", backgroundPosition: "center",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 26, fontWeight: 800, color: "#fff", flexShrink: 0,
                fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
              }}>
                {!user?.profile_pic && (user?.first_name || user?.username || "?")[0].toUpperCase()}
              </div>
              <label style={{
                position: "absolute", bottom: -4, right: -4,
                width: 24, height: 24, borderRadius: "50%",
                background: "var(--accent)", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontSize: 12, cursor: "pointer", border: "2px solid var(--card-bg)"
              }}>
                📷
                <input type="file" hidden accept="image/*" onChange={(e) => uploadProfilePic(e.target.files[0])} />
              </label>
            </div>
            <div style={{ minWidth: 0, flex: "1 1 220px" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{user?.first_name} {user?.last_name}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>@{user?.username}</div>
              <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="badge" style={{ background: "var(--accent)22", color: "var(--accent)", fontSize: 11, padding: "2px 8px", borderRadius: 99 }}>
                  {roleLabel}
                </span>
                <span className="badge" style={{ background: "rgba(255,255,255,0.06)", color: "var(--muted)", fontSize: 11, padding: "2px 8px", borderRadius: 99 }}>
                  {user?.emp_id}
                </span>
              </div>
            </div>
          </div>

          {/* Read-only info */}
          {[
            ["Employee ID",  user?.emp_id],
            ["Department",   user?.department],
            ["Username",     user?.username],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
              <span style={{ color: "var(--muted)" }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v || "—"}</span>
            </div>
          ))}
        </div>

        {/* ── Edit Form ── */}
        <form onSubmit={save} autoComplete="off" className="card" style={{ padding: 28 }}>
          <h2 className="syne" style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>✏️ Edit Details</h2>

          <div className="form-row">
            <div className="form-group">
              <label className="label">First Name</label>
              <input className="input" value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Last Name</label>
              <input className="input" value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>

          <div style={{ height: 1, background: "var(--border)", margin: "20px 0" }} />
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>
            Change Password (optional)
          </h3>

          <div className="form-group">
            <label className="label">Current Password</label>
            <PasswordInput placeholder="Required to set new password"
              autoComplete="off"
              name="profile_current_password_no_autofill"
              value={form.current_password}
              onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="label">New Password</label>
              <PasswordInput placeholder="Min 6 characters"
                autoComplete="off"
                name="profile_new_password_no_autofill"
                minLength={6}
                value={form.new_password}
                onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="label">Confirm New Password</label>
              <PasswordInput placeholder="Repeat new password"
                autoComplete="off"
                name="profile_confirm_password_no_autofill"
                minLength={6}
                value={form.confirm_password}
                onChange={(e) => setForm((f) => ({ ...f, confirm_password: e.target.value }))} />
            </div>
          </div>

          <button className="btn-primary" type="submit" disabled={saving}
            style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
            {saving ? "Saving…" : "💾 Save Changes"}
          </button>
        </form>

      </div>

      {canRequestIncrement ? (
        <div className="card" style={{ padding: 28, marginTop: 24 }}>
          <h2 className="syne" style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>💹 Salary Increment Request</h2>
          <p style={{ color: "var(--muted)", marginBottom: 16 }}>
            Submit increment in percentage. Accounts will review and forward it to Admin for approval.
          </p>

          <form onSubmit={submitIncrementRequest}>
            <div className="form-row">
              <div className="form-group">
                <label className="label">Employee</label>
                <select
                  className="input"
                  value={incrementForm.employee_emp_id}
                  onChange={(e) => setIncrementForm((current) => ({ ...current, employee_emp_id: e.target.value }))}
                >
                  <option value="">Select employee</option>
                  {incrementTargets.map((item) => (
                    <option key={item.emp_id} value={item.emp_id}>
                      {item.emp_id} - {item.first_name} {item.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="label">Increment %</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="e.g. 8"
                  value={incrementForm.increment_percent}
                  onChange={(e) => setIncrementForm((current) => ({ ...current, increment_percent: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="label">Effective From (optional)</label>
                <input
                  className="input"
                  type="date"
                  value={incrementForm.effective_from}
                  onChange={(e) => setIncrementForm((current) => ({ ...current, effective_from: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="label">Justification</label>
              <textarea
                className="input"
                rows={3}
                value={incrementForm.justification}
                onChange={(e) => setIncrementForm((current) => ({ ...current, justification: e.target.value }))}
                placeholder="Reason for increment request"
              />
            </div>

            <button className="btn-primary" type="submit" disabled={sendingIncrement || loadingIncrements}>
              {sendingIncrement ? "Submitting..." : "Submit Request"}
            </button>
          </form>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>Recent Requests</div>
            {loadingIncrements ? (
              <div style={{ color: "var(--muted)" }}>Loading requests...</div>
            ) : incrementRequests.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>No increment requests submitted yet.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>%</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incrementRequests.map((item) => (
                      <tr key={item.id}>
                        <td><b>{item.emp_id}</b><div style={{ fontSize: 12, color: "var(--muted)" }}>{item.name}</div></td>
                        <td>{item.increment_percent ? `+${item.increment_percent}%` : "—"}</td>
                        <td><StatusBadge status={item.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
      {toastNode}
    </div>
  );
}
