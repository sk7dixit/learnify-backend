const express = require('express');
const router = express.Router();
const {
    getDashboardData,
    getActiveUsers,
    getAppSettings,
    getBadgeData,
    updateAppSetting,
    getUserSubmissions,
    getAllNotes,
    deleteUser // <-- NEW FUNCTION IMPORTED
} = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// --- Main Admin Routes ---
router.get('/dashboard', authMiddleware, adminMiddleware, getDashboardData);
router.get('/active-users', authMiddleware, adminMiddleware, getActiveUsers);
router.get('/user-submissions', authMiddleware, adminMiddleware, getUserSubmissions);
router.get('/all-notes', authMiddleware, adminMiddleware, getAllNotes);

// --- NEW: User Deletion Route ---
// This route handles the permanent removal of a user by their ID.
router.delete('/users/:id', authMiddleware, adminMiddleware, deleteUser);

// --- App Settings Routes ---
router.get('/settings', authMiddleware, adminMiddleware, getAppSettings);
router.put('/settings', authMiddleware, adminMiddleware, updateAppSetting);

// --- Admin Badge Route ---
router.get('/badges', authMiddleware, adminMiddleware, getBadgeData);

module.exports = router;