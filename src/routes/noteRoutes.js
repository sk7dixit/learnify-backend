// src/routes/noteRoutes.js
const express = require("express");
const multer = require("multer");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const checkSubscription = require("../middleware/checkSubscription");
const pool = require('../config/db');

const {
  addNote,
  getFilteredNotes,
  getSingleNote,
  uploadUserNote,
  getPendingNotes,
  reviewNote,
  addFavourite,
  removeFavourite,
  getFavourites,
  serveNoteWithWatermark,
  editNote,
  removeNote,
  getMyNotes,
  requestNoteAccess,
  getAccessRequests,
  respondToAccessRequest,
  getFreeNote,
  getFavouriteIds,
  deleteMyNotes,
  getNoteRatings,
  addNoteRating,
  getSharedNotes,
} = require("../controllers/noteController");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + require('path').extname(file.originalname)),
});
const upload = multer({ storage });

// --- PUBLIC/GENERAL ROUTES ---
router.get("/universities", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT DISTINCT university_name FROM notes WHERE university_name IS NOT NULL AND university_name != '' AND approval_status = 'approved' ORDER BY university_name"
        );
        res.json(result.rows.map(row => row.university_name));
    } catch (err) {
        console.error("❌ Error fetching universities:", err.message);
        res.status(500).json({ error: "Failed to fetch university list" });
    }
});
router.get("/filtered", authMiddleware, getFilteredNotes);
router.get("/free", getFreeNote);

// --- USER-SPECIFIC ROUTES (AUTH REQUIRED) ---
router.post("/user-upload", authMiddleware, upload.single("file"), uploadUserNote);
router.get("/favourites/ids", authMiddleware, getFavouriteIds);
router.get("/favourites", authMiddleware, getFavourites);
router.post("/favourites/:noteId", authMiddleware, addFavourite);
router.delete("/favourites/:noteId", authMiddleware, removeFavourite);
router.post('/access/request/:noteId', authMiddleware, requestNoteAccess);
router.get('/access/requests', authMiddleware, getAccessRequests);
router.put('/access/respond/:requestId', authMiddleware, respondToAccessRequest);
router.get("/my-notes", authMiddleware, getMyNotes);
router.delete("/my-notes", authMiddleware, deleteMyNotes);
router.get("/shared-with-me", authMiddleware, getSharedNotes);

// --- NOTE VIEWING (SUBSCRIPTION CHECK APPLIES) ---
router.get("/view/:id", authMiddleware, checkSubscription, serveNoteWithWatermark);

// --- ADMIN-ONLY ROUTES ---
router.get("/details/:id", authMiddleware, adminMiddleware, getSingleNote);
router.get("/pending-approval", authMiddleware, adminMiddleware, getPendingNotes);
router.put("/review/:noteId", authMiddleware, adminMiddleware, reviewNote);
router.post("/upload", authMiddleware, adminMiddleware, upload.single("file"), addNote);
router.put("/:id", authMiddleware, adminMiddleware, editNote);
router.delete("/:id", authMiddleware, adminMiddleware, removeNote);

// --- RATING & REVIEW ROUTES ---
router.get("/:noteId/ratings", authMiddleware, getNoteRatings);
router.post("/:noteId/rate", authMiddleware, addNoteRating);

module.exports = router;