// src/controllers/noteController.js
// Core controller for notes: uploads, browsing, ratings, admin review, watermarking, multi-upload to Cloudinary

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const pool = require("../config/db");
const { updateUserFreeViews } = require("../models/userModel");
const { pdfQueue } = require('../config/queue');

const streamifier = require('streamifier');
const multer = require('multer');

// Your model functions (ensure these exist in ../models/noteModel)
const { createNote, updateNote, findNoteById, deleteNote, incrementNoteViewCount, findNoteByIdAndJoinUser, getLatestApprovedVersion, createNoteVersion } = require("../models/noteModel");

// ------------------ Notification Helper (NEW) ------------------
/**
 * Inserts a new notification and associates it with favorited users of a note.
 * Runs outside the main transaction (best practice for background tasks).
 */
async function notifyFavoritedUsers(noteId, noteTitle, type = 'new') {
  try {
    const title = type === 'new' ? `Note Approved: ${noteTitle}` : `Update Available: ${noteTitle}`;
    const message = type === 'new'
      ? `The note "${noteTitle}" you uploaded/requested is now available!`
      : `A new version of the note "${noteTitle}" is now available.`;

    // 1. Get all user IDs who favorited this note
    const favouritedUsersResult = await pool.query(
      "SELECT user_id FROM user_favourites WHERE note_id = $1",
      [noteId]
    );
    const userIds = favouritedUsersResult.rows.map(row => row.user_id);

    // 2. Insert the main notification
    const notificationResult = await pool.query(
      "INSERT INTO notifications (title, message) VALUES ($1, $2) RETURNING id",
      [title, message]
    );
    const notificationId = notificationResult.rows[0].id;

    // 3. Associate the notification with users (batch insert into user_notifications)
    if (userIds.length > 0) {
      const userNotificationInserts = userIds.map(userId => `(${userId}, ${notificationId})`).join(', ');
      await pool.query(`
                INSERT INTO user_notifications (user_id, notification_id)
                VALUES ${userNotificationInserts}
                ON CONFLICT DO NOTHING
            `);
      console.log(`[Notification] Sent ${userIds.length} notifications for Note ID ${noteId}`);
    }

  } catch (err) {
    console.error("❌ Notification error for version update:", err.message);
  }
}


// ------------------ Cloudinary setup ------------------
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// ------------------ multer memory storage ------------------
const MAX_FILES = parseInt(process.env.MULTI_UPLOAD_MAX_FILES || '10', 10);
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MULTI_UPLOAD_MAX_FILESIZE || `${20 * 1024 * 1024}`, 10);
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'orionotes/notes';

const memoryStorage = multer.memoryStorage();
const uploadMiddleware = multer({
  storage: memoryStorage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  }
});

