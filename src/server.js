// THE FIX: Load environment variables from .env file at the very top.
require('dotenv').config();

const app = require('./app');
const { checkAllUsers } = require('./utils/badgeService');
// ADD: Import the pool object to allow database access
const pool = require('./src/config/db');

const PORT = process.env.PORT || 5000;

// --- TEMPORARY FIX FUNCTION (Executes on Server Start) ---
const fixAdminPassword = async () => {
    // ⚠️ CRITICAL: Replace this placeholder with the secure Bcrypt hash you generated!
    const NEW_BCRYPT_HASH = '$2b$10$nQ6c1AxFx08dD2VCtGfofONa5nNaJndHozboblryTO16QiTaEAZzm';
    const ADMIN_EMAIL = 'learnify887@gmail.com';

    try {
        const sql = `
            UPDATE public.users
            SET
                password = $1,
                role = 'admin',
                is_verified = TRUE,
                verification_token = NULL
            WHERE email = $2
            RETURNING id, username, is_verified;
        `;
        const result = await pool.query(sql, [NEW_BCRYPT_HASH, ADMIN_EMAIL]);

        if (result.rowCount === 1) {
            console.log("✅ [ADMIN FIX] SUCCESS! Admin password updated and verified.");
        } else {
            console.warn("⚠️ [ADMIN FIX] Admin user not found in DB. Check users table.");
        }
    } catch (err) {
        // This catch handles internal Render DB errors, but should succeed.
        console.error("❌ [ADMIN FIX] FAILED to run SQL update:", err.message);
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