import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import jwt from "jsonwebtoken";

dotenv.config();

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 5001;

/* =========================
   ENVIRONMENT CHECK
========================= */

if (
  !process.env.DATABASE_URL ||
  !process.env.JWT_SECRET ||
  !process.env.ADMIN_PASSWORD
) {
  console.error(
    "DATABASE_URL, JWT_SECRET and ADMIN_PASSWORD are required."
  );

  process.exit(1);
}

/* =========================
   POSTGRESQL
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false,
  },

  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  max: 5,

  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on("error", (error) => {
  console.error("PostgreSQL pool error:", error);
});

/* =========================
   MIDDLEWARE
========================= */

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://dashboard-aikyam-1.onrender.com",
    ],

    methods: [
      "GET",
      "POST",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

app.use(express.json());

/* =========================
   AUTHENTICATION
========================= */

function createToken() {
  return jwt.sign(
    {
      role: "admin",
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "12h",
    }
  );
}

function authenticate(req, res, next) {
  const authorization =
    req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication required.",
    });
  }

  const token = authorization.substring(7);

  try {
    req.admin = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    next();
  } catch {
    return res.status(401).json({
      message: "Session expired or invalid.",
    });
  }
}

/* =========================
   HEALTH
========================= */

app.get("/", (req, res) => {
  res.json({
    message: "AI AIKYAM Dashboard API",
    status: "online",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS current_time"
    );

    res.json({
      status: "healthy",
      database: "connected",
      time: result.rows[0].current_time,
    });
  } catch (error) {
    console.error(
      "Health check error:",
      error
    );

    res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: error.message,
      code: error.code || null,
    });
  }
});

/* =========================
   ADMIN LOGIN
========================= */

app.post("/api/admin/login", (req, res) => {
  const password = req.body?.password;

  if (
    !password ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      message: "Invalid admin password.",
    });
  }

  res.json({
    token: createToken(),
  });
});

/* =========================================================
   DATABASE SCHEMA
========================================================= */