// ------------------ helper: upload buffer to cloudinary ------------------
function uploadBufferToCloudinary(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const options = {
      resource_type: 'raw',
      folder: CLOUDINARY_FOLDER,
      public_id: publicId,
      overwrite: false,
    };
    const uploadStream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

// ------------------ Multi-upload handler ------------------
/**
 * POST /api/notes/multi-upload
 * Protected: req.user must be set by auth middleware
 */
async function handleMultiUpload(req, res) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const userId = req.user.id;
    const { titles, material_types, fields, courses, subjects, university_names, is_free } = req.body;

    // Parse arrays (multipart/form-data sends arrays as multiple fields with same key or indexed keys)
    // We expect the frontend to send arrays or single values.
    // Helper to ensure array
    const toArray = (val) => {
      if (!val) return [];
      return Array.isArray(val) ? val : [val];
    };

    const titleList = toArray(titles);
    const typeList = toArray(material_types);
    const fieldList = toArray(fields);
    const courseList = toArray(courses);
    const subjectList = toArray(subjects);
    const uniList = toArray(university_names);
    // is_free comes as an array of strings "true"/"false" or booleans
    const isFreeList = toArray(is_free);

    const createdNotes = [];
    const errors = [];

    for (let i = 0; i < req.files.length; i++) {
      const f = req.files[i];
      const title = titleList[i] || f.originalname;
      const matType = typeList[i] || 'personal_material';
      const isFreeVal = isFreeList[i] === 'true' || isFreeList[i] === true;

      try {
        // 1. Upload to Cloudinary
        const randomHex = crypto.randomBytes(6).toString('hex');
        const safeName = f.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\.-]/g, '');
        const publicId = `${userId}_${Date.now()}_${randomHex}_${path.parse(safeName).name}`;

        const uploadResult = await uploadBufferToCloudinary(f.buffer, publicId);

        // 2. Insert into DB
        // Construct insert query based on material type
        let insertSql, insertVals;

        if (matType === 'university_material') {
          insertSql = `
            INSERT INTO notes (
              user_id, title, pdf_path, file_url, cloudinary_public_id,
              material_type, university_name, course, subject,
              is_free, approval_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
            RETURNING *
          `;
          insertVals = [
            userId, title, null, uploadResult.secure_url, uploadResult.public_id,
            'university_material', uniList[i] || null, courseList[i] || null, subjectList[i] || null,
            isFreeVal
          ];
        } else {
          // personal
          const institutionType = ["Class 12", "Class 11", "Class 10"].includes(fieldList[i]) ? "School" : "College";
          insertSql = `
            INSERT INTO notes (
              user_id, title, pdf_path, file_url, cloudinary_public_id,
              material_type, institution_type, field, course, subject,
              is_free, approval_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
            RETURNING *
          `;
          insertVals = [
            userId, title, null, uploadResult.secure_url, uploadResult.public_id,
            'personal_material', institutionType, fieldList[i] || null, courseList[i] || null, subjectList[i] || null,
            isFreeVal
          ];
        }

        const result = await pool.query(insertSql, insertVals);
        createdNotes.push(result.rows[0]);
      } catch (err) {
        console.error('Upload failed for file', f.originalname, err);
        errors.push({ file: f.originalname, error: err.message || String(err) });
      }
    }

    if (createdNotes.length === 0) {
      return res.status(500).json({ error: 'All uploads failed', details: errors });
    }

    return res.status(201).json({ message: `Uploaded ${createdNotes.length} files`, notes: createdNotes, errors });
  } catch (err) {
    console.error('handleMultiUpload error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File size exceeds limit of ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB` });
    }
    if (err.message && err.message.includes('Cloudinary')) {
      return res.status(502).json({ error: 'Cloudinary upload failed. Please check server configuration.' });
    }
    return res.status(500).json({ error: 'Multi-upload failed', details: err.message });
  }
}

