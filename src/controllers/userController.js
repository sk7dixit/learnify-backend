// src/controllers/userController.js
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const pool = require("../config/db");
const {
  createUser, findUserByEmail, findUserByUsername, findUserByEmailOrUsername,
  verifyUser, findUserById, updateUserPassword, updateUserProfile, updateUserLastLogin, findUserByVerificationToken, updateTwoFactorSecret, enableTwoFactor, disableTwoFactor
} = require("../models/userModel");
const generateToken = require("../utils/generateToken");
const { sendEmailOtp } = require("../utils/sendEmail");

// Helper function to create a consistent user object for the frontend
const createUserPayload = (user, isSubscriptionEnabled) => {
    return {
        id: user.id, name: user.name, email: user.email, username: user.username, role: user.role,
        subscription_expiry: user.subscription_expiry, free_views: user.free_views, is_subscription_enabled: isSubscriptionEnabled
    };
};

async function registerUser(req, res) {
  try {
    const { name, age, email, password, mobileNumber, username } = req.body;
    if (!name || !email || !password || !mobileNumber || !username) {
      return res.status(400).json({ error: "All fields are required" });
    }
    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      return res.status(400).json({ error: "User already exists with this email" });
    }
    const existingUsername = await findUserByUsername(username);
    if (existingUsername) {
      return res.status(400).json({ error: "This username is already taken" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const role = email === process.env.ADMIN_EMAIL ? "admin" : "user";
    await createUser(name, age, email, hashedPassword, role, null, mobileNumber, username);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
        `INSERT INTO otps (email, otp) VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET otp = $2, created_at = NOW()`,
        [email, otp]
    );

    await sendEmailOtp(email, otp);
    res.status(201).json({ message: "User registered successfully. Please check your email for a verification code." });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Registration failed", details: err.message });
  }
}

async function loginUser(req, res) {
  try {
    const { identifier, password, twoFactorCode } = req.body; // Expecting 2FA code now
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

    // --- 2FA CHECK ---
    if (user.is_two_factor_enabled) {
      if (!twoFactorCode) {
        // First attempt, user needs to provide 2FA code
        return res.status(403).json({ error: "2FA required", twoFactorRequired: true });
      }

      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret,
        encoding: 'base32',
        token: twoFactorCode,
      });

      if (!verified) {
        return res.status(403).json({ error: "Invalid 2FA code", twoFactorRequired: true });
      }
    }
    // --- END 2FA CHECK ---

    await updateUserLastLogin(user.id);
    const settingsResult = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'is_subscription_enabled'");
    const isSubscriptionEnabled = settingsResult.rows[0]?.setting_value ?? false;

    // Fetch fresh user data after successful 2FA/login
    const freshUser = await findUserById(user.id);

    res.json({
      message: "Login successful",
      user: createUserPayload(freshUser, isSubscriptionEnabled),
      token: generateToken(freshUser),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed", details: err.message });
  }
}
async function generateTwoFactorSecret(req, res) {
  try {
    const userId = req.user.id;
    const secret = speakeasy.generateSecret({
      name: `OriNotes:${req.user.username}`, // Use app name and username
    });

    // Store the secret temporarily (or overwrite existing)
    await updateTwoFactorSecret(userId, secret.base32);

    // Generate QR code data URL
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    res.json({
      secret: secret.base32,
      qrCodeUrl,
    });
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
      secret: secret,
      encoding: 'base32',
      token: token,
    });

    if (verified) {
      await enableTwoFactor(userId);
      const user = await findUserById(userId);
      // Refresh user data in token/session to include is_two_factor_enabled: true
      const settingsResult = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'is_subscription_enabled'");
      const isSubscriptionEnabled = settingsResult.rows[0]?.setting_value ?? false;

      return res.json({
        message: "✅ 2FA successfully enabled.",
        user: createUserPayload(user, isSubscriptionEnabled),
        token: generateToken(user),
      });
    } else {
      // If verification fails, clear the temporary secret for security
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

    // Refresh user data in token/session
    const settingsResult = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'is_subscription_enabled'");
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

        await sendEmailOtp(user.email, otp);
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
        const settingsResult = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'is_subscription_enabled'");
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

async function verifyEmailOtp(req, res) {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({ error: "Email and OTP are required." });
        }

        const otpResult = await pool.query(
            "SELECT * FROM otps WHERE email = $1 AND otp = $2 AND created_at > NOW() - INTERVAL '5 minutes'",
            [email, otp]
        );

        if (otpResult.rowCount === 0) {
            return res.status(400).json({ error: "Invalid or expired OTP." });
        }

        const user = await findUserByEmail(email);
        if (!user) {
            return res.status(404).json({ error: "User not found. Please register again." });
        }

        await verifyUser(user.id);
        await pool.query("DELETE FROM otps WHERE email = $1", [email]);

        const freshUser = await findUserById(user.id);
        if (!freshUser) {
            return res.status(404).json({ error: "Could not retrieve user details after verification." });
        }

        await updateUserLastLogin(freshUser.id);
        const settingsResult = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'is_subscription_enabled'");
        const isSubscriptionEnabled = settingsResult.rows[0]?.setting_value ?? false;

        res.json({
            message: "Email verified successfully! Logging you in...",
            user: createUserPayload(freshUser, isSubscriptionEnabled),
            token: generateToken(freshUser),
        });
    } catch (err) {
        console.error("Verify Email OTP error:", err);
        res.status(500).json({ error: "Verification failed." });
    }
}

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
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(userId, hashedNewPassword);
    res.json({ message: "✅ Password changed successfully!" });
  } catch (err) {
    console.error("Change Password error:", err);
    res.status(500).json({ error: "Failed to change password." });
  }
}

