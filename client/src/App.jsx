import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  LogOut,
  Mail,
  RefreshCw,
  Recycle,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  UsersRound,
} from "lucide-react";

/* =========================================================
   API
========================================================= */

const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://dashboard-aikyam-1.onrender.com/api";

function apiFetch(path, options = {}) {
  const token = localStorage.getItem("adminToken");

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {}),
    },
  });
}

function dateText(value) {
  if (!value) return "—";

  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatMoney(value) {
  return `₹ ${Number(value || 0).toLocaleString("en-IN")}`;
}

/* =========================================================
   LOGIN
========================================================= */

function Login({ onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();

    setLoading(true);
    setError("");

    try {
      const r = await apiFetch("/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password,
        }),
      });

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message || "Invalid admin password."
        );
      }

      if (!d.token) {
        throw new Error(
          "Login succeeded but no authentication token was returned."
        );
      }

      localStorage.setItem("adminToken", d.token);

      onLogin();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="eyebrow">
          AAIKYAM / ADMIN ACCESS
        </div>

        <ShieldCheck size={34} />

        <h1>
          ADMIN
          <br />
          <em>CONSOLE.</em>
        </h1>

        <p>
          Restricted administrative dashboard for
          registrations, teams and participant queries.
        </p>

        {error && (
          <div className="error-box">
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <label htmlFor="admin-password">
            ACCESS KEY
          </label>

          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            placeholder="Enter admin password"
            autoComplete="current-password"
          />

          <button
            className="primary-button"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "AUTHENTICATING..."
              : "ENTER CONSOLE"}
          </button>
        </form>
      </section>
    </main>
  );
}

/* =========================================================
   REGISTRATIONS
========================================================= */

