"use client";

import { useEffect, useState } from "react";
import { Star, Search, MessageSquare, ShieldAlert, Award, TrendingUp, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import Loader from "@/components/ui/Loader";

function StarRow({ value = 0, onChange, readOnly = false, size = 18 }) {
  const safeValue = Math.max(0, Math.min(5, Number(value || 0)));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= safeValue;
        const icon = (
          <Star
            size={size}
            style={{
              transition: "all 0.2s ease",
              color: filled ? "#f59e0b" : "rgba(148, 163, 184, 0.2)",
              fill: filled ? "#f59e0b" : "transparent"
            }}
          />
        );
        if (readOnly) {
          return <span key={star} style={{ display: "inline-flex" }}>{icon}</span>;
        }
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange?.(star)}
            style={{
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "inline-flex"
            }}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}

export default function PeerRatingsPage() {
  const { role, user } = useAuth();
  const [showToast, toastNode] = useToast();
  
  const [activeTab, setActiveTab] = useState("give"); // "give" | "my" | "admin"
  const [loading, setLoading] = useState(true);
  
  // Give tab states
  const [employees, setEmployees] = useState([]);
  const [searchEmployee, setSearchEmployee] = useState("");
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [rating, setRating] = useState(5);
  const [feedback, setFeedback] = useState("");
  const [givenRatings, setGivenRatings] = useState([]);
  const [submitLoading, setSubmitLoading] = useState(false);

  // My Received stats
  const [receivedStats, setReceivedStats] = useState({
    average_rating: 0,
    ratings_count: 0,
    feedback_list: []
  });

  // Admin dashboard states
  const [allRatings, setAllRatings] = useState([]);
  const [summary, setSummary] = useState([]);
  const [searchSummary, setSearchSummary] = useState("");
  
  const isPrivileged = ["admin", "hr", "hod"].includes(role);

  const loadData = async () => {
    setLoading(true);
    try {
      const empData = await apiFetch("/peer-ratings/employees");
      setEmployees(empData || []);
      
      const givenData = await apiFetch("/peer-ratings/my-given");
      setGivenRatings(givenData || []);
      
      const receivedData = await apiFetch("/peer-ratings/received");
      setReceivedStats(receivedData || { average_rating: 0, ratings_count: 0, feedback_list: [] });
      
      if (isPrivileged) {
        const allData = await apiFetch("/peer-ratings/all");
        setAllRatings(allData?.ratings || []);
        setSummary(allData?.summary || []);
      }
    } catch (err) {
      showToast(err.message || "Failed to load ratings data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmpId) {
      showToast("Please select an employee to rate", "error");
      return;
    }
    setSubmitLoading(true);
    try {
      await apiFetch("/peer-ratings", {
        method: "POST",
        body: JSON.stringify({
          ratee_id: parseInt(selectedEmpId),
          rating,
          feedback: feedback.trim() || null
        })
      });
      showToast("Rating submitted successfully!");
      setSelectedEmpId("");
      setSearchEmployee("");
      setRating(5);
      setFeedback("");
      
      // Full reload so given/received/admin tables all refresh
      await loadData();
    } catch (err) {
      showToast(err.message || "Failed to submit rating", "error");
    } finally {
      setSubmitLoading(false);
    }
  };

  const filteredEmployees = employees.filter(emp =>
    (emp.name || "").toLowerCase().includes(searchEmployee.toLowerCase()) ||
    (emp.username || "").toLowerCase().includes(searchEmployee.toLowerCase()) ||
    (emp.department || "").toLowerCase().includes(searchEmployee.toLowerCase())
  );

  const filteredSummary = summary.filter(emp =>
    (emp.employee_name || "").toLowerCase().includes(searchSummary.toLowerCase()) ||
    (emp.username || "").toLowerCase().includes(searchSummary.toLowerCase()) ||
    (emp.department || "").toLowerCase().includes(searchSummary.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ display: "flex", height: "60vh", alignItems: "center", justifyContent: "center" }}>
        <Loader size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 10px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header Banner */}
      <div className="card" style={{ padding: 24, background: "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(30,27,75,0.4) 100%)", border: "1px solid rgba(99,102,241,0.2)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 99, padding: "4px 12px", fontSize: 12, color: "#a78bfa", fontWeight: 600, width: "fit-content", marginBottom: 12 }}>
          ⭐ Peer-to-Peer Feedback
        </div>
        <h1 className="syne" style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Peer Rating System</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, margin: "6px 0 0 0", maxWidth: 650, lineHeight: 1.5 }}>
          Submit ratings and constructive feedback for your team members. Peer ratings are completely anonymous to the recipients.
        </p>
      </div>

      {/* Tabs Menu */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 1 }}>
        <button
          className="btn-ghost"
          onClick={() => setActiveTab("give")}
          style={{
            borderBottom: activeTab === "give" ? "2px solid var(--primary, #6366f1)" : "none",
            borderRadius: 0,
            padding: "10px 20px",
            background: activeTab === "give" ? "rgba(99,102,241,0.05)" : "transparent",
            color: activeTab === "give" ? "var(--primary, #6366f1)" : "var(--muted)",
            fontWeight: 600
          }}
        >
          Give Rating
        </button>
        {role !== "admin" ? <button
          className="btn-ghost"
          onClick={() => setActiveTab("my")}
          style={{
            borderBottom: activeTab === "my" ? "2px solid var(--primary, #6366f1)" : "none",
            borderRadius: 0,
            padding: "10px 20px",
            background: activeTab === "my" ? "rgba(99,102,241,0.05)" : "transparent",
            color: activeTab === "my" ? "var(--primary, #6366f1)" : "var(--muted)",
            fontWeight: 600
          }}
        >
          My Performance
        </button> : null}
        {isPrivileged && (
          <button
            className="btn-ghost"
            onClick={() => setActiveTab("admin")}
            style={{
              borderBottom: activeTab === "admin" ? "2px solid var(--primary, #6366f1)" : "none",
              borderRadius: 0,
              padding: "10px 20px",
              background: activeTab === "admin" ? "rgba(99,102,241,0.05)" : "transparent",
              color: activeTab === "admin" ? "var(--primary, #6366f1)" : "var(--muted)",
              fontWeight: 600
            }}
          >
            Ratings Dashboard
          </button>
        )}
      </div>

      {/* TAB 1: Give Rating */}
      {activeTab === "give" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
          {/* Rating Form */}
          <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, height: "fit-content" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <Award size={20} style={{ color: "var(--primary, #6366f1)" }} />
              Rate a Colleague
            </h2>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                  Select Colleague
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search colleague name..."
                    value={searchEmployee}
                    className="input"
                    onChange={(e) => {
                      setSearchEmployee(e.target.value);
                      if (selectedEmpId) setSelectedEmpId("");
                    }}
                    style={{ width: "100%" }}
                  />
                </div>
                {searchEmployee && !selectedEmpId && (
                  <div style={{
                    position: "absolute",
                    marginTop: 4,
                    maxHeight: 180,
                    overflowY: "auto",
                    background: "var(--surface, #1e293b)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    zIndex: 99,
                    width: "calc(100% - 48px)",
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)"
                  }}>
                    {filteredEmployees.length > 0 ? (
                      filteredEmployees.map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => {
                            setSelectedEmpId(emp.id);
                            setSearchEmployee(emp.name);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 12px",
                            background: "transparent",
                            border: "none",
                            borderBottom: "1px solid rgba(255,255,255,0.05)",
                            color: "inherit",
                            cursor: "pointer",
                            transition: "background 0.15s ease"
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{emp.name} (@{emp.username})</div>
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>{emp.department} · {emp.job_title}</div>
                        </button>
                      ))
                    ) : (
                      <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--muted)" }}>No active colleagues found</div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                  Rating
                </label>
                <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                  <StarRow value={rating} onChange={setRating} size={24} />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                  Anonymous Feedback / Comments
                </label>
                <textarea
                  rows={4}
                  placeholder="Tell them what they are doing great or how they can improve..."
                  value={feedback}
                  className="input"
                  onChange={(e) => setFeedback(e.target.value)}
                  style={{ width: "100%", resize: "none" }}
                />
              </div>

              <button
                type="submit"
                disabled={submitLoading || !selectedEmpId}
                className="btn-primary"
                style={{ width: "100%", padding: 10, fontWeight: 700 }}
              >
                {submitLoading ? "Submitting..." : "Submit Rating"}
              </button>
            </form>
          </div>

          {/* Ratings Given */}
          <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, flexGrow: 2 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <MessageSquare size={20} style={{ color: "var(--primary, #6366f1)" }} />
              Ratings Submitted by Me
            </h2>
            {givenRatings.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: 8 }}>Colleague</th>
                      <th style={{ padding: 8 }}>Rating</th>
                      <th style={{ padding: 8 }}>Comments</th>
                      <th style={{ padding: 8 }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {givenRatings.map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: 12, fontWeight: 600 }}>
                          {r.ratee_name}
                          <span style={{ display: "block", fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>@{r.ratee_username}</span>
                        </td>
                        <td style={{ padding: 12 }}>
                          <StarRow value={r.rating} readOnly size={14} />
                        </td>
                        <td style={{ padding: 12, color: "var(--muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.feedback}>
                          {r.feedback || "—"}
                        </td>
                        <td style={{ padding: 12, color: "var(--muted)" }}>
                          {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(r.created_at))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 20px", border: "1px dashed var(--border)", borderRadius: 12 }}>
                <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>You haven't rated any colleagues yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: My Received Ratings */}
      {activeTab === "my" && role !== "admin" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
          {/* Aggregates */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card" style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 16 }}>
              <h2 style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "1px", margin: 0 }}>
                My Average Rating
              </h2>
              <div style={{ fontSize: 48, fontWeight: 800, color: "#f59e0b" }}>
                {receivedStats.average_rating}
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <StarRow value={receivedStats.average_rating} readOnly size={22} />
              </div>
              <p style={{ color: "var(--muted)", fontSize: 12, margin: 0 }}>
                Based on {receivedStats.ratings_count} anonymous peer ratings
              </p>
            </div>

            <div className="card" style={{ padding: 20, borderLeft: "4px solid rgba(239,68,68,0.5)" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#ef4444", display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px 0" }}>
                <ShieldAlert size={16} />
                Anonymity Guarantee
              </h3>
              <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
                To promote honest feedback, the identities of your raters are entirely hidden. Rater names, usernames, profile IDs, and submission timestamps are scrubbed from employee performance views.
              </p>
            </div>
          </div>

          {/* Anonymous Feedback Comments */}
          <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, flexGrow: 2 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <MessageSquare size={20} style={{ color: "var(--primary, #6366f1)" }} />
              Anonymous Peer Comments
            </h2>
            {receivedStats.feedback_list.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {receivedStats.feedback_list.map((comment, index) => (
                  <div
                    key={index}
                    style={{
                      padding: 16,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      borderRadius: 8,
                      color: "inherit",
                      fontSize: 13,
                      lineHeight: 1.5,
                      fontStyle: "italic"
                    }}
                  >
                    "{comment}"
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "60px 20px", border: "1px dashed var(--border)", borderRadius: 12 }}>
                <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>No feedback comments received yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Admin/HOD/HR Dashboard */}
      {activeTab === "admin" && isPrivileged && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Summary Grid */}
          <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Users size={20} style={{ color: "var(--primary, #6366f1)" }} />
                Employee Peer Rating Summaries
              </h2>
              <div>
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={searchSummary}
                  className="input"
                  onChange={(e) => setSearchSummary(e.target.value)}
                  style={{ width: 200, padding: "4px 8px", fontSize: 12 }}
                />
              </div>
            </div>

            {filteredSummary.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: 8 }}>Employee</th>
                      <th style={{ padding: 8 }}>Department</th>
                      <th style={{ padding: 8 }}>Average Rating</th>
                      <th style={{ padding: 8 }}>Ratings Received</th>
                      <th style={{ padding: 8 }}>Ratings Given</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSummary.map((emp) => (
                      <tr key={emp.user_id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: 12, fontWeight: 600 }}>
                          {emp.employee_name}
                          <span style={{ display: "block", fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>@{emp.username}</span>
                        </td>
                        <td style={{ padding: 12, color: "var(--muted)" }}>
                          {emp.department}
                          <span style={{ display: "block", fontSize: 10, color: "var(--muted)" }}>{emp.job_title}</span>
                        </td>
                        <td style={{ padding: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 700, color: "#f59e0b" }}>{emp.avg_rating_received}</span>
                            <StarRow value={emp.avg_rating_received} readOnly size={12} />
                          </div>
                        </td>
                        <td style={{ padding: 12, fontWeight: 600 }}>{emp.ratings_received_count}</td>
                        <td style={{ padding: 12, fontWeight: 600 }}>{emp.ratings_given_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 20 }}>
                <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>No rating summaries found.</p>
              </div>
            )}
          </div>

          {/* Audit Logs / Transaction Details */}
          <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={20} style={{ color: "var(--primary, #6366f1)" }} />
              Detailed Transaction Log (Privileged View)
            </h2>
            {allRatings.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: 8 }}>Rater</th>
                      <th style={{ padding: 8 }}>Ratee</th>
                      <th className="pb-3" style={{ padding: 8 }}>Score</th>
                      <th className="pb-3" style={{ padding: 8 }}>Feedback / Comments</th>
                      <th className="pb-3" style={{ padding: 8 }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRatings.map((r) => (
                      <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: 12, fontWeight: 600 }}>
                          {r.rater_name}
                          <span style={{ display: "block", fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>@{r.rater_username}</span>
                        </td>
                        <td style={{ padding: 12, fontWeight: 600 }}>
                          {r.ratee_name}
                          <span style={{ display: "block", fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>@{r.ratee_username}</span>
                        </td>
                        <td style={{ padding: 12 }}>
                          <StarRow value={r.rating} readOnly size={12} />
                        </td>
                        <td style={{ padding: 12, color: "var(--muted)", maxWidth: 250, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                          {r.feedback || <span style={{ fontStyle: "italic", opacity: 0.5 }}>No comment</span>}
                        </td>
                        <td style={{ padding: 12, color: "var(--muted)" }}>
                          {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(r.created_at))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 20px", border: "1px dashed var(--border)", borderRadius: 12 }}>
                <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>No peer ratings submitted yet.</p>
              </div>
            )}
          </div>
        </div>
      )}
      {toastNode}
    </div>
  );
}
