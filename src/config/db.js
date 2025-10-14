const { Pool } = require("pg");
require("dotenv").config();

// THIS IS THE BULLETPROOF FIX:
// We check for the existence of DATABASE_URL, which only Render provides.
// This is more reliable than checking NODE_ENV during the build step.
const isProduction = process.env.DATABASE_URL;

const connectionConfig = {};

if (isProduction) {
  // If we are on Render, use the DATABASE_URL.
  console.log("✅ Production DB config loaded (using DATABASE_URL)");
  connectionConfig.connectionString = process.env.DATABASE_URL;
  connectionConfig.ssl = {
    rejectUnauthorized: false,
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

module.exports = pool;