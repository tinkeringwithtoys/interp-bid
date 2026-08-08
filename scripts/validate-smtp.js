import { sendSmtpMail, smtpConfigFromEnv } from '../src/email.js';
if (process.env.CONFIRM_SMTP_SMOKE_TEST !== 'true') throw new Error('Set CONFIRM_SMTP_SMOKE_TEST=true to intentionally send a test email.');
const config = smtpConfigFromEnv();
if (!config) throw new Error('Missing SMTP configuration.');
await sendSmtpMail({ config, subject: 'interp-bid SMTP validation', text: 'SMTP validation succeeded. This is a deliberate test message from interp-bid.' });
console.log(`Sent SMTP validation email to ${config.recipients.join(', ')}.`);
