// server.js
// Entrypoint for OriNotes backend
// - Loads .env first
// - Boots app from ./app
// - Ensures an admin account exists (if ADMIN_EMAIL + ADMIN_PASSWORD are provided)
// - Optionally triggers badge checks if the badge util exports them

require('dotenv').config();

const app = require('./app');
const pool = require('./config/db'); // central DB pool used throughout the project
const bcrypt = require('bcrypt');

const PORT = process.env.PORT || 5000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || (ADMIN_EMAIL ? ADMIN_EMAIL.split('@')[0] : 'admin');

let badgeChecker = null;
try {
  // Try to require a badge/check utility if present (path tolerant)
  // Common locations: ./utils/badgeService.js or ./src/services/badgeService.js
  try {
    badgeChecker = require('./utils/badgeService');
  } catch (e) {
    // fallback
    try {
      badgeChecker = require('./src/services/badgeService');
    } catch (e2) {
      badgeChecker = null;
    }
  }
} catch (err) {
  badgeChecker = null;
}

/**
 * Ensure admin account exists and has role=admin.
 * This is intentionally conservative:
 *  - If ADMIN_* env vars are not defined, it does nothing.
 *  - It will not override other fields (only sets role, and password if explicitly provided).
 */
async function fixAdminAccount() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log('⚠️  ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin account auto-check.');
    return;
  }

  try {
    // Check if a user exists with the admin email (case-insensitive)
    const { rows } = await pool.query('SELECT id, email, role FROM users WHERE email ILIKE $1 LIMIT 1', [ADMIN_EMAIL]);
    if (rows.length === 0) {
      // Create admin user
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
      const insertQ = `
        INSERT INTO users (name, email, password, role, is_verified, username, created_at)
        VALUES ($1, $2, $3, 'admin', TRUE, $4, NOW())
        RETURNING id, email, role, username
      `;
      const insertRes = await pool.query(insertQ, [ADMIN_NAME, ADMIN_EMAIL, hashed, ADMIN_USERNAME]);
      console.log('✅ Admin account created:', insertRes.rows[0]);
      return;
    }

    // If user exists, ensure role is admin and optionally update password if env requests it
    const user = rows[0];

    // Ensure role is 'admin'
    if (user.role !== 'admin') {
      await pool.query('UPDATE users SET role = $1 WHERE id = (SELECT id FROM users WHERE email ILIKE $2 LIMIT 1)', ['admin', ADMIN_EMAIL]);
      console.log(`🔧 Updated existing user ${user.email} to role=admin.`);
    } else {
      console.log(`ℹ️ Admin user already present: ${user.email}`);
    }

    // Optionally update password only if ADMIN_FORCE_PASSWORD_RESET=true (safe opt-in)
    if (process.env.ADMIN_FORCE_PASSWORD_RESET && process.env.ADMIN_FORCE_PASSWORD_RESET.toLowerCase() === 'true') {
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await pool.query('UPDATE users SET password = $1 WHERE email ILIKE $2', [hashed, ADMIN_EMAIL]);
      console.log('🔐 Admin password updated via ADMIN_FORCE_PASSWORD_RESET=true.');
    }

  } catch (err) {
    console.error('❌ fixAdminAccount failed:', err);
  }
}

/**
 * Attempt to run a badge-checking routine (if exported).
 * The server will not fail if the module or function is missing.
 */
function runBadgeChecksIfAvailable() {
  if (!badgeChecker) {
    console.log('ℹ️ No badge-checker module found (utils or src/services). Skipping scheduled badge checks.');
    return;
  }

  // Preferred function name: checkAllUsers
  const checkFn = badgeChecker.checkAllUsers || badgeChecker.checkAll || badgeChecker.runBadgeChecks;
  if (typeof checkFn !== 'function') {
    console.log('ℹ️ Badge module found but no exported check function (checkAllUsers / checkAll / runBadgeChecks). Skipping scheduled badge checks.');
    return;
  }

  try {
    console.log('⏱️  Running initial badge check in 5s...');
    setTimeout(() => {
      try { checkFn(); } catch (e) { console.error('Badge check initial run failed:', e); }
    }, 5000);

    // Re-run hourly (safe default). You can control via env if desired.
    const intervalMs = parseInt(process.env.BADGE_CHECK_INTERVAL_MS || `${60 * 60 * 1000}`, 10);
    setInterval(() => {
      try { checkFn(); } catch (e) { console.error('Scheduled badge check failed:', e); }
    }, intervalMs);

    console.log(`✅ Badge checks scheduled every ${Math.round((intervalMs / 1000) / 60)} minutes.`);
  } catch (err) {
    console.error('❌ Error scheduling badge checks:', err);
  }
}

// Start the HTTP server
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server is listening on port ${PORT} (env: ${process.env.NODE_ENV || 'development'})`);

  // Run admin-account fix (if env configured)
  await fixAdminAccount().catch(err => console.error('fixAdminAccount error:', err));

  // Schedule or run badge checks if available
  runBadgeChecksIfAvailable();
});

// Robust handlers for unexpected errors
process.on('unhandledRejection', (reason) => {
  console.error('--- 🛑 UNHANDLED PROMISE REJECTION 🛑 ---');
  console.error(reason instanceof Error ? reason.stack : reason);
  // Optional: decide to shutdown in extreme cases
});

process.on('uncaughtException', (err) => {
  console.error('--- 💀 UNCAUGHT EXCEPTION 💀 ---');
  console.error(err.stack || err);
  // In many deployments you may want to exit after uncaught exceptions:
  // process.exit(1);
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n⚠️ ${signal} received — shutting down gracefully...`);
  try {
    // stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed.');
    });

    // give the server up to 10s to close connections
    setTimeout(async () => {
      try {
        await pool.end(); // close DB pool
        console.log('DB pool closed.');
      } catch (e) {
        console.error('Error closing DB pool:', e);
      } finally {
        process.exit(0);
      }
    }, 10000);
  } catch (err) {
    console.error('Error during graceful shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export server for tests if needed
module.exports = server;
