"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { fmtDateTime } from "@/lib/formatters";

export default function TopbarNotifications({ role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const rootRef = useRef(null);

  async function loadNotifications() {
    try {
      const data = await apiFetch("/notifications");
      setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
      setUnreadCount(Number(data?.unread_count || 0));
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 45000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  async function markRead(notification) {
    try {
      if (typeof notification?.id === "number") {
        await apiFetch(`/notifications/${notification.id}/read`, { method: "POST" });
      }
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      setOpen(false);
      const message = String(notification?.message || "").toLowerCase();
      const route = notification?.meta?.route
        || (message.includes("resignation") ? (role === "employee" ? "/dashboard/resignation" : "/dashboard/resignations")
          : message.includes("grievance") ? (role === "admin" || role === "hr" ? "/dashboard/grievances-hr" : "/dashboard/grievance")
          : message.includes("leave") ? (role === "admin" || role === "hr" ? "/dashboard/leave-approvals" : "/dashboard/leaves")
          : message.includes("payroll") || message.includes("salary") || message.includes("increment") ? (role === "admin" || role === "accounts" ? "/dashboard/payroll" : "/dashboard/payslip")
          : message.includes("rating") || message.includes("appraisal") ? "/dashboard/performance"
          : message.includes("task") ? (role === "hod" || role === "tl" ? "/dashboard/tasks-assign" : "/dashboard/tasks")
          : message.includes("policy") ? "/dashboard/policies"
          : message.includes("notice") ? "/dashboard/notices"
          : "/dashboard");
      router.push(route);
    } catch {}
  }

  async function markAllRead() {
    try {
      await apiFetch("/notifications/read-all", { method: "POST" });
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
    } catch {}
  }

  return (
    <div className="topbar-notifications" ref={rootRef}>
      <button
        type="button"
        className="notification-trigger"
        aria-label="Notifications"
        title="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="notification-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="notification-panel">
          <div className="notification-panel__header">
            <div>
              <div className="notification-panel__title">Notifications</div>
              <div className="notification-panel__subtitle">
                {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
              </div>
            </div>
            <button
              type="button"
              className="notification-mark-all"
              onClick={markAllRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck size={15} />
              Mark all read
            </button>
          </div>

          <div className="notification-list">
            {loading ? (
              <div className="notification-empty">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">No notifications yet.</div>
            ) : (
              notifications.map((item) => (
                <button
                  key={String(item.id)}
                  type="button"
                  className={`notification-item${item.is_read ? " is-read" : ""}`}
                  onClick={() => markRead(item)}
                >
                  <span className="notification-item__dot" style={{ background: item.is_read ? "var(--border)" : "var(--accent)" }} />
                  <span className="notification-item__content">
                    <span className="notification-item__message">{item.message}</span>
                    <span className="notification-item__time">{item.created_at ? fmtDateTime(item.created_at) : (item.time || "Now")}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
