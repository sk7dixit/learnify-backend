// scripts/migrate.js
const fs = require('fs');
const path = require('path');
// IMPORTANT: We are importing the pool from your existing db.js file
const pool = require('../db'); // Assumes db.js is in the root directory

const runMigration = async () => {
  console.log('Starting database migration...');
  try {
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema.sql...');
    await pool.query(schemaSql);

    console.log('✅ Database migration completed successfully.');
  } catch (error) {
    console.error('❌ Error during database migration:', error);
    // Exit with an error code to stop the build process if migration fails
    process.exit(1);
  } finally {
    // End the pool connection
    await pool.end();
  }
};

runMigration();