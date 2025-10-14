const suggestionModel = require('../models/suggestionModel');

// User: Post a new suggestion
async function postSuggestion(req, res) {
  try {
    const { message } = req.body;
    const userId = req.user.id;
    if (!message) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }
    const suggestion = await suggestionModel.createSuggestion(userId, message);
    res.status(201).json(suggestion);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit suggestion.' });
  }
}

// Admin: Get all suggestions
async function fetchAllSuggestions(req, res) {
  try {
    const suggestions = await suggestionModel.getAllSuggestions();
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch suggestions.' });
  }
}

// Admin: Reply to a suggestion
async function postReply(req, res) {
  try {
    const { suggestionId } = req.params;
    const { reply } = req.body;
    if (!reply) {
      return res.status(400).json({ error: 'Reply cannot be empty.' });
    }
    const updatedSuggestion = await suggestionModel.replyToSuggestion(suggestionId, reply);
    res.json(updatedSuggestion);
  } catch (err) {
    res.status(500).json({ error: 'Failed to post reply.' });
  }
}

// User: Get their own suggestion history
async function getMySuggestions(req, res) {
    try {
        const userId = req.user.id;
        const suggestions = await suggestionModel.getSuggestionsByUserId(userId);
        res.json(suggestions);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch your suggestions.' });
    }
}

module.exports = {
  postSuggestion,
  fetchAllSuggestions,
  postReply,
  getMySuggestions,
};