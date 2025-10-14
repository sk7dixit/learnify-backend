const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db.js');

const runMigration = async () => {
  console.log('Starting database migration...');
  try {
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema.sql...');
    await pool.query(schemaSql);

    console.log('✅ Database migration completed successfully.');

    // Explicitly exit the script with a success code
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during database migration:', error);
    process.exit(1);
  } finally {
    // This will run, but the process.exit() above will ensure the script terminates.
    console.log('Closing database connection...');
    await pool.end();
    console.log('Connection closed.');
  }
};