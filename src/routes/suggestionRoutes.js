const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const {
  postSuggestion,
  fetchAllSuggestions,
  postReply,
  getMySuggestions
} = require('../controllers/suggestionController');

// For any logged-in user to post a suggestion
router.post('/', authMiddleware, postSuggestion);

// For any logged-in user to see their own history
router.get('/my-history', authMiddleware, getMySuggestions);

// For admins only to get all suggestions
router.get('/all', authMiddleware, adminMiddleware, fetchAllSuggestions);

// For admins only to reply to a suggestion
router.put('/reply/:suggestionId', authMiddleware, adminMiddleware, postReply);

module.exports = router;