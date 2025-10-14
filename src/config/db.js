const { Pool } = require("pg");
require("dotenv").config();

// This is the critical change. We check if we are in a production environment.
// Render automatically sets NODE_ENV to 'production'.
const isProduction = process.env.NODE_ENV === "production";

// This object will hold our database connection details.
const connectionConfig = {};

if (isProduction) {
  // If we are on Render, use the DATABASE_URL. This is the most important part.
  console.log("✅ Production DB config loaded (using DATABASE_URL)");
  connectionConfig.connectionString = process.env.DATABASE_URL;
  connectionConfig.ssl = {
    rejectUnauthorized: false, // Required for Render's managed PostgreSQL
  };
} else {
  // If we are on your local computer, use the .env file.
  console.log("✅ Development DB config loaded (using .env file)");
  connectionConfig.user = process.env.DB_USER;
  connectionConfig.host = process.env.DB_HOST;
  connectionConfig.database = process.env.DB_NAME;
  connectionConfig.password = process.env.DB_PASS;
  connectionConfig.port = process.env.DB_PORT;
}

const pool = new Pool(connectionConfig);

// We remove the .connect() call to prevent the script from hanging.
// The pool will connect automatically when a query is made.

module.exports = pool;