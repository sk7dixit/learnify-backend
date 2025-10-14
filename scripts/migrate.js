const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db.js');

const runMigration = async () => {
  console.log('Starting database migration...');
  try {
    // This will now use the correctly configured pool from db.js
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL');

    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema.sql...');
    await pool.query(schemaSql);

    console.log('✅ Database migration completed successfully.');

  } catch (error) {
    console.error('❌ Error during database migration:', error);
    process.exit(1);

  } finally {
    console.log('Closing database connection...');
    await pool.end();
    console.log('Connection closed. Build will now complete.');
  }
};

runMigration();