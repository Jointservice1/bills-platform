const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const config = require('./config');
const auth = require('./auth');
const orders = require('./orders');
const wallet = require('./wallet');
const ads = require('./ads');
const { tx } = require('./db');
const catalog = require('./catalog');
const defaultMailer = require('./mailer');
const { esc } = require('./views/ui');
const pages = require('./views/pages');
const adminViews = require('./views/admin');

const FLASH = {
  welcome: ['ok', 'Welcome! Fund your wallet to make your first purchase.'],
  funded: ['ok', 'Wallet funded successfully.'],
  'fund-failed': ['error', 'Your wallet was not funded. The payment did not complete.'],
  'fund-pending': ['warn', 'We are still confirming your payment. Your wallet will update automatically.'],
  'paystack-error': ['error', 'We could not reach Paystack. Please try again.'],
  'low-balance': ['warn', 'Your balance is too low for this payment.'],
  requeried: ['ok', 'Order rechecked with the provider.'],
  'ad-saved': ['ok', 'Ad saved. It is now showing in its ad space.'],
  'ad-deleted': ['ok', 'Ad deleted.'],
  'password-reset': ['ok', 'Your password has been changed. You are now logged in.'],
};
const flashOf = (req) => (FLASH[req.query.msg] ? { type: FLASH[req.query.msg][0], text: FLASH[req.query.msg][1] } : null);
const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&%.]*$/.test(n) ? n : null);
// Lagos midnight expressed in UTC, for "today" stats.
const LAGOS_TODAY = "datetime('now','+1 hour','start of day','-1 hour')";
const LAGOS_YESTERDAY = "datetime('now','+1 hour','start of day','-1 day','-1 hour')";

