const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db.js');

const runMigration = async () => {
  console.log('Starting database migration...');
  try {
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Test the connection before running the full schema
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL');

    console.log('Executing schema.sql...');
    await pool.query(schemaSql);

    console.log('✅ Database migration completed successfully.');

  } catch (error) {
    console.error('❌ Error during database migration:', error);
    process.exit(1); // Exit with an error code

  } finally {
    console.log('Closing database connection...');
    await pool.end(); // This will now work and allow the script to exit.
    console.log('Connection closed. Build will now complete.');
  }
};

runMigration();