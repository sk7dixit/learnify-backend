// fix_admin.js - ONLY RUN ONCE LOCALLY
require('dotenv').config(); // Load local environment variables first
const { Pool } = require('pg');

// ⚠️ Get your hash from the hash_temp.js script's output
const NEW_BCRYPT_HASH = '$2b$10$nQ6c1AxFx08dD2VCtGfofONa5nNaJndHozboblryTO16QiTaEAZzm';
const ADMIN_EMAIL = 'learnify887@gmail.com';

// ----------------------------------------------------
// This function mimics the connection setup used in db.js
// ----------------------------------------------------
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://local_user:local_pass@localhost:5432/local_db',
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
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

        // Use the pool to execute the query
        const result = await pool.query(sql, [NEW_BCRYPT_HASH, ADMIN_EMAIL]);

        if (result.rowCount === 1) {
            console.log("✅ SUCCESS! Admin password updated and verified.");
            console.log("   User ID:", result.rows[0].id);
            console.log("   Username:", result.rows[0].username);
        } else {
            console.error("❌ FAILURE: Admin user not found in the database. 0 rows updated.");
        }
    } catch (err) {
        console.error("❌ CRITICAL ERROR during password fix:", err.message);
        console.error("   Ensure your .env has the correct DATABASE_URL if running locally, or use the psql command.");
    } finally {
        await pool.end();
    }
}

fixAdminPassword();