async function initializeSchema() {
  /* =======================================================
     REGISTRATION SOFT DELETE
  ======================================================= */

  await pool.query(`
    ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS is_deleted
    BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query(`
    ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS deleted_at
    TIMESTAMP NULL;
  `);

  await pool.query(`
    UPDATE registrations
    SET is_deleted = FALSE
    WHERE is_deleted IS NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    registrations_is_deleted_idx
    ON registrations(is_deleted);
  `);

  /* =======================================================
     TEAMS TABLE
  ======================================================= */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,

      team_id VARCHAR(50)
        UNIQUE NOT NULL,

      team_name VARCHAR(150)
        NOT NULL,

      verified BOOLEAN
        NOT NULL DEFAULT FALSE,

      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /* =======================================================
     TEAM VERIFICATION COLUMN
  ======================================================= */

  await pool.query(`
    ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS verified
    BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  /* =======================================================
     TEAM MEMBERS
  ======================================================= */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,

      team_id INTEGER
        NOT NULL,

      registration_id VARCHAR(50)
        NOT NULL,

      created_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_team
        FOREIGN KEY (team_id)
        REFERENCES teams(id)
        ON DELETE CASCADE,

      CONSTRAINT fk_registration
        FOREIGN KEY (registration_id)
        REFERENCES registrations(registration_id)
        ON DELETE CASCADE,

      CONSTRAINT unique_team_member
        UNIQUE (team_id, registration_id),

      CONSTRAINT unique_registration_team
        UNIQUE (registration_id)
    );
  `);

  /* =======================================================
     TEAM INDEXES
  ======================================================= */

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_team_members_team_id
    ON team_members(team_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_team_members_registration_id
    ON team_members(registration_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    teams_verified_idx
    ON teams(verified);
  `);

  /* =======================================================
     QUERY RECYCLE BIN
  ======================================================= */

  await pool.query(`
    ALTER TABLE queries
    ADD COLUMN IF NOT EXISTS is_deleted
    BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query(`
    ALTER TABLE queries
    ADD COLUMN IF NOT EXISTS deleted_at
    TIMESTAMP NULL;
  `);

  await pool.query(`
    UPDATE queries
    SET is_deleted = FALSE
    WHERE is_deleted IS NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    queries_is_deleted_idx
    ON queries(is_deleted);
  `);

  console.log(
    "Database schema initialized successfully."
  );

  console.log(
    "Soft-delete / recycle-bin support enabled."
  );

  console.log(
    "Query recycle-bin support enabled."
  );

  console.log(
    "Team dashboard support enabled."
  );
}

/* =========================================================
   REGISTRATIONS
========================================================= */

app.get(
  "/api/registrations",
  authenticate,
  async (req, res) => {
    try {
      const status =
        req.query.status || "all";

      const search = String(
        req.query.search || ""
      ).trim();

      const page = Math.max(
        1,
        parseInt(req.query.page, 10) || 1
      );

      const limit = Math.min(
        100,
        Math.max(
          1,
          parseInt(req.query.limit, 10) || 20
        )
      );

      const offset =
        (page - 1) * limit;

      const conditions = [
        "COALESCE(is_deleted, FALSE) = FALSE",
      ];

      const values = [];

      /* =========================
         STATUS FILTER
      ========================= */

      if (status === "verified") {
        conditions.push(
          "payment_status = 'verified'"
        );
      }

      if (status === "pending") {
        conditions.push(`
          (
            payment_status IS NULL
            OR payment_status <> 'verified'
          )
        `);
      }

      /* =========================
         SEARCH
      ========================= */

      if (search) {
        values.push(`%${search}%`);

        const parameter =
          `$${values.length}`;

        conditions.push(`
          (
            name ILIKE ${parameter}
            OR email ILIKE ${parameter}
            OR phone ILIKE ${parameter}
            OR institution ILIKE ${parameter}
            OR city ILIKE ${parameter}
            OR department ILIKE ${parameter}
            OR registration_id ILIKE ${parameter}
            OR transaction_id ILIKE ${parameter}
          )
        `);
      }

      const where =
        `WHERE ${conditions.join(" AND ")}`;

      /* =========================
         FILTERED COUNT
      ========================= */

      const countResult =
        await pool.query(
          `
            SELECT COUNT(*)::int AS count
            FROM registrations
            ${where}
          `,
          values
        );

      /* =========================
         STATISTICS
      ========================= */

      const totalsResult =
        await pool.query(`
          SELECT

            COUNT(*)::int AS total,

            COUNT(*)
            FILTER (
              WHERE payment_status = 'verified'
            )::int AS verified,

            COUNT(*)
            FILTER (
              WHERE
                payment_status IS NULL
                OR payment_status <> 'verified'
            )::int AS pending,

            COALESCE(
              SUM(amount) FILTER (
                WHERE payment_status = 'verified'
              ),
              0
            )::int AS verified_revenue

          FROM registrations

          WHERE
            COALESCE(is_deleted, FALSE) = FALSE
        `);

      /* =========================
         REGISTRATION DATA
      ========================= */

      const rowsResult =
        await pool.query(
          `
            SELECT

              registration_id,
              name,
              email,
              phone,
              institution,
              city,
              department,
              year_of_study,
              events,
              amount,
              transaction_id,

              COALESCE(
                payment_status,
                'pending'
              ) AS payment_status,

              created_at

            FROM registrations

            ${where}

            ORDER BY
              created_at DESC,
              id DESC

            LIMIT $${values.length + 1}

            OFFSET $${values.length + 2}
          `,
          [
            ...values,
            limit,
            offset,
          ]
        );

      const statistics =
        totalsResult.rows[0];

      res.json({
        rows: rowsResult.rows,

        stats: {
          total: Number(
            statistics.total
          ),

          verified: Number(
            statistics.verified
          ),

          pending: Number(
            statistics.pending
          ),

          amount: Number(
            statistics.verified_revenue
          ),

          verifiedRevenue: Number(
            statistics.verified_revenue
          ),

          filtered: Number(
            countResult.rows[0].count
          ),
        },

        page,
        limit,
      });
    } catch (error) {
      console.error(
        "REGISTRATION QUERY ERROR:",
        error
      );

      res.status(500).json({
        message: error.message,
        code: error.code || null,
        detail: error.detail || null,
        hint: error.hint || null,
      });
    }
  }
);
/* =========================================================
   DASHBOARD STATISTICS
========================================================= */

app.get(
  "/api/registrations/stats",
  authenticate,
  async (req, res) => {
    try {
      const registrationResult =
        await pool.query(`
          SELECT
            COUNT(*)::int AS total,

            COUNT(*)
            FILTER (
              WHERE payment_status = 'verified'
            )::int AS verified,

            COUNT(*)
            FILTER (
              WHERE
                payment_status IS NULL
                OR payment_status <> 'verified'
            )::int AS pending,

            COALESCE(
              SUM(amount)
              FILTER (
                WHERE payment_status = 'verified'
              ),
              0
            )::int AS verified_revenue

          FROM registrations

          WHERE
            COALESCE(is_deleted, FALSE) = FALSE
        `);

      const teamResult =
        await pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*)
              FILTER (
                WHERE verified = TRUE
              )::int AS verified,
            COUNT(*)
              FILTER (
                WHERE verified = FALSE
              )::int AS pending
          FROM teams
        `);

      const queryResult =
        await pool.query(`
          SELECT
            COUNT(*)::int AS total
          FROM queries
          WHERE
            COALESCE(is_deleted, FALSE) = FALSE
        `);

      const registrations =
        registrationResult.rows[0];

      const teams =
        teamResult.rows[0];

      const queries =
        queryResult.rows[0];

      res.json({
        registrations:
          Number(registrations.total),

        total:
          Number(registrations.total),

        verified:
          Number(registrations.verified),

        pending:
          Number(registrations.pending),

        verifiedRevenue:
          Number(
            registrations.verified_revenue
          ),

        teams:
          Number(teams.total),

        verifiedTeams:
          Number(teams.verified),

        pendingTeams:
          Number(teams.pending),

        queries:
          Number(queries.total),
      });
    } catch (error) {
      console.error(
        "DASHBOARD STATS ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Unable to load dashboard statistics.",
        code: error.code || null,
      });
    }
  }
);
/* =========================================================
   VERIFY / UNVERIFY REGISTRATION
========================================================= */

