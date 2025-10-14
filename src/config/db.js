const { Pool } = require("pg");
require("dotenv").config();

// This configuration object will be used to create the connection pool.
let config;

// Check if the DATABASE_URL environment variable is available (this is the case on Render)
if (process.env.DATABASE_URL) {
  // Production configuration (for Render)
  config = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false, // Required for Render's managed PostgreSQL
    },
  };
  console.log("✅ Production DB config loaded (using DATABASE_URL)");
} else {
  // Development configuration (for your local machine)
  config = {
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT,
  };
  console.log("✅ Development DB config loaded (using .env file)");
}

const pool = new Pool(config);

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch(err => console.error("❌ DB Connection Error", err));

module.exports = pool;
