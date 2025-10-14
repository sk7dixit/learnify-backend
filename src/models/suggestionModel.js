const pool = require('../config/db');

// For a user to post a new suggestion
async function createSuggestion(userId, message) {
  const result = await pool.query(
    'INSERT INTO suggestions (user_id, message) VALUES ($1, $2) RETURNING *',
    [userId, message]
  );
  return result.rows[0];
}

// For an admin to get all suggestions
async function getAllSuggestions() {
  const result = await pool.query(`
    SELECT s.id, s.message, s.status, s.admin_reply, s.created_at, u.name as user_name, u.email as user_email
    FROM suggestions s
    JOIN users u ON s.user_id = u.id
    ORDER BY s.created_at DESC
  `);
  return result.rows;
}

// For an admin to reply to a suggestion
async function replyToSuggestion(suggestionId, adminReply) {
  const result = await pool.query(
    "UPDATE suggestions SET admin_reply = $1, status = 'replied', replied_at = NOW() WHERE id = $2 RETURNING *",
    [adminReply, suggestionId]
  );
  return result.rows[0];
}

// For a user to get their own suggestion history
async function getSuggestionsByUserId(userId) {
    const result = await pool.query(
        'SELECT * FROM suggestions WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
    );
    return result.rows;
}

module.exports = {
  createSuggestion,
  getAllSuggestions,
  replyToSuggestion,
  getSuggestionsByUserId,
};