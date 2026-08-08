import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEmail, parseRecipients, smtpConfigFromEnv } from '../src/email.js';
test('parses comma-separated recipients', () => assert.deepEqual(parseRecipients('one@example.com, two@example.com'), ['one@example.com', 'two@example.com']));
test('SMTP configuration is unavailable until every secret exists', () => assert.equal(smtpConfigFromEnv({}), null));
test('formats safe plain-text SMTP mail', () => { const mail = formatEmail({ from: 'scout@example.com', recipients: ['team@example.com'], subject: 'New\nlead', text: '.a line' }); assert.match(mail, /Subject: New lead/); assert.match(mail, /\r\n\.\.a line/); });
test('maps complete SMTP configuration from ALERT_EMAIL', () => { const config = smtpConfigFromEnv({ SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_USERNAME: 'user', SMTP_PASSWORD: 'pass', SMTP_FROM: 'scout@example.com', ALERT_EMAIL: 'team@example.com' }); assert.equal(config.secure, false); assert.equal(config.requireTls, true); assert.deepEqual(config.recipients, ['team@example.com']); });
