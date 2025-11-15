// src/utils/sendEmail.js


const sgMail = require('@sendgrid/mail');
const nodemailer = require('nodemailer');

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || `OriNotes <no-reply@${process.env.DOMAIN || 'example.com'}>`;

// Init SendGrid if API key provided
if (SENDGRID_API_KEY) {
  try {
    sgMail.setApiKey(SENDGRID_API_KEY);
  } catch (err) {
    console.warn('sendEmail: SendGrid init failed:', err?.message || err);
  }
}

// Nodemailer SMTP transport fallback
let smtpTransport = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true' || false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Generic send function. Try SendGrid, fall back to SMTP.
 * Throws if neither provider is available or both providers fail.
 * @param {{to:string,subject:string,html?:string,text?:string}} param0
 */
async function sendEmail({ to, subject, html, text }) {
  // Try SendGrid first
  if (SENDGRID_API_KEY) {
    try {
      await sgMail.send({
        to,
        from: EMAIL_FROM,
        subject,
        html,
        text,
      });
      return { provider: 'sendgrid' };
    } catch (err) {
      // Log and fall back
      console.error('sendEmail: SendGrid error:', err?.response?.body || err.message || err);
    }
  }

  // Nodemailer fallback
  if (smtpTransport) {
    try {
      await smtpTransport.sendMail({
        from: EMAIL_FROM,
        to,
        subject,
        html,
        text,
      });
      return { provider: 'smtp' };
    } catch (err) {
      console.error('sendEmail: Nodemailer error:', err);
      // Rethrow Nodemailer error
      throw err;
    }
  }

  // No provider configured — log and throw
  const msg = 'No email provider configured. Set SENDGRID_API_KEY or SMTP_* env vars.';
  console.error('sendEmail:', msg);
  throw new Error(msg);
}

/**
 * Send password reset email (resetUrl should contain the token & email)
 * @param {string} to
 * @param {string} resetUrl
 */
async function sendResetPasswordEmail(to, resetUrl) {
  const subject = 'OriNotes — Password Reset Request';
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111;">
      <h2>OriNotes — Password Reset</h2>
      <p>We received a request to reset the password for <strong>${to}</strong>.</p>
      <p>Click the link below to reset your password. This link is valid for a short time.</p>
      <p style="margin: 18px 0; text-align:center;">
        <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="background:#06b6d4;color:white;padding:10px 14px;border-radius:6px;text-decoration:none;">Reset your password</a>
      </p>
      <p>If the button doesn't work, copy & paste this URL into your browser:</p>
      <p style="font-size:0.9em;color:#666;">${resetUrl}</p>
      <hr />
      <p style="font-size:0.85em;color:#666;">If you did not request this, ignore this email.</p>
    </div>
  `;
  const text = `Reset your OriNotes password: ${resetUrl}`;

  // If no provider configured, log the link for dev
  try {
    const res = await sendEmail({ to, subject, html, text });
    return res;
  } catch (err) {
    // PHASE 1 FIX: If sendEmail throws, log the link for debug but then rethrow
    console.warn('sendResetPasswordEmail: failed to send email, logging reset link for debug:', resetUrl);
    console.warn(`Reset link for ${to}: ${resetUrl}`);
    throw err; // <-- CRITICAL: Rethrow the error to ensure userController doesn't think it succeeded
  }
}

// Alias for compatibility (some controllers expect sendPasswordReset)
const sendPasswordReset = sendResetPasswordEmail;

/**
 * Send an email OTP (6-digit) — used for login/verification flows.
 * @param {string} to
 * @param {string} otp
 */
async function sendEmailOtp(to, otp) {
  const subject = 'OriNotes — Verification Code';
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif;">
      <h3>OriNotes Verification Code</h3>
      <p>Use the following code to complete your action. It expires in 10 minutes.</p>
      <p style="font-size:1.6rem;font-weight:700;margin:10px 0;">${otp}</p>
      <p>If you did not request this, ignore this email.</p>
    </div>
  `;
  const text = `Your OriNotes verification code: ${otp}`;

  try {
    return await sendEmail({ to, subject, html, text });
  } catch (err) {
    console.error('sendEmailOtp: failed to send OTP email', err);
    // bubble up or return object; we'll return the error information
    throw err;
  }
}

/**
 * Optional helper: notify user about successful login / new device (useful for "remember me")
 * meta can contain ip, device, time
 */
async function sendLoginNotification(to, meta = {}) {
  const subject = 'OriNotes — New sign-in to your account';
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif;">
      <h3>New sign-in detected</h3>
      <p>We detected a new sign-in for your OriNotes account (${to}).</p>
      <p><strong>Details:</strong></p>
      <ul>
        ${meta.ip ? `<li>IP: ${meta.ip}</li>` : ''}
        ${meta.agent ? `<li>Device: ${meta.agent}</li>` : ''}
        <li>Time: ${new Date().toLocaleString()}</li>
      </ul>
      <p>If this was you, no action is needed. If you didn't sign in, please reset your password immediately.</p>
    </div>
  `;
  const text = `New sign-in detected for ${to}. Time: ${new Date().toLocaleString()}`;

  try {
    return await sendEmail({ to, subject, html, text });
  } catch (err) {
    console.error('sendLoginNotification: failed to send login notification', err);
    // Not critical, so swallow error and return failure indicator
    return { success: false, error: err.message || String(err) };
  }
}

module.exports = {
  sendEmail,
  sendResetPasswordEmail,
  sendPasswordReset, // alias
  sendEmailOtp,
  sendLoginNotification,
};