// ------------------ Original single-file upload ------------------
async function uploadUserNote(req, res) {
  try {
    const {
      title, material_type,
      field, course, subject,
      university_name
    } = req.body;

    const userId = req.user.id;
    const username = req.user.username;

    if (!title || !req.file || !material_type) {
      return res.status(400).json({ error: "Title, PDF file, and material type are required" });
    }
    if (!username) {
      return res.status(400).json({ error: "User information is missing. Please log in again." })
    }

    let pdfPath;
    let absolutePath;
    if (req.file.path) {
      pdfPath = `/uploads/${req.file.filename}`;
      absolutePath = req.file.path;
    } else if (req.file && req.file.buffer) {
      const filename = `${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
      const uploadDir = path.join(__dirname, '..', '..', 'uploads');
      await fs.mkdir(uploadDir, { recursive: true }).catch(() => { });
      const diskPath = path.join(uploadDir, filename);
      await fs.writeFile(diskPath, req.file.buffer);
      pdfPath = `/uploads/${filename}`;
      absolutePath = diskPath;
    } else {
      return res.status(400).json({ error: 'Upload file missing' });
    }

    let notePayload = {
      title,
      pdf_path: pdfPath,
      user_id: userId,
      is_free: false,
      approval_status: 'pending',
    };

    if (material_type === 'university_material') {
      notePayload = {
        ...notePayload,
        material_type: 'university_material',
        university_name: university_name,
        course: course,
        subject: subject,
      };
    } else {
      const institutionType = ["Class 12", "Class 11", "Class 10"].includes(field) ? "School" : "College";
      notePayload = {
        ...notePayload,
        material_type: 'personal_material',
        institution_type: institutionType,
        field: field || null,
        course: course || null,
        subject: subject || null,
      };
    }

    const newNote = await createNote(notePayload);

    await pdfQueue.add('watermarkUserUpload', {
      filePath: absolutePath,
      username: username,
    });

    res.status(201).json({ message: "✅ Note uploaded! It will be processed and submitted for approval.", note: newNote });

  } catch (err) {
    console.error("❌ User note upload error:", err);
    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(e => console.error("Failed to clean up file:", e));
    }
    res.status(500).json({ error: "Failed to upload note." });
  }
}

// ------------------ Browsing, review, favourites, ratings, etc. ------------------

async function getFilteredNotes(req, res) {
  try {
    const { q, material_type, institution_type, field, course, subject, university_name } = req.query;
    let query = `SELECT id, title, view_count, is_free FROM notes WHERE approval_status = 'approved' AND (expiry_date IS NULL OR expiry_date > NOW())`;
    const values = [];
    let paramIndex = 1;
    const addFilter = (column, value) => {
      if (value) {
        query += ` AND ${column} ILIKE $${paramIndex++}`;
        values.push(value);
      }
    };
    addFilter('material_type', material_type);
    addFilter('institution_type', institution_type);
    addFilter('field', field);
    addFilter('course', course);
    addFilter('subject', subject);
    addFilter('university_name', university_name);
    if (q) {
      query += ` AND title ILIKE $${paramIndex++}`;
      values.push(`%${q}%`);
    }
    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching filtered notes:", err.message);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
}

/**
 * GET /api/notes/available-subjects
 * Retrieves all distinct, approved subjects, courses, and fields
 * to populate the browsing filters.
 */
async function getAvailableSubjects(req, res) {
  try {
    const [
      subjectsResult,
      coursesResult,
      fieldsResult,
      universitiesResult
    ] = await Promise.all([
      pool.query("SELECT DISTINCT subject FROM notes WHERE subject IS NOT NULL AND subject != '' AND approval_status = 'approved' ORDER BY subject ASC"),
      pool.query("SELECT DISTINCT course FROM notes WHERE course IS NOT NULL AND course != '' AND approval_status = 'approved' ORDER BY course ASC"),
      pool.query("SELECT DISTINCT field FROM notes WHERE field IS NOT NULL AND field != '' AND approval_status = 'approved' ORDER BY field ASC"),
      pool.query("SELECT DISTINCT university_name FROM notes WHERE university_name IS NOT NULL AND university_name != '' AND approval_status = 'approved' ORDER BY university_name ASC"),
    ]);

    const normalize = (rows, key) => rows.map(row => row[key]);

    res.json({
      subjects: normalize(subjectsResult.rows, 'subject'),
      courses: normalize(coursesResult.rows, 'course'),
      fields: normalize(fieldsResult.rows, 'field'),
      universities: normalize(universitiesResult.rows, 'university_name'),
    });
  } catch (err) {
    console.error("❌ Error fetching available subjects:", err.message);
    res.status(500).json({ error: "Failed to fetch filter data." });
  }
}

async function addNote(req, res) {
  try {
    const { title, material_type, institution_type, field, course, subject, university_name, isFree } = req.body;
    const userId = req.user.id;
    if (!title || !req.file || !material_type) {
      return res.status(400).json({ error: "Title, PDF file, and material type are required" });
    }
    const isFreeBool = isFree === 'true';
    const pdfBytes = await fs.readFile(req.file.path);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    pdfDoc.setProducer('Learnify');
    pdfDoc.setCreator('Learnify Admin');
    const finalPdfBytes = await pdfDoc.save();
    await fs.writeFile(req.file.path, finalPdfBytes);
    const pdfPath = `/uploads/${req.file.filename}`;
    const newNote = await createNote({
      title,
      pdf_path: pdfPath,
      user_id: userId,
      is_free: isFreeBool,
      material_type,
      approval_status: 'approved',
      institution_type: institution_type || null,
      field: field || null,
      course: course || null,
      subject: subject || null,
      university_name: university_name || null,
    });
    res.status(201).json(newNote);
  } catch (err) {
    console.error("❌ Admin note creation error:", err);
    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(e => console.error("Failed to clean up file:", e));
    }
    res.status(500).json({ error: "Failed to create note" });
  }
}

async function getPendingNotes(req, res) {
  try {
    const result = await pool.query(`
          SELECT n.id, n.title, n.created_at, u.username
          FROM notes n
          JOIN users u ON n.user_id = u.id
          WHERE n.approval_status = 'pending'
          ORDER BY n.created_at ASC
      `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching pending notes:", err.message);
    res.status(500).json({ error: "Failed to fetch pending notes." });
  }
}

async function reviewNote(req, res) {
  try {
    const { noteId } = req.params;
    const { action, reason } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: "Invalid action." });
    }
    if (action === 'reject' && !reason) {
      return res.status(400).json({ error: "A reason is required for rejection." });
    }
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const updatedNote = await updateNote(noteId, {
      approval_status: newStatus,
      rejection_reason: reason || null,
    });

    if (!updatedNote) {
      return res.status(404).json({ error: "Note not found." });
    }

    if (newStatus === 'approved') {
      notifyFavoritedUsers(updatedNote.id, updatedNote.title, 'new').catch(e => console.error('Background notification failed:', e));
    }

    res.json({ message: `Note has been ${newStatus}.`, note: updatedNote });
  } catch (err) {
    console.error("Error reviewing note:", err.message);
    res.status(500).json({ error: "Failed to review note." });
  }
}

async function addFavourite(req, res) {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;
    await pool.query(
      'INSERT INTO user_favourites (user_id, note_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, noteId]
    );
    res.status(201).json({ message: "Added to favourites." });
  } catch (err) {
    console.error("Error adding favourite:", err.message);
    res.status(500).json({ error: "Failed to add favourite." });
  }
}

async function removeFavourite(req, res) {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;
    await pool.query(
      'DELETE FROM user_favourites WHERE user_id = $1 AND note_id = $2',
      [userId, noteId]
    );
    res.json({ message: "Removed from favourites." });
  } catch (err) {
    console.error("Error removing favourite:", err.message);
    res.status(500).json({ error: "Failed to remove favourite." });
  }
}

async function getFavourites(req, res) {
  try {
    const userId = req.user.id;
    const result = await pool.query(`
          SELECT n.id, n.title, n.view_count, n.is_free
          FROM notes n
          JOIN user_favourites uf ON n.id = uf.note_id
          WHERE uf.user_id = $1 AND n.approval_status = 'approved'
          ORDER BY uf.created_at DESC
      `, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error("Error getting favourites:", err.message);
    res.status(500).json({ error: "Failed to get favourites." });
  }
}

async function getFavouriteIds(req, res) {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      'SELECT note_id FROM user_favourites WHERE user_id = $1',
      [userId]
    );
    const ids = result.rows.map(row => row.note_id);
    res.json(ids);
  } catch (err) {
    console.error("Error fetching favourite IDs:", err.message);
    res.status(500).json({ error: "Failed to get favourite IDs." });
  }
}

async function getSingleNote(req, res) {
  try {
    const { id } = req.params;
    const note = await findNoteById(id);
    if (!note) {
      return res.status(404).json({ error: "Note not found." });
    }
    res.json(note);
  } catch (err) {
    console.error("Error fetching single note:", err.message);
    res.status(500).json({ error: "Failed to fetch note details." });
  }
}

async function serveNoteWithWatermark(req, res) {
  try {
    const { id } = req.params;
    const viewingUser = req.user;
    const note = await findNoteByIdAndJoinUser(id);
    if (!note) {
      return res.status(404).json({ error: "Note not found." });
    }

    // If note is stored on Cloudinary, fetch remote and watermark
    if (note.cloudinary_public_id || note.file_url) {
      const fetch = globalThis.fetch || require('node-fetch');
      const remoteUrl = note.file_url;
      const resp = await fetch(remoteUrl);
      if (!resp.ok) throw new Error('Failed to fetch remote PDF for watermarking');
      const remoteBuffer = Buffer.from(await resp.arrayBuffer());
      const logoPath = path.join(__dirname, '..', 'assets', 'learnify-logo.png');
      const logoBytes = await fs.readFile(logoPath);
      const pdfDoc = await PDFDocument.load(remoteBuffer);
      const logoImage = await pdfDoc.embedPng(logoBytes);
      const logoDims = logoImage.scale(0.15);
      if (viewingUser.role !== 'admin' && note.user_id !== viewingUser.id) {
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const pages = pdfDoc.getPages();
        for (const page of pages) {
          const { width, height } = page.getSize();
          page.drawText(`Viewed by ${viewingUser.username}`, {
            x: width / 2 - 100, y: height / 2, font, size: 42, color: rgb(0.8, 0.2, 0.2), opacity: 0.12, rotate: { type: 'degrees', angle: -45 },
          });
          page.drawImage(logoImage, {
            x: width - logoDims.width - 20, y: height - logoDims.height - 20, width: logoDims.width, height: logoDims.height, opacity: 0.16,
          });
        }
      }
      const finalPdfBytes = await pdfDoc.save();
      res.setHeader('Content-Security-Policy', "frame-src 'self' blob:");
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${note.title}.pdf"`);
      return res.send(Buffer.from(finalPdfBytes));
    }

    // Local file path handling
    const notePath = path.join(__dirname, '..', '..', 'uploads', path.basename(note.pdf_path));
    const logoPath = path.join(__dirname, '..', 'assets', 'learnify-logo.png');

    const pdfBytes = await fs.readFile(notePath);
    const logoBytes = await fs.readFile(logoPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoDims = logoImage.scale(0.15);
    if (viewingUser.role !== 'admin' && note.user_id !== viewingUser.id) {
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();
      for (const page of pages) {
        const { width, height } = page.getSize();
        page.drawText(`Viewed by ${viewingUser.username}`, {
          x: width / 2 - 100, y: height / 2, font, size: 50, color: rgb(0.8, 0.2, 0.2), opacity: 0.15, rotate: { type: 'degrees', angle: -45 },
        });
        page.drawImage(logoImage, {
          x: width - logoDims.width - 20, y: height - logoDims.height - 20, width: logoDims.width, height: logoDims.height, opacity: 0.2,
        });
      }
    }
    const finalPdfBytes = await pdfDoc.save();
    res.setHeader('Content-Security-Policy', "frame-src 'self' blob:");
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${note.title}.pdf"`);
    res.send(Buffer.from(finalPdfBytes));
  } catch (err) {
    console.error("❌ Error serving PDF:", err && err.message ? err.message : err);
    if (err && err.code === 'ENOENT') {
      return res.status(500).json({ error: "Could not serve the note. PDF file or logo asset is missing on the server." });
    }
    res.status(500).json({ error: "Could not serve the note." });
  }
}

