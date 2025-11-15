// db.js
const { Pool } = require("pg");
require("dotenv").config();

const isProduction = !!process.env.DATABASE_URL || process.env.NODE_ENV === "production";

const maxClients = parseInt(process.env.MAX_DB_CLIENTS || "20", 10);
const idleTimeoutMillis = parseInt(process.env.DB_IDLE_TIMEOUT_MS || "30000", 10); // 30s
const connectionTimeoutMillis = parseInt(process.env.DB_CONN_TIMEOUT_MS || "2000", 10); // 2s

let connectionConfig = {
  max: maxClients,
  idleTimeoutMillis,
  connectionTimeoutMillis,
};

if (process.env.DATABASE_URL) {
  console.log("✅ Production DB config loaded (using DATABASE_URL)");
  connectionConfig.connectionString = process.env.DATABASE_URL;

  // For managed Postgres (Render / Heroku) we generally need ssl with rejectUnauthorized false
  // If you have a CA bundle, set REJECT_UNAUTHORIZED to 'true' and provide proper certs.
  connectionConfig.ssl = {
    rejectUnauthorized: process.env.DB_REJECT_UNAUTHORIZED === "true" ? true : false,
  };
} else {
  // Local dev config expected in .env
  console.log("✅ Development DB config loaded (using .env variables)");
  connectionConfig.user = process.env.DB_USER || "postgres";
  connectionConfig.host = process.env.DB_HOST || "localhost";
  connectionConfig.database = process.env.DB_NAME || "learnify";
  connectionConfig.password = process.env.DB_PASS || "";
  connectionConfig.port = parseInt(process.env.DB_PORT || "5432", 10);
  // SSL typically not used in local dev
}

// Create pool
const pool = new Pool(connectionConfig);

// Basic pool error handler (avoid app crash on idle client error)
pool.on("error", (err) => {
  console.error("Unexpected error on idle DB client", err);
});

// Convenience wrapper (optional)
async function runQuery(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // Uncomment to log slow queries in dev: console.log('Executed query', { text, duration, rows: res.rowCount });
  return res;
}

module.exports = pool;
module.exports.runQuery = runQuery;
