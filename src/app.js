// backend/app.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

dotenv.config();

const { pool } = require("./config/db");
const userRoutes = require("./routes/userRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middlewares ---
app.use(express.json());
app.use(cookieParser());

// CORS setup (allow localhost + your Render frontend)
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://learnify-frontend-34du.onrender.com",
      "https://learnify-frontend-git-main-yourusername.onrender.com", // add your actual production URL here
    ],
    credentials: true,
  })
);

// Simple logger (shows every incoming request)
app.use((req, res, next) => {
  console.log(`➡️  ${req.method} ${req.originalUrl}`);
  next();
});

// --- Rate Limiter for Auth routes ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many login attempts. Please try again later.",
});

// --- Routes ---
app.use("/api/users/login", authLimiter); // limiter only for login
app.use("/api/users", userRoutes);
app.use("/api/payments", paymentRoutes);

// --- Static file serving (for uploads/images) ---
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// --- Health check route ---
app.get("/", (req, res) => {
  res.send("✅ Learnify Backend is running.");
});

// --- Global error handler (optional) ---
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ message: "Server Error" });
});

// --- Start server ---
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
