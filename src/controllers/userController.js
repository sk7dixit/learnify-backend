// src/controllers/userController.js
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const pool = require("../config/db");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const {
  createUser,
  findUserByEmail,
  findUserByUsername,
  findUserByEmailOrUsername,
  verifyUser,
  findUserById,
  updateUserPassword,
  updateUserProfile,
  updateUserLastLogin,
  findUserByVerificationToken,
  updateTwoFactorSecret,
  enableTwoFactor,
  disableTwoFactor
} = require("../models/userModel");
const generateToken = require("../utils/generateToken");
const {
  sendEmailOtp,
  sendResetPasswordEmail,
  sendLoginNotification
} = require("../utils/sendEmail");
const { sendSmsOtp, sendResetSms } = require("../utils/sendSms");

// Configuration constants (adjust via env vars)
const RESET_TOKEN_EXPIRY_MINUTES = parseInt(process.env.RESET_TOKEN_EXPIRY_MINUTES || "60", 10); // 60 min
const REFRESH_TOKEN_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || "10", 10); // 10 days
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || "10", 10);
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

// --- helper payload for frontend (unchanged) ---
const createUserPayload = (user, isSubscriptionEnabled) => {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    subscription_expiry: user.subscription_expiry,
    free_views: user.free_views,
    is_subscription_enabled: isSubscriptionEnabled,
  };
};

// ----------------------
// PENDING REGISTRATION (Phase 8)
// ----------------------
async function registerUser(req, res) {
  try {
    const { name, email, password, mobileNumber, username } = req.body;

    if (!name || !email || !password || !mobileNumber || !username) {
      return res.status(400).json({
        error: "All required fields are needed: name, email, password, mobileNumber, username",
      });
    }

    // Prevent duplicate in final users
    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: "User already exists with this email" });
    }
    const existingUsername = await findUserByUsername(username);
    if (existingUsername) {
      return res.status(400).json({ error: "This username is already taken" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const role = email === process.env.ADMIN_EMAIL ? "admin" : "user";

    // Generate OTP for verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const now = new Date();

    // Upsert into pending_registrations table (create if missing)
    await pool.query(
      `INSERT INTO pending_registrations (name, email, password, username, mobile_number, role, otp, otp_created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password = EXCLUDED.password,
         username = EXCLUDED.username,
         mobile_number = EXCLUDED.mobile_number,
         role = EXCLUDED.role,
         otp = EXCLUDED.otp,
         otp_created_at = EXCLUDED.otp_created_at`,
      [name, email.toLowerCase().trim(), hashedPassword, username, mobileNumber, role, otp, now]
    );

    // Send OTP via email (and optionally SMS)
    await sendEmailOtp(email, otp).catch(e => console.warn("sendEmailOtp error:", e));
    // Optionally: sendSmsOtp(mobileNumber, otp) if phone verification desired

    return res.status(201).json({
      message: "Registration pending. OTP sent to your email. Please verify to complete signup.",
    });
  } catch (err) {
    console.error("Registration error (pending flow):", err);
    return res.status(500).json({ error: "Registration failed", details: err.message });
  }
}

// ----------------------
// LOGIN / 2FA / REMEMBER-ME (Phase 7)
// ----------------------
async function loginUser(req, res) {
  try {
    const { identifier, password, twoFactorCode, rememberMe } = req.body; // rememberMe boolean
    if (!identifier || !password) {
      return res.status(400).json({ error: "Identifier and password are required" });
    }

    const user = await findUserByEmailOrUsername(identifier);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!user.is_verified) {
      return res.status(403).json({ error: "Please verify your email to log in." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 2FA check
    if (user.is_two_factor_enabled) {
      if (!twoFactorCode) {
        return res.status(403).json({ error: "2FA required", twoFactorRequired: true });
      }
      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret,
        encoding: "base32",
        token: twoFactorCode,
      });
      if (!verified) {
        return res.status(403).json({ error: "Invalid 2FA code", twoFactorRequired: true });
      }
    }

    // Update last login
    await updateUserLastLogin(user.id);

    // Prepare response
    const settingsResult = await pool.query(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'is_subscription_enabled'"
    );
    const isSubscriptionEnabled = settingsResult.rows[0]?.setting_value ?? false;
    const freshUser = await findUserById(user.id);

    // Generate access token (short-lived)
    const accessToken = generateToken(freshUser);

    // If rememberMe true, create refresh token and set httpOnly cookie
    if (rememberMe) {
      const { rawToken, hashedToken, expiresAt } = await _createRefreshTokenForUser(user.id, req);
      // store cookie (10 days)
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
      };
      res.cookie("refreshToken", rawToken, cookieOptions);
      // Optionally send login notification
      sendLoginNotification(user.email, { ip: req.ip, agent: req.get("User-Agent") }).catch(() => { });
      return res.json({
        message: "Login successful",
        user: createUserPayload(freshUser, isSubscriptionEnabled),
        token: accessToken,
        remember: true,
      });
    }

    return res.json({
      message: "Login successful",
      user: createUserPayload(freshUser, isSubscriptionEnabled),
      token: accessToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed", details: err.message });
  }
}

// Helper: create & store refresh token (returns raw and hashed)
async function _createRefreshTokenForUser(userId, req) {
  const rawToken = crypto.randomBytes(64).toString("hex"); // long random token
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, hashedToken, expiresAt.toISOString(), req.get("User-Agent") || null, req.ip || null]
  );

  return { rawToken, hashedToken, expiresAt };
}

