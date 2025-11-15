// src/models/noteModel.js
const pool = require("../config/db");

// -------------------------------------------------------
// CORE NOTE FUNCTIONS (Updated for Cloudinary/Multi-Upload)
// -------------------------------------------------------

/**
 * Creates a new note entry in the 'notes' table.
 * Assumes noteData now includes file_url and cloudinary_public_id,
 * replacing reliance on pdf_path for new uploads.
 */
async function createNote(noteData) {
  const {
    title, user_id, is_free, material_type, approval_status,
    institution_type, field, course, subject, university_name,
    file_url, cloudinary_public_id // NEW: for Cloudinary integration
    // Note: pdf_path is handled as null for new Cloudinary uploads
  } = noteData;

  const query = `
    INSERT INTO notes (
      title, user_id, is_free, material_type, approval_status,
      institution_type, field, course, subject, university_name,
      file_url, cloudinary_public_id, view_count, pdf_path
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, NULL)
    RETURNING *`;

  const values = [
    title, user_id, is_free, material_type, approval_status,
    institution_type, field, course, subject, university_name,
    file_url, cloudinary_public_id
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
        "SELECT n.*, u.username as owner_username, u.email as owner_email FROM notes n JOIN users u ON n.user_id = u.id WHERE n.id = $1",
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
  queryValues.push(noteId); // The ID is the last parameter

  const query = `UPDATE notes SET ${queryParts.join(', ')} WHERE id = $${index} RETURNING *`;
  const result = await pool.query(query, queryValues);
  return result.rows[0];
}

async function deleteNote(noteId) {
  // NOTE: Cascading deletes should handle cleaning up note_versions and other related tables
  const result = await pool.query(
    "DELETE FROM notes WHERE id = $1 RETURNING file_url, cloudinary_public_id",
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

// -------------------------------------------------------
// PHASE 2: VERSION CONTROL FUNCTIONS
// -------------------------------------------------------

/**
 * Creates a new note version entry in the 'note_versions' table.
 * Used for subsequent uploads of an existing note.
 */
async function createNoteVersion(versionData) {
  const {
    note_id, uploader_id, title, file_url, cloudinary_public_id,
    version_hash, previous_version_id
  } = versionData;

  const query = `
    INSERT INTO note_versions (
      note_id, uploader_id, title, file_url, cloudinary_public_id,
      version_hash, previous_version_id, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
    RETURNING *`;

  const values = [
    note_id, uploader_id, title, file_url, cloudinary_public_id,
    version_hash, previous_version_id
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Finds the latest approved version of a note by note_id.
 */
async function getLatestApprovedVersion(noteId) {
  const query = `
    SELECT *
    FROM note_versions
    WHERE note_id = $1 AND status = 'approved'
    ORDER BY upload_date DESC
    LIMIT 1`;

  const result = await pool.query(query, [noteId]);
  return result.rows[0];
}

/**
 * Finds all versions for a note, ordered by date.
 */
async function getNoteVersions(noteId) {
  const query = `
    SELECT nv.id, nv.title, nv.upload_date, nv.status, u.username AS uploader_username
    FROM note_versions nv
    JOIN users u ON nv.uploader_id = u.id
    WHERE nv.note_id = $1
    ORDER BY nv.upload_date DESC`;

  const result = await pool.query(query, [noteId]);
  return result.rows;
}


/**
 * Once a new version is approved, this function updates the original
 * 'notes' table to point to the new version's file.
 */
async function updateNoteToNewVersion(noteId, versionId, versionData) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Update the original note entry
    const updateNoteQuery = `
      UPDATE notes
      SET title = $1,
          file_url = $2,
          cloudinary_public_id = $3,
          updated_at = NOW(),
          approval_status = 'approved'
      WHERE id = $4
      RETURNING *`;

    const noteResult = await client.query(updateNoteQuery, [
      versionData.title,
      versionData.file_url,
      versionData.cloudinary_public_id,
      noteId
    ]);

    // 2. Mark this specific version as the latest approved one
    const updateVersionStatusQuery = `
      UPDATE note_versions
      SET status = 'approved', is_latest_approved = TRUE
      WHERE id = $1 AND note_id = $2
      RETURNING *`;

    const versionResult = await client.query(updateVersionStatusQuery, [versionId, noteId]);

    // 3. Optional: Mark all OTHER approved versions for this note as NOT the latest.
    const resetOldLatestQuery = `
      UPDATE note_versions
      SET is_latest_approved = FALSE
      WHERE note_id = $1 AND id != $2 AND is_latest_approved = TRUE`;

    await client.query(resetOldLatestQuery, [noteId, versionId]);


    await client.query('COMMIT');
    return { note: noteResult.rows[0], version: versionResult.rows[0] };
  } catch (e) {
    await client.query('ROLLBACK');
    console.error("❌ Transaction failed in updateNoteToNewVersion:", e);
    throw e;
  } finally {
    client.release();
  }
}

// -------------------------------------------------------
// EXPORTS
// -------------------------------------------------------
module.exports = {
  // Core Note Functions (Updated)
  createNote,
  findNoteById,
  findNoteByIdAndJoinUser,
  updateNote,
  deleteNote,
  incrementNoteViewCount,

  // Version Control Functions (NEW)
  createNoteVersion,
  getLatestApprovedVersion,
  getNoteVersions,
  updateNoteToNewVersion,
};