app.patch(
  "/api/registrations/:registrationId/status",
  authenticate,
  async (req, res) => {
    try {
      const status =
        req.body?.status;

      if (
        !["pending", "verified"].includes(
          status
        )
      ) {
        return res.status(400).json({
          message:
            "Status must be pending or verified.",
        });
      }

      const result =
        await pool.query(
          `
            UPDATE registrations

            SET payment_status = $1

            WHERE
              registration_id = $2
              AND COALESCE(is_deleted, FALSE) = FALSE

            RETURNING
              registration_id,
              payment_status
          `,
          [
            status,
            req.params.registrationId,
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message:
            "Active registration not found.",
        });
      }

      res.json({
        message:
          status === "verified"
            ? "Registration verified."
            : "Registration moved back to pending.",

        registration:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "STATUS UPDATE ERROR:",
        error
      );

      res.status(500).json({
        message: error.message,
        code: error.code || null,
      });
    }
  }
);

/* =========================================================
   SOFT DELETE REGISTRATION
========================================================= */

app.delete(
  "/api/registrations/:registrationId",
  authenticate,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
            UPDATE registrations

            SET
              is_deleted = TRUE,
              deleted_at = CURRENT_TIMESTAMP

            WHERE
              registration_id = $1
              AND COALESCE(is_deleted, FALSE) = FALSE

            RETURNING
              registration_id,
              is_deleted,
              deleted_at
          `,
          [req.params.registrationId]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message:
            "Active registration not found.",
        });
      }

      res.json({
        message:
          "Registration moved to recycle bin.",

        registration:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "SOFT DELETE ERROR:",
        error
      );

      res.status(500).json({
        message: error.message,
        code: error.code || null,
      });
    }
  }
);

/* =========================================================
   REGISTRATION RECYCLE BIN
========================================================= */

app.get(
  "/api/registrations/recycle-bin",
  authenticate,
  async (req, res) => {
    try {
      const result =
        await pool.query(`
          SELECT

            registration_id,
            name,
            email,
            phone,
            institution,
            city,
            department,
            year_of_study,
            events,
            amount,
            transaction_id,

            COALESCE(
              payment_status,
              'pending'
            ) AS payment_status,

            created_at,
            deleted_at

          FROM registrations

          WHERE
            COALESCE(is_deleted, FALSE) = TRUE

          ORDER BY
            deleted_at DESC,
            id DESC
        `);

      res.json({
        rows: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      console.error(
        "RECYCLE BIN ERROR:",
        error
      );

      res.status(500).json({
        message: error.message,
        code: error.code || null,
      });
    }
  }
);

/* =========================================================
   RESTORE REGISTRATION
========================================================= */

app.patch(
  "/api/registrations/:registrationId/restore",
  authenticate,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
            UPDATE registrations

            SET
              is_deleted = FALSE,
              deleted_at = NULL

            WHERE
              registration_id = $1
              AND COALESCE(is_deleted, FALSE) = TRUE

            RETURNING
              registration_id,
              is_deleted,
              deleted_at,
              payment_status
          `,
          [req.params.registrationId]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message:
            "Deleted registration not found.",
        });
      }

      res.json({
        message:
          "Registration restored successfully.",

        registration:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "RESTORE ERROR:",
        error
      );

      res.status(500).json({
        message: error.message,
        code: error.code || null,
      });
    }
  }
);

