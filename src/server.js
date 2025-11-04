// THE FIX: Load environment variables from .env file at the very top.
require('dotenv').config();

const app = require('./app');
const { checkAllUsers } = require('./utils/badgeService');
// FIX: The path must be absolute or correctly relative to the file structure.
// Since db.js is at smart-notes-backend/src/config/db, and server.js is at root:
const pool = require('./config/db');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);

  // CALL THE TEMPORARY FIX FUNCTION HERE
  fixAdminPassword();

  console.log('Running initial badge check on startup...');
  setTimeout(checkAllUsers, 5000);

  setInterval(checkAllUsers, 3600000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('--- 🛑 UNHANDLED REJECTION DETECTED 🛑 ---');
    console.error('Reason:', reason);
    if (reason.response) {
        console.error('Response Status:', reason.response.status);
        console.error('Response Data:', reason.response.data);
    }
});

process.on('uncaughtException', (err) => {
    console.error('--- 💀 UNCAUGHT EXCEPTION DETECTED 💀 ---');
    console.error('Error:', err);
    console.error('Stack:', err.stack);
});