const nodemailer = require("nodemailer");

// This function handles the creation and sending of emails.
async function sendEmailOtp(email, otp) {
  try {
    // Log the attempt for debugging purposes
    console.log(`Attempting to send OTP email to: ${email}`);
    console.log(`Using email user: ${process.env.EMAIL_USER}`);

    // Create a transporter object using the SMTP transport protocol
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false, // true for 465, false for other ports like 587
      auth: {
        user: process.env.EMAIL_USER, // Your sender email address from .env
        pass: process.env.EMAIL_PASS, // Your sender email password or app password from .env
      },
    });

    // Define the email options
    const mailOptions = {
      from: `"Learnify Support" <${process.env.EMAIL_USER}>`,
      to: email,
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

    // Send the email
    const info = await transporter.sendMail(mailOptions);

    // Log the success message for confirmation
    console.log("✅ OTP Email sent successfully:", info.response);

  } catch (error) {
    // Log any errors that occur during the process
    console.error("❌ CRITICAL ERROR sending OTP email:", error);
    // You might want to throw the error to be handled by the controller
    throw new Error("Failed to send OTP email.");
  }
}

module.exports = { sendEmailOtp };