async function getFreeNote(req, res) {
  try {
    const result = await pool.query(
      "SELECT id, pdf_path, file_url, cloudinary_public_id FROM notes WHERE is_free = TRUE AND approval_status = 'approved' ORDER BY created_at DESC LIMIT 1"
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No free note available at the moment.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error fetching free note:", err.message);
    res.status(500).json({ error: "Failed to fetch free note." });
  }
}

async function getMyNotes(req, res) {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      "SELECT id, title, approval_status, rejection_reason, created_at FROM notes WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching my notes:", err.message);
    res.status(500).json({ error: "Failed to fetch your notes." });
  }
}

/**
 * POST /api/notes/:noteId/report
 * Allows a user to report/flag a note for review.
 */
async function reportNote(req, res) {
  try {
    const { noteId } = req.params;
    const { reason, comment } = req.body;
    const reporterId = req.user.id;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: "A reason is required to report a note." });
    }

    // Check if the note exists
    const note = await findNoteById(noteId);
    if (!note) {
      return res.status(404).json({ error: "Note not found." });
    }

    // Check if the user is reporting their own note
    if (note.user_id === reporterId) {
      return res.status(400).json({ error: "You cannot report your own note." });
    }

    // Insert the report into the new note_reports table
    const query = `
      INSERT INTO note_reports (note_id, reporter_id, reason, comment, status)
      VALUES ($1, $2, $3, $4, 'new')
      RETURNING id, created_at
    `;
    const values = [noteId, reporterId, reason, comment];

    try {
      const result = await pool.query(query, values);

      // Optional: Trigger a notification to admins about the new report

      return res.status(201).json({
        message: "Note successfully reported. An admin will review it shortly.",
        reportId: result.rows[0].id
      });
    } catch (e) {
      // PostgreSQL error code for unique violation (23505)
      if (e.code === '23505' && e.constraint === 'note_reports_note_id_reporter_id_key') {
        return res.status(409).json({ error: "You have already submitted a report for this note." });
      }
      throw e; // Re-throw other errors
    }

  } catch (err) {
    console.error("❌ Error submitting note report:", err.message);
    res.status(500).json({ error: "Server error while submitting report." });
  }
}


