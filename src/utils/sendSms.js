// src/utils/sendSms.js
/**
 * sendSms.js
 *
 * - Primary provider: Twilio
 * - If Twilio not configured, fallback is to log the SMS (developer mode).
 *
 * Exports:
 *  - sendSms(to, body)
 *  - sendSmsOtp(to, otp)
 *  - sendResetSms(to, resetUrl)
 */

const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_PHONE_NUMBER;

// Init Twilio client only if credentials present
let client = null;
if (accountSid && authToken) {
  try {
    client = twilio(accountSid, authToken);
  } catch (err) {
    console.warn('sendSms: Twilio init failed:', err?.message || err);
  }
}

/**
 * Generic SMS send
 * @param {string} to - E.164 number (e.g., +919876543210)
 * @param {string} body - Message body
 */
async function sendSms(to, body) {
  if (!to || !body) {
    console.warn('sendSms: missing "to" or "body"');
    return { success: false, error: 'Missing to or body' };
  }

  if (!client || !twilioNumber) {
    // No provider configured — log message for dev testing
    console.warn(`sendSms (logged) -> To: ${to} | Body: ${body}`);
    return { success: true, provider: 'log' };
  }

  try {
    const msg = await client.messages.create({
      to,
      from: twilioNumber,
      body,
    });
    console.log(`sendSms: Sent to ${to} sid=${msg.sid}`);
    return { success: true, provider: 'twilio', sid: msg.sid };
  } catch (err) {
    console.error(`sendSms: Failed to send SMS to ${to}:`, err && err.message ? err.message : err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Send OTP via SMS (6-digit code)
 * @param {string} to
 * @param {string} otp
 */
async function sendSmsOtp(to, otp) {
  const body = `Your OriNotes verification code is: ${otp}. It expires in 10 minutes.`;
  return sendSms(to, body);
}

/**
 * Send reset password SMS
 * Keep message short — include a short link if you have one (consider URL shortener)
 * @param {string} to
 * @param {string} resetUrl
 */
async function sendResetSms(to, resetUrl) {
  // Many SMS receivers have link preview or truncate long URLs, consider using a short URL service in production
  const shortUrl = resetUrl; // replace with shortener if available
  const body = `OriNotes password reset: ${shortUrl} (valid for a short time). If you did not request this, ignore.`;
  return sendSms(to, body);
}

module.exports = {
  sendSms,
  sendSmsOtp,
  sendResetSms,
};
