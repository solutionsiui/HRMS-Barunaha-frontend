"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { apiFetch } from "@/lib/api";
import AppLogo from "@/components/AppLogo";
import PasswordInput from "@/components/ui/PasswordInput";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => (searchParams.get("token") || "").trim(), [searchParams]);

  const [email, setEmail] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestDone, setRequestDone] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  const [passwordForm, setPasswordForm] = useState({ new_password: "", confirm_password: "" });
  const [resetLoading, setResetLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenEmail, setTokenEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function validateToken() {
      if (!token) {
        setTokenValid(false);
        setTokenEmail("");
        return;
      }
      setValidating(true);
      setError("");
      setSuccess("");
      try {
        const data = await apiFetch(`/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
        if (cancelled) return;
        setTokenValid(true);
        setTokenEmail(data?.email || "");
      } catch (err) {
        if (cancelled) return;
        setTokenValid(false);
        setError(err.message || "Reset link is invalid or expired");
      } finally {
        if (!cancelled) setValidating(false);
      }
    }

    validateToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleRequestReset(e) {
    e.preventDefault();
    if (cooldownSeconds > 0) return;
    setRequestLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setRequestDone(true);
      setSuccess(data?.message || "If an account exists for that email, a reset link has been sent (valid for 5 minutes).");
      setCooldownSeconds(300);
    } catch (err) {
      setError(err.message || "Unable to send reset link");
    } finally {
      setRequestLoading(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setResetLoading(true);
    setError("");
    setSuccess("");

    try {
      if ((passwordForm.new_password || "").length < 6) {
        throw new Error("New password must be at least 6 characters");
      }
      if (passwordForm.new_password !== passwordForm.confirm_password) {
        throw new Error("Passwords do not match");
      }

      const data = await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          new_password: passwordForm.new_password,
        }),
      });

      setSuccess(data?.message || "Password reset successfully");
      setTokenValid(false);
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError(err.message || "Unable to reset password");
    } finally {
      setResetLoading(false);
    }
  }

  const showingResetForm = Boolean(token);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--login-bg)",
        padding: 16,
      }}
    >
      <div style={{ width: "100%", maxWidth: 460 }}>
        <div className="card slide-up" style={{ padding: "42px 36px", background: "var(--login-card)", borderColor: "var(--border)" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
              <AppLogo size={60} showText={false} />
            </div>
            <h1 className="syne" style={{ fontSize: 28, fontWeight: 800, color: "var(--text)" }}>
              {showingResetForm ? "Reset Password" : "Forgot Password"}
            </h1>
            <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 8 }}>
              {showingResetForm
                ? "Create a new password for your account."
                : "Enter your account email and we will send you a reset link."}
            </p>
          </div>

          {!showingResetForm ? (
            <form onSubmit={handleRequestReset} autoComplete="off">
              <div className="form-group">
                <label className="label">Email</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}>
                    <Mail size={16} />
                  </span>
                  <input
                    className="input"
                    type="email"
                    placeholder="Enter your account email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={cooldownSeconds > 0 || requestLoading}
                    autoComplete="off"
                    name="reset_email_no_autofill"
                    style={{ paddingLeft: 40, ...(cooldownSeconds > 0 ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
                    required
                  />
                </div>
              </div>

              {requestDone ? (
                <div
                  style={{
                    background: "#22c55e22",
                    border: "1px solid #22c55e44",
                    borderRadius: 10,
                    padding: "12px 14px",
                    fontSize: 13,
                    color: "#16a34a",
                    marginBottom: 16,
                  }}
                >
                  {success}
                </div>
              ) : null}

              {error ? (
                <div
                  style={{
                    background: "#ef444422",
                    border: "1px solid #ef444444",
                    borderRadius: 10,
                    padding: "12px 14px",
                    fontSize: 13,
                    color: "#ef4444",
                    marginBottom: 16,
                  }}
                >
                  {error}
                </div>
              ) : null}

              <button
                className="btn-primary"
                type="submit"
                disabled={requestLoading || cooldownSeconds > 0}
                style={{ width: "100%", justifyContent: "center", padding: "14px 20px", fontSize: 15, ...(cooldownSeconds > 0 ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
              >
                {requestLoading ? "Sending..." : cooldownSeconds > 0 ? `Resend Link (${formatTime(cooldownSeconds)})` : <><span>Send Reset Link</span><ArrowRight size={16} /></>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} autoComplete="off">
              <div
                style={{
                  background: "var(--hover-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "12px 14px",
                  fontSize: 13,
                  color: "var(--muted)",
                  marginBottom: 18,
                }}
              >
                {validating
                  ? "Validating reset link..."
                  : tokenValid
                    ? `Resetting password for ${tokenEmail || "this account"}`
                    : "This reset link is not valid."}
              </div>

              <div className="form-group">
                <label className="label">New Password</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none", zIndex: "var(--z-layer-base)" }}>
                    <LockKeyhole size={16} />
                  </span>
                  <PasswordInput
                    placeholder="Enter new password"
                    value={passwordForm.new_password}
                    onChange={(e) => setPasswordForm((current) => ({ ...current, new_password: e.target.value }))}
                    autoComplete="off"
                    name="reset_password_no_autofill"
                    minLength={6}
                    inputStyle={{ paddingLeft: 40 }}
                    required
                    disabled={!tokenValid || validating}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="label">Confirm Password</label>
                <PasswordInput
                  placeholder="Confirm new password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm((current) => ({ ...current, confirm_password: e.target.value }))}
                  autoComplete="off"
                  name="reset_confirm_password_no_autofill"
                  minLength={6}
                  required
                  disabled={!tokenValid || validating}
                />
              </div>

              {error ? (
                <div
                  style={{
                    background: "#ef444422",
                    border: "1px solid #ef444444",
                    borderRadius: 10,
                    padding: "12px 14px",
                    fontSize: 13,
                    color: "#ef4444",
                    marginBottom: 16,
                  }}
                >
                  {error}
                </div>
              ) : null}

              {success ? (
                <div
                  style={{
                    background: "#22c55e22",
                    border: "1px solid #22c55e44",
                    borderRadius: 10,
                    padding: "12px 14px",
                    fontSize: 13,
                    color: "#16a34a",
                    marginBottom: 16,
                  }}
                >
                  {success}
                </div>
              ) : null}

              <button
                className="btn-primary"
                type="submit"
                disabled={!tokenValid || validating || resetLoading}
                style={{ width: "100%", justifyContent: "center", padding: "14px 20px", fontSize: 15 }}
              >
                {resetLoading ? "Updating..." : <><span>Update Password</span><ArrowRight size={16} /></>}
              </button>
            </form>
          )}

          <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
            <Link href="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--muted)", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>
              <ArrowLeft size={15} />
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}


export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--login-bg)" }} />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
