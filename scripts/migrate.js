const fs = require('fs');
const path = require('path');
// This path points to your db.js file inside the src/config folder
const pool = require('../src/config/db.js');

const runMigration = async () => {
  console.log('Starting database migration...');
  try {
    // This path points to your schema.sql file in the main project folder
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
    // End the pool connection, which allows the script to finish
    await pool.end();
  }
};

runMigration();