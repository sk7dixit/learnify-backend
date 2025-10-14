const { Pool } = require("pg");
require("dotenv").config();

// Determine if we are in production (on Render)
const isProduction = process.env.NODE_ENV === "production";

// Configuration for the database connection
const connectionConfig = isProduction
  ? {
      // In production, use the DATABASE_URL provided by Render
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    }
  : {
      // In development, use individual variables from your .env file
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASS,
      port: process.env.DB_PORT,
    };

const pool = new Pool(connectionConfig);

// We DO NOT call pool.connect() here.
// The pool will handle connections automatically when a query is made.
// This is the main fix.

module.exports = pool;