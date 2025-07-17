const nodemailer = require('nodemailer');

const smtpTransport = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  auth: {
    user: process.env.NODEMAILER_USER,
    pass: process.env.NODEMAILER_PASS,
  },
});

/**
 * Sends a login link via email
 * @param {string} email - User's email address
 * @param {string} token - JWT login token
 * @param {string} name - Optional user name for personalized greeting
 */

async function sendLoginLinkEmail(email, token, name = "there") {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  const loginLink = `${FRONTEND_URL}/link-login?token=${token}`;

  const html = `
    <div style="font-family: sans-serif;">
      <h2>🔑 Hello ${name}, here's your Split-Free Login Link</h2>
      <p>Click below to log in:</p>
      <a href="${loginLink}" style="background:#6366F1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">
        Login Now
      </a>
      <p>This link is valid for 10 minutes.</p>
    </div>
  `;

  await smtpTransport.sendMail({
    from: '"Split-Free" <developerpraneel@gmail.com>',
    to: email,
    subject: "Your Split-Free Login Link",
    html,
  });
}

module.exports = {
  sendLoginLinkEmail,
};
