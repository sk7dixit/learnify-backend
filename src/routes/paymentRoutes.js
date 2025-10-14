// backend/routes/paymentRoutes.js
const express = require("express");
const { pool } = require("../config/db");
const router = express.Router();
const axios = require("axios");

// Example PayPal webhook endpoint
router.post("/paypal/webhook", async (req, res) => {
  try {
    const event = req.body;
    console.log("📬 Received PayPal webhook:", event.event_type);

    // Example: log into DB for audit
    await pool.query(
      "INSERT INTO paypal_webhooks(event_type, payload) VALUES($1, $2)",
      [event.event_type, JSON.stringify(event)]
    );

    res.status(200).send("Webhook received");
  } catch (err) {
    console.error("❌ PayPal Webhook Error:", err.message);
    res.status(500).send("Server error");
  }
});

// Example payment creation route (if you have one)
router.post("/paypal/create-order", async (req, res) => {
  try {
    const accessToken = await getPayPalAccessToken();
    const response = await axios.post(
      `${process.env.PAYPAL_BASE_URL}/v2/checkout/orders`,
      {
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: "10.00",
            },
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error("❌ PayPal create-order error:", error.response?.data || error.message);
    res.status(500).json({ message: "Payment creation failed" });
  }
});

async function getPayPalAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");

  const response = await axios.post(
    `${process.env.PAYPAL_BASE_URL}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data.access_token;
}

module.exports = router;
