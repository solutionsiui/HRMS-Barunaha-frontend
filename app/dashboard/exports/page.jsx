"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, getToken } from "@/lib/api";
import { useToast } from "@/hooks/useToast";

export default function ExportsPage() {
  const { role } = useAuth();
  const isAccounts = role === "accounts";
  const canSeeAnnexure = role === "accounts" || role === "admin";
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [department, setDepartment] = useState("");
  const [employee, setEmployee] = useState("");
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showToast, toastNode] = useToast();

  useEffect(() => {
    if (!isAccounts) apiFetch("/departments").then((data) => setDepartments(Array.isArray(data) ? data : [])).catch(() => {});
    apiFetch("/employees").then((data) => setEmployees(Array.isArray(data) ? data : [])).catch(() => {});
  }, [isAccounts]);

  const token = useMemo(() => getToken(), []);

  async function download(path, label) {
    try {
      const res = await fetch(`/api/proxy${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const contentDisposition = res.headers.get("content-disposition") || "";
      const match = contentDisposition.match(/filename="?([^"]+)"?/i);
      const suggestedName = match?.[1];
      const link = document.createElement("a");
      link.href = url;
      link.download = suggestedName || `${label.replace(/\s+/g, "_").toLowerCase()}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast(`Downloading ${label}...`);
    } catch (error) {
      showToast(error.message || "Download failed", "error");
    }
  }

  const formattedMonth = `${year}-${String(month).padStart(2, "0")}`;
  const query = `month=${month}&year=${year}${employee ? `&emp_id=${employee}` : ""}${department ? `&department=${encodeURIComponent(department)}` : ""}`;
  const attendanceCombinedQuery = `month=${formattedMonth}${department ? `&department=${encodeURIComponent(department)}` : ""}${employee ? `&emp_id=${employee}` : ""}`;
  const attendanceSingleQuery = `month=${month}&year=${year}${department ? `&department=${encodeURIComponent(department)}` : ""}${employee ? `&emp_id=${employee}` : ""}`;
  const bgvQuery = `${employee ? `emp_id=${employee}&` : ""}department=${encodeURIComponent(department || "All")}`;

  return (
    <div>
      <div className="page-header">
        <h1 className="syne" style={{ fontSize: 28, fontWeight: 800 }}>Exports & Reports</h1>
        <p style={{ color: "var(--muted)", marginTop: 4 }}>{isAccounts ? "Generate annexure files in bank format. Selecting one employee also adds detailed payroll metrics." : "Download attendance registers by department or employee."}</p>
      </div>
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 className="syne" style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Export Filters</h3>
        <div className="form-row">
          <div className="form-group"><label className="label">Month</label><select className="input" value={month} onChange={(e) => setMonth(+e.target.value)}>{["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select></div>
          <div className="form-group"><label className="label">Year</label><select className="input" value={year} onChange={(e) => setYear(+e.target.value)}>{[2024, 2025, 2026, 2027].map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          {!isAccounts ? <div className="form-group">
            <label className="label">Department</label>
            <input
              className="input"
              list="department-search-list"
              placeholder="Type to search departments…"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
            <datalist id="department-search-list">
              {departments.map((item) => <option key={item.id || item.name} value={item.name} />)}
            </datalist>
          </div> : null}
          <div className="form-group">
            <label className="label">{isAccounts ? "Employee (optional)" : "Employee"}</label>
            <input className="input" list="emp-search-list" placeholder="Type to search employees…" value={employee ? `${employee} - ${(employees.find((e) => e.emp_id === employee) || {}).first_name || ""} ${(employees.find((e) => e.emp_id === employee) || {}).last_name || ""}`.trim() : ""} onChange={(e) => { const val = e.target.value; const match = employees.find((emp) => `${emp.emp_id} - ${emp.first_name} ${emp.last_name}` === val); setEmployee(match ? match.emp_id : (val === "" ? "" : employee)); if (val === "") setEmployee(""); }} onBlur={(e) => { if (!e.target.value) setEmployee(""); }} />
            <datalist id="emp-search-list">
              <option value="">All employees</option>
              {employees.map((item) => <option key={item.emp_id} value={`${item.emp_id} - ${item.first_name} ${item.last_name}`} />)}
            </datalist>
            {employee && <button type="button" onClick={() => setEmployee("")} style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: "4px 0", marginTop: 2 }}>✕ Clear</button>}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
        {[
          {
            icon: "📊", label: "Attendance Report", color: "#6366f1",
            desc: "Choose Excel (multi-sheet), CSV or PDF",
            formats: [
              { tag: "XLSX (5-Sheet)", path: `/exports/all-attendance-formats?${attendanceCombinedQuery}` },
              { tag: "XLSX (Register)", path: `/exports/attendance?${attendanceSingleQuery}` },
              { tag: "CSV", path: `/exports/attendance.csv?${attendanceSingleQuery}` },
              { tag: "PDF", path: `/exports/attendance.pdf?${attendanceSingleQuery}` },
            ],
          },
          {
            icon: "💰", label: "Salary Annexure", color: "#f59e0b",
            desc: "Payroll XLSX export",
            formats: [{ tag: "XLSX", path: `/exports/annexure?${query}` }],
          },
          {
            icon: "🛡", label: "BGV Report", color: "#10b981",
            desc: "Background verification report",
            formats: [{ tag: "PDF", path: `/exports/bgv?${bgvQuery}` }],
          },
          {
            icon: "📈", label: "Performance Report", color: "#8b5cf6",
            desc: "Employee performance XLSX",
            formats: [{ tag: "XLSX", path: `/performance/export?month=${month}&year=${year}${employee ? `&emp_id=${employee}` : ""}` }],
          },
        ]
          .filter((item) => (isAccounts ? item.label === "Salary Annexure" : true))
          .filter((item) => (item.label === "Salary Annexure" ? canSeeAnnexure : true))
          .map((item) => (
          <div key={item.label} className="card" style={{ padding: 24 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{item.icon}</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>{item.desc}</div>
            <div style={{ display: "grid", gap: 8 }}>
              {item.formats.map((fmt) => (
                <button
                  key={fmt.tag}
                  className="btn-primary"
                  style={{ background: item.color, width: "100%", justifyContent: "center" }}
                  onClick={() => download(fmt.path, `${item.label} (${fmt.tag})`)}
                >
                  Download {fmt.tag}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {toastNode}
    </div>
  );
}
