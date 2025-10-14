// src/utils/generateToken.js
const jwt = require("jsonwebtoken");

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      username: user.username, // **THE FIX IS HERE**
    },
    process.env.JWT_SECRET || "default_secret",
    { expiresIn: "7d" }
  );
}

module.exports = generateToken;