/* =========================================================
   TEAMS — LIST
========================================================= */

app.get(
  "/teams",
  authenticate,
  async (req, res) => {
    try {
      const status =
        req.query.status || "all";

      const search = String(
        req.query.search || ""
      ).trim();

      const conditions = [];

      const values = [];

      /* =========================
         TEAM STATUS FILTER
      ========================= */

      if (status === "verified") {
        conditions.push(
          "t.verified = TRUE"
        );
      }

      if (status === "pending") {
        conditions.push(
          "t.verified = FALSE"
        );
      }

      /* =========================
         SEARCH
      ========================= */

      if (search) {
        values.push(`%${search}%`);

        const parameter =
          `$${values.length}`;

        conditions.push(`
          (
            t.team_id ILIKE ${parameter}
            OR t.team_name ILIKE ${parameter}
            OR EXISTS (
              SELECT 1
              FROM team_members tm2
              JOIN registrations r2
                ON r2.registration_id =
                   tm2.registration_id
              WHERE
                tm2.team_id = t.id
                AND (
                  r2.registration_id ILIKE ${parameter}
                  OR r2.name ILIKE ${parameter}
                  OR r2.email ILIKE ${parameter}
                )
            )
          )
        `);
      }

      const where =
        conditions.length > 0
          ? `WHERE ${conditions.join(" AND ")}`
          : "";

      /* =========================
         TEAM DATA
      ========================= */

      const result =
        await pool.query(
          `
            SELECT

              t.id,
              t.team_id,
              t.team_name,
              t.verified,
              t.created_at,

              COUNT(
                tm.registration_id
              )::int AS member_count,

              COALESCE(
                json_agg(
                  json_build_object(

                    'registrationId',
                    r.registration_id,

                    'name',
                    r.name,

                    'email',
                    r.email,

                    'phone',
                    r.phone,

                    'institution',
                    r.institution,

                    'city',
                    r.city,

                    'department',
                    r.department,

                    'yearOfStudy',
                    r.year_of_study,

                    'paymentStatus',
                    COALESCE(
                      r.payment_status,
                      'pending'
                    ),

                    'isDeleted',
                    COALESCE(
                      r.is_deleted,
                      FALSE
                    )

                  )
                  ORDER BY
                    tm.created_at ASC
                )
                FILTER (
                  WHERE
                    r.registration_id IS NOT NULL
                ),

                '[]'::json
              ) AS members

            FROM teams t

            LEFT JOIN team_members tm
              ON tm.team_id = t.id

            LEFT JOIN registrations r
              ON r.registration_id =
                 tm.registration_id

            ${where}

            GROUP BY
              t.id,
              t.team_id,
              t.team_name,
              t.verified,
              t.created_at

            ORDER BY
              t.created_at DESC,
              t.id DESC
          `,
          values
        );

      /* =========================
         TEAM STATISTICS
      ========================= */

      const statisticsResult =
        await pool.query(`
          SELECT

            COUNT(*)::int AS total,

            COUNT(*)
            FILTER (
              WHERE verified = TRUE
            )::int AS verified,

            COUNT(*)
            FILTER (
              WHERE verified = FALSE
            )::int AS pending

          FROM teams
        `);

      const statistics =
        statisticsResult.rows[0];

      res.json({
        rows: result.rows,

        stats: {
          total: Number(
            statistics.total
          ),

          verified: Number(
            statistics.verified
          ),

          pending: Number(
            statistics.pending
          ),
        },
      });
    } catch (error) {
      console.error(
        "TEAM LIST ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Unable to load teams.",
        code: error.code || null,
        detail: error.detail || null,
      });
    }
  }
);

