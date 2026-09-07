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

  // Render / hosted PostgreSQL requires SSL
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

      // CHANGE THIS TO YOUR ACTUAL
      // DEPLOYED DASHBOARD FRONTEND URL
      "https://YOUR-DASHBOARD-FRONTEND.onrender.com",
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

app.post("/api/auth/login", (req, res) => {
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

/* =========================
   DATABASE SCHEMA
========================= */

async function initializeSchema() {
  /*
   * Existing registrations table is preserved.
   *
   * These columns support the recycle bin.
   */

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

  /*
   * Make sure existing registrations
   * are treated as active.
   */

  await pool.query(`
    UPDATE registrations
    SET is_deleted = FALSE
    WHERE is_deleted IS NULL;
  `);

  /*
   * Index for faster active/deleted filtering.
   */

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    registrations_is_deleted_idx
    ON registrations(is_deleted);
  `);
}

/* =========================
   REGISTRATIONS
========================= */

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
         SEARCH FILTER
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
         DASHBOARD STATISTICS
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

          /*
           * ONLY VERIFIED ACTIVE
           * REGISTRATIONS COUNT
           * TOWARD REVENUE.
           */

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

/* =========================
   VERIFY / UNVERIFY
========================= */

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

/* =========================
   SOFT DELETE
========================= */

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

/* =========================
   RECYCLE BIN
========================= */

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

/* =========================
   RESTORE REGISTRATION
========================= */

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

/* =========================
   CSV ESCAPING
========================= */

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

/* =========================
   CSV EXPORT
========================= */

app.get(
  "/api/registrations/export",
  async (req, res) => {
    try {
      /*
       * Export uses the JWT supplied by
       * the dashboard as ?token=...
       */

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

/* =========================
   QUERIES
========================= */

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

/* =========================
   ERROR HANDLER
========================= */

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

/* =========================
   START SERVER
========================= */

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