const nodemailer = require('nodemailer');
const config = require('./config');

// Sends mail through Gmail SMTP (or any SMTP server set in .env).
// Gmail needs an App Password: Google Account > Security > 2-Step Verification > App passwords.
let transport;
const enabled = () => !!(config.smtp.user && config.smtp.pass);

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transport;
}

async function send({ to, subject, text, html }) {
  if (!enabled()) {
    if (config.isProduction) throw new Error('Email is not configured (SMTP_USER / SMTP_PASS).');
    // Development without SMTP: print the mail so the flow can still be tested.
    console.log(`[mail] (SMTP not configured, not sent)\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  await getTransport().sendMail({ from: config.smtp.from || `${config.appName} <${config.smtp.user}>`, to, subject, text, html });
}

module.exports = { enabled, send };
