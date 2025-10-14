const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const {
  buySubscription,
  getMySubscriptions,
  getAllSubscriptions,
} = require("../controllers/subscriptionController");

// Buy subscription - This is the entry point from the frontend
router.post("/buy", authMiddleware, buySubscription);

// Get my subscription history
router.get("/my", authMiddleware, getMySubscriptions);

// Admin → View all subscriptions
router.get("/all", authMiddleware, adminMiddleware, getAllSubscriptions);

module.exports = router;