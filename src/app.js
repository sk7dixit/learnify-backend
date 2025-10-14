require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

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
app.use(helmet());

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests from this IP, please try again after 15 minutes.",
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many authentication attempts from this IP, please try again after 15 minutes.",
});


// --- CORE MIDDLEWARE ---
app.use(
  cors({
    origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://learnify-frontend-34du.onrender.com"
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));


// --- APPLY RATE LIMITERS AND ROUTES ---
app.use("/api/users/login", authLimiter);
app.use("/api/users/register", authLimiter);
// ... other routes

app.use("/api/", apiLimiter);
app.use("/api/users", userRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/suggestions", suggestionRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/", (req, res) => {
  res.send("🚀 Smart Notes Backend Running");
});

module.exports = app;
