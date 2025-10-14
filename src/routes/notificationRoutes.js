// src/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const {
  createNotification,
  getUserNotifications,
  markAllAsRead,
  getUnreadCount, // <-- IMPORT NEW FUNCTION
} = require('../controllers/notificationController');

// For admins to create a new notification
router.post('/', authMiddleware, adminMiddleware, createNotification);

// For logged-in users to get their list of notifications
router.get('/', authMiddleware, getUserNotifications);

// For a user to get their unread notification count
router.get('/unread-count', authMiddleware, getUnreadCount); // <-- ADD NEW ROUTE

// For logged-in users to mark their notifications as read
router.post('/mark-read', authMiddleware, markAllAsRead);

module.exports = router;