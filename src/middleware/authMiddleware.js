const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token or invalid format" });
    }

    const token = authHeader.split(" ")[1];

    // Use the SECRET from environment variables
    const secret = process.env.JWT_SECRET || "default_secret";

    // Verification is the point of failure
    const decoded = jwt.verify(token, secret);

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