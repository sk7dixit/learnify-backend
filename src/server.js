// server.js
const cors = require('cors');
const app = require('./app');
require('dotenv').config();
const { checkAllUsers } = require('./utils/badgeService'); // Corrected import path for the badge service

const PORT = process.env.PORT || 5000;
const frontendURL = "https://learnify-frontend-34du.onrender.com";

app.use(cors({ origin: frontendURL }));
// The database connection is now handled by the pool imported in other files (like controllers).
// No need to connect here again.

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);

  // --- NEW: Periodically check for and award badges ---
  console.log('Running initial badge check on startup...');
  // Run it once on startup after a small delay to ensure connections are ready
  setTimeout(checkAllUsers, 5000);

  // Then run it every hour (3600000 milliseconds)
  setInterval(checkAllUsers, 3600000);
});

// ========================================================
// CRITICAL DEBUGGING: Catch unhandled promise rejections
// This is often where Express errors from external APIs land
// ========================================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('--- 🛑 UNHANDLED REJECTION DETECTED 🛑 ---');
    console.error('Reason:', reason);

    // Check for an Axios response error structure
    if (reason.response) {
        console.error('PayPal Response Status:', reason.response.status);
        console.error('PayPal Response Data:', reason.response.data);
    }
});

process.on('uncaughtException', (err) => {
    console.error('--- 💀 UNCAUGHT EXCEPTION DETECTED 💀 ---');
    console.error('Error:', err);
    console.error('Stack:', err.stack);
});