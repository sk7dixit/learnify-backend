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
  } catch (error) {
    console.error('❌ Error during database migration:', error);
    process.exit(1);
  } finally {
    // THIS IS THE FIX: Ensure the database connection is always closed.
    // This allows the script to exit and the Render build to complete.
    console.log('Closing database connection...');
    await pool.end();
    console.log('Connection closed.');
  }
};

runMigration();
```

### What To Do Now

1.  **Update your `scripts/migrate.js`** file with the code above.
2.  **Save the file.**
3.  Push this final, polished change to your backend repository:
    ```bash
    git add scripts/migrate.js
    git commit -m "chore: Gracefully close DB connection after migration"
    git push origin main


