const fs = require('fs');
const path = require('path');
// THE FIX: The path is now corrected to point to the db.js file inside src/config/
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
    // Exit with an error code to stop the build process if migration fails
    process.exit(1);
  } finally {
    // End the pool connection
    await pool.end();
  }
};

runMigration();
```

### What to Do Now

1.  **Update your `scripts/migrate.js`** file with the code I provided above.
2.  **Save the file.**
3.  Push this final correction to your backend repository on GitHub:
    ```bash
    git add scripts/migrate.js
    git commit -m "fix: Correct path to db.js in migration script"
    git push origin main


