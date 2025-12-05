const pool = require('../src/config/db');

const createTableQuery = `
    CREATE TABLE IF NOT EXISTS public.pending_registrations (
        id BIGSERIAL PRIMARY KEY,
        name character varying(100) NOT NULL,
        email character varying(150) UNIQUE NOT NULL,
        password character varying(255) NOT NULL,
        username character varying(50) NOT NULL,
        mobile_number character varying(255),
        role character varying(20) DEFAULT 'user'::character varying,
        otp character varying(6) NOT NULL,
        otp_created_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
    );
    CREATE INDEX IF NOT EXISTS idx_pending_registrations_email ON public.pending_registrations(email);
`;

async function run() {
    try {
        console.log('Creating pending_registrations table...');
        await pool.query(createTableQuery);
        console.log('✅ Table created successfully.');
    } catch (err) {
        console.error('❌ Error creating table:', err);
    } finally {
        await pool.end();
    }
}

run();