// ----------------------
// REFRESH AUTH TOKEN endpoint (Phase 7)
// ----------------------
async function refreshAuthToken(req, res) {
  try {
    // Try cookie first, then body
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!rawToken) {
      return res.status(401).json({ error: "No refresh token provided" });
    }
    const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");

    const rtResult = await pool.query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked, u.*
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token = $1 LIMIT 1`,
      [hashed]
    );

    if (rtResult.rowCount === 0) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }
    const row = rtResult.rows[0];
    if (row.revoked) return res.status(401).json({ error: "Refresh token revoked" });
    if (new Date(row.expires_at) < new Date()) return res.status(401).json({ error: "Refresh token expired" });

    // Issue new short-lived access token
    const user = await findUserById(row.user_id);
    if (!user) return res.status(401).json({ error: "User not found" });

    const newAccessToken = generateToken(user);

    // (Optional) rotate refresh token: for simplicity we keep same refresh token
    res.json({ token: newAccessToken });
  } catch (err) {
    console.error("refreshAuthToken error:", err);
    res.status(500).json({ error: "Failed to refresh token" });
  }
}

// Logout / revoke refresh token (Phase 7)
async function logout(req, res) {
  try {
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!rawToken) {
      // Clear cookie anyway
      res.clearCookie("refreshToken");
      return res.json({ message: "Logged out" });
    }
    const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");
    await pool.query("UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1", [hashed]);
    res.clearCookie("refreshToken");
    return res.json({ message: "Logged out and refresh token revoked" });
  } catch (err) {
    console.error("Logout error:", err);
    res.clearCookie("refreshToken");
    res.status(500).json({ error: "Logout failed" });
  }
}

// ----------------------
// 2FA helpers (existing) - ensure speakeasy & qrcode imported
// ----------------------
async function generateTwoFactorSecret(req, res) {
  try {
    const userId = req.user.id;
    const secret = speakeasy.generateSecret({
      name: `OriNotes:${req.user.username}`,
    });
    await updateTwoFactorSecret(userId, secret.base32);
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qrCodeUrl });
  } catch (err) {
    console.error("❌ Error generating 2FA secret:", err.message);
    res.status(500).json({ error: "Failed to generate 2FA secret." });
  }
}

async function verifyTwoFactorSetup(req, res) {
  try {
    const { token, secret } = req.body;
    const userId = req.user.id;
    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
    });
    if (verified) {
      await enableTwoFactor(userId);
      const user = await findUserById(userId);
      const settingsResult = await pool.query(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'is_subscription_enabled'"
      );
      const isSubscriptionEnabled = settingsResult.rows[0]?.setting_value ?? false;
      return res.json({
        message: "✅ 2FA successfully enabled.",
        user: createUserPayload(user, isSubscriptionEnabled),
        token: generateToken(user),
      });
    } else {
      await updateTwoFactorSecret(userId, null, false);
      res.status(400).json({ error: "❌ Invalid verification code. 2FA setup failed." });
    }
  } catch (err) {
    console.error("❌ Error verifying 2FA setup:", err.message);
    res.status(500).json({ error: "Failed to verify 2FA setup." });
  }
}

async function disableTwoFactorAuth(req, res) {
  try {
    await disableTwoFactor(req.user.id);
    const user = await findUserById(req.user.id);
    const settingsResult = await pool.query(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'is_subscription_enabled'"
    );
    const isSubscriptionEnabled = settingsResult.rows[0]?.setting_value ?? false;
    res.json({
      message: "✅ 2FA successfully disabled.",
      user: createUserPayload(user, isSubscriptionEnabled),
      token: generateToken(user),
    });
  } catch (err) {
    console.error("❌ Error disabling 2FA:", err.message);
    res.status(500).json({ error: "Failed to disable 2FA." });
  }
}

// ----------------------
// OTP Login flow (existing)
// ----------------------
async function requestLoginOtp(req, res) {
  try {
    const { identifier } = req.body;
    const user = await findUserByEmailOrUsername(identifier);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    if (!user.is_verified) {
      return res.status(403).json({ error: "Your account is not verified." });
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await pool.query(
      `INSERT INTO otps (email, otp) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET otp = $2, created_at = NOW()`,
      [user.email, otp]
    );
    await sendEmailOtp(user.email, otp).catch(e => console.warn("sendEmailOtp error:", e));
    // Optionally: sendSmsOtp(user.mobile_number, otp) if phone present
    res.status(200).json({ message: `An OTP has been sent to the email associated with your account.` });
  } catch (err) {
    console.error("Request Login OTP error:", err);
    res.status(500).json({ error: "Failed to send OTP." });
  }
}

async function verifyLoginOtp(req, res) {
  try {
    const { identifier, otp } = req.body;
    const user = await findUserByEmailOrUsername(identifier);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const otpResult = await pool.query(
      "SELECT * FROM otps WHERE email = $1 AND otp = $2 AND created_at > NOW() - INTERVAL '5 minutes'",
      [user.email, otp]
    );
    if (otpResult.rowCount === 0) {
      return res.status(400).json({ error: "Invalid or expired OTP." });
    }
    await pool.query("DELETE FROM otps WHERE email = $1", [user.email]);
    await updateUserLastLogin(user.id);
    const settingsResult = await pool.query(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'is_subscription_enabled'"
    );
    const isSubscriptionEnabled = settingsResult.rows[0]?.setting_value ?? false;
    res.json({
      message: "Login successful",
      user: createUserPayload(user, isSubscriptionEnabled),
      token: generateToken(user),
    });
  } catch (err) {
    console.error("Verify Login OTP error:", err);
    res.status(500).json({ error: "Login failed." });
  }
}

// ----------------------
// EMAIL VERIFICATION (Phase 8 finalization) - existing
// ----------------------
async function verifyEmailOtp(req, res) {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required." });
    }

    const pendingResult = await pool.query(
      `SELECT * FROM pending_registrations WHERE email = $1 AND otp = $2 AND otp_created_at > NOW() - INTERVAL '10 minutes'`,
      [email.toLowerCase().trim(), otp]
    );
    if (pendingResult.rowCount === 0) {
      return res.status(400).json({ error: "Invalid or expired OTP. Please request a new one." });
    }
    const pending = pendingResult.rows[0];
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      await pool.query("DELETE FROM pending_registrations WHERE email = $1", [email.toLowerCase().trim()]);
      return res.status(200).json({ message: "Account already exists. Please log in." });
    }

    // Create the final user from pending (password already hashed)
    const newUser = await createUser(
      pending.name,
      pending.email,
      pending.password,
      pending.role || "user",
      null,
      pending.mobile_number,
      pending.username
    );
    if (!newUser || !newUser.id) {
      console.error("Failed to create user from pending registration:", pending);
      return res.status(500).json({ error: "Failed to create user account." });
    }

    // Mark verified, delete pending, clear OTPS
    await verifyUser(newUser.id);
    await pool.query("DELETE FROM pending_registrations WHERE email = $1", [email.toLowerCase().trim()]);
    await pool.query("DELETE FROM otps WHERE email = $1", [email.toLowerCase().trim()]).catch(() => { });

    await updateUserLastLogin(newUser.id);
    const settingsResult = await pool.query(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'is_subscription_enabled'"
    );
    const isSubscriptionEnabled = settingsResult.rows[0]?.setting_value ?? false;
    const freshUser = await findUserById(newUser.id);
    return res.json({
      message: "Email verified successfully! Logging you in...",
      user: createUserPayload(freshUser, isSubscriptionEnabled),
      token: generateToken(freshUser),
    });
  } catch (err) {
    console.error("Verify Email OTP error (pending flow):", err);
    return res.status(500).json({ error: "Verification failed." });
  }
}

// ----------------------
// CHANGE PASSWORD (existing)
// ----------------------
async function changePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Old and new passwords are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters long." });
    }
    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect old password." });
    }
    const hashedNewPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await updateUserPassword(userId, hashedNewPassword);
    res.json({ message: "✅ Password changed successfully!" });
  } catch (err) {
    console.error("Change Password error:", err);
    res.status(500).json({ error: "Failed to change password." });
  }
}

// ----------------------
// FORGOT / RESET PASSWORD (Phase 1 Fix: Removed silent catch)
// ----------------------
async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const userResult = await pool.query("SELECT id, email FROM users WHERE email=$1", [email.toLowerCase().trim()]);
    if (!userResult.rowCount) {
      // Generic response to prevent user enumeration
      return res.json({ message: "If an account with this email exists, a reset link has been sent." });
    }

    const user = userResult.rows[0];

    // Create raw token and store hashed value in DB
    const rawToken = crypto.randomBytes(32).toString("hex"); // 64 chars
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await pool.query(
      `UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3`,
      [hashedToken, expiresAt.toISOString(), user.id]
    );

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

    // PHASE 1 FIX: Removed the silent .catch(e => console.warn(...)) to allow a proper error response if email fails.
    // If sendEmail is properly configured to throw, the outer catch block will handle it.
    await sendResetPasswordEmail(user.email, resetUrl);
    // Optionally send SMS short message
    // await sendResetSms(user.mobile_number, resetUrl).catch(e => console.warn("sendResetSms error:", e));

    return res.json({ message: "If an account with this email exists, a reset link has been sent." });
  } catch (err) {
    console.error("forgotPassword error:", err);
    // If the error is specific to email sending (e.g., SendGrid offline), you can refine this.
    // For now, catch all and provide a generic server error.
    return res.status(500).json({ error: "Failed to process password reset request. Please check server logs." });
  }
}

async function resetPassword(req, res) {
  const { token, password, email } = req.body;
  if (!token || !password || !email) return res.status(400).json({ error: "Token, email and password are required" });

  try {
    // Hash incoming token and match against DB
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const result = await pool.query(
      `SELECT id, reset_token_expires, email FROM users WHERE reset_token = $1 AND email = $2 LIMIT 1`,
      [tokenHash, email.toLowerCase().trim()]
    );
    if (!result.rowCount) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }
    const user = result.rows[0];
    const expiresAt = new Date(user.reset_token_expires);
    if (!expiresAt || expiresAt < new Date()) {
      return res.status(400).json({ error: "Token has expired" });
    }

    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    const hashed = await bcrypt.hash(password, salt);

    await pool.query(
      `UPDATE users SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2`,
      [hashed, user.id]
    );

    return res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("resetPassword error:", err);
    return res.status(500).json({ error: "Failed to reset password" });
  }
}

// ----------------------
// VERIFY EMAIL (legacy route)
async function verifyEmail(req, res) {
  try {
    const { token } = req.params;
    const user = await findUserByVerificationToken(token);
    if (!user) {
      return res.status(400).send("<h1>Verification link is invalid or has expired.</h1>");
    }
    await verifyUser(user.id);
    res.send("<h1>✅ Email Verified Successfully!</h1><p>You can now close this tab and log in.</p>");
  } catch (err) {
    console.error("Verify Email Link error:", err);
    res.status(500).send("<h1>Error</h1><p>An error occurred during verification.</p>");
  }
}

// ----------------------
// PROFILE / STATS / DASHBOARD (unchanged from you)
// ----------------------
async function getPublicProfile(req, res) {
  try {
    const { username } = req.params;
    const userResult = await pool.query("SELECT id, username, badges FROM users WHERE username = $1", [username]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    const user = userResult.rows[0];
    const notesResult = await pool.query(
      "SELECT id, title, view_count FROM notes WHERE user_id = $1 AND approval_status = 'approved'",
      [user.id]
    );
    res.json({ username: user.username, badges: user.badges || [], uploadedNotes: notesResult.rows });
  } catch (err) {
    console.error("Get Public Profile error:", err);
    res.status(500).json({ error: "Failed to fetch user profile." });
  }
}

async function getUserStats(req, res) {
  try {
    const userId = req.user.id;
    const [uploadsResult, viewsResult] = await Promise.all([
      pool.query("SELECT approval_status, COUNT(*) as count FROM notes WHERE user_id = $1 GROUP BY approval_status", [userId]),
      pool.query("SELECT COALESCE(SUM(view_count), 0) as total_views FROM notes WHERE user_id = $1 AND approval_status = 'approved'", [userId])
    ]);
    const stats = { approved: 0, pending: 0, rejected: 0, total_views: parseInt(viewsResult.rows[0].total_views) || 0 };
    uploadsResult.rows.forEach(row => {
      if (stats.hasOwnProperty(row.approval_status)) {
        stats[row.approval_status] = parseInt(row.count);
      }
    });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user stats." });
  }
}

async function getDashboardData(req, res) {
  try {
    const userId = req.user.id;
    const [userResult, notesViewedResult, totalNotesCountResult] = await Promise.all([
      pool.query("SELECT name, subscription_expiry, free_views, badges FROM users WHERE id = $1", [userId]),
      pool.query("SELECT COUNT(DISTINCT note_id) FROM user_views WHERE user_id = $1", [userId]),
      pool.query("SELECT COUNT(*) FROM notes WHERE approval_status = 'approved'")
    ]);
    const user = userResult.rows[0] || {};
    const notesViewed = parseInt(notesViewedResult.rows[0].count, 10) || 0;
    const totalNotes = parseInt(totalNotesCountResult.rows[0].count, 10) || 0;
    const dashboardData = {
      name: user.name,
      notesViewed,
      totalNotesAvailable: totalNotes,
      subscriptionExpiry: user.subscription_expiry,
      free_views: user.free_views,
      studyStreak: 5,
      badges: user.badges || [],
      leaderboardRank: 10,
    };
    res.json(dashboardData);
  } catch (err) {
    console.error("❌ Error fetching user dashboard data:", err);
    res.status(500).json({ error: "Failed to fetch dashboard data." });
  }
}

async function getProfile(req, res) {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json(user);
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ error: "Failed to get profile" });
  }
}

async function updateMyProfile(req, res) {
  try {
    const user = await updateUserProfile(req.user.id, req.body);
    res.json({ message: "Profile updated", user });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
}

// ----------------------
// EXPORTS (include new functions)
module.exports = {
  registerUser,
  loginUser,
  requestLoginOtp,
  verifyLoginOtp,
  verifyEmailOtp,
  changePassword,
  getPublicProfile,
  getUserStats,
  getDashboardData,
  getProfile,
  updateMyProfile,
  forgotPassword,
  resetPassword,
  verifyEmail,
  generateTwoFactorSecret,
  verifyTwoFactorSetup,
  disableTwoFactorAuth,
  // Phase 7
  refreshAuthToken,
  logout,
};