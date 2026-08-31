export default function StatusBadge({ status, label }) {
  const map = {
    approved: ["#10b981", "Approved"],
    rejected: ["#ef4444", "Rejected"],
    pending: ["#f59e0b", "Pending"],
    open: ["#f59e0b", "Open"],
    resolved: ["#10b981", "Resolved"],
    active: ["#10b981", "Active"],
    present: ["#10b981", "Present"],
    absent: ["#ef4444", "Absent"],
    half_day: ["#f59e0b", "Half Day"],
    late: ["#f97316", "Late"],
    early_leave: ["#eab308", "Early Leave"],
    submitted: ["#6366f1", "Submitted"],
    reviewing: ["#6366f1", "Reviewing"],
    reviewed: ["#8b5cf6", "Reviewed"],
    completed: ["#10b981", "Completed"],
    "needs revisions": ["#f97316", "Needs Revisions"],
    approved_hr: ["#10b981", "Approved by HR"],
    rejected_hr: ["#ef4444", "Rejected by HR"],
    pending_hr: ["#f59e0b", "Pending HR"],
    pending_accounts: ["#f59e0b", "Pending Accounts"],
    pending_admin: ["#f59e0b", "Pending Admin"],
    approved_admin: ["#10b981", "Approved by Admin"],
    rejected_admin: ["#ef4444", "Rejected by Admin"],
    compoff: ["#06b6d4", "Comp-Off"],
    extra_pay: ["#f59e0b", "Extra Pay"],
    wfh: ["#06b6d4", "Work From Home"],
    work_from_home: ["#06b6d4", "Work From Home"],
    paid_leave: ["#10b981", "Paid Leave"],
    holiday: ["#64748b", "Holiday"],
  };
  const [color, defaultLabel] = map[status?.toLowerCase()] || ["#64748b", status || "—"];
  return (
    <span
      className="badge"
      style={{ background: `${color}22`, color, boxShadow: `inset 0 0 0 1px ${color}44` }}
    >
      {label || defaultLabel}
    </span>
  );
}