async function uploadNoteVersion(req, res) {
  try {
    const { noteId } = req.params;
    const { newTitle } = req.body;
    const uploaderId = req.user.id;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "New PDF file is required." });
    if (!newTitle) return res.status(400).json({ error: "New title is required." });

    const existingNote = await findNoteById(noteId);
    if (!existingNote || existingNote.user_id !== uploaderId) {
      return res.status(403).json({ error: "You cannot submit a new version for this note." });
    }
    if (existingNote.approval_status !== 'approved') {
      return res.status(400).json({ error: `Cannot update version. Note status is '${existingNote.approval_status}'.` });
    }

    // 1. Calculate file hash for uniqueness check
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // 2. Upload the new file to Cloudinary
    const randomHex = crypto.randomBytes(6).toString('hex');
    const safeName = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\.-]/g, '');
    const publicId = `${uploaderId}_version_${noteId}_${Date.now()}_${randomHex}_${path.parse(safeName).name}`;
    const uploadResult = await uploadBufferToCloudinary(file.buffer, publicId);

    // 3. Find the previous approved version's ID
    const latestApproved = await getLatestApprovedVersion(noteId);

    // 4. Create the new version entry in the database (status = 'pending')
    const newVersion = await createNoteVersion({
      note_id: noteId,
      uploader_id: uploaderId,
      title: newTitle,
      file_url: uploadResult.secure_url,
      cloudinary_public_id: uploadResult.public_id,
      version_hash: hash,
      previous_version_id: latestApproved ? latestApproved.id : null,
    });

    res.status(201).json({
      message: "New version successfully submitted for review.",
      version: newVersion,
    });
  } catch (err) {
    console.error("❌ Version upload failed:", err);
    res.status(500).json({ error: "Failed to submit new note version." });
  }
}

