// src/controllers/notificationController.js
const pool = require('../config/db');

// --- ADMIN: Create and send a new notification ---
async function createNotification(req, res) {
  const { title, message } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Title and message are required.' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO notifications (title, message) VALUES ($1, $2) RETURNING id',
      [title, message]
    );
    res.status(201).json({ message: 'Notification created successfully.', notificationId: result.rows[0].id });
  } catch (err) {
    console.error('Error creating notification:', err);
    res.status(500).json({ error: 'Failed to create notification.' });
  }
}

// --- USER: Get all their notifications (with read status) ---
async function getUserNotifications(req, res) {
  const userId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT
        n.id, n.title, n.message, n.created_at,
        un.is_read
      FROM notifications n
      LEFT JOIN user_notifications un ON n.id = un.notification_id AND un.user_id = $1
      ORDER BY n.created_at DESC
    `, [userId]);

    res.json({ notifications: result.rows });
  } catch (err) {
    console.error('Error fetching user notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
}

// --- USER: Get just the count of unread notifications ---
async function getUnreadCount(req, res) {
    const userId = req.user.id;
    try {
        // This query counts all notifications that do NOT have a corresponding 'true' read record for the user.
        const result = await pool.query(`
            SELECT COUNT(n.id)
            FROM notifications n
            LEFT JOIN user_notifications un ON n.id = un.notification_id AND un.user_id = $1
            WHERE un.is_read IS NOT TRUE
        `, [userId]);

        const count = parseInt(result.rows[0].count, 10);
        res.json({ count });

    } catch (err) {
        console.error('Error fetching unread notification count:', err);
        res.status(500).json({ error: 'Failed to fetch unread count.' });
    }
}

// --- USER: Mark all notifications as read ---
async function markAllAsRead(req, res) {
  const userId = req.user.id;
  try {
    await pool.query(`
      INSERT INTO user_notifications (user_id, notification_id, is_read)
      SELECT $1, id, TRUE FROM notifications
      ON CONFLICT (user_id, notification_id)
      DO UPDATE SET is_read = TRUE;
    `, [userId]);
    res.status(200).json({ message: 'All notifications marked as read.' });
  } catch (err) {
    console.error('Error marking notifications as read:', err);
    res.status(500).json({ error: 'Failed to update notification status.' });
  }
}

module.exports = {
  createNotification,
  getUserNotifications,
  markAllAsRead,
  getUnreadCount,
};