function createApp({ db, provider, paystack, mailer = defaultMailer }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  const demo = provider.name === 'mock';

  // ---- Paystack webhook (raw body for signature check) ----
  app.post('/webhooks/paystack', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!paystack.verifySignature(raw, req.get('x-paystack-signature'))) return res.status(401).send('Invalid signature');
    let payload;
    try { payload = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).send('Bad JSON'); }
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    if (db.prepare('SELECT 1 FROM webhook_events WHERE body_hash = ?').get(hash)) return res.sendStatus(200);
    try {
      if (payload.event === 'charge.success' && payload.data?.reference) {
        orders.creditFunding(db, payload.data.reference, payload.data);
      }
      db.prepare('INSERT OR IGNORE INTO webhook_events (body_hash, event, payload) VALUES (?, ?, ?)').run(hash, String(payload.event), raw.toString('utf8'));
      res.sendStatus(200);
    } catch (err) {
      console.error('[webhook]', err);
      res.sendStatus(500); // Paystack will retry
    }
  });

  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProduction ? '1h' : 0 }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(auth.loadUser(db));
  app.use((req, res, next) => {
    res.set({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    next();
  });

  const msg = (req, res, code, opts) => res.status(code).send(pages.message({ user: req.user, demo, ...opts }));

  // ---- Home & auth ----
  app.get('/', (req, res) => {
    if (!req.user) return res.send(pages.landing({ demo, ads: ads.pick(db, ['landing']) }));
    const recent = db.prepare("SELECT * FROM orders WHERE user_id = ? AND status != 'draft' ORDER BY id DESC LIMIT 5").all(req.user.id);
    res.send(pages.home({ user: req.user, recent, demo, flash: flashOf(req), ads: ads.pick(db, ['home']) }));
  });

  app.get('/register', (req, res) => res.send(pages.auth({ mode: 'register', next: req.query.next })));
  app.post('/register', (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = catalog.normalisePhone(req.body.phone);
    const password = String(req.body.password || '');
    const fail = (error) => res.status(400).send(pages.auth({ mode: 'register', error, values: { name, email, phone: req.body.phone }, next: req.body.next }));
    if (!name) return fail('Enter your name.');
    if (!phone) return fail('Enter a valid Nigerian phone number.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Enter a valid email.');
    if (password.length < 8) return fail('Password must be at least 8 characters.');
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return fail('An account with that email already exists. Log in instead.');
    const r = db.prepare('INSERT INTO users (email, name, phone, password_hash) VALUES (?, ?, ?, ?)').run(email, name, phone, auth.hashPassword(password));
    auth.createSession(db, res, Number(r.lastInsertRowid));
    res.redirect(303, safeNext(req.body.next) || '/?msg=welcome');
  });

  app.get('/login', (req, res) => res.send(pages.auth({ mode: 'login', next: req.query.next })));
  app.post('/login', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !auth.checkPassword(String(req.body.password || ''), user.password_hash)) {
      return res.status(401).send(pages.auth({ mode: 'login', error: 'Wrong email or password.', values: { email }, next: req.body.next }));
    }
    auth.createSession(db, res, user.id);
    res.redirect(303, safeNext(req.body.next) || '/');
  });

  // ---- Forgotten password: email a 6-digit code, then set a new password ----
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  app.get('/forgot', (req, res) => res.send(pages.forgot({ values: { email: req.query.email } })));
  app.post('/forgot', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!validEmail(email)) return res.status(400).send(pages.forgot({ error: 'Enter a valid email.', values: { email } }));
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    // Same response whether or not the account exists, so emails can't be probed.
    if (user) {
      const r = auth.issueResetCode(db, user.id);
      if (r.wait) return res.status(429).send(pages.reset({ email, error: `A code was just sent. Wait ${r.wait} seconds before requesting another.` }));
      try {
        await mailer.send({
          to: user.email,
          subject: `${config.appName} password reset code: ${r.code}`,
          text: `Hi ${user.name},\n\nYour ${config.appName} password reset code is ${r.code}.\nIt expires in ${auth.OTP_MINUTES} minutes.\n\nIf you did not ask to reset your password, ignore this email.`,
          html: `<p>Hi ${esc(user.name)},</p><p>Your ${esc(config.appName)} password reset code is:</p>
            <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${r.code}</p>
            <p>It expires in ${auth.OTP_MINUTES} minutes.</p><p>If you did not ask to reset your password, ignore this email.</p>`,
        });
      } catch (err) {
        console.error('[mail]', err.message);
        db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
        return res.status(502).send(pages.forgot({ error: 'We could not send the email. Please try again shortly.', values: { email } }));
      }
    }
    res.redirect(303, `/reset?email=${encodeURIComponent(email)}`);
  });

  app.get('/reset', (req, res) => res.send(pages.reset({ email: String(req.query.email || '') })));
  app.post('/reset', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const fail = (error) => res.status(400).send(pages.reset({ email, error }));
    if (password.length < 8) return fail('Password must be at least 8 characters.');
    if (password !== String(req.body.confirm || '')) return fail('The two passwords do not match.');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !auth.consumeResetCode(db, user.id, req.body.code)) {
      return fail('That code is wrong or has expired. Check the email or request a new code.');
    }
    tx(db, () => {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // sign out other devices
    });
    auth.createSession(db, res, user.id);
    res.redirect(303, '/?msg=password-reset');
  });

  app.post('/logout',(req, res) => { auth.destroySession(db, req, res); res.redirect(303, '/'); });

  // ---- Buying ----
  const recentFor = (userId, cat) => db.prepare(`SELECT service_id, service_name, biller, meter_type, MAX(customer_name) AS customer_name
    FROM orders WHERE user_id = ? AND category = ? AND status = 'success' GROUP BY service_id, biller ORDER BY MAX(id) DESC LIMIT 6`).all(userId, cat);

  app.get('/api/variations/:serviceId', async (req, res) => {
    const s = catalog.byId[req.params.serviceId];
    if (!s) return res.status(404).json({ error: 'Unknown service' });
    try {
      res.json(await provider.listVariations(s.id));
    } catch (err) {
      console.error('[variations]', s.id, err.message);
      res.status(502).json({ error: 'Provider unavailable' });
    }
  });

  app.get('/buy/:cat', auth.requireUser, (req, res) => {
    const cat = catalog.category(req.params.cat);
    if (!cat) return msg(req, res, 404, { title: 'Not found', text: 'That service does not exist.', type: 'error' });
    res.send(pages.buy({ user: req.user, cat, values: req.query, recent: recentFor(req.user.id, cat.id), demo, ads: ads.pick(db, ['buy']) }));
  });

  app.post('/buy/:cat', auth.requireUser, async (req, res) => {
    const cat = catalog.category(req.params.cat);
    if (!cat) return msg(req, res, 404, { title: 'Not found', text: 'That service does not exist.', type: 'error' });
    const q = await orders.quote(db, provider, req.user, cat.id, req.body);
    if (!q.ok) return res.status(400).send(pages.buy({ user: req.user, cat, values: req.body, error: q, recent: recentFor(req.user.id, cat.id), demo }));
    res.redirect(303, `/orders/${q.order.id}/review`);
  });

  const ownOrder = (req) => db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);

  app.get('/orders/:id/review', auth.requireUser, (req, res) => {
    const order = ownOrder(req);
    if (!order) return msg(req, res, 404, { title: 'Not found', text: 'Order not found.', type: 'error' });
    if (order.status !== 'draft') return res.redirect(303, `/orders/${order.id}`);
    res.send(pages.review({ user: req.user, order, info: JSON.parse(order.customer_info || '{}'), demo }));
  });

  app.post('/orders/:id/pay', auth.requireUser, async (req, res) => {
    const r = await orders.execute(db, provider, req.user.id, Number(req.params.id));
    if (r.error === 'not-found') return msg(req, res, 404, { title: 'Not found', text: 'Order not found.', type: 'error' });
    if (r.error === 'insufficient') return res.redirect(303, `/orders/${req.params.id}/review?msg=low-balance`);
    res.redirect(303, `/orders/${r.order.id}`);
  });

  app.get('/orders/:id', auth.requireUser, (req, res) => {
    const order = ownOrder(req);
    if (!order) return msg(req, res, 404, { title: 'Not found', text: 'Order not found.', type: 'error' });
    if (order.status === 'draft') return res.redirect(303, `/orders/${order.id}/review`);
    res.send(pages.receipt({ user: req.user, order, demo, flash: flashOf(req), ads: ads.pick(db, ['receipt']) }));
  });

  app.get('/orders', auth.requireUser, (req, res) => {
    const filter = ['success', 'pending', 'failed'].includes(req.query.status) ? req.query.status : '';
    const statuses = { success: ['success'], pending: ['pending', 'processing'], failed: ['failed'], '': ['success', 'pending', 'processing', 'failed'] }[filter];
    const list = db.prepare(`SELECT * FROM orders WHERE user_id = ? AND status IN (${statuses.map(() => '?').join(',')}) ORDER BY id DESC LIMIT 100`)
      .all(req.user.id, ...statuses);
    res.send(pages.history({ user: req.user, orders: list, filter, demo, ads: ads.pick(db, ['history']) }));
  });

  // ---- Wallet ----
  app.get('/wallet', auth.requireUser, (req, res) => {
    const ledger = db.prepare('SELECT * FROM wallet_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
    res.send(pages.wallet({
      user: req.user, ledger, amount: req.query.amount, next: safeNext(req.query.next), canPaystack: paystack.enabled(), demo, flash: flashOf(req), ads: ads.pick(db, ['wallet']),
    }));
  });

  app.post('/wallet/fund', auth.requireUser, async (req, res) => {
    const amount = Math.round(parseFloat(req.body.amount) * 100);
    const next = safeNext(req.body.next);
    if (!(amount >= 100 * 100 && amount <= 500000 * 100)) {
      return msg(req, res, 400, { title: 'Invalid amount', text: 'Enter an amount between ₦100 and ₦500,000.', type: 'error', link: '/wallet', linkText: 'Back to wallet' });
    }
    if (req.body.demo && demo && !config.isProduction) {
      tx(db, () => wallet.credit(db, req.user.id, amount, 'funding', `DEMO-${Date.now()}`));
      return res.redirect(303, next || '/wallet?msg=funded');
    }
    if (!paystack.enabled()) return res.redirect(303, '/wallet?msg=paystack-error');
    const reference = `FUND-${req.user.id}-${crypto.randomBytes(8).toString('hex')}`;
    try {
      const init = await paystack.initialize({
        email: req.user.email, amount, reference,
        callbackUrl: `${config.baseUrl}/wallet/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`,
      });
      db.prepare('INSERT INTO fundings (user_id, reference, amount) VALUES (?, ?, ?)').run(req.user.id, reference, amount);
      res.redirect(303, init.authorization_url);
    } catch (err) {
      console.error('[fund]', err.message);
      res.redirect(303, '/wallet?msg=paystack-error');
    }
  });

  // Paystack sends the customer back here. Verify server-side; never trust the redirect.
  app.get('/wallet/callback', async (req, res) => {
    const reference = String(req.query.reference || req.query.trxref || '');
    const next = safeNext(req.query.next);
    if (!db.prepare('SELECT 1 FROM fundings WHERE reference = ?').get(reference)) return res.redirect(303, '/wallet?msg=fund-failed');
    let f;
    try {
      f = orders.creditFunding(db, reference, await paystack.verify(reference));
    } catch (err) {
      console.error('[fund callback]', err.message);
      return res.redirect(303, '/wallet?msg=fund-pending');
    }
    if (f.status === 'success') return res.redirect(303, next || '/wallet?msg=funded');
    res.redirect(303, f.status === 'pending' ? '/wallet?msg=fund-pending' : '/wallet?msg=fund-failed');
  });

  // ---- Admin ----
  // ---- Ads ----
  app.get('/ads/:id/click', (req, res) => {
    const url = ads.click(db, Number(req.params.id));
    if (!url) return res.redirect(302, '/');
    res.redirect(302, url);
  });

  app.post('/admin/ads', auth.requireAdmin, async (req, res) => {
    const r = ads.create(db, req.body);
    if (r.error) return renderAdmin(req, res.status(400), { adError: r.error, adValues: req.body });
    res.redirect(303, '/admin?msg=ad-saved#ads');
  });
  app.post('/admin/ads/:id/toggle', auth.requireAdmin, (req, res) => { ads.toggle(db, Number(req.params.id)); res.redirect(303, '/admin#ads'); });
  app.post('/admin/ads/:id/delete', auth.requireAdmin, (req, res) => { ads.remove(db, Number(req.params.id)); res.redirect(303, '/admin?msg=ad-deleted#ads'); });

  app.get('/admin', auth.requireAdmin, (req, res) => renderAdmin(req, res));

  async function renderAdmin(req, res, extra = {}) {
    const one = (sql, ...p) => db.prepare(sql).get(...p);
    const all = (sql, ...p) => db.prepare(sql).all(...p);
    const ok7 = "created_at >= datetime('now','-7 days')";
    const s = {
      ...one(`SELECT COALESCE(SUM(total),0) AS salesToday, COUNT(*) AS countToday FROM orders WHERE status='success' AND created_at >= ${LAGOS_TODAY}`),
      ...one(`SELECT COALESCE(SUM(total),0) AS salesYesterday FROM orders WHERE status='success' AND created_at >= ${LAGOS_YESTERDAY} AND created_at < ${LAGOS_TODAY}`),
      ...one(`SELECT COALESCE(SUM(total),0) AS sales7, COUNT(*) AS count7 FROM orders WHERE status='success' AND ${ok7}`),
      ...one(`SELECT COALESCE(SUM(amount),0) AS fundedToday, COUNT(*) AS fundCountToday FROM fundings WHERE status='success' AND COALESCE(paid_at, created_at) >= ${LAGOS_TODAY}`),
      fees30: one("SELECT COALESCE(SUM(fee),0) AS v FROM orders WHERE status='success' AND created_at >= datetime('now','-30 days')").v,
      liabilities: one('SELECT COALESCE(SUM(balance),0) AS v FROM users').v,
      pending: one("SELECT COUNT(*) AS v FROM orders WHERE status IN ('pending','processing')").v,
      success7: one(`SELECT COUNT(*) AS v FROM orders WHERE status='success' AND ${ok7}`).v,
      failed7: one(`SELECT COUNT(*) AS v FROM orders WHERE status='failed' AND ${ok7}`).v,
      customers: one('SELECT COUNT(*) AS v FROM users').v,
      newToday: one(`SELECT COUNT(*) AS v FROM users WHERE created_at >= ${LAGOS_TODAY}`).v,
      new7: one(`SELECT COUNT(*) AS v FROM users WHERE ${ok7}`).v,
    };

    // Daily sales for the last 14 Lagos days, zero-filled.
    const rows = Object.fromEntries(all(`SELECT date(created_at,'+1 hour') AS d, SUM(total) AS value, COUNT(*) AS n FROM orders
      WHERE status='success' AND created_at >= datetime('now','+1 hour','start of day','-13 days','-1 hour') GROUP BY d`).map((r) => [r.d, r]));
    const lagosNow = new Date(Date.now() + 3600e3);
    const daily = Array.from({ length: 14 }, (_, i) => {
      const day = new Date(Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate() - (13 - i)));
      const key = day.toISOString().slice(0, 10);
      const fmt = (o) => day.toLocaleDateString('en-NG', { timeZone: 'UTC', ...o });
      return { label: fmt({ day: 'numeric', month: 'short' }), long: fmt({ weekday: 'short', day: 'numeric', month: 'short' }), value: rows[key]?.value || 0, n: rows[key]?.n || 0 };
    });

    const byCategory = all(`SELECT category, COUNT(*) AS n, SUM(total) AS value, SUM(fee) AS fees FROM orders
      WHERE status='success' AND created_at >= datetime('now','-30 days') GROUP BY category ORDER BY value DESC`);

    const q = String(req.query.q || '').trim().slice(0, 80);
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const filter = ['success', 'pending', 'failed'].includes(req.query.status) ? req.query.status : '';
    const where = { success: "o.status='success'", pending: "o.status IN ('pending','processing')", failed: "o.status='failed'", '': "o.status != 'draft'" }[filter];
    const orderSearch = q ? " AND (u.email LIKE ?1 ESCAPE '\\' OR u.name LIKE ?1 ESCAPE '\\' OR o.biller LIKE ?1 ESCAPE '\\' OR o.request_id LIKE ?1 ESCAPE '\\' OR o.customer_name LIKE ?1 ESCAPE '\\')" : '';
    const list = all(`SELECT o.*, u.email, u.name FROM orders o JOIN users u ON u.id = o.user_id WHERE ${where}${orderSearch} ORDER BY o.id DESC LIMIT 100`, ...(q ? [like] : []));
    const userSearch = q ? "WHERE u.email LIKE ?1 ESCAPE '\\' OR u.name LIKE ?1 ESCAPE '\\' OR u.phone LIKE ?1 ESCAPE '\\'" : '';
    const users = all(`SELECT u.*, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.status = 'success') AS orders,
      (SELECT COALESCE(SUM(total),0) FROM orders o WHERE o.user_id = u.id AND o.status = 'success') AS spent
      FROM users u ${userSearch} ORDER BY u.id DESC LIMIT 100`, ...(q ? [like] : []));
    const fundings = all('SELECT f.*, u.email, u.name FROM fundings f JOIN users u ON u.id = f.user_id ORDER BY f.id DESC LIMIT 50');
    const topCustomers = all(`SELECT u.name, u.email, SUM(o.total) AS spent, COUNT(*) AS n FROM orders o JOIN users u ON u.id = o.user_id
      WHERE o.status='success' AND o.created_at >= datetime('now','-30 days') GROUP BY u.id ORDER BY spent DESC LIMIT 5`);

    // Activity feed: sign-ups, completed top-ups and purchases, newest first.
    const feed = all(`SELECT * FROM (
        SELECT 'order' AS kind, o.created_at AS at, u.name, o.status, o.total AS amount,
          o.service_name || COALESCE(' · ' || o.variation_name, '') AS label, o.category, o.refunded
          FROM orders o JOIN users u ON u.id = o.user_id WHERE o.status != 'draft'
        UNION ALL SELECT 'funding', f.created_at, u.name, f.status, f.amount, f.channel, NULL, 0
          FROM fundings f JOIN users u ON u.id = f.user_id WHERE f.status != 'pending'
        UNION ALL SELECT 'signup', created_at, name, 'success', 0, email, NULL, 0 FROM users
      ) ORDER BY at DESC LIMIT 15`);

    const sys = {
      paystack: paystack.enabled(),
      webhooks24: one("SELECT COUNT(*) AS v FROM webhook_events WHERE received_at >= datetime('now','-1 day')").v,
      lastWebhook: one('SELECT MAX(received_at) AS v FROM webhook_events').v,
      sessions: one('SELECT COUNT(*) AS v FROM sessions WHERE expires_at > ?', new Date().toISOString()).v,
      mismatches: one("SELECT COUNT(*) AS v FROM fundings WHERE status = 'mismatch'").v,
    };

    let providerBalance = null;
    try { providerBalance = await provider.balance(); } catch (err) { console.error('[balance]', err.message); }
    res.send(adminViews.dashboard({
      user: req.user, s, providerBalance, providerName: provider.name, byCategory, orders: list, filter, q, users, fundings, feed, daily, topCustomers, sys,
      flash: flashOf(req), demo, ads: ads.list(db), adSlots: ads.SLOTS, ...extra,
    }));
  }

  app.post('/admin/orders/:id/requery', auth.requireAdmin, async (req, res) => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
    if (o && ['pending', 'processing'].includes(o.status)) {
      try { orders.settle(db, o.id, await provider.requery(o.request_id)); } catch (err) { console.error('[requery]', err.message); }
    }
    res.redirect(303, '/admin?status=pending&msg=requeried#orders');
  });

  app.use((req, res) => msg(req, res, 404, { title: 'Page not found', text: 'That page does not exist.', type: 'error' }));
  app.use((err, req, res, _next) => {
    console.error(err);
    msg(req, res, 500, { title: 'Something went wrong', text: 'Please try again. If money left your wallet, it will be refunded or delivered automatically.', type: 'error' });
  });
  return app;
}

module.exports = { createApp };
