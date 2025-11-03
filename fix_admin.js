// fix_admin.js - Final Attempt with Explicit SSL Configuration
require('dotenv').config();
const { Pool } = require('pg');

const NEW_BCRYPT_HASH = '$2b$10$nQ6c1AxFx08dD2VCtGfofONa5nNaJndHozboblryTO16QiTaEAZzm';
const ADMIN_EMAIL = 'learnify887@gmail.com';

// ----------------------------------------------------
// FIX: Force Node.js to use explicit SSL configuration
// ----------------------------------------------------
const pool = new Pool({
    // Use the DATABASE_URL (set in your terminal) or fallback (optional)
    connectionString: process.env.DATABASE_URL,

    // Explicit SSL configuration required for Render (rejectUnauthorized: false is crucial)
    ssl: {
        rejectUnauthorized: false
    }
});

async function fixAdminPassword() {
    try {
        console.log(`Attempting to update password for: ${ADMIN_EMAIL}`);

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
            console.log("✅ SUCCESS! Admin password updated and verified.");
            console.log("   User ID:", result.rows[0].id);
            console.log("   Username:", result.rows[0].username);
        } else {
            console.error("❌ FAILURE: Admin user not found. 0 rows updated.");
        }
    } catch (err) {
        console.error("❌ CRITICAL ERROR during password fix:", err.message);
        console.error("   Ensure your DATABASE_URL is set correctly and the SSL configuration is valid.");
    } finally {
        await pool.end();
    }
}

fixAdminPassword();