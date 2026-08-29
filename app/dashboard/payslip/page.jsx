"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getToken } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import { fmtINR } from "@/lib/formatters";
import EmptyState from "@/components/ui/EmptyState";
import Loader from "@/components/ui/Loader";

export default function PayslipPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showToast, toastNode] = useToast();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const load = useCallback(async () => {
    if (user?.self_service_access?.can_view_my_payslip === false) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await apiFetch(`/payroll/payslip/me?month=${month}&year=${year}`);
      setData(d);
    } catch {
      setData(null);
    }
    setLoading(false);
  }, [month, user?.self_service_access?.can_view_my_payslip, year]);

  useEffect(() => {
    if (user?.self_service_access?.can_view_my_payslip === false) {
      router.replace("/dashboard");
      return;
    }
    load();
  }, [load, router, user?.self_service_access?.can_view_my_payslip]);

  async function downloadOfficialPdf() {
    setDownloading(true);
    try {
      const token = getToken();
      const response = await fetch(`/api/proxy/payslip/download/me?month=${month}&year=${year}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "Payslip download failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("content-disposition") || "";
      const match = contentDisposition.match(/filename="?([^\"]+)"?/i);
      const filename = match?.[1] || `Payslip_${year}_${String(month).padStart(2, "0")}.pdf`;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast("Official payslip download started");
    } catch (error) {
      showToast(error.message || "Payslip download failed", "error");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>My Payslip</h1><p style={{ color: "var(--muted)", marginTop: 4 }}>View and download your salary slip</p></div>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="input" style={{ width: "auto" }} value={month} onChange={(e) => setMonth(+e.target.value)}>{months.map((m, i) => <option key={i} value={i+1} disabled={year === new Date().getFullYear() && i + 1 > new Date().getMonth() + 1}>{m}</option>)}</select>
          <select className="input" style={{ width: "auto" }} value={year} onChange={(e) => setYear(+e.target.value)}>{[2024,2025,2026].filter((y) => y <= new Date().getFullYear()).map((y) => <option key={y} value={y}>{y}</option>)}</select>
          <button className="btn-primary" onClick={load}>View</button>
        </div>
      </div>
      {loading ? <Loader /> : user?.self_service_access?.can_view_my_payslip === false ? <EmptyState icon="₹" title="My Payslip disabled" sub="Admin has turned off self payslip access for your role." /> : !data ? <EmptyState icon="₹" title="No payslip found" sub="Payslip not generated for this period yet" /> : (
        <>
          <div className="payslip-actions no-print" style={{ maxWidth: 860, margin: "0 auto 12px", display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button className="btn-ghost" onClick={() => window.print()}>Print Friendly</button>
            <button className="btn-primary" disabled={downloading} onClick={downloadOfficialPdf}>{downloading ? "Preparing..." : "Download Official PDF"}</button>
          </div>
          <div className="payslip-print-root">
            <div className="card payslip-sheet" style={{ maxWidth: 860, margin: "0 auto", background: "#ffffff", color: "#111827" }}>
              <div className="payslip-header" style={{ padding: "24px 28px", background: "#0B1A3A", color: "#fff", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <img src="/logo.png" alt="Logo" style={{ height: 42, width: "auto", objectFit: "contain", borderRadius: 4, background: "rgba(255,255,255,0.15)", padding: 4 }} />
                  <div>
                    <div className="syne" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "0.03em" }}>Barunaha Entertainment Pvt. Ltd.</div>
                    <div style={{ fontSize: 11, color: "#CBD5E1", marginTop: 6 }}>Regd. Office: New Delhi, India</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>SALARY SLIP</div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{months[(data.month || month) - 1]} {data.year || year}</div>
                </div>
              </div>
              <div style={{ textAlign: "center", fontSize: 10, color: "#64748b", padding: "6px 0", borderBottom: "1px solid #e2e8f0" }}>CONFIDENTIAL — For the addressee only</div>

              <div style={{ padding: 28 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 18 }}>
                  <div className="payslip-chip"><div className="label">Employee Name</div><div className="payslip-chip-value">{data.employee_name || "—"}</div></div>
                  <div className="payslip-chip"><div className="label">Employee ID</div><div className="payslip-chip-value">{data.emp_id || "—"}</div></div>
                  <div className="payslip-chip"><div className="label">Department</div><div className="payslip-chip-value">{data.department || "—"}</div></div>
                  <div className="payslip-chip"><div className="label">Base Salary</div><div className="payslip-chip-value">{fmtINR(data.base_salary)}</div></div>
                </div>

                <h3 className="syne" style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: "#0f172a" }}>Attendance & Payroll Summary</h3>
                <div className="payslip-table">
                  <div className="payslip-row"><span>Days Present</span><strong>{data.presents}</strong></div>
                  <div className="payslip-row"><span>Absent Days</span><strong>{data.absents}</strong></div>
                  <div className="payslip-row"><span>Half Days</span><strong>{data.half_days}</strong></div>
                  <div className="payslip-row"><span>Late Arrivals</span><strong>{data.lates}</strong></div>
                  <div className="payslip-row"><span>Early Leaves</span><strong>{data.early_leaves}</strong></div>
                  <div className="payslip-row"><span>Paid Leaves</span><strong>{data.paid_leaves}</strong></div>
                  <div className="payslip-row"><span>Unpaid Leaves</span><strong>{data.unpaid_leaves}</strong></div>
                  <div className="payslip-row">
                    <span>
                      Holiday Days
                      {data.holiday_details?.length ? <small style={{ display: "block", color: "#64748b", marginTop: 3 }}>{data.holiday_details.join(", ")}</small> : null}
                    </span>
                    <strong>{data.holiday_days || 0}</strong>
                  </div>
                  <div className="payslip-row"><span>WFH Days</span><strong>{data.wfh_days || 0}</strong></div>
                  <div className="payslip-row"><span>Absent Deduction</span><strong style={{ color: "#b91c1c" }}>-{fmtINR(data.absent_deduction || 0)}</strong></div>
                  <div className="payslip-row"><span>Half Day Deduction</span><strong style={{ color: "#b91c1c" }}>-{fmtINR(data.half_day_deduction || 0)}</strong></div>
                  <div className="payslip-row"><span>Paid Leave Deduction</span><strong style={{ color: "#b91c1c" }}>-{fmtINR(data.paid_leave_deduction || 0)}</strong></div>
                  <div className="payslip-row"><span>Unpaid Leave Deduction</span><strong style={{ color: "#b91c1c" }}>-{fmtINR(data.unpaid_leave_deduction || 0)}</strong></div>
                  <div className="payslip-row"><span>Late Penalty Deduction</span><strong style={{ color: "#b91c1c" }}>-{fmtINR(data.late_deduction || 0)}</strong></div>
                  <div className="payslip-row"><span>Early Leave Penalty Deduction</span><strong style={{ color: "#b91c1c" }}>-{fmtINR(data.early_leave_deduction || 0)}</strong></div>
                  <div className="payslip-row"><span>Other Attendance Adjustment</span><strong style={{ color: (data.other_attendance_adjustment || 0) > 0 ? "#b91c1c" : "#166534" }}>{(data.other_attendance_adjustment || 0) > 0 ? `-${fmtINR(Math.abs(data.other_attendance_adjustment || 0))}` : `+${fmtINR(Math.abs(data.other_attendance_adjustment || 0))}`}</strong></div>
                  <div className="payslip-row"><span>Total Deductions</span><strong style={{ color: "#b91c1c" }}>-{fmtINR(data.total_deductions || data.deductions || 0)}</strong></div>
                  <div className="payslip-row"><span>Comp-Off Credited Days</span><strong>{data.compoff_credited_days || 0}</strong></div>
                  <div className="payslip-row"><span>Comp-Off Used Days</span><strong>{data.compoff_used_days || 0}</strong></div>
                  <div className="payslip-row"><span>Extra Pay / Comp-Off Addition</span><strong style={{ color: "#166534" }}>+{fmtINR(data.extra_pay_addition || 0)}</strong></div>
                  <div className="payslip-row"><span>Late Penalty Days</span><strong style={{ color: "#b91c1c" }}>-{data.late_penalty || 0}</strong></div>
                  <div className="payslip-row"><span>Early Leave Penalty</span><strong style={{ color: "#b91c1c" }}>-{data.early_leave_penalty || 0}</strong></div>
                  <div className="payslip-row payslip-accent"><span>Payable Days</span><strong>{data.payable_days}</strong></div>
                </div>

                <div className="payslip-net" style={{ marginTop: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#047857", fontWeight: 700 }}>Net Salary Payout</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Payable after deductions</div>
                  </div>
                  <div className="syne" style={{ fontSize: 30, fontWeight: 800, color: "#059669" }}>{fmtINR(data.net_salary)}</div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid #e2e8f0", padding: "14px 28px 18px", display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: 12 }}>
                <span>This is a system-generated payslip and does not require physical signature.</span>
                <span>Generated on {new Date().toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx global>{`
        .payslip-chip {
          border: 1px solid #dbe2ea;
          border-radius: 10px;
          padding: 10px 12px;
          background: #f8fafc;
        }
        .payslip-chip-value {
          margin-top: 4px;
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
        }
        .payslip-table {
          border: 1px solid #dbe2ea;
          border-radius: 10px;
          overflow: hidden;
        }
        .payslip-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 14px;
          border-bottom: 1px solid #e5eaf1;
          font-size: 14px;
        }
        .payslip-row:last-child {
          border-bottom: none;
        }
        .payslip-row span {
          color: #475569;
        }
        .payslip-row strong {
          color: #111827;
        }
        .payslip-accent {
          background: #ecfdf5;
          font-weight: 700;
        }
        .payslip-net {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border: 1px solid #a7f3d0;
          background: linear-gradient(135deg, #ecfdf5, #f0fdf4);
          border-radius: 12px;
          padding: 16px;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          .payslip-print-root,
          .payslip-print-root * {
            visibility: visible !important;
          }
          body * {
            visibility: hidden;
          }
          .payslip-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
            background: #ffffff;
          }
          .payslip-sheet {
            box-shadow: none !important;
            border: 1px solid #d1d5db !important;
            margin: 0 !important;
            max-width: 100% !important;
            border-radius: 0 !important;
          }
          @page {
            size: A4;
            margin: 12mm;
          }
        }
      `}</style>
      {toastNode}
    </div>
  );
}