function Registrations({ onStats }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [updating, setUpdating] = useState("");
  const [page, setPage] = useState(1);

  const perPage = 10;

  async function load() {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      params.set("limit", "100");
      params.set("page", "1");

      if (status !== "all") {
        params.set("status", status);
      }

      if (search.trim()) {
        params.set("search", search.trim());
      }

      const r = await apiFetch(
        `/registrations?${params.toString()}`
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to load registrations."
        );
      }

      setRows(d.rows || []);

      if (d.stats && onStats) {
        onStats(d.stats);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  useEffect(() => {
    const timer = setTimeout(() => {
      load();
      setPage(1);
    }, 250);

    return () => clearTimeout(timer);
  }, [search]);

  async function setPaymentStatus(id, next) {
    setUpdating(id);
    setError("");

    try {
      const r = await apiFetch(
        `/registrations/${encodeURIComponent(
          id
        )}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: next,
          }),
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to update registration status."
        );
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
        throw new Error(
          d.message ||
            "Unable to recycle registration."
        );
      }

      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating("");
    }
  }

  const pages = Math.max(
    1,
    Math.ceil(rows.length / perPage)
  );

  useEffect(() => {
    if (page > pages) {
      setPage(pages);
    }
  }, [pages, page]);

  const visibleRows = rows.slice(
    (page - 1) * perPage,
    page * perPage
  );

  function exportCsv(exportStatus = "all") {
    const token =
      localStorage.getItem("adminToken");

    if (!token) {
      setError("Authentication token missing.");
      return;
    }

    const url =
      `${API_BASE}/registrations/export` +
      `?status=${encodeURIComponent(
        exportStatus
      )}` +
      `&token=${encodeURIComponent(token)}`;

    window.open(url, "_blank");
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            01 / REGISTRATIONS
          </div>

          <h2>
            ATTENDEE
            <br />
            <em>REGISTRY.</em>
          </h2>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <div className="export-menu">
            <button className="ghost-button">
              <Download size={15} />
              EXPORT
            </button>

            <div className="export-dropdown">
              <button
                onClick={() =>
                  exportCsv("all")
                }
              >
                ALL REGISTRATIONS
              </button>

              <button
                onClick={() =>
                  exportCsv("verified")
                }
              >
                VERIFIED ONLY
              </button>

              <button
                onClick={() =>
                  exportCsv("pending")
                }
              >
                PENDING ONLY
              </button>
            </div>
          </div>

          <button
            className="ghost-button"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={15} />

            {loading
              ? "LOADING..."
              : "REFRESH"}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />

          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search attendee..."
          />
        </div>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">
            ALL STATUS
          </option>

          <option value="verified">
            VERIFIED
          </option>

          <option value="pending">
            PENDING
          </option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>REGISTRATION</th>
              <th>PARTICIPANT</th>
              <th>INSTITUTION</th>
              <th>EVENTS</th>
              <th>TRANSACTION</th>
              <th>STATUS</th>
              <th>ACTION</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan="7"
                  className="empty"
                >
                  LOADING REGISTRATIONS...
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan="7"
                  className="empty"
                >
                  NO REGISTRATIONS FOUND.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr
                  key={row.registration_id}
                >
                  <td>
                    <strong>
                      {row.registration_id}
                    </strong>

                    <small>
                      {dateText(
                        row.created_at
                      )}
                    </small>
                  </td>

                  <td>
                    <strong>{row.name}</strong>

                    <small>
                      {row.email}
                    </small>

                    <small>
                      {row.phone}
                    </small>
                  </td>

                  <td>
                    <strong>
                      {row.institution}
                    </strong>

                    <small>
                      {row.city}
                    </small>

                    <small>
                      {row.department} · Year{" "}
                      {row.year_of_study}
                    </small>
                  </td>

                  <td>
                    <div className="event-list">
                      {(row.events || []).map(
                        (event) => (
                          <span key={event}>
                            {event}
                          </span>
                        )
                      )}
                    </div>
                  </td>

                  <td className="transaction-cell">
                    {row.transaction_id ||
                      "—"}
                  </td>

                  <td>
                    <span
                      className={`status-pill ${
                        row.payment_status ===
                        "verified"
                          ? "verified"
                          : "pending"
                      }`}
                    >
                      {row.payment_status ||
                        "pending"}
                    </span>
                  </td>

                  <td>
                    <div className="action-stack">
                      {row.payment_status ===
                      "verified" ? (
                        <button
                          className="status-button pending-button"
                          disabled={
                            updating ===
                            row.registration_id
                          }
                          onClick={() =>
                            setPaymentStatus(
                              row.registration_id,
                              "pending"
                            )
                          }
                        >
                          {updating ===
                          row.registration_id
                            ? "..."
                            : "UNVERIFY"}
                        </button>
                      ) : (
                        <button
                          className="status-button verify-button"
                          disabled={
                            updating ===
                            row.registration_id
                          }
                          onClick={() =>
                            setPaymentStatus(
                              row.registration_id,
                              "verified"
                            )
                          }
                        >
                          <CheckCircle2
                            size={14}
                          />

                          {updating ===
                          row.registration_id
                            ? "..."
                            : "VERIFY"}
                        </button>
                      )}

                      <button
                        className="status-button delete-button"
                        disabled={
                          updating ===
                          row.registration_id
                        }
                        onClick={() =>
                          softDelete(
                            row.registration_id
                          )
                        }
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
            onClick={() =>
              setPage((p) => p - 1)
            }
          >
            <ChevronLeft size={16} />
          </button>

          <button
            disabled={page >= pages}
            onClick={() =>
              setPage((p) => p + 1)
            }
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   TEAMS
========================================================= */

function Teams() {
  const [teams, setTeams] = useState([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState("");
  const [showTeamRecycleBin, setShowTeamRecycleBin] =
    useState(false);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();

      if (search.trim()) {
        params.set("search", search.trim());
      }

      const query =
        params.toString()
          ? `?${params.toString()}`
          : "";

      const r = await apiFetch(
        `/teams${query}`
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to load teams."
        );
      }

      setTeams(
        d.rows ||
          d.teams ||
          []
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setTeamStatus(
    teamId,
    next
  ) {
    setUpdating(teamId);
    setError("");

    try {
      const r = await apiFetch(
        `/teams/${encodeURIComponent(
          teamId
        )}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status: next,
          }),
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to update team status."
        );
      }

      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating("");
    }
  }

  async function deleteTeam(teamId) {
    if (
      !window.confirm(
        "Move this team to the recycle bin?"
      )
    ) {
      return;
    }

    setUpdating(teamId);
    setError("");

    try {
      const r = await apiFetch(
        `/teams/${encodeURIComponent(
          teamId
        )}`,
        {
          method: "DELETE",
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to delete team."
        );
      }

      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUpdating("");
    }
  }

  function exportTeams(
    exportStatus = "all"
  ) {
    const token =
      localStorage.getItem("adminToken");

    if (!token) {
      setError(
        "Authentication token missing."
      );
      return;
    }

    const url =
      `${API_BASE}/teams/export` +
      `?status=${encodeURIComponent(
        exportStatus
      )}` +
      `&token=${encodeURIComponent(
        token
      )}`;

    window.open(url, "_blank");
  }

  const filtered = useMemo(() => {
    const q =
      search.trim().toLowerCase();

    if (!q) return teams;

    return teams.filter((team) =>
      JSON.stringify(team)
        .toLowerCase()
        .includes(q)
    );
  }, [teams, search]);

  if (showTeamRecycleBin) {
    return (
      <TeamRecycleBin
        onBack={() =>
          setShowTeamRecycleBin(false)
        }
      />
    );
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            02 / TEAMS
          </div>

          <h2>
            TEAM
            <br />
            <em>REGISTRY.</em>
          </h2>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <div className="export-menu">
            <button className="ghost-button">
              <Download size={15} />
              EXPORT
            </button>

            <div className="export-dropdown">
              <button
                onClick={() =>
                  exportTeams("all")
                }
              >
                ALL TEAMS
              </button>

              <button
                onClick={() =>
                  exportTeams("verified")
                }
              >
                VERIFIED TEAMS
              </button>

              <button
                onClick={() =>
                  exportTeams("pending")
                }
              >
                PENDING TEAMS
              </button>
            </div>
          </div>

          <button
            className="ghost-button"
            onClick={() =>
              setShowTeamRecycleBin(true)
            }
          >
            <Recycle size={15} />
            RECYCLE BIN
          </button>

          <button
            className="ghost-button"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={15} />

            {loading
              ? "LOADING..."
              : "REFRESH"}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />

          <input
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="Search teams..."
          />
        </div>
      </div>

      {loading ? (
        <div className="empty-card">
          LOADING TEAMS...
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-card">
          NO TEAMS FOUND.
        </div>
      ) : (
        <div className="query-grid">
          {filtered.map((team) => {
            const teamId =
              team.team_id ||
              team.id;

            const members =
              team.members ||
              [];

            const verified =
              Boolean(team.verified);

            return (
              <article
                className="query-card"
                key={teamId}
              >
                <div className="query-top">
                  <div>
                    <div className="query-number">
                      TEAM
                    </div>

                    <h3>
                      {team.team_name ||
                        "UNTITLED TEAM"}
                    </h3>
                  </div>

                  <UsersRound size={22} />
                </div>

                <p>
                  <strong>
                    TEAM ID:
                  </strong>{" "}
                  {teamId}

                  {"\n\n"}

                  <strong>
                    MEMBERS:
                  </strong>

                  {"\n"}

                  {members.length > 0
                    ? members
                        .map(
                          (member) =>
                            `${member.registrationId || member.registration_id || "UNKNOWN"} — ${member.name || ""}`
                        )
                        .join("\n")
                    : "No members returned."}
                </p>

                <div className="query-bottom">
                  <span
                    className={`status-pill ${
                      verified
                        ? "verified"
                        : "pending"
                    }`}
                  >
                    {verified
                      ? "VERIFIED"
                      : "PENDING"}
                  </span>

                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                    }}
                  >
                    {verified ? (
                      <button
                        className="status-button pending-button"
                        disabled={
                          updating ===
                          teamId
                        }
                        onClick={() =>
                          setTeamStatus(
                            teamId,
                            "pending"
                          )
                        }
                      >
                        {updating ===
                        teamId
                          ? "..."
                          : "UNVERIFY TEAM"}
                      </button>
                    ) : (
                      <button
                        className="status-button verify-button"
                        disabled={
                          updating ===
                          teamId
                        }
                        onClick={() =>
                          setTeamStatus(
                            teamId,
                            "verified"
                          )
                        }
                      >
                        <CheckCircle2
                          size={14}
                        />

                        {updating ===
                        teamId
                          ? "..."
                          : "VERIFY TEAM"}
                      </button>
                    )}

                    <button
                      className="status-button delete-button"
                      disabled={
                        updating ===
                        teamId
                      }
                      onClick={() =>
                        deleteTeam(teamId)
                      }
                    >
                      <Trash2 size={14} />

                      {updating ===
                      teamId
                        ? "..."
                        : "RECYCLE"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* =========================================================
   TEAM RECYCLE BIN
========================================================= */

function TeamRecycleBin({ onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const r = await apiFetch(
        "/teams/recycle-bin"
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to load deleted teams."
        );
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

  async function restore(teamId) {
    if (
      !window.confirm(
        "Restore this team to the active team registry?"
      )
    ) {
      return;
    }

    setRestoring(teamId);
    setError("");

    try {
      const r = await apiFetch(
        `/teams/${encodeURIComponent(
          teamId
        )}/restore`,
        {
          method: "PATCH",
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to restore team."
        );
      }

      await load();
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
          <div className="eyebrow">
            02 / TEAM RECYCLE BIN
          </div>

          <h2>
            DELETED
            <br />
            <em>TEAMS.</em>
          </h2>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <button
            className="ghost-button"
            onClick={onBack}
          >
            <ChevronLeft size={15} />
            BACK TO TEAMS
          </button>

          <button
            className="ghost-button"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={15} />

            {loading
              ? "LOADING..."
              : "REFRESH"}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      <div className="recycle-summary">
        <Recycle size={18} />

        <span>
          {rows.length} team
          {rows.length === 1
            ? ""
            : "s"} currently in
          the recycle bin.
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>TEAM ID</th>
              <th>TEAM NAME</th>
              <th>STATUS</th>
              <th>MEMBERS</th>
              <th>CREATED AT</th>
              <th>DELETED AT</th>
              <th>ACTION</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan="7"
                  className="empty"
                >
                  LOADING TEAM RECYCLE BIN...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan="7"
                  className="empty"
                >
                  TEAM RECYCLE BIN IS EMPTY.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.team_id}
                >
                  <td>
                    <strong>
                      {row.team_id}
                    </strong>
                  </td>

                  <td>
                    <strong>
                      {row.team_name}
                    </strong>
                  </td>

                  <td>
                    <span
                      className={`status-pill ${
                        row.verified
                          ? "verified"
                          : "pending"
                      }`}
                    >
                      {row.verified
                        ? "VERIFIED"
                        : "PENDING"}
                    </span>
                  </td>

                  <td>
                    {row.member_count}
                  </td>

                  <td>
                    {dateText(
                      row.created_at
                    )}
                  </td>

                  <td>
                    {dateText(
                      row.deleted_at
                    )}
                  </td>

                  <td>
                    <button
                      className="status-button restore-button"
                      disabled={
                        restoring ===
                        row.team_id
                      }
                      onClick={() =>
                        restore(
                          row.team_id
                        )
                      }
                    >
                      <RotateCcw
                        size={14}
                      />

                      {restoring ===
                      row.team_id
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

/* =========================================================
   REGISTRATION RECYCLE BIN
========================================================= */

function RecycleBin() {
  const [rows, setRows] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [restoring, setRestoring] =
    useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const r = await apiFetch(
        "/registrations/recycle-bin"
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to load recycle bin."
        );
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
    if (
      !window.confirm(
        "Restore this attendee to active registrations?"
      )
    ) {
      return;
    }

    setRestoring(id);
    setError("");

    try {
      const r = await apiFetch(
        `/registrations/${encodeURIComponent(
          id
        )}/restore`,
        {
          method: "PATCH",
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to restore registration."
        );
      }

      await load();
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
          <div className="eyebrow">
            04 / RECYCLE BIN
          </div>

          <h2>
            DELETED
            <br />
            <em>ATTENDEES.</em>
          </h2>
        </div>

        <button
          className="ghost-button"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw size={15} />

          {loading
            ? "LOADING..."
            : "REFRESH"}
        </button>
      </div>

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      <div className="recycle-summary">
        <Recycle size={18} />

        <span>
          {rows.length} attendee
          {rows.length === 1
            ? ""
            : "s"} currently in
          the recycle bin.
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
                <td
                  colSpan="7"
                  className="empty"
                >
                  LOADING RECYCLE BIN...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan="7"
                  className="empty"
                >
                  RECYCLE BIN IS EMPTY.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={
                    row.registration_id
                  }
                >
                  <td>
                    <strong>
                      {
                        row.registration_id
                      }
                    </strong>

                    <small>
                      {dateText(
                        row.created_at
                      )}
                    </small>
                  </td>

                  <td>
                    <strong>
                      {row.name}
                    </strong>

                    <small>
                      {row.email}
                    </small>

                    <small>
                      {row.phone}
                    </small>
                  </td>

                  <td>
                    <strong>
                      {row.institution}
                    </strong>

                    <small>
                      {row.city}
                    </small>

                    <small>
                      {row.department} · Year{" "}
                      {row.year_of_study}
                    </small>
                  </td>

                  <td>
                    <div className="event-list">
                      {(row.events ||
                        []).map(
                        (event) => (
                          <span
                            key={event}
                          >
                            {event}
                          </span>
                        )
                      )}
                    </div>
                  </td>

                  <td>
                    <span
                      className={`status-pill ${
                        row.payment_status ===
                        "verified"
                          ? "verified"
                          : "pending"
                      }`}
                    >
                      {row.payment_status ||
                        "pending"}
                    </span>
                  </td>

                  <td>
                    {dateText(
                      row.deleted_at
                    )}
                  </td>

                  <td>
                    <button
                      className="status-button restore-button"
                      disabled={
                        restoring ===
                        row.registration_id
                      }
                      onClick={() =>
                        restore(
                          row.registration_id
                        )
                      }
                    >
                      <RotateCcw
                        size={14}
                      />

                      {restoring ===
                      row.registration_id
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

/* =========================================================
   QUERIES
========================================================= */

function Queries() {
  const [rows, setRows] =
    useState([]);

  const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [deleting, setDeleting] =
    useState("");

  const [showRecycleBin, setShowRecycleBin] =
    useState(false);

  async function load() {
    setLoading(true);
    setError("");

    try {
      const r = await apiFetch(
        "/queries"
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to load queries."
        );
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

  async function deleteQuery(id) {
    if (
      !window.confirm(
        "Move this query to the recycle bin?"
      )
    ) {
      return;
    }

    setDeleting(id);
    setError("");

    try {
      const r = await apiFetch(
        `/queries/${encodeURIComponent(
          id
        )}`,
        {
          method: "DELETE",
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to delete query."
        );
      }

      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting("");
    }
  }

  function mailtoUrl(
    email,
    query
  ) {
    const subject =
      "Regarding your AI AIKYAM query";

    const body =
      `Hello,\n\n` +
      `Thank you for contacting the AI AIKYAM team.\n\n` +
      `Regarding your query:\n` +
      `"${query || ""}"\n\n` +
      `Regards,\nAI AIKYAM Team`;

    return (
    `https://mail.google.com/mail/?view=cm&fs=1` +
    `&to=${encodeURIComponent(
      String(email || "").trim()
    )}` +
    `&su=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`
  );
  }

  if (showRecycleBin) {
    return (
      <QueryRecycleBin
        onBack={() =>
          setShowRecycleBin(false)
        }
      />
    );
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            03 / QUERIES
          </div>

          <h2>
            INBOX
            <br />
            <em>QUERIES.</em>
          </h2>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <button
            className="ghost-button"
            onClick={() =>
              setShowRecycleBin(true)
            }
          >
            <Recycle size={15} />
            RECYCLE BIN
          </button>

          <button
            className="ghost-button"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={15} />

            {loading
              ? "LOADING..."
              : "REFRESH"}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      {loading ? (
        <div className="empty-card">
          LOADING QUERIES...
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-card">
          NO QUERIES FOUND.
        </div>
      ) : (
        <div className="query-grid">
          {rows.map((row, index) => (
            <article
              className="query-card"
              key={row.id}
            >
              <div className="query-top">
                <div>
                  <div className="query-number">
                    QUERY{" "}
                    {String(
                      index + 1
                    ).padStart(2, "0")}
                  </div>

                  <h3>
                    {row.email}
                  </h3>
                </div>

                <Mail size={22} />
              </div>

              <p>
                {row.query}
              </p>

              <div className="query-bottom">
                <small>
                  RECEIVED{" "}
                  {dateText(
                    row.created_at
                  )}
                </small>

                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    flexWrap: "wrap",
                  }}
                >
                  <a
                    className="gmail-button"
                    href={mailtoUrl(
                      row.email,
                      row.query
                    )}
                  >
                    <Mail size={14} />
                    REPLY
                  </a>

                  <button
                    className="status-button delete-button"
                    disabled={
                      deleting === row.id
                    }
                    onClick={() =>
                      deleteQuery(
                        row.id
                      )
                    }
                  >
                    <Trash2 size={14} />

                    {deleting ===
                    row.id
                      ? "..."
                      : "RECYCLE"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* =========================================================
   QUERY RECYCLE BIN
========================================================= */

function QueryRecycleBin({
  onBack,
}) {
  const [rows, setRows] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [restoring, setRestoring] =
    useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const r = await apiFetch(
        "/queries/recycle-bin"
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to load deleted queries."
        );
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
    if (
      !window.confirm(
        "Restore this query to the active inbox?"
      )
    ) {
      return;
    }

    setRestoring(id);
    setError("");

    try {
      const r = await apiFetch(
        `/queries/${encodeURIComponent(
          id
        )}/restore`,
        {
          method: "PATCH",
        }
      );

      const d = await r.json();

      if (!r.ok) {
        throw new Error(
          d.message ||
            "Unable to restore query."
        );
      }

      await load();
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
          <div className="eyebrow">
            03 / QUERY RECYCLE BIN
          </div>

          <h2>
            DELETED
            <br />
            <em>QUERIES.</em>
          </h2>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <button
            className="ghost-button"
            onClick={onBack}
          >
            <ChevronLeft size={15} />
            BACK TO QUERIES
          </button>

          <button
            className="ghost-button"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw size={15} />

            {loading
              ? "LOADING..."
              : "REFRESH"}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      <div className="recycle-summary">
        <Recycle size={18} />

        <span>
          {rows.length} quer
          {rows.length === 1
            ? "y"
            : "ies"} currently in
          the recycle bin.
        </span>
      </div>

      {loading ? (
        <div className="empty-card">
          LOADING QUERY RECYCLE BIN...
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-card">
          QUERY RECYCLE BIN IS EMPTY.
        </div>
      ) : (
        <div className="query-grid">
          {rows.map((row, index) => (
            <article
              className="query-card"
              key={row.id}
            >
              <div className="query-top">
                <div>
                  <div className="query-number">
                    DELETED QUERY{" "}
                    {String(
                      index + 1
                    ).padStart(2, "0")}
                  </div>

                  <h3>
                    {row.email}
                  </h3>
                </div>

                <Recycle size={22} />
              </div>

              <p>
                {row.query}
              </p>

              <div className="query-bottom">
                <small>
                  DELETED{" "}
                  {dateText(
                    row.deleted_at
                  )}
                </small>

                <button
                  className="status-button restore-button"
                  disabled={
                    restoring === row.id
                  }
                  onClick={() =>
                    restore(row.id)
                  }
                >
                  <RotateCcw
                    size={14}
                  />

                  {restoring ===
                  row.id
                    ? "..."
                    : "RESTORE"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard({
  onLogout,
}) {
  const [section, setSection] =
    useState("registrations");

  const [stats, setStats] =
    useState({
      total: 0,
      verified: 0,
      pending: 0,
      verifiedRevenue: 0,
      teams: 0,
      queries: 0,
    });

  const [statsLoading, setStatsLoading] =
    useState(true);

  async function loadStats() {
    setStatsLoading(true);

    try {
      /*
        The server already returns registration
        statistics from GET /api/registrations.
      */

      const r = await apiFetch(
        "/registrations?limit=1&page=1"
      );

      const d = await r.json();

      if (r.ok) {
        setStats({
          total:
            d.stats?.total ??
            0,

          registrations:
            d.stats?.total ??
            0,

          verified:
            d.stats?.verified ??
            0,

          pending:
            d.stats?.pending ??
            0,

          verifiedRevenue:
            d.stats?.verifiedRevenue ??
            0,

          teams:
            d.teamStats?.total ??
            0,

          queries:
            d.queryStats?.total ??
            0,
        });
      }

      /*
        Team statistics are loaded separately.
      */

      const teamResponse =
        await apiFetch("/teams");

      if (teamResponse.ok) {
        const teamData =
          await teamResponse.json();

        setStats((current) => ({
          ...current,
          teams:
            teamData.stats?.total ??
            teamData.rows?.length ??
            0,
        }));
      }

      /*
        Query count.
      */

      const queryResponse =
        await apiFetch("/queries");

      if (queryResponse.ok) {
        const queryData =
          await queryResponse.json();

        setStats((current) => ({
          ...current,
          queries:
            queryData.rows?.length ??
            0,
        }));
      }
    } catch {
      // Stats should never crash dashboard.
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  function logout() {
    localStorage.removeItem(
      "adminToken"
    );

    onLogout();
  }

  const navItems = [
    {
      id: "registrations",
      label: "REGISTRATIONS",
      icon: Users,
    },
    {
      id: "teams",
      label: "TEAMS",
      icon: UsersRound,
    },
    {
      id: "queries",
      label: "QUERIES",
      icon: Mail,
    },
    {
      id: "recycle",
      label: "RECYCLE BIN",
      icon: Recycle,
    },
  ];

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            AI <span>AIKYAM</span>
          </div>

          <div className="sidebar-label">
            ADMIN CONSOLE
          </div>
        </div>

        <nav>
          {navItems.map((item) => {
            const Icon =
              item.icon;

            return (
              <button
                key={item.id}
                className={
                  section === item.id
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setSection(item.id)
                }
              >
                <Icon size={15} />

                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="mini-stat">
            <span>
              REGISTRATIONS
            </span>

            <strong>
              {statsLoading
                ? "..."
                : stats.total ??
                  stats.registrations}
            </strong>
          </div>

          <div className="mini-stat">
            <span>
              VERIFIED
            </span>

            <strong>
              {statsLoading
                ? "..."
                : stats.verified}
            </strong>
          </div>

          <div className="mini-stat">
            <span>
              TEAMS
            </span>

            <strong>
              {statsLoading
                ? "..."
                : stats.teams}
            </strong>
          </div>

          <div className="mini-stat">
            <span>
              QUERIES
            </span>

            <strong>
              {statsLoading
                ? "..."
                : stats.queries}
            </strong>
          </div>

          <button
            className="logout-button"
            onClick={logout}
          >
            <LogOut size={15} />
            LOGOUT
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        {section ===
          "registrations" && (
          <Registrations
            onStats={(newStats) =>
              setStats((current) => ({
                ...current,
                ...newStats,
                registrations:
                  newStats.total ??
                  current.registrations,
              }))
            }
          />
        )}

        {section === "teams" && (
          <Teams />
        )}

        {section === "queries" && (
          <Queries />
        )}

        {section === "recycle" && (
          <RecycleBin />
        )}
      </main>
    </div>
  );
}

/* =========================================================
   APP
========================================================= */

export default function App() {
  const [authenticated, setAuthenticated] =
    useState(
      Boolean(
        localStorage.getItem(
          "adminToken"
        )
      )
    );

  if (!authenticated) {
    return (
      <Login
        onLogin={() =>
          setAuthenticated(true)
        }
      />
    );
  }

  return (
    <Dashboard
      onLogout={() =>
        setAuthenticated(false)
      }
    />
  );
}