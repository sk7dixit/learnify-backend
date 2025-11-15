// src/routes/noteRoutes.js
const express = require('express');
const router = express.Router();

// Middlewares: FIXING THE PATH. Assuming middleware files are in src/middleware/
// If the file is src/routes/noteRoutes.js, we need to go up one level (..)
// then down into the correct middleware directory.
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// Controller
const noteController = require('../controllers/noteController');

// Use the controller's multer uploadMiddleware (memory storage)
const uploadMiddleware = noteController.uploadMiddleware;

// ----------------- Public / Browsing -----------------

// GET /api/notes/filtered?course=...&subject=...&q=...
router.get('/filtered', noteController.getFilteredNotes);

// GET /api/notes/available-subjects?course=...
router.get('/available-subjects', noteController.getAvailableSubjects);

// GET /api/notes/free/latest
router.get('/free/latest', noteController.getFreeNote);

// GET /api/notes/:id - note metadata
router.get('/:id', noteController.getSingleNote);

// Serve PDF view/stream (watermarked) - protected
router.get('/:id/view', authMiddleware, noteController.serveNoteWithWatermark);
router.get('/:id/download', authMiddleware, noteController.serveNoteWithWatermark); // same handler for download

// ----------------- Ratings & Favourites -----------------
router.get('/:noteId/ratings', noteController.getNoteRatings);
router.post('/:noteId/rate', authMiddleware, noteController.addNoteRating);

router.get('/favourites/ids', authMiddleware, noteController.getFavouriteIds);
router.get('/favourites', authMiddleware, noteController.getFavourites);
router.post('/favourites/:id', authMiddleware, noteController.addFavourite);
router.delete('/favourites/:id', authMiddleware, noteController.removeFavourite);

// ----------------- PHASE 2: COMMUNITY CURATION (NEW) -----------------
// POST /api/notes/:noteId/report
router.post('/:noteId/report', authMiddleware, noteController.reportNote);


// ----------------- Uploads -----------------

// Single upload preserved (uses uploadMiddleware)
router.post('/upload',
  authMiddleware,
  uploadMiddleware.single('file'),
  noteController.uploadUserNote
);

// Multi-upload (files[] + titles[]), up to configured max (controller also validates)
router.post('/multi-upload',
  authMiddleware,
  uploadMiddleware.array('files[]', parseInt(process.env.MULTI_UPLOAD_MAX_FILES || '10', 10)),
  noteController.handleMultiUpload
);

// ----------------- Access / Sharing -----------------
router.post('/access/request/:noteId', authMiddleware, noteController.requestNoteAccess);
router.put('/access/respond/:requestId', authMiddleware, adminMiddleware, noteController.respondToAccessRequest);

router.get('/shared-with-me', authMiddleware, noteController.getSharedNotes);

// ----------------- Admin review -----------------
router.get('/admin/pending', authMiddleware, adminMiddleware, noteController.getPendingNotes);
router.put('/admin/review/:noteId', authMiddleware, adminMiddleware, noteController.reviewNote);

// Convenience aliases
router.put('/admin/approve/:noteId', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    req.body.action = 'approve';
    await noteController.reviewNote(req, res, next);
  } catch (e) { next(e); }
});
router.put('/admin/reject/:noteId', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    req.body.action = 'reject';
    await noteController.reviewNote(req, res, next);
  } catch (e) { next(e); }
});

// ----------------- Notes management -----------------
// Edit note metadata
router.put('/:id', authMiddleware, noteController.editNote);

// Delete note (owner/admin)
router.delete('/:id', authMiddleware, noteController.removeNote);

// Batch delete owned notes
router.post('/delete', authMiddleware, noteController.deleteMyNotes);

// My notes
router.get('/me', authMiddleware, noteController.getMyNotes);

// Misc / fallback endpoints (versions etc.)
router.post('/:id/version', authMiddleware, uploadMiddleware.single('file'), noteController.uploadNoteVersion || ((req, res) => res.status(501).json({ error: 'Not implemented' })));
router.get('/:id/versions', noteController.getNoteVersions || ((req, res) => res.status(501).json({ error: 'Not implemented' })));

// Admin extras
router.get('/admin/user-submissions', authMiddleware, adminMiddleware, noteController.getUserSubmissions || ((req,res) => res.status(501).json({ error: 'Not implemented' })));

// Export router
module.exports = router;