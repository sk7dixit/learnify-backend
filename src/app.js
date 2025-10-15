// backend/app.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

// --- Import all your route files ---
const userRoutes = require("./routes/userRoutes");
const noteRoutes = require("./routes/noteRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const suggestionRoutes = require("./routes/suggestionRoutes");
const chatRoutes = require("./routes/chatRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

// --- Middlewares ---
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// --- CORS setup ---
// This is a secure and flexible CORS configuration for production
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://12-7.0.0.1:5173",
      process.env.FRONTEND_URL, // Use an environment variable for your production frontend
    ].filter(Boolean), // Filter out undefined values
    credentials: true,
  })
);

// --- Simple Request Logger ---
app.use((req, res, next) => {
  console.log(`➡️  ${req.method} ${req.path}`);
  next();
});

// --- Rate Limiter for Authentication routes ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 25, // Max requests per IP
  message: "Too many login or registration attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// --- API Routes ---
// Apply the rate limiter specifically to sensitive auth endpoints
app.use("/api/users/login", authLimiter);
app.use("/api/users/register", authLimiter);
app.use("/api/users/forgot-password", authLimiter);

// Register all your application routes
app.use("/api/users", userRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/suggestions", suggestionRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);


// --- Static file serving for PDF uploads ---
// Serves files from the /uploads directory at the /uploads URL
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- Health Check Route ---
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "✅ Learnify Backend is running." });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error("❌ Unhandled Application Error:", err.stack);
  res.status(500).json({ error: "Something went wrong on the server!" });
});

// Export the configured app instance
module.exports = app;