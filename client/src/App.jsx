import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  LogOut,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  RotateCcw,
  Recycle,
  Users,
  XCircle,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:5001/api";

function apiFetch(path, options = {}) {
  const token = localStorage.getItem("aikyam_admin_token");

  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function dateText(value) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function Login({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      localStorage.setItem("aikyam_admin_token", data.token);
      onLogin();
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="eyebrow">AI · AIKYAM / ADMIN</div>
        <ShieldCheck size={34} />

        <h1>
          CONTROL
          <br />
          <em>CENTER.</em>
        </h1>

        <p>
          Authorized access only. Manage registrations, verification,
          deleted attendees and attendee queries.
        </p>

        <form onSubmit={submit}>
          <label>ADMIN PASSWORD</label>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
            required
          />

          {error && <div className="error-box">{error}</div>}

          <button className="primary-button" disabled={loading}>
            {loading ? "AUTHENTICATING..." : "ENTER DASHBOARD"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Stat({ label, value, Icon }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <Icon size={18} />
      </div>

      <strong>{value}</strong>
    </div>
  );
}

function Registrations({ onStats }) {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    verified: 0,
    pending: 0,
    amount: 0,
    verifiedRevenue: 0,
    filtered: 0,
  });

  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState("");

  const limit = 20;

  async function load() {
    setLoading(true);
    setError("");

    try {
      const q = new URLSearchParams({
        status,
        search,
        page: String(page),
        limit: String(limit),
      });

      const r = await apiFetch(`/registrations?${q}`);
      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.message || "Unable to load registrations");
      }

      setRows(d.rows || []);

      const nextStats = {
        total: Number(d.stats?.total || 0),
        verified: Number(d.stats?.verified || 0),
        pending: Number(d.stats?.pending || 0),
        filtered: Number(d.stats?.filtered || 0),
        amount: Number(d.stats?.amount || 0),
        verifiedRevenue: Number(
          d.stats?.verifiedRevenue ?? d.stats?.amount ?? 0
        ),
      };

      setStats(nextStats);
      onStats(nextStats);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [status, search, page]);

  async function setPaymentStatus(id, next) {
    setUpdating(id);
    setError("");

    try {
      const r = await apiFetch(
        `/registrations/${encodeURIComponent(id)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.message || "Update failed");
      }

      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating("");
    }
  }

  async function softDelete(id) {
    const confirmed = window.confirm(
      "Move this attendee to the recycle bin?"
    );

    if (!confirmed) return;

    setUpdating(id);
    setError("");

    try {
      const r = await apiFetch(
        `/registrations/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.message || "Unable to delete registration");
      }

      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating("");
    }
  }

  function exportCsv(type) {
    const token = localStorage.getItem("aikyam_admin_token");

    window.open(
      `${API}/registrations/export?status=${encodeURIComponent(
        type
      )}&token=${encodeURIComponent(token || "")}`,
      "_blank"
    );
  }

  const pages = Math.max(1, Math.ceil((stats.filtered || 0) / limit));

  return (
    <section>
      <div className="page-heading">
        <div>
          <div className="eyebrow">01 / REGISTRATIONS</div>

          <h2>
            ATTENDEE
            <br />
            <em>CONTROL.</em>
          </h2>
        </div>

        <button className="ghost-button" onClick={load} disabled={loading}>
          <RefreshCw size={15} />
          {loading ? "LOADING..." : "REFRESH"}
        </button>
      </div>

      <div className="stats-grid">
        <Stat label="TOTAL ACTIVE" value={stats.total} Icon={Users} />
        <Stat
          label="VERIFIED"
          value={stats.verified}
          Icon={CheckCircle2}
        />
        <Stat label="PENDING" value={stats.pending} Icon={XCircle} />
        <Stat
          label="VERIFIED REVENUE"
          value={formatMoney(stats.verifiedRevenue)}
          Icon={ShieldCheck}
        />
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />

          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, institution, transaction ID..."
          />
        </div>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">ALL STATUS</option>
          <option value="verified">VERIFIED</option>
          <option value="pending">UNVERIFIED</option>
        </select>

        <div className="export-menu">
          <button className="ghost-button">
            <Download size={15} /> EXPORT
          </button>

          <div className="export-dropdown">
            <button onClick={() => exportCsv("all")}>ALL ACTIVE DATA</button>
            <button onClick={() => exportCsv("verified")}>
              VERIFIED ONLY
            </button>
            <button onClick={() => exportCsv("pending")}>
              UNVERIFIED ONLY
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>REGISTRATION</th>
              <th>PARTICIPANT</th>
              <th>INSTITUTION</th>
              <th>EVENTS</th>
              <th>AMOUNT</th>
              <th>TRANSACTION</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="empty">
                  LOADING...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty">
                  NO ACTIVE REGISTRATIONS FOUND.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.registration_id}>
                  <td>
                    <strong>{row.registration_id}</strong>
                    <small>{dateText(row.created_at)}</small>
                  </td>

                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.email}</small>
                    <small>{row.phone}</small>
                  </td>

                  <td>
                    <strong>{row.institution}</strong>
                    <small>{row.city}</small>
                    <small>
                      {row.department} · Year {row.year_of_study}
                    </small>
                  </td>

                  <td>
                    <div className="event-list">
                      {(row.events || []).map((event) => (
                        <span key={event}>{event}</span>
                      ))}
                    </div>
                  </td>

                  <td>{formatMoney(row.amount)}</td>

                  <td className="transaction-cell">
                    {row.transaction_id || "—"}
                  </td>

                  <td>
                    <span
                      className={`status-pill ${
                        row.payment_status === "verified"
                          ? "verified"
                          : "pending"
                      }`}
                    >
                      {row.payment_status}
                    </span>
                  </td>

                  <td>
                    <div className="action-stack">
                      {row.payment_status === "verified" ? (
                        <button
                          className="status-button pending-button"
                          disabled={updating === row.registration_id}
                          onClick={() =>
                            setPaymentStatus(
                              row.registration_id,
                              "pending"
                            )
                          }
                        >
                          {updating === row.registration_id
                            ? "..."
                            : "UNVERIFY"}
                        </button>
                      ) : (
                        <button
                          className="status-button verify-button"
                          disabled={updating === row.registration_id}
                          onClick={() =>
                            setPaymentStatus(
                              row.registration_id,
                              "verified"
                            )
                          }
                        >
                          <CheckCircle2 size={14} />
                          {updating === row.registration_id
                            ? "..."
                            : "VERIFY"}
                        </button>
                      )}

                      <button
                        className="status-button delete-button"
                        disabled={updating === row.registration_id}
                        onClick={() =>
                          softDelete(row.registration_id)
                        }
                        title="Move to recycle bin"
                      >
                        <Trash2 size={14} />
                        RECYCLE
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <span>
          PAGE {page} / {pages}
        </span>

        <div>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={16} />
          </button>

          <button
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

