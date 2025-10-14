// THE FIX: Load environment variables from .env file at the very top.
require('dotenv').config();

const app = require('./app');
const { checkAllUsers } = require('./utils/badgeService');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);

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