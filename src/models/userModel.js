// src/models/userModel.js
const pool = require("../config/db");

// -------------------------------------------------------
// PHASE 1: New function for temporary registration entry
// -------------------------------------------------------
async function createPendingUser(
  name,
  email,
  hashedPassword,
  role,
  verificationToken,
  mobileNumber,
  username
) {
  // NOTE: This assumes you have a 'pending_registrations' table setup in your DB migration.
  // It holds temporary user data until OTP/email verification is successful.
  const result = await pool.query(
    `INSERT INTO pending_registrations
      (name, email, password, role, verification_token, mobile_number, username)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [name, email, hashedPassword, role, verificationToken, mobileNumber, username]
  );
  return result.rows[0];
}

// -------------------------------------------------------
// PHASE 6 + PHASE 8 : Updated user model
// -------------------------------------------------------

// Create User (The final user creation after verification)
async function createUser(
  name,
  email,
  hashedPassword,
  role,
  verificationToken,
  mobileNumber,
  username
) {
  const result = await pool.query(
    `INSERT INTO users
      (name, email, password, role, is_verified, verification_token, mobile_number, username, is_mobile_verified)
     VALUES ($1, $2, $3, $4, FALSE, $5, $6, $7, FALSE)
     RETURNING id, name, email, role, is_verified, mobile_number, free_views, created_at, username`,
    [name, email, hashedPassword, role, verificationToken, mobileNumber, username]
  );
  return result.rows[0];
}

// ---------------- FIND USER FUNCTIONS ----------------

// Case-insensitive email lookup
async function findUserByEmail(email) {
  const result = await pool.query(
    "SELECT * FROM users WHERE email ILIKE $1",
    [email]
  );
  return result.rows[0];
}

// Case-insensitive username lookup
async function findUserByUsername(username) {
  const result = await pool.query(
    "SELECT * FROM users WHERE username ILIKE $1",
    [username]
  );
  return result.rows[0];
}

// Login with either email OR username
async function findUserByEmailOrUsername(identifier) {
  const result = await pool.query(
    "SELECT * FROM users WHERE email ILIKE $1 OR username ILIKE $1",
    [identifier]
  );
  return result.rows[0];
}

// Mobile lookup
async function findUserByMobile(mobile) {
  const result = await pool.query(
    "SELECT * FROM users WHERE mobile_number = $1",
    [mobile]
  );
  return result.rows[0];
}

async function findUserById(id) {
  const result = await pool.query(
    "SELECT * FROM users WHERE id = $1",
    [id]
  );
  return result.rows[0];
}

// ---------------- PASSWORD & LOGIN ----------------

async function updateUserPassword(userId, hashedPassword) {
  await pool.query(
    "UPDATE users SET password = $1 WHERE id = $2",
    [hashedPassword, userId]
  );
}

async function updateUserLastLogin(userId) {
  await pool.query(
    "UPDATE users SET last_login = NOW() WHERE id = $1",
    [userId]
  );
}

// ---------------- EMAIL VERIFICATION ----------------

async function verifyUser(userId) {
  await pool.query(
    "UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = $1",
    [userId]
  );
}

async function findUserByVerificationToken(token) {
  const result = await pool.query(
    "SELECT * FROM users WHERE verification_token = $1",
    [token]
  );
  return result.rows[0];
}

// ---------------- PROFILE UPDATE (PHASE 8) ----------------

async function updateUserProfile(userId, fields) {
  const queryParts = [];
  const queryValues = [];
  let index = 1;

  const columnMap = {
    name: "name",
    mobileNumber: "mobile_number",
    schoolCollege: "school_college",
    bio: "bio",
    username: "username", // Allow username updates (optional)
    avatarUrl: "avatar_url" // Cloudinary profile image
  };

  // Build dynamic SQL
  for (const [key, dbColumn] of Object.entries(columnMap)) {
    if (fields[key] !== undefined && fields[key] !== null) {
      queryParts.push(`${dbColumn} = $${index++}`);
      queryValues.push(fields[key]);
    }
  }

  // Nothing to update
  if (queryParts.length === 0) {
    const currentUser = await pool.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    return currentUser.rows[0];
  }

  queryValues.push(userId);
  const query = `
    UPDATE users
    SET ${queryParts.join(", ")}
    WHERE id = $${index}
    RETURNING *`;

  const result = await pool.query(query, queryValues);
  return result.rows[0];
}

// ---------------- FREE VIEWS ----------------
async function updateUserFreeViews(userId, newViews) {
  await pool.query(
    "UPDATE users SET free_views = $1 WHERE id = $2",
    [newViews, userId]
  );
}

// ---------------- TWO FACTOR AUTH (PHASE 6) ----------------

// Save 2FA secret
async function updateTwoFactorSecret(userId, secret, isEnabled = false) {
  const result = await pool.query(
    `UPDATE users
     SET two_factor_secret = $1, is_two_factor_enabled = $2
     WHERE id = $3
     RETURNING id, two_factor_secret, is_two_factor_enabled`,
    [secret, isEnabled, userId]
  );
  return result.rows[0];
}

async function enableTwoFactor(userId) {
  await pool.query(
    "UPDATE users SET is_two_factor_enabled = TRUE WHERE id = $1",
    [userId]
  );
}

async function disableTwoFactor(userId) {
  await pool.query(
    "UPDATE users SET two_factor_secret = NULL, is_two_factor_enabled = FALSE WHERE id = $1",
    [userId]
  );
}

// -------------------------------------------------------
// EXPORTS
// -------------------------------------------------------
module.exports = {
  createPendingUser, // <-- New Export
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserByEmailOrUsername,
  findUserByMobile,
  findUserById,
  updateUserPassword,
  updateUserLastLogin,
  verifyUser,
  findUserByVerificationToken,
  updateUserProfile,
  updateUserFreeViews,
  updateTwoFactorSecret,
  enableTwoFactor,
  disableTwoFactor,
};