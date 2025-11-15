// src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const generateToken = require('../utils/generateToken'); // adjust path if your util is elsewhere

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'refreshToken';

// Helper: find refresh token row by raw token
async function findRefreshTokenRowByRaw(rawToken) {
  if (!rawToken) return null;
  const hashed = crypto.createHash('sha256').update(rawToken).digest('hex');
  const q = `
    SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked, u.*
    FROM refresh_tokens rt
    JOIN users u ON rt.user_id = u.id
    WHERE rt.token = $1
    LIMIT 1
  `;
  const result = await pool.query(q, [hashed]);
  return result.rows[0] || null;
}

// Helper: attach user object (clean) to req and optionally ensure verified
function attachUserToReq(req, userRow) {
  // Remove sensitive fields
  const user = { ...userRow };
  delete user.password;
  delete user.reset_token;
  delete user.reset_token_expires;
  delete user.two_factor_secret; // Also strip 2FA secret
  // Attach
  req.user = user;
  return user;
}

/**
 * Auth middleware:
 * - verifies access token (Authorization: Bearer <token>)
 * - if expired: attempts to validate refreshToken cookie/body and attach user and issue new access token
 */
module.exports = async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    let token = bearer || null;

    // --- 1. ACCESS TOKEN CHECK ---
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        const userId = payload.id || payload.userId || payload.sub;
        if (!userId) {
          return res.status(401).json({ error: 'Invalid token' });
        }
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [userId]);
        if (userRes.rowCount === 0) return res.status(401).json({ error: 'User not found' });

        const user = userRes.rows[0];

        // Enforce email verification (Phase 6)
        if (!user.is_verified) {
          return res.status(403).json({ error: 'Email not verified' });
        }

        // Enforce 2FA if enabled (Phase 7)
        if (user.is_two_factor_enabled && !payload.twoFactorPassed) {
          return res.status(403).json({ error: 'Two-factor authentication required', twoFactorRequired: true });
        }

        attachUserToReq(req, user);
        return next();
      } catch (err) {
        // Only attempt refresh flow if token is simply expired.
        if (err.name !== 'TokenExpiredError') {
          return res.status(401).json({ error: 'Invalid token' });
        }
        // Token expired - proceed to refresh token check
        token = null;
      }
    }

    // --- 2. REFRESH TOKEN (REMEMBER ME) CHECK ---
    const rawRefresh = (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) || req.body?.refreshToken || null;
    if (!rawRefresh) {
      // If no valid access token and no refresh token, fail.
      return res.status(401).json({ error: 'Authentication required' });
    }

    const rtRow = await findRefreshTokenRowByRaw(rawRefresh);
    if (!rtRow) {
      try { res.clearCookie(REFRESH_COOKIE_NAME); } catch (e) {}
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (rtRow.revoked) {
      return res.status(401).json({ error: 'Refresh token revoked' });
    }

    if (!rtRow.expires_at || new Date(rtRow.expires_at) < new Date()) {
      try { res.clearCookie(REFRESH_COOKIE_NAME); } catch (e) {}
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    // Attach user and (optionally) issue a fresh access token for convenience
    const user = rtRow;

    // Enforce email verification
    if (!user.is_verified) {
      return res.status(403).json({ error: 'Email not verified' });
    }

    // PHASE 1 FIX: Allow login if 2FA is enabled but user used Remember Me.
    // The security risk is balanced by the 10-day expiry of the refresh token.
    // The user passed 2FA to generate this token initially.

    // Attach user
    attachUserToReq(req, user);

    // Issue a new access token (short-lived) and pass it to the route handler
    try {
      // NOTE: When generating new token here, ensure twoFactorPassed=true in payload
      // if 2FA is enabled, as they passed it initially to get the RT.
      const payload = {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role,
          twoFactorPassed: req.user.is_two_factor_enabled ? true : false,
      };
      const newAccessToken = generateToken(payload);
      res.locals.newAccessToken = newAccessToken;
    } catch (e) {
      console.error('authMiddleware: failed to create new access token:', e?.message || e);
    }

    return next();
  } catch (err) {
    console.error('authMiddleware error:', err);
    return res.status(500).json({ error: 'Authentication failure' });
  }
};