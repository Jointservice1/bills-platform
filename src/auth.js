const crypto = require('node:crypto');
const config = require('./config');

const SESSION_DAYS = 30;
const COOKIE = 'sid';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function checkPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  return crypto.timingSafeEqual(expected, crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length));
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createSession(db, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires.toISOString());
  // Lax: survives the redirect back from Paystack, blocks cross-site POSTs.
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.isProduction, expires });
}

function destroySession(db, req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE);
}

function loadUser(db) {
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    req.user = null;
    if (token) {
      const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ?`).get(token, new Date().toISOString());
      if (row) req.user = { ...row, isAdmin: !!config.adminEmail && row.email === config.adminEmail };
    }
    next();
  };
}

// ---- Password reset by emailed one-time code ----
const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Returns { code } for a new code, or { wait } (seconds) if one was sent too recently.
function issueResetCode(db, userId) {
  const prev = db.prepare('SELECT created_at FROM password_resets WHERE user_id = ?').get(userId);
  const since = prev ? (Date.now() - Date.parse(prev.created_at)) / 1000 : Infinity;
  if (since < OTP_RESEND_SECONDS) return { wait: Math.ceil(OTP_RESEND_SECONDS - since) };
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  const now = new Date();
  db.prepare(`INSERT INTO password_resets (user_id, code_hash, attempts, expires_at, created_at) VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at`)
    .run(userId, sha256(code), new Date(now.getTime() + OTP_MINUTES * 60e3).toISOString(), now.toISOString());
  return { code };
}

// Checks a code; on success the code is used up. Returns true/false.
function consumeResetCode(db, userId, code) {
  const row = db.prepare('SELECT * FROM password_resets WHERE user_id = ?').get(userId);
  if (!row || row.expires_at < new Date().toISOString() || row.attempts >= OTP_MAX_ATTEMPTS) return false;
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(sha256(String(code).replace(/\D/g, ''))));
  if (ok) db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
  else db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ?').run(userId);
  return ok;
}

const requireUser =(req, res, next) =>
  (req.user ? next() : res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`));
// Non-admins get a plain 404 so they can't even tell an admin area exists.
const requireAdmin = (req, res, next) => (req.user?.isAdmin ? next() : next('route'));

module.exports = {
  hashPassword, checkPassword, createSession, destroySession, loadUser, requireUser, requireAdmin,
  issueResetCode, consumeResetCode, OTP_MINUTES,
};