/* =========================================================
   TEAM — VERIFY / UNVERIFY
========================================================= */

app.patch(
  "/teams/:teamId/status",
  authenticate,
  async (req, res) => {
    try {
      const status =
        req.body?.status;

      if (
        !["pending", "verified"].includes(
          status
        )
      ) {
        return res.status(400).json({
          message:
            "Team status must be pending or verified.",
        });
      }

      const verified =
        status === "verified";

      const result =
        await pool.query(
          `
            UPDATE teams

            SET verified = $1

            WHERE team_id = $2

            RETURNING
              team_id,
              team_name,
              verified,
              created_at
          `,
          [
            verified,
            req.params.teamId,
          ]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message:
            "Team not found.",
        });
      }

      res.json({
        success: true,

        message:
          verified
            ? "Team verified successfully."
            : "Team moved back to pending.",

        team:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "TEAM STATUS UPDATE ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to update team status.",
        code: error.code || null,
      });
    }
  }
);

/* =========================================================
   TEAM — SINGLE TEAM
========================================================= */

app.get(
  "/teams/:teamId",
  authenticate,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
            SELECT

              t.team_id,
              t.team_name,
              t.verified,
              t.created_at,

              COALESCE(
                json_agg(
                  json_build_object(

                    'registrationId',
                    r.registration_id,

                    'name',
                    r.name,

                    'email',
                    r.email,

                    'phone',
                    r.phone,

                    'institution',
                    r.institution,

                    'city',
                    r.city,

                    'department',
                    r.department,

                    'yearOfStudy',
                    r.year_of_study,

                    'paymentStatus',
                    COALESCE(
                      r.payment_status,
                      'pending'
                    ),

                    'isDeleted',
                    COALESCE(
                      r.is_deleted,
                      FALSE
                    )

                  )
                  ORDER BY
                    tm.created_at ASC
                )
                FILTER (
                  WHERE
                    r.registration_id IS NOT NULL
                ),

                '[]'::json
              ) AS members

            FROM teams t

            LEFT JOIN team_members tm
              ON tm.team_id = t.id

            LEFT JOIN registrations r
              ON r.registration_id =
                 tm.registration_id

            WHERE
              t.team_id = $1

            GROUP BY
              t.id,
              t.team_id,
              t.team_name,
              t.verified,
              t.created_at
          `,
          [req.params.teamId]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message:
            "Team not found.",
        });
      }

      res.json({
        team: result.rows[0],
      });
    } catch (error) {
      console.error(
        "SINGLE TEAM ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Unable to load team.",
        code: error.code || null,
      });
    }
  }
);

/* =========================================================
   CSV ESCAPING
========================================================= */

function csv(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const stringValue =
    Array.isArray(value)
      ? value.join(" | ")
      : String(value);

  return `"${stringValue.replaceAll(
    '"',
    '""'
  )}"`;
}

