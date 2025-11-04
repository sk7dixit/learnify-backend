const sgMail = require("@sendgrid/mail");

// Set the API Key outside the function once
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// This function handles the creation and sending of emails using SendGrid API.
async function sendEmailOtp(email, otp) {
  try {
    console.log(`Attempting to send OTP email via SendGrid to: ${email}`);
    console.log(`Using email user: ${process.env.EMAIL_USER}`);

    // Define the email options using SendGrid's format
    const msg = {
      to: email,
      from: {
        email: process.env.EMAIL_USER,
        name: "OriNotes Support",
      },
      subject: "Your Learnify Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Your Verification Code</h2>
          <p>Thank you for using Learnify. Please use the following One-Time Password (OTP) to complete your action.</p>
          <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #1a73e8;">${otp}</p>
          <p>This code is valid for 5 minutes.</p>
          <p>If you did not request this code, please ignore this email.</p>
          <hr/>
          <p style="font-size: 0.9em; color: #888;">Learnify Team</p>
        </div>
      `,
    };

    // Send the email using the API. This uses standard HTTP/HTTPS ports.
    const info = await sgMail.send(msg);

    console.log("✅ OTP Email sent successfully:", info[0].statusCode);

  } catch (error) {
    // SendGrid errors often contain a response object with more details
    console.error(
      "❌ CRITICAL ERROR sending OTP email via SendGrid:",
      error.response ? error.response.body : error
    );
    throw new Error("Failed to send OTP email.");
  }
}

module.exports = { sendEmailOtp };