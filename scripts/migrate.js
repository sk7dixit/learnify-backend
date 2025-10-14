const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db.js');

const runMigration = async () => {
  console.log('Starting database migration...');
  const totalStartTime = Date.now(); // Start total timer

  try {
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing schema.sql...');
    const queryStartTime = Date.now(); // Start query timer
    await pool.query(schemaSql);
    // End query timer and log duration
    console.log(`✅ Database query executed successfully in ${Date.now() - queryStartTime}ms.`);

  } catch (error) {
    console.error('❌ Error during database migration:', error);
    process.exit(1);
  } finally {
    console.log('Closing database connection...');
    const closeStartTime = Date.now(); // Start connection close timer
    await pool.end();
    // End connection close timer and log duration
    console.log(`Connection closed in ${Date.now() - closeStartTime}ms.`);
  }

  // Log total duration
  console.log(`✨ Total migration script finished in ${Date.now() - totalStartTime}ms.`);
};

runMigration();