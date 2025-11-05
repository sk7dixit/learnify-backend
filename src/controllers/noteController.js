// src/controllers/noteController.js
const { createNote, updateNote, findNoteById, deleteNote, incrementNoteViewCount, findNoteByIdAndJoinUser } = require("../models/noteModel");
const fs = require('fs').promises;
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const pool = require("../config/db");
const path = require("path");
const { updateUserFreeViews } = require("../models/userModel");
const { pdfQueue } = require('../config/queue');

// ... (all other functions like getFilteredNotes, addNote, etc. remain unchanged) ...
// --- THIS IS THE ONLY FUNCTION THAT HAS CHANGED ---
async function uploadUserNote(req, res) {
    try {
        const {
            title, material_type,
            // Personal Note fields
            field, course, subject,
            // University Note fields
            university_name
        } = req.body;

        const userId = req.user.id;
        const username = req.user.username;

        if (!title || !req.file || !material_type) {
            return res.status(400).json({ error: "Title, PDF file, and material type are required" });
        }
        if (!username) {
            return res.status(400).json({ error: "User information is missing. Please log in again."})
        }

        const pdfPath = `/uploads/${req.file.filename}`;
        const absolutePath = req.file.path;

        let notePayload = {
            title,
            pdf_path: pdfPath,
            user_id: userId,
            is_free: false, // User uploads are never free by default
            approval_status: 'pending',
        };

        // Populate payload based on the type of upload
        if (material_type === 'university_material') {
            notePayload = {
                ...notePayload,
                material_type: 'university_material',
                university_name: university_name,
                course: course,
                subject: subject,
            };
        } else { // Default to personal_material
            const institutionType = ["Class 12", "Class 11", "Class 10"].includes(field) ? "School" : "College";
            notePayload = {
                ...notePayload,
                material_type: 'personal_material', // New type
                institution_type: institutionType,
                field: field || null,
                course: course || null,
                subject: subject || null,
            };
        }

        const newNote = await createNote(notePayload);

        // Add a job to the queue for background watermarking
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


// --- NO OTHER FUNCTIONS BELOW THIS LINE WERE CHANGED ---
// ... (getPendingNotes, reviewNote, addFavourite, removeNote, editNote etc. are all the same as before)
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

        // FIX 1: Correct path for uploaded PDFs. note.pdf_path stores '/uploads/filename.pdf'
        // The path needs to go up one level (to src) and then to the uploads folder at the root.
        const notePath = path.join(__dirname, '..', '..', 'uploads', path.basename(note.pdf_path));

        // FIX 2: Correct path for the logo file, which is inside src/assets/
        // __dirname (controllers) -> '..' (src) -> 'assets' -> 'learnify-logo.png'
        // Assuming your logo is named 'learnify-logo.png' based on your folder structure.
        const logoPath = path.join(__dirname, '..', 'assets', 'learnify-logo.png');

        // ----------------------------------------------------------------------------------

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
        console.error("❌ Error serving PDF:", err.message);
        if (err.code === 'ENOENT') {
            // Updated error message to be more specific based on the path fix
            return res.status(500).json({ error: "Could not serve the note. PDF file or logo asset is missing on the server." });
        }
        res.status(500).json({ error: "Could not serve the note." });
    }
}
async function getFreeNote(req, res) {
    try {
        const result = await pool.query(
            "SELECT id, pdf_path FROM notes WHERE is_free = TRUE AND approval_status = 'approved' ORDER BY created_at DESC LIMIT 1"
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
async function deleteMyNotes(req, res) {
    try {
        const userId = req.user.id;
        const { noteIds } = req.body;
        if (!noteIds || !Array.isArray(noteIds) || noteIds.length === 0) {
            return res.status(400).json({ error: "Note IDs must be provided in an array." });
        }
        const result = await pool.query(
            "DELETE FROM notes WHERE id = ANY($1::int[]) AND user_id = $2 RETURNING pdf_path",
            [noteIds, userId]
        );
        result.rows.forEach(row => {
            const filePath = path.join(__dirname, '..', '..', 'uploads', path.basename(row.pdf_path));
            fs.unlink(filePath).catch(err => console.error("Failed to delete file:", err.message));
        });
        res.json({ message: `Successfully deleted ${result.rowCount} notes.` });
    } catch (err) {
        console.error("❌ Error deleting my notes:", err.message);
        res.status(500).json({ error: "Failed to delete notes." });
    }
}
async function getNoteRatings(req, res) {
    try {
        const { noteId } = req.params;
        const result = await pool.query(
            `SELECT r.rating, r.review_text, r.created_at, u.username
             FROM note_ratings r
             JOIN users u ON r.user_id = u.id
             WHERE r.note_id = $1
             ORDER BY r.created_at DESC`,
            [noteId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error fetching note ratings:", err.message);
        res.status(500).json({ error: "Failed to fetch ratings." });
    }
}
async function addNoteRating(req, res) {
    try {
        const { noteId } = req.params;
        const userId = req.user.id;
        const { rating, review_text } = req.body;
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ error: "A rating between 1 and 5 is required." });
        }
        const result = await pool.query(
            `INSERT INTO note_ratings (note_id, user_id, rating, review_text)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (note_id, user_id)
             DO UPDATE SET rating = EXCLUDED.rating, review_text = EXCLUDED.review_text, created_at = NOW()
             RETURNING *`,
            [noteId, userId, rating, review_text]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("❌ Error adding note rating:", err.message);
        res.status(500).json({ error: "Failed to submit your rating." });
    }
}
async function requestNoteAccess(req, res) {
    try {
        const { noteId } = req.params;
        const requesterId = req.user.id;
        const noteResult = await pool.query("SELECT user_id FROM notes WHERE id = $1", [noteId]);
        if (noteResult.rowCount === 0) {
            return res.status(404).json({ error: "Note not found." });
        }
        const ownerId = noteResult.rows[0].user_id;
        if (ownerId === requesterId) {
            return res.status(400).json({ error: "You cannot request access to your own note." });
        }
        await pool.query(
            `INSERT INTO note_access_permissions (note_id, owner_id, requester_id, status)
             VALUES ($1, $2, $3, 'pending')
             ON CONFLICT (note_id, requester_id) DO NOTHING`,
            [noteId, ownerId, requesterId]
        );
        res.status(201).json({ message: "Access request sent successfully." });
    } catch (err) {
        console.error("❌ Error sending access request:", err.message);
        res.status(500).json({ error: "Failed to send access request." });
    }
}
async function getAccessRequests(req, res) {
    try {
        const ownerId = req.user.id;
        const result = await pool.query(`
            SELECT p.id, p.note_id, n.title as note_title, u.username as requester_username
            FROM note_access_permissions p
            JOIN notes n ON p.note_id = n.id
            JOIN users u ON p.requester_id = u.id
            WHERE p.owner_id = $1 AND p.status = 'pending'
            ORDER BY p.created_at DESC
        `, [ownerId]);
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error fetching access requests:", err.message);
        res.status(500).json({ error: "Failed to fetch access requests." });
    }
}
async function respondToAccessRequest(req, res) {
    try {
        const { requestId } = req.params;
        const { action } = req.body;
        const ownerId = req.user.id;
        if (!['grant', 'deny'].includes(action)) {
            return res.status(400).json({ error: "Invalid action." });
        }
        const newStatus = action === 'grant' ? 'granted' : 'denied';
        const result = await pool.query(
            "UPDATE note_access_permissions SET status = $1 WHERE id = $2 AND owner_id = $3 RETURNING id",
            [newStatus, requestId, ownerId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Request not found or you are not the owner." });
        }
        res.json({ message: `Request has been ${newStatus}.` });
    } catch (err) {
        console.error("❌ Error responding to access request:", err.message);
        res.status(500).json({ error: "Failed to respond to request." });
    }
}
async function getSharedNotes(req, res) {
    try {
        const requesterId = req.user.id;
        const result = await pool.query(`
            SELECT n.id, n.title, n.view_count, u.username as owner_username
            FROM notes n
            JOIN note_access_permissions p ON n.id = p.note_id
            JOIN users u ON n.user_id = u.id
            WHERE p.requester_id = $1 AND p.status = 'granted'
            ORDER BY u.username, n.title
        `, [requesterId]);
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error fetching shared notes:", err.message);
        res.status(500).json({ error: "Failed to fetch shared notes." });
    }
}
async function removeNote(req, res) {
    try {
        const { id } = req.params;
        const note = await findNoteById(id);
        if (!note) {
            return res.status(404).json({ error: "Note not found." });
        }
        await deleteNote(id);
        const filePath = path.join(__dirname, '..', '..', 'uploads', path.basename(note.pdf_path));
        await fs.unlink(filePath);
        res.json({ message: "Note deleted successfully." });
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.warn(`File not found for deleted note ID ${req.params.id}, but proceeding with DB deletion.`);
            res.json({ message: "Note record deleted, but the physical file was already missing." });
        } else {
            console.error("❌ Error deleting note:", err.message);
            res.status(500).json({ error: "Failed to delete note." });
        }
    }
}
async function editNote(req, res) {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        const existingNote = await findNoteById(id);
        if (!existingNote) {
            return res.status(404).json({ error: "Note not found." });
        }
        const fieldsToUpdate = {
            title: updatedData.title,
            institution_type: updatedData.category,
            field: updatedData.stream,
            course: updatedData.discipline,
            expiry_date: updatedData.expiry_date || null,
            is_free: updatedData.is_free,
        };
        const updatedNote = await updateNote(id, fieldsToUpdate);
        res.json({ message: "Note updated successfully.", note: updatedNote });
    } catch (err) {
        console.error("❌ Error editing note:", err.message);
        res.status(500).json({ error: "Failed to edit note." });
    }
}
module.exports = {
  addNote, getFilteredNotes, getSingleNote, uploadUserNote, getPendingNotes, reviewNote, addFavourite,
  removeFavourite, getFavourites, getFavouriteIds, serveNoteWithWatermark, getFreeNote, editNote,
  removeNote, getSharedNotes, requestNoteAccess, getAccessRequests, respondToAccessRequest,
  getMyNotes, deleteMyNotes, getNoteRatings, addNoteRating,
};