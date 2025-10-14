// src/middleware/checkSubscription.js
const { findUserById, updateUserFreeViews } = require("../models/userModel");
const { findNoteById } = require("../models/noteModel");
const pool = require('../config/db');

async function logNoteView(userId, noteId) {
    try {
        await pool.query(
            'INSERT INTO user_views (user_id, note_id) VALUES ($1, $2) ON CONFLICT (user_id, note_id) DO NOTHING',
            [userId, noteId]
        );
    } catch (err) {
        console.error("Log view error:", err.message);
    }
}

async function checkSubscription(req, res, next) {
  try {
    const userId = req.user.id;
    const noteId = req.params.id;

    const grantAccess = async () => {
        await logNoteView(userId, noteId);
        // We don't increment view count here anymore, it's done after access is granted
        return next();
    };

    if (req.user?.role === 'admin') {
      return grantAccess();
    }

    const user = await findUserById(userId);
    const note = await findNoteById(noteId);

    if (!user) return res.status(404).json({ error: "User not found" });
    if (!note) return res.status(404).json({ error: "Note not found" });

    // 1. Check if the note is marked as free
    if (note.is_free) {
      return grantAccess();
    }

    // 2. LOGIC UPDATE: Check if subscriptions are globally disabled by admin
    const settingsResult = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'is_subscription_enabled'");
    const isSubscriptionEnabled = settingsResult.rows[0]?.setting_value ?? false;

    if (!isSubscriptionEnabled) {
        return grantAccess(); // Grant access to everyone if subscriptions are off
    }

    // 3. Check for an active user subscription
    const now = new Date();
    if (user.subscription_expiry && new Date(user.subscription_expiry) > now) {
      return grantAccess();
    }

    // 4. If no subscription, check for remaining free views
    const freeViewsUsed = user.free_views || 0;
    if (freeViewsUsed < 2) { // Assuming a limit of 2 free views
      await updateUserFreeViews(user.id, freeViewsUsed + 1);
      return grantAccess();
    }

    // 5. If all checks fail, deny access
    return res.status(403).json({ 
        error: "Access denied. Please subscribe for unlimited access.",
        reason: "subscription_required" 
    });

  } catch (err) {
    console.error("❌ Subscription check middleware failed:", err.message);
    res.status(500).json({ error: "Server error during subscription check" });
  }
}

module.exports = checkSubscription;