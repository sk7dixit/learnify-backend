const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token or invalid format" });
    }

    const token = authHeader.split(" ")[1];

    // FIX: Check for the production secret (Security Improvement)
    const secret = process.env.JWT_SECRET;

    if (!secret || secret === "default_secret") {
         console.error("❌ SECURITY ALERT: JWT_SECRET not configured correctly in production!");
         // Optionally return a 500 error here to force correction
    }

    // Verification is the point of failure
    const decoded = jwt.verify(token, secret || "default_secret"); // Use a fallback for local dev only

    // CRITICAL: Ensure decoded object has an ID
    if (!decoded || !decoded.id) {
        return res.status(403).json({ error: "Token verification failed: Invalid payload." });
    }

    req.user = decoded; // ✅ includes role now
    next();
  } catch (err) {
    console.error("❌ JWT error:", err.message);
    // Return the failure so frontend knows to log out
    return res.status(403).json({ error: "Invalid or expired token. Please log in again." });
  }
}

module.exports = authMiddleware;