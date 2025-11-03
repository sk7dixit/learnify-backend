// THE FIX: Load environment variables from .env file at the very top.
require('dotenv').config();

const app = require('./app');
const { checkAllUsers } = require('./utils/badgeService');
// FIX: The path must be absolute or correctly relative to the file structure.
// Since db.js is at smart-notes-backend/src/config/db, and server.js is at root:
const pool = require('./config/db');

const PORT = process.env.PORT || 5000;

// --- TEMPORARY FIX FUNCTION (Executes on Server Start) ---
// Note: This hash is temporary and should be removed after successful login.
const fixAdminPassword = async () => {
    // ⚠️ CRITICAL: The Bcrypt hash you generated earlier
    const NEW_BCRYPT_HASH = '$2b$10$nQ6c1AxFx08dD2VCtGfofOFu0AxNmAInh3bzobobRYTD16Q/tT6aEAZzm';
    const ADMIN_EMAIL = 'learnify887@gmail.com';

    try {
        const sql = `
            INSERT INTO public.users
                (name, age, email, password, role, is_verified, username, mobile_number, last_login)
            VALUES
                ('Admin', 21, $1, $2, 'admin', TRUE, 'learnifyadmin', '0000000000', NOW())
            ON CONFLICT (email) DO UPDATE
            SET password = EXCLUDED.password, role = 'admin', is_verified = TRUE
            RETURNING id, username;
        `;

        // Note: The $1 is the email, $2 is the hash, based on your original userModel's logic.
        const result = await pool.query(sql, [ADMIN_EMAIL, NEW_BCRYPT_HASH]);

        if (result.rowCount === 1) {
            console.log(`✅ [ADMIN FIX] SUCCESS! Admin user created/updated: ${result.rows[0].username}`);
        } else {
            console.error("❌ [ADMIN FIX] FAILED to run SQL update. Check query.");
        }
    } catch (err) {
        // This should catch duplicate key errors if a user exists
        console.error("❌ [ADMIN FIX] CRITICAL ERROR during SQL execution:", err.message);
    }
};
// ----------------------------------------------------


app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);

  // CALL THE TEMPORARY FIX FUNCTION HERE
  fixAdminPassword();

  console.log('Running initial badge check on startup...');
  setTimeout(checkAllUsers, 5000);

  setInterval(checkAllUsers, 3600000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('--- 🛑 UNHANDLED REJECTION DETECTED 🛑 ---');
    console.error('Reason:', reason);
    if (reason.response) {
        console.error('Response Status:', reason.response.status);
        console.error('Response Data:', reason.response.data);
    }
});

process.on('uncaughtException', (err) => {
    console.error('--- 💀 UNCAUGHT EXCEPTION DETECTED 💀 ---');
    console.error('Error:', err);
    console.error('Stack:', err.stack);
});