async function reviewNoteVersion(req, res) {
  const { versionId } = req.params;
  const { action } = req.body;

  if (action !== 'approve') {
    return res.status(400).json({ error: 'Only approval is handled here.' });
  }

  try {
    // Assume findNoteVersionById exists in noteModel
    const version = await pool.query("SELECT * FROM note_versions WHERE id = $1", [versionId]);
    if (version.rowCount === 0) return res.status(404).json({ error: "Version not found." });
    const { note_id, title, file_url, cloudinary_public_id } = version.rows[0];

    // This function MUST be implemented in noteModel.js to handle the transaction
    const result = await updateNoteToNewVersion(note_id, versionId, {
      title, file_url, cloudinary_public_id
    });

    // PHASE 2 FIX: Notify users who favorited the original note
    notifyFavoritedUsers(note_id, title, 'update').catch(e => console.error('Background notification failed:', e));

    return res.json({ message: "Version approved and live!", note: result.note, version: result.version });

  } catch (e) {
    console.error("❌ Version review/approval failed:", e);
    return res.status(500).json({ error: "Failed to approve version." });
  }
}

async function deleteMyNotes(req, res) {
  try {
    const userId = req.user.id;
    const { noteIds } = req.body;
    if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
      return res.status(400).json({ error: "Note IDs must be provided in an array." });
    }
    const result = await pool.query(
      "DELETE FROM notes WHERE id = ANY($1::int[]) AND user_id = $2 RETURNING pdf_path, file_url, cloudinary_public_id",
      [noteIds, userId]
    );

    for (const row of result.rows) {
      try {
        if (row.cloudinary_public_id) {
          await cloudinary.uploader.destroy(row.cloudinary_public_id, { resource_type: 'raw' }).catch(e => console.warn('Cloudinary deletion warning:', e.message));
        } else if (row.pdf_path) {
          const filePath = path.join(__dirname, '..', '..', 'uploads', path.basename(row.pdf_path));
          await fs.unlink(filePath).catch(err => console.error("Failed to delete file:", err.message));
        }
      } catch (e) {
        console.error('Cleanup error for deleted note:', e.message);
      }
    }
    res.json({ message: `Successfully deleted ${result.rowCount} notes.` });
  } catch (err) {
    console.error("❌ Error deleting my notes:", err.message);
    res.status(500).json({ error: "Failed to delete notes." });
  }
}

