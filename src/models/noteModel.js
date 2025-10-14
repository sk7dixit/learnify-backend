// src/models/noteModel.js
const pool = require("../config/db");

async function createNote(noteData) {
  const {
    title, pdf_path, user_id, is_free, material_type, approval_status,
    institution_type, field, course, subject, university_name
  } = noteData;

  const query = `
    INSERT INTO notes (
      title, pdf_path, user_id, is_free, material_type, approval_status,
      institution_type, field, course, subject, university_name, view_count
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0)
    RETURNING *`;

  const values = [
    title, pdf_path, user_id, is_free, material_type, approval_status,
    institution_type, field, course, subject, university_name
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

async function findNoteById(id) {
  const result = await pool.query("SELECT * FROM notes WHERE id = $1", [id]);
  return result.rows[0];
}

async function findNoteByIdAndJoinUser(id) {
    const result = await pool.query(
        "SELECT n.*, u.username as owner_username FROM notes n JOIN users u ON n.user_id = u.id WHERE n.id = $1",
        [id]
    );
    return result.rows[0];
}

async function updateNote(noteId, fields) {
  const queryParts = [];
  const queryValues = [];
  let index = 1;

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      queryParts.push(`${key} = $${index++}`);
      queryValues.push(value);
    }
  }

  if (queryParts.length === 0) {
    return null;
  }

  queryParts.push(`updated_at = NOW()`);
  queryValues.push(noteId);

  const query = `UPDATE notes SET ${queryParts.join(', ')} WHERE id = $${index} RETURNING *`;
  const result = await pool.query(query, queryValues);
  return result.rows[0];
}

async function deleteNote(noteId) {
  const result = await pool.query(
    "DELETE FROM notes WHERE id = $1 RETURNING *",
    [noteId]
  );
  return result.rows[0];
}

async function incrementNoteViewCount(noteId) {
  await pool.query(
    "UPDATE notes SET view_count = view_count + 1 WHERE id = $1",
    [noteId]
  );
}

module.exports = {
  createNote,
  findNoteById,
  findNoteByIdAndJoinUser,
  updateNote,
  deleteNote,
  incrementNoteViewCount,
};