function RecycleBin({ onStats }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const r = await apiFetch("/registrations/recycle-bin");
      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.message || "Unable to load recycle bin");
      }

      setRows(d.rows || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function restore(id) {
    const confirmed = window.confirm(
      "Restore this attendee to active registrations?"
    );

    if (!confirmed) return;

    setRestoring(id);
    setError("");

    try {
      const r = await apiFetch(
        `/registrations/${encodeURIComponent(id)}/restore`,
        {
          method: "PATCH",
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.message || "Unable to restore registration");
      }

      await load();

      // Force active dashboard statistics to refresh when returning.
      if (onStats) {
        onStats((current) => ({ ...current }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setRestoring("");
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <div className="eyebrow">03 / RECYCLE BIN</div>

          <h2>
            DELETED
            <br />
            <em>ATTENDEES.</em>
          </h2>
        </div>

        <button className="ghost-button" onClick={load} disabled={loading}>
          <RefreshCw size={15} />
          {loading ? "LOADING..." : "REFRESH"}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="recycle-summary">
        <Recycle size={18} />
        <span>
          {rows.length} attendee{rows.length === 1 ? "" : "s"} currently
          in the recycle bin.
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>REGISTRATION</th>
              <th>PARTICIPANT</th>
              <th>INSTITUTION</th>
              <th>EVENTS</th>
              <th>STATUS</th>
              <th>DELETED AT</th>
              <th>ACTION</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="empty">
                  LOADING RECYCLE BIN...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty">
                  RECYCLE BIN IS EMPTY.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.registration_id}>
                  <td>
                    <strong>{row.registration_id}</strong>
                    <small>{dateText(row.created_at)}</small>
                  </td>

                  <td>
                    <strong>{row.name}</strong>
                    <small>{row.email}</small>
                    <small>{row.phone}</small>
                  </td>

                  <td>
                    <strong>{row.institution}</strong>
                    <small>{row.city}</small>
                    <small>
                      {row.department} · Year {row.year_of_study}
                    </small>
                  </td>

                  <td>
                    <div className="event-list">
                      {(row.events || []).map((event) => (
                        <span key={event}>{event}</span>
                      ))}
                    </div>
                  </td>

                  <td>
                    <span
                      className={`status-pill ${
                        row.payment_status === "verified"
                          ? "verified"
                          : "pending"
                      }`}
                    >
                      {row.payment_status}
                    </span>
                  </td>

                  <td>{dateText(row.deleted_at)}</td>

                  <td>
                    <button
                      className="status-button restore-button"
                      disabled={restoring === row.registration_id}
                      onClick={() => restore(row.registration_id)}
                    >
                      <RotateCcw size={14} />
                      {restoring === row.registration_id
                        ? "..."
                        : "RESTORE"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Queries() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const r = await apiFetch("/queries");
      const d = await r.json();

      if (!r.ok) {
        throw new Error(d.message || "Unable to load queries");
      }

      setRows(d.rows || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  /*
   * mailto avoids the accounts.google.com redirect loop that can happen
   * with Gmail web compose URLs. If Gmail is the configured mail handler,
   * the compose window opens with recipient, subject and body populated.
   */
  function mailtoUrl(email, query) {
    const cleanEmail = String(email || "").trim();
    const subject = "Regarding your AI AIKYAM query";

    const body =
      `Hello,\n\n` +
      `Thank you for contacting the AI AIKYAM team.\n\n` +
      `Regarding your query:\n` +
      `"${String(query || "").trim()}"\n\n` +
      `Regards,\nAI AIKYAM Team`;

    return (
      `,https://mail.google.com/mail/?view=cm&fs=1&to=kurumaddali1201@gmail.com&su=${encodeURIComponent(cleanEmail)}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`
    );
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <div className="eyebrow">02 / INBOX</div>

          <h2>
            TEAM
            <br />
            <em>QUERIES.</em>
          </h2>
        </div>

        <button className="ghost-button" onClick={load} disabled={loading}>
          <RefreshCw size={15} />
          {loading ? "LOADING..." : "REFRESH"}
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="query-grid">
        {loading ? (
          <div className="empty-card">LOADING QUERIES...</div>
        ) : rows.length === 0 ? (
          <div className="empty-card">NO QUERIES YET.</div>
        ) : (
          rows.map((row) => (
            <article className="query-card" key={row.id}>
              <div className="query-top">
                <div>
                  <span className="query-number">
                    #{String(row.id).padStart(3, "0")}
                  </span>

                  <h3>{row.email}</h3>
                </div>

                <Mail size={19} />
              </div>

              <p>{row.query}</p>

              <div className="query-bottom">
                <small>{dateText(row.created_at)}</small>

                <a
                  className="gmail-button"
                  href={mailtoUrl(row.email, row.query)}
                >
                  REPLY IN GMAIL <ExternalLink size={14} />
                </a>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export default function App() {
  const [auth, setAuth] = useState(
    Boolean(localStorage.getItem("aikyam_admin_token"))
  );

  const [tab, setTab] = useState("registrations");

  const [stats, setStats] = useState({
    total: 0,
    verified: 0,
    pending: 0,
    verifiedRevenue: 0,
  });

  function logout() {
    localStorage.removeItem("aikyam_admin_token");
    setAuth(false);
  }

  if (!auth) {
    return <Login onLogin={() => setAuth(true)} />;
  }

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand">
          AI<span>·</span>AIKYAM
        </div>

        <div className="sidebar-label">ADMIN / 2026</div>

        <nav>
          <button
            className={tab === "registrations" ? "active" : ""}
            onClick={() => setTab("registrations")}
          >
            <Users size={17} />
            REGISTRATIONS
          </button>

          <button
            className={tab === "queries" ? "active" : ""}
            onClick={() => setTab("queries")}
          >
            <Mail size={17} />
            QUERIES
          </button>

          <button
            className={tab === "recycle" ? "active" : ""}
            onClick={() => setTab("recycle")}
          >
            <Recycle size={17} />
            RECYCLE BIN
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="mini-stat">
            <span>VERIFIED</span>
            <strong>{stats.verified || 0}</strong>
          </div>

          <div className="mini-stat">
            <span>PENDING</span>
            <strong>{stats.pending || 0}</strong>
          </div>

          <div className="mini-stat">
            <span>VERIFIED REVENUE</span>
            <strong>{formatMoney(stats.verifiedRevenue)}</strong>
          </div>

          <button className="logout-button" onClick={logout}>
            <LogOut size={15} />
            LOG OUT
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        {tab === "registrations" && (
          <Registrations onStats={setStats} />
        )}

        {tab === "queries" && <Queries />}

        {tab === "recycle" && <RecycleBin onStats={setStats} />}
      </main>
    </div>
  );
}