// Placeholder functions
async function editNote(req, res) { return res.status(501).json({ error: "Not Implemented" }); }
async function removeNote(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const note = await findNoteById(id);
    if (!note) {
      return res.status(404).json({ error: "Note not found." });
    }

    // Allow if admin or if user owns the note
    if (userRole !== 'admin' && note.user_id !== userId) {
      return res.status(403).json({ error: "Unauthorized to delete this note." });
    }

    // Delete file from Cloudinary or Local Storage
    if (note.cloudinary_public_id) {
      await cloudinary.uploader.destroy(note.cloudinary_public_id, { resource_type: 'raw' });
    } else if (note.pdf_path) {
      const filePath = path.join(__dirname, '..', '..', 'uploads', path.basename(note.pdf_path));
      await fs.unlink(filePath).catch(err => console.error("Failed to delete file:", err.message));
    }

    await deleteNote(id);
    res.json({ message: "Note deleted successfully." });
  } catch (err) {
    console.error("Error deleting note:", err.message);
    res.status(500).json({ error: "Failed to delete note." });
  }
}

async function getAllNotes(req, res) {
  try {
    // Admin only: fetch ALL notes with user details
    const result = await pool.query(`
      SELECT n.*, u.username, u.email 
      FROM notes n 
      LEFT JOIN users u ON n.user_id = u.id 
      ORDER BY n.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching all notes:", err.message);
    res.status(500).json({ error: "Failed to fetch notes." });
  }
}

module.exports = {
  uploadUserNote,
  handleMultiUpload,
  getPendingNotes,
  reviewNote,
  getFilteredNotes,
  addNote,
  getNoteById,
  reviewNoteVersion,
  addFavourite,
  removeFavourite,
  getFavourites,
  getFavouriteIds,
  serveNoteWithWatermark,
  getFreeNote,
  getMyNotes,
  deleteMyNotes,
  reportNote,
  getAvailableSubjects,
  editNote,
  removeNote,
  getSharedNotes,
  requestNoteAccess,
  getAccessRequests,
  respondToAccessRequest,
  getNoteRatings,
  addNoteRating,
  getAllNotes,
  uploadNoteVersion
};