async function getPublicProfile(req, res) {
    try {
        const { username } = req.params;
        const userResult = await pool.query("SELECT id, username, badges FROM users WHERE username = $1", [username]);
        if (userResult.rowCount === 0) {
            return res.status(404).json({ error: "User not found." });
        }
        const user = userResult.rows[0];
        const notesResult = await pool.query("SELECT id, title, view_count FROM notes WHERE user_id = $1 AND approval_status = 'approved'", [user.id]);
        res.json({
            username: user.username,
            badges: user.badges || [],
            uploadedNotes: notesResult.rows,
        });
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
            notesViewed: notesViewed,
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
    } catch(err){
        console.error("Error fetching profile:", err);
        res.status(500).json({ error: "Failed to get profile" });
    }
}

async function updateMyProfile(req, res) {
    try {
        const user = await updateUserProfile(req.user.id, req.body);
        res.json({ message: "Profile updated", user });
    } catch(err){
        console.error("Error updating profile:", err);
        res.status(500).json({ error: "Failed to update profile" });
    }
}

async function forgotPassword(req, res) {
    try {
        const { identifier } = req.body;
        const user = await findUserByEmailOrUsername(identifier);
        if (user) {
            const resetToken = crypto.randomBytes(32).toString("hex");
            const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
            const passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

            await pool.query(
                "UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3",
                [hashedToken, passwordResetExpires, user.id]
            );

            const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
            // await sendPasswordResetEmail(user.email, resetUrl);
            console.log("Password Reset URL (for testing):", resetUrl);
        }
        res.json({ message: "If an account exists with that identifier, a password reset link has been sent." });
    } catch (err) {
        console.error("Forgot Password error:", err);
        res.status(500).json({ error: "Failed to process forgot password request." });
    }
}

async function resetPassword(req, res) {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: "A valid token and a new password (min 6 chars) are required." });
        }
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

        const result = await pool.query(
            "SELECT * FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()",
            [hashedToken]
        );
        const user = result.rows[0];

        if (!user) {
            return res.status(400).json({ error: "Password reset token is invalid or has expired." });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        await pool.query(
            "UPDATE users SET password = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2",
            [hashedNewPassword, user.id]
        );

        res.json({ message: "✅ Password has been reset successfully. You can now log in." });
    } catch (err) {
        console.error("Reset Password error:", err);
        res.status(500).json({ error: "Failed to reset password." });
    }
}

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
};