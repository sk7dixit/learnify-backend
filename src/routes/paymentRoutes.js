// src/routes/paymentRoutes.js
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const pool = require('../config/db'); // <-- FIX: Import the central DB pool

// Import controller functions
const { createPayPalOrder, capturePayPalOrder } = require("../controllers/paymentController");

// ====================== CREATE PAYPAL ORDER ======================
// Route: POST /api/payments/create-order
router.post("/create-order", authMiddleware, createPayPalOrder);

// ====================== CAPTURE PAYPAL ORDER ======================
// Route: POST /api/payments/capture-order/:orderId
router.post("/capture-order/:orderId", authMiddleware, capturePayPalOrder);

// ====================== PAYPAL WEBHOOK ======================
// Note: This route must be public, so it has no authMiddleware
router.post("/paypal-webhook", async (req, res) => {
  try {
    const event = req.body;
    console.log("Received PayPal Webhook:", event.event_type);

    if (event.event_type === "CHECKOUT.ORDER.COMPLETED") {
      const order = event.resource;
      const customId = order.purchase_units?.[0]?.custom_id;

      if (!customId) {
        console.error("Webhook Error: custom_id is missing from the PayPal order.");
        return res.status(400).send("Custom ID is required for processing.");
      }

      const [userId, plan] = customId.split('_');

      if (!userId || !plan) {
        console.error(`Webhook Error: Invalid custom_id format: ${customId}`);
        return res.status(400).send("Invalid custom ID format.");
      }

      let days;
      if (plan === "weekly") days = 7;
      else if (plan === "monthly") days = 30;
      else if (plan === "semester") days = 180;
      else {
        console.error("Webhook Error: Invalid plan received from PayPal webhook:", plan);
        return res.status(400).send("Invalid plan type.");
      }

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      // --- Use the central database pool for all queries ---
      await pool.query(
        `INSERT INTO subscriptions (user_id, plan, start_date, end_date, status)
         VALUES ($1, $2, NOW(), $3, 'active')`,
        [userId, plan, expiryDate]
      );
      await pool.query(
        "UPDATE users SET subscription_expiry = $1, free_views = 0 WHERE id = $2",
        [expiryDate, userId]
      );
      console.log(`✅ Subscription for user ${userId} successfully processed via PayPal webhook.`);
    }

    res.status(200).send("Webhook received and acknowledged.");
  } catch (err) {
    console.error("❌ PayPal webhook handling failed:", err.message);
    res.status(500).send("Internal Server Error during webhook processing.");
  }
});

module.exports = router;