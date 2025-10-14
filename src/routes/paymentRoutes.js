const express = require("express");
const router = express.Router(); // <--- FIX: Initialize the router instance
const axios = require("axios");
const { Pool } = require("pg");
const authMiddleware = require("../middleware/authMiddleware");

// Import the controller functions (note: these are not routers themselves)
const { createPayPalOrder, capturePayPalOrder } = require("../controllers/paymentController");

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL;

// ====================== 1. CREATE PAYPAL ORDER ======================
// Route: POST /api/payments/create-order
router.post("/create-order", authMiddleware, async (req, res) => {
  // Delegate the logic to the controller function
  await createPayPalOrder(req, res);
});

// ====================== 2. CAPTURE PAYPAL ORDER ======================
// Route: POST /api/payments/capture-order/:orderId
router.post("/capture-order/:orderId", authMiddleware, async (req, res) => {
  // Delegate the logic to the controller function
  await capturePayPalOrder(req, res);
});

// ====================== 3. PAYPAL WEBHOOK ======================
// Note: This route must be public, hence no authMiddleware
router.post("/paypal-webhook", async (req, res) => {
  try {
    const pool = new Pool({ /* Using the DB config here for simplicity */ });
    const event = req.body;

    if (event.event_type === "CHECKOUT.ORDER.COMPLETED") {
      const order = event.resource;
      const customId = order.purchase_units?.[0]?.custom_id;

      if (!customId) {
        console.error("Webhook Error: custom_id missing from PayPal order.");
        return res.status(400).send("Custom ID required.");
      }

      const [userId, plan] = customId.split('_');

      let days;
      if (plan === "weekly") days = 7;
      else if (plan === "monthly") days = 30;
      else if (plan === "semester") days = 180;
      else {
        console.error("Invalid plan received from PayPal webhook:", plan);
        return res.status(400).send("Invalid plan");
      }

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);

      // CRITICAL: Database operations
      await pool.query(
        `INSERT INTO subscriptions (user_id, plan, start_date, end_date, status)
         VALUES ($1, $2, NOW(), $3, 'active')`,
        [userId, plan, expiryDate]
      );
      await pool.query(
        "UPDATE users SET subscription_expiry = $1, free_views = 0 WHERE id = $2",
        [expiryDate, userId]
      );
      console.log(`✅ Subscription for user ${userId} updated via PayPal webhook.`);
    }

    res.status(200).send("Webhook received successfully");
  } catch (err) {
    console.error("❌ PayPal webhook handling error:", err.message);
    res.status(500).send("Webhook Error");
  }
});


// FIX: This must export the router instance for Express to use it.
module.exports = router;