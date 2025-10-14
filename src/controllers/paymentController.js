const axios = require("axios");

// Dynamically select credentials based on environment
const isLive = process.env.PAYPAL_ENVIRONMENT === 'live';
const PAYPAL_CLIENT_ID = isLive ? process.env.PAYPAL_LIVE_CLIENT_ID : process.env.PAYPAL_SANDBOX_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = isLive ? process.env.PAYPAL_LIVE_CLIENT_SECRET : process.env.PAYPAL_SANDBOX_CLIENT_SECRET;
const PAYPAL_BASE_URL = isLive ? process.env.PAYPAL_LIVE_URL : process.env.PAYPAL_SANDBOX_URL;

// ====================== HELPER FUNCTION: GET ACCESS TOKEN ======================
const generateAccessToken = async () => {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      throw new Error("MISSING_PAYPAL_API_CREDENTIALS: Check .env file for the current environment.");
    }

    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");

    const response = await axios.post(
      `${PAYPAL_BASE_URL}/v1/oauth2/token`,
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return response.data.access_token;
  } catch (error) {
    const errorDetails = error.response?.data || error.message;
    console.error("❌ Failed to generate PayPal Access Token:", errorDetails);
    throw new Error(`PayPal Auth Failed: ${error.response?.data?.error_description || 'Check credentials'}`);
  }
};

// ====================== 1. CREATE PAYPAL ORDER ======================
async function createPayPalOrder(req, res) {
  try {
    const { plan, amount } = req.body;
    const userId = req.user.id;

    if (!plan || !amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: "Invalid plan or amount provided." });
    }

    const accessToken = await generateAccessToken();

    const paypalPayload = {
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: "USD",
          value: amount,
        },
        custom_id: `${userId}_${plan}`, // For tracking in webhooks
      }],
    };

    console.log("➡️ Creating PayPal Order with payload:", JSON.stringify(paypalPayload, null, 2));

    const order = await axios.post(
      `${PAYPAL_BASE_URL}/v2/checkout/orders`,
      paypalPayload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    res.status(201).json(order.data);
  } catch (error) {
    const friendlyError = error.message.includes("PayPal Auth Failed")
      ? "PayPal authentication failed. Check your Secret Key/Client ID in .env for the correct environment (Live/Sandbox)."
      : "Failed to create PayPal order due to a server error.";

    console.error("❌ Error creating PayPal order:", error.response?.data || error.message);
    res.status(500).json({ error: friendlyError, details: error.response?.data || error.message });
  }
}

// ====================== 2. CAPTURE PAYPAL ORDER ======================
async function capturePayPalOrder(req, res) {
  try {
    const { orderId } = req.params;
    const accessToken = await generateAccessToken();

    console.log(`➡️ Capturing PayPal Order ID: ${orderId}`);

    const capture = await axios.post(
      `${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    res.json(capture.data);
  } catch (error) {
    console.error("❌ Error capturing PayPal order:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to capture PayPal order", details: error.response?.data });
  }
}

module.exports = { createPayPalOrder, capturePayPalOrder };