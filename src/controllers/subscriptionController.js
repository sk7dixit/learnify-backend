// src/controllers/subscriptionController.js
const pool = require("../config/db");
const { createPayPalOrder } = require("./paymentController");

// ====================== BUY SUBSCRIPTION ======================
async function buySubscription(req, res) {
  try {
    const { plan, gateway } = req.body;

    if (gateway === "stripe") {
      // Logic for Stripe, which we will keep here for future use.
      return res.status(501).json({ error: "Stripe integration is not active. Please use PayPal." });
    }

    else if (gateway === "paypal") {
      // Delegate to the createPayPalOrder function
      return await createPayPalOrder(req, res);
    }

    else {
      return res.status(400).json({ error: "Invalid payment gateway" });
    }

  } catch (err) {
    console.error("❌ Subscription error:", err.message);
    res.status(500).json({ error: "Subscription failed", details: err.message });
  }
}

// ====================== GET MY SUBSCRIPTIONS ======================
async function getMySubscriptions(req, res) {
  try {
    const result = await pool.query(
      "SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY start_date DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Fetch subscription error:", err.message);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
}

// ====================== ADMIN VIEW ALL SUBSCRIPTIONS ======================
async function getAllSubscriptions(req, res) {
  try {
    const result = await pool.query(
      `SELECT s.id, u.name, u.email, s.plan, s.start_date, s.end_date, s.status
       FROM subscriptions s
       JOIN users u ON s.user_id = u.id
       ORDER BY s.start_date DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Admin fetch subscriptions error:", err.message);
    res.status(500).json({ error: "Failed to fetch subscriptions" });
  }
}

module.exports = {
  buySubscription,
  getMySubscriptions,
  getAllSubscriptions,
};