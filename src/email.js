import net from 'node:net';
import tls from 'node:tls';

export function parseRecipients(value = '') { return value.split(',').map((item) => item.trim()).filter(Boolean); }
export function smtpConfigFromEnv(env = process.env) {
  const recipients = parseRecipients(env.REPORT_RECIPIENTS);
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM'];
  if (!required.every((key) => env[key]) || !recipients.length) return null;
  return { host: env.SMTP_HOST, port: Number(env.SMTP_PORT), username: env.SMTP_USERNAME, password: env.SMTP_PASSWORD, from: env.SMTP_FROM, recipients, secure: env.SMTP_SECURE === 'true' || Number(env.SMTP_PORT) === 465, requireTls: env.SMTP_REQUIRE_TLS !== 'false' };
}
export function formatEmail({ from, recipients, subject, text }) {
  const safeSubject = subject.replace(/[\r\n]/g, ' ');
  const body = text.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
  return [`From: ${from}`, `To: ${recipients.join(', ')}`, `Subject: ${safeSubject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', body].join('\r\n');
}
function waitFor(socket, event) { return new Promise((resolve, reject) => { socket.once(event, resolve); socket.once('error', reject); }); }
function readReply(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => { buffer += chunk.toString('utf8'); const lines = buffer.split('\r\n').filter(Boolean); const last = lines.at(-1); if (last && /^\d{3} /.test(last)) { cleanup(); resolve({ code: Number(last.slice(0, 3)), lines }); } };
    const onError = (error) => { cleanup(); reject(error); };
    const cleanup = () => { socket.off('data', onData); socket.off('error', onError); };
    socket.on('data', onData); socket.once('error', onError);
  });
}
async function command(socket, value, expected = [250]) { socket.write(`${value}\r\n`); const reply = await readReply(socket); if (!expected.includes(reply.code)) throw new Error(`SMTP ${value.split(' ')[0]} failed: ${reply.lines.join(' | ')}`); return reply; }
async function upgradeTls(socket, host) { const secureSocket = tls.connect({ socket, servername: host }); await waitFor(secureSocket, 'secureConnect'); return secureSocket; }
export async function sendSmtpMail({ config, subject, text }) {
  let socket = config.secure ? tls.connect({ host: config.host, port: config.port, servername: config.host }) : net.createConnection({ host: config.host, port: config.port });
  await waitFor(socket, config.secure ? 'secureConnect' : 'connect');
  let reply = await readReply(socket); if (reply.code !== 220) throw new Error(`SMTP greeting failed: ${reply.lines.join(' | ')}`);
  reply = await command(socket, 'EHLO interp-bid'); const capabilities = reply.lines.join('\n').toUpperCase();
  if (!config.secure && capabilities.includes('STARTTLS')) { await command(socket, 'STARTTLS', [220]); socket = await upgradeTls(socket, config.host); await command(socket, 'EHLO interp-bid'); }
  else if (!config.secure && config.requireTls) throw new Error('SMTP server does not advertise STARTTLS; refusing an insecure email connection.');
  const token = Buffer.from(`\u0000${config.username}\u0000${config.password}`).toString('base64');
  await command(socket, `AUTH PLAIN ${token}`, [235]); await command(socket, `MAIL FROM:<${config.from}>`, [250]);
  for (const recipient of config.recipients) await command(socket, `RCPT TO:<${recipient}>`, [250, 251]);
  await command(socket, 'DATA', [354]); socket.write(`${formatEmail({ from: config.from, recipients: config.recipients, subject, text })}\r\n.\r\n`);
  reply = await readReply(socket); if (reply.code !== 250) throw new Error(`SMTP DATA failed: ${reply.lines.join(' | ')}`);
  await command(socket, 'QUIT', [221]); socket.end();
}
