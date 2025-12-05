// src/routes/userRoutes.js
const express = require("express");
const {
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
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPasswordWithOtp
  generateTwoFactorSecret, // <-- NEW
  verifyTwoFactorSetup,    // <-- NEW
  disableTwoFactorAuth,
} = require("../controllers/userController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// --- AUTHENTICATION ---
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/login-otp-request", requestLoginOtp);
router.post("/login-otp-verify", verifyLoginOtp);

// --- ACCOUNT VERIFICATION ---
router.post("/verify-email-otp", verifyEmailOtp);
router.get("/verify-email/:token", verifyEmail);

// --- PASSWORD MANAGEMENT ---
// Phase 6 endpoints (forgot / reset)
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.put("/change-password", authMiddleware, changePassword);

// --- USER DATA & STATS ---
router.get("/dashboard", authMiddleware, getDashboardData);
router.get("/my-stats", authMiddleware, getUserStats);

// --- PROFILE MANAGEMENT ---
router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, updateMyProfile);
router.get("/profile/:username", authMiddleware, getPublicProfile);

// --- 2FA MANAGEMENT (NEW SECTION) ---
router.post('/2fa/generate-secret', authMiddleware, generateTwoFactorSecret);
router.post('/2fa/verify-setup', authMiddleware, verifyTwoFactorSetup);
router.post('/2fa/disable', authMiddleware, disableTwoFactorAuth);

// 1. Send OTP
router.post("/forgot-password", sendForgotPasswordOtp);

// 2. Verify OTP (Optional check before showing password field)
router.post("/verify-reset-otp", verifyForgotPasswordOtp);

// 3. Set New Password
router.post("/reset-password", resetPasswordWithOtp);

module.exports = router;