/* =========================================================
   CSV EXPORT
========================================================= */

app.get(
  "/api/registrations/export",
  async (req, res) => {
    try {
      const token =
        req.query.token;

      if (!token) {
        return res.status(401).send(
          "Authentication required."
        );
      }

      try {
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );
      } catch {
        return res.status(401).send(
          "Invalid or expired session."
        );
      }

      const status =
        req.query.status || "all";

      let statusCondition = "";

      if (status === "verified") {
        statusCondition =
          "AND payment_status = 'verified'";
      }

      if (status === "pending") {
        statusCondition = `
          AND (
            payment_status IS NULL
            OR payment_status <> 'verified'
          )
        `;
      }

      const result =
        await pool.query(`
          SELECT

            registration_id,
            name,
            email,
            phone,
            institution,
            city,
            department,
            year_of_study,
            events,
            amount,
            transaction_id,

            COALESCE(
              payment_status,
              'pending'
            ) AS payment_status,

            created_at

          FROM registrations

          WHERE
            COALESCE(is_deleted, FALSE) = FALSE

            ${statusCondition}

          ORDER BY
            created_at DESC
        `);

      const headers = [
        "Registration ID",
        "Name",
        "Email",
        "Phone",
        "Institution",
        "City",
        "Department",
        "Year of Study",
        "Events",
        "Amount",
        "Transaction ID",
        "Payment Status",
        "Created At",
      ];

      const lines = [
        headers
          .map(csv)
          .join(","),

        ...result.rows.map(
          (row) =>
            [
              row.registration_id,
              row.name,
              row.email,
              row.phone,
              row.institution,
              row.city,
              row.department,
              row.year_of_study,
              row.events,
              row.amount,
              row.transaction_id,
              row.payment_status,
              row.created_at,
            ]
              .map(csv)
              .join(",")
        ),
      ];

      let filename;

      if (status === "verified") {
        filename =
          "ai-aikyam-verified-registrations.csv";
      } else if (status === "pending") {
        filename =
          "ai-aikyam-unverified-registrations.csv";
      } else {
        filename =
          "ai-aikyam-all-active-registrations.csv";
      }

      res.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      res.send(
        lines.join("\n")
      );
    } catch (error) {
      console.error(
        "CSV EXPORT ERROR:",
        error
      );

      res.status(500).send(
        "Unable to export CSV."
      );
    }
  }
);

/* =========================================================
   QUERIES — ACTIVE LIST
========================================================= */

app.get(
  "/api/queries",
  authenticate,
  async (req, res) => {
    try {
      const result =
        await pool.query(`
          SELECT
            id,
            email,
            query,
            created_at

          FROM queries

          WHERE
            COALESCE(is_deleted, FALSE) = FALSE

          ORDER BY
            created_at DESC,
            id DESC
        `);

      res.json({
        rows: result.rows,
      });
    } catch (error) {
      console.error(
        "QUERY LIST ERROR:",
        error
      );

      res.status(500).json({
        message: error.message,
        code: error.code || null,
      });
    }
  }
);

