// src/routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware'); // <-- Import admin middleware
const {
    validateMessage,
    deleteChatMessage,
    getAllChatMessages,
    clearAllChat
} = require('../controllers/chatController');

// This route remains for conceptual validation if needed
router.post('/send', authMiddleware, validateMessage, (req, res) => {
    res.json({ message: "Conceptual: Message would be sent here." });
});
// --- NEW ADMIN ROUTE ---
// Route to fetch all messages for the dashboard
router.get('/all', authMiddleware, adminMiddleware, getAllChatMessages);
// --- NEW ADMIN-ONLY ROUTES ---

// Route for an admin to delete a specific message
router.delete('/messages/:messageId', authMiddleware, adminMiddleware, deleteChatMessage);

// Route for an admin to clear the entire chat
router.delete('/all', authMiddleware, adminMiddleware, clearAllChat);


module.exports = router;