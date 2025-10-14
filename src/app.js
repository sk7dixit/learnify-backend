// src/app.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet"); // <-- NEW: For security headers
const rateLimit = require("express-rate-limit"); // <-- NEW: For rate limiting

const userRoutes = require("./routes/userRoutes");
const noteRoutes = require("./routes/noteRoutes");
const adminRoutes = require("./routes/adminRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const suggestionRoutes = require("./routes/suggestionRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const chatRoutes = require("./routes/chatRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const app = express();

// --- SECURITY MIDDLEWARE ---

// 1. Set essential security headers with Helmet
app.use(helmet());

// 2. Define a rate limiter for general API usage
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 200, // Limit each IP to 200 requests per window (more generous for general use)
	standardHeaders: true,
	legacyHeaders: false,
    message: "Too many requests from this IP, please try again after 15 minutes.",
});

// 3. Define a stricter rate limiter for authentication routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 authentication attempts per 15 mins to prevent brute-forcing
    standardHeaders: true,
	legacyHeaders: false,
    message: "Too many authentication attempts from this IP, please try again after 15 minutes.",
});


// --- CORE MIDDLEWARE ---
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// Serve static files from the 'uploads' directory
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));


// --- APPLY RATE LIMITERS AND ROUTES ---

// Apply the stricter limiter ONLY to sensitive authentication endpoints
app.use("/api/users/login", authLimiter);
app.use("/api/users/register", authLimiter);
app.use("/api/users/forgot-password", authLimiter);
app.use("/api/users/reset-password", authLimiter);
app.use("/api/users/login-otp-request", authLimiter);
app.use("/api/users/login-otp-verify", authLimiter);
app.use("/api/users/verify-email-otp", authLimiter);

// Apply the general API limiter to all other API routes
app.use("/api/", apiLimiter);

// Register the route handlers
app.use("/api/users", userRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/suggestions", suggestionRoutes);
app.use("/api/notifications", notificationRoutes);

// Default route
app.get("/", (req, res) => {
  res.send("🚀 Smart Notes Backend Running");
});

module.exports = app;