/* =========================================================
   QUERY — SOFT DELETE
========================================================= */

app.delete(
  "/api/queries/:id",
  authenticate,
  async (req, res) => {
    try {
      const queryId =
        parseInt(req.params.id, 10);

      if (!Number.isInteger(queryId)) {
        return res.status(400).json({
          message:
            "Invalid query ID.",
        });
      }

      const result =
        await pool.query(
          `
            UPDATE queries

            SET
              is_deleted = TRUE,
              deleted_at = CURRENT_TIMESTAMP

            WHERE
              id = $1
              AND COALESCE(is_deleted, FALSE) = FALSE

            RETURNING
              id,
              email,
              query,
              created_at,
              is_deleted,
              deleted_at
          `,
          [queryId]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message:
            "Active query not found.",
        });
      }

      res.json({
        success: true,

        message:
          "Query moved to recycle bin.",

        query:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "QUERY SOFT DELETE ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to delete query.",
        code: error.code || null,
      });
    }
  }
);

/* =========================================================
   QUERY RECYCLE BIN
========================================================= */

app.get(
  "/api/queries/recycle-bin",
  authenticate,
  async (req, res) => {
    try {
      const result =
        await pool.query(`
          SELECT

            id,
            email,
            query,
            created_at,
            deleted_at

          FROM queries

          WHERE
            COALESCE(is_deleted, FALSE) = TRUE

          ORDER BY
            deleted_at DESC,
            id DESC
        `);

      res.json({
        rows: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      console.error(
        "QUERY RECYCLE BIN ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to load deleted queries.",
        code: error.code || null,
      });
    }
  }
);

/* =========================================================
   RESTORE QUERY
========================================================= */

app.patch(
  "/api/queries/:id/restore",
  authenticate,
  async (req, res) => {
    try {
      const queryId =
        parseInt(req.params.id, 10);

      if (!Number.isInteger(queryId)) {
        return res.status(400).json({
          message:
            "Invalid query ID.",
        });
      }

      const result =
        await pool.query(
          `
            UPDATE queries

            SET
              is_deleted = FALSE,
              deleted_at = NULL

            WHERE
              id = $1
              AND COALESCE(is_deleted, FALSE) = TRUE

            RETURNING
              id,
              email,
              query,
              created_at,
              is_deleted,
              deleted_at
          `,
          [queryId]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message:
            "Deleted query not found.",
        });
      }

      res.json({
        success: true,

        message:
          "Query restored successfully.",

        query:
          result.rows[0],
      });
    } catch (error) {
      console.error(
        "QUERY RESTORE ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to restore query.",
        code: error.code || null,
      });
    }
  }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (error, req, res, next) => {
    console.error(
      "UNHANDLED SERVER ERROR:",
      error
    );

    res.status(500).json({
      message:
        "Internal server error.",
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {
  try {
    console.log(
      "Testing PostgreSQL connection..."
    );

    const result =
      await pool.query(
        "SELECT NOW() AS now"
      );

    console.log(
      "PostgreSQL connected:",
      result.rows[0].now
    );

    await initializeSchema();

    console.log(
      "Soft-delete / recycle-bin schema ready."
    );

    console.log(
      "Query recycle-bin API ready."
    );

    console.log(
      "Team dashboard API ready."
    );

    console.log(
      "AI AIKYAM Dashboard database connection ready."
    );

    app.listen(
      PORT,
      () => {
        console.log(
          `AI AIKYAM Dashboard API running on port ${PORT}`
        );
      }
    );
  } catch (error) {
    console.error(
      "DATABASE CONNECTION / INITIALIZATION FAILED"
    );

    console.error(
      "MESSAGE:",
      error.message
    );

    console.error(
      "CODE:",
      error.code
    );

    console.error(
      "DETAIL:",
      error.detail
    );

    process.exit(1);
  }
}

startServer();