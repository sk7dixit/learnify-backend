// The 'app' we import from './app' is now fully configured with CORS
const app = require('./app');
require('dotenv').config();
const { checkAllUsers } = require('./utils/badgeService');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);

  // --- Periodically check for and award badges ---
  console.log('Running initial badge check on startup...');
  setTimeout(checkAllUsers, 5000);
  setInterval(checkAllUsers, 3600000);
});

// ========================================================
// CRITICAL DEBUGGING: Catch unhandled promise rejections
// ========================================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('--- 🛑 UNHANDLED REJECTION DETECTED 🛑 ---');
    console.error('Reason:', reason);
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
