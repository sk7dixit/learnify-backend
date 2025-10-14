// src/utils/sendSms.js
const twilio = require('twilio');
require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

const client = new twilio(accountSid, authToken);

async function sendSms(to, body) {
  try {
    if (!accountSid || !authToken || !twilioNumber) {
      console.error("Twilio credentials are not set in .env file. Skipping SMS.");
      return;
    }

    await client.messages.create({
      to: to,
      from: twilioNumber,
      body: body
    });
    console.log(`✅ SMS sent to ${to}`);
  } catch (error) {
    console.error(`❌ Failed to send SMS to ${to}:`, error.message);
  }
}

module.exports = sendSms;