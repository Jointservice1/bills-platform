process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_fake';
process.env.PROVIDER = 'mock';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { open } = require('../src/db');
const { createApp } = require('../src/app');
const { createMock } = require('../src/providers/mock');
const { parseTx } = require('../src/providers/vtpass');
const orders = require('../src/orders');
const realPaystack = require('../src/paystack');

function fakePaystack() {
  const txs = {};
  return {
    txs,
    enabled: () => true,
    verifySignature: realPaystack.verifySignature,
    async initialize(t) { txs[t.reference] = t; return { authorization_url: `https://checkout.test/${t.reference}` }; },
    async verify(ref) { return { status: 'success', amount: txs[ref].amount, channel: 'card', paid_at: new Date().toISOString() }; },
  };
}

function client(base) {
  let cookie = '';
  return async (path, { method = 'GET', form, headers = {}, body } = {}) => {
    const res = await fetch(base + path, {
      method, redirect: 'manual',
      headers: { ...(cookie && { cookie }), ...(form && { 'content-type': 'application/x-www-form-urlencoded' }), ...headers },
      body: form ? new URLSearchParams(form).toString() : body,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  };
}

async function setup() {
  const db = open(':memory:');
  const provider = createMock();
  const paystack = fakePaystack();
  const server = createApp({ db, provider, paystack }).listen(0);
  const base = `http://localhost:${server.address().port}`;
  const c = client(base);
  await c('/register', { method: 'POST', form: { name: 'Ada Obi', phone: '08031234567', email: 'ada@test.local', password: 'password123' } });
  const user = () => db.prepare("SELECT * FROM users WHERE email = 'ada@test.local'").get();
  // Buy: form → review → pay; returns the final order.
  const buy = async (cat, form) => {
    const r = await c(`/buy/${cat}`, { method: 'POST', form });
    if (r.status !== 303) return { error: r };
    const id = Number(r.location.match(/\/orders\/(\d+)\/review/)[1]);
    const p = await c(`/orders/${id}/pay`, { method: 'POST', form: {} });
    return { id, pay: p, order: db.prepare('SELECT * FROM orders WHERE id = ?').get(id) };
  };
  return { db, provider, paystack, server, c, user, buy, base };
}

test('wallet funding via Paystack is credited exactly once', async () => {
  const { db, paystack, server, c, user, base } = await setup();
  try {
    const r = await c('/wallet/fund', { method: 'POST', form: { amount: '5000' } });
    assert.match(r.location, /^https:\/\/checkout\.test\//);
    const ref = r.location.split('/').pop();
    await c(`/wallet/callback?reference=${ref}`);
    assert.equal(user().balance, 500000);

    // Same payment arrives via webhook (and twice): no double credit.
    const body = JSON.stringify({ event: 'charge.success', data: { reference: ref, status: 'success', amount: 500000 } });
    const sig = crypto.createHmac('sha512', 'sk_test_fake').update(body).digest('hex');
    const anon = client(base);
    for (let i = 0; i < 2; i++) {
      const w = await anon('/webhooks/paystack', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-paystack-signature': sig } });
      assert.equal(w.status, 200);
    }
    await c(`/wallet/callback?reference=${ref}`);
    assert.equal(user().balance, 500000);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wallet_ledger WHERE reason = 'funding'").get().n, 1);

    // Forged webhook rejected.
    const bad = await anon('/webhooks/paystack', { method: 'POST', body, headers: { 'x-paystack-signature': 'forged' } });
    assert.equal(bad.status, 401);
    assert.ok(paystack.txs[ref]);
  } finally { server.close(); }
});

test('purchases: success, refund on failure, pending then requery', async () => {
  const { db, provider, server, c, user, buy } = await setup();
  try {
    await c('/wallet/fund', { method: 'POST', form: { amount: '20000', demo: '1' } });
    assert.equal(user().balance, 2000000);

    // Airtime success.
    let r = await buy('airtime', { service: 'mtn', biller: '+234 803 123 4567', amount: '500' });
    assert.equal(r.order.status, 'success');
    assert.equal(r.order.biller, '08031234567');
    assert.equal(user().balance, 2000000 - 50000);

    // Prepaid electricity returns a token and verified name.
    r = await buy('electricity', { service: 'ikeja-electric', meterType: 'prepaid', biller: '45012345678', amount: '2000', phone: '08031234567' });
    assert.equal(r.order.status, 'success');
    assert.match(r.order.token, /^\d{4}(-\d{4}){4}$/);
    assert.equal(r.order.customer_name, 'Demo Customer');
    const receipt = await c(`/orders/${r.id}`);
    assert.match(receipt.text, /Electricity token/);

    // Failure → refunded.
    const before = user().balance;
    r = await buy('airtime', { service: 'glo', biller: '08059999999', amount: '1000' });
    assert.equal(r.order.status, 'failed');
    assert.equal(r.order.refunded, 1);
    assert.equal(user().balance, before);

    // Pending → stays debited → requery delivers.
    r = await buy('airtime', { service: 'airtel', biller: '08028888888', amount: '200' });
    assert.equal(r.order.status, 'pending');
    assert.equal(user().balance, before - 20000);
    db.prepare("UPDATE orders SET updated_at = datetime('now','-1 minute') WHERE id = ?").run(r.id);
    await orders.requeryPending(db, provider);
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(r.id).status, 'success');

    // Ledger reconciles with balance.
    const sum = db.prepare("SELECT SUM(CASE direction WHEN 'credit' THEN amount ELSE -amount END) AS s FROM wallet_ledger WHERE user_id = ?").get(user().id).s;
    assert.equal(sum, user().balance);
  } finally { server.close(); }
});

test('data price comes from the provider, not the form', async () => {
  const { server, c, user, buy } = await setup();
  try {
    await c('/wallet/fund', { method: 'POST', form: { amount: '10000', demo: '1' } });
    const r = await buy('data', { service: 'mtn-data', biller: '08031234567', variation: 'd-2gb', amount: '1' });
    assert.equal(r.order.amount, 75000);
    assert.equal(user().balance, 1000000 - 75000);
  } finally { server.close(); }
});

test('TV renewal uses the verified renewal amount', async () => {
  const { server, c, buy } = await setup();
  try {
    await c('/wallet/fund', { method: 'POST', form: { amount: '20000', demo: '1' } });
    const r = await buy('tv', { service: 'gotv', biller: '7023456789', tvMode: 'renew', phone: '08031234567' });
    assert.equal(r.order.status, 'success');
    assert.equal(r.order.amount, 390000);
    assert.equal(r.order.tv_mode, 'renew');
  } finally { server.close(); }
});

test('guards: low balance, double pay, bad meter, bad phone', async () => {
  const { db, server, c, user, buy } = await setup();
  try {
    let r = await buy('airtime', { service: 'mtn', biller: '08031234567', amount: '500' });
    assert.match(r.pay.location, /review\?msg=low-balance/);
    assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(r.id).status, 'draft');

    await c('/wallet/fund', { method: 'POST', form: { amount: '1000', demo: '1' } });
    await c(`/orders/${r.id}/pay`, { method: 'POST', form: {} }); // second click after funding
    await c(`/orders/${r.id}/pay`, { method: 'POST', form: {} }); // double click
    assert.equal(user().balance, 50000);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM wallet_ledger WHERE reason = 'purchase'").get().n, 1);

    r = await buy('electricity', { service: 'eko-electric', meterType: 'prepaid', biller: '12340000', amount: '1000', phone: '08031234567' });
    assert.equal(r.error.status, 400);
    assert.match(r.error.text, /Invalid number/);

    r = await buy('airtime', { service: 'mtn', biller: '12345', amount: '100' });
    assert.match(r.error.text, /valid 11-digit/);
  } finally { server.close(); }
});

test('electricity estimate: units and finish date', async () => {
  const estimator = require('../src/estimator');
  // ₦10,750 at Band A (₦209.5/kWh) → ₦10,000 after VAT → 47.7 kWh; at 6 kWh/day ≈ 7.96 days.
  const e = estimator.estimate({ amount: 1075000, band: 'A', dailyKwh: 6, from: new Date('2026-11-17T08:00:00Z') });
  assert.equal(e.units, 47.7);
  assert.equal(Math.floor(e.days), 7);
  assert.equal(e.finish.toISOString().slice(0, 10), '2026-11-25');
  assert.equal(estimator.estimate({ amount: 100, band: 'Z' }), null);
  assert.equal(estimator.parseUnits('29.4 kWh'), 29.4);

  const { server, c, buy } = await setup();
  try {
    await c('/wallet/fund', { method: 'POST', form: { amount: '20000', demo: '1' } });
    const form = await c('/buy/electricity');
    assert.match(form.text, /How long will it last/);
    assert.match(form.text, /class="foot"/);
    const r = await buy('electricity', { service: 'ikeja-electric', meterType: 'prepaid', biller: '45012345678', amount: '5000', band: 'B', usage: 'medium', phone: '08031234567' });
    assert.equal(r.order.status, 'success');
    assert.equal(JSON.parse(r.order.customer_info).dailyKwh, 6);
    const receipt = await c(`/orders/${r.id}`);
    assert.match(receipt.text, /Runs out around/);
    assert.match(receipt.text, /Recharge by/);
  } finally { server.close(); }
});

test('electricity estimate from an appliance list', async () => {
  const estimator = require('../src/estimator');
  // 4 bulbs × 10 W × 6 h = 0.24 kWh; fridge 150 W × 10 h = 1.5; TV 60 W × 6 h = 0.36 → 2.1 kWh/day.
  const form = { usage: 'appliances', applName: ['LED bulb', 'Fridge', 'TV', ''], applWatts: ['10', '150', '60', ''], applQty: ['4', '1', '1', '1'], applHours: ['6', '10', '6', ''] };
  assert.equal(estimator.appliances(form).length, 3); // blank row dropped
  assert.equal(estimator.dailyKwh('appliances', null, form), 2.1);
  assert.equal(estimator.dailyKwh('appliances', null, { applWatts: '' }), null); // empty list: no estimate, still allowed
  // A single row arrives as plain strings, not arrays.
  assert.equal(estimator.dailyKwh('appliances', null, { applName: 'AC', applWatts: '1000', applQty: '1', applHours: '5' }), 5);

  // 47.7 kWh at 2.1 kWh/day ≈ 22.7 days; recharge 3 days before (20% would be 4.5, capped at 3).
  const from = new Date('2026-11-17T08:00:00Z');
  const e = estimator.estimate({ amount: 1075000, band: 'A', dailyKwh: 2.1, from });
  assert.equal(Math.floor(e.days), 22);
  assert.equal(Math.round((e.finish - e.recharge) / 864e5), 3);
  // Short durations: at least 1 day before, never in the past.
  const short = estimator.estimate({ amount: 1075000, band: 'A', dailyKwh: 60, from });
  assert.equal(short.recharge.getTime(), from.getTime());

  const { server, c, buy } = await setup();
  try {
    await c('/wallet/fund', { method: 'POST', form: { amount: '20000', demo: '1' } });
    assert.match((await c('/buy/electricity')).text, /List my appliances/);
    const body = new URLSearchParams({ service: 'ikeja-electric', meterType: 'prepaid', biller: '45012345678', amount: '5000', band: 'B', phone: '08031234567', usage: 'appliances' });
    form.applName.forEach((_, i) => ['applName', 'applWatts', 'applQty', 'applHours'].forEach((k) => body.append(k, form[k][i])));
    const res = await c('/buy/electricity', { method: 'POST', body: body.toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(res.status, 303);
    const id = Number(res.location.match(/\/orders\/(\d+)\/review/)[1]);
    await c(`/orders/${id}/pay`, { method: 'POST', form: {} });
    const receipt = await c(`/orders/${id}`);
    assert.match(receipt.text, /your 3 appliances \(≈ 2.1 kWh\/day\), assuming constant light/);
    assert.match(receipt.text, /Recharge by/);
  } finally { server.close(); }
});

test('ads: admin creates, customers see it, clicks are tracked', async () => {
  const { db, server, c, base } = await setup();
  try {
    const anon = client(base);
    const landing = await anon('/');
    assert.match(landing.text, /Frequently asked questions/);
    assert.doesNotMatch(landing.text, /Ad space:/); // empty slots are invisible to visitors

    const admin = client(base);
    await admin('/register', { method: 'POST', form: { name: 'Admin', phone: '08030000001', email: 'admin@test.local', password: 'password123' } });
    assert.match((await admin('/')).text, /Ad space: home/); // admins see placeholders

    // Customers can't create ads; bad links are rejected.
    assert.equal((await c('/admin/ads', { method: 'POST', form: { title: 'x', link_url: 'https://x.test' } })).status, 404);
    assert.equal((await c('/admin')).status, 404); // customers can't see the dashboard exists
    assert.equal((await anon('/admin')).status, 404);
    assert.doesNotMatch((await c('/')).text, /href="\/admin"/);
    const bad = await admin('/admin/ads', { method: 'POST', form: { title: 'Bad', link_url: 'javascript:alert(1)' } });
    assert.equal(bad.status, 400);

    const dash = await admin('/admin?q=ada');
    assert.equal(dash.status, 200);
    assert.match(dash.text, /Admin dashboard/);
    assert.match(dash.text, /Sales, last 14 days/);
    assert.match(dash.text, /ada@test\.local/);

    const ok = await admin('/admin/ads', { method: 'POST', form: { title: 'Solar Sale', body: 'Big discount', link_url: 'https://solar.test/deal', slot: 'home' } });
    assert.equal(ok.status, 303);
    const home = await c('/');
    assert.match(home.text, /Solar Sale/);
    assert.match(home.text, /Sponsored/);
    const id = db.prepare('SELECT id FROM ads').get().id;
    const click = await c(`/ads/${id}/click`);
    assert.equal(click.location, 'https://solar.test/deal');
    const row = db.prepare('SELECT impressions, clicks FROM ads WHERE id = ?').get(id);
    assert.equal(row.clicks, 1);
    assert.ok(row.impressions >= 1);

    // Paused ads stop showing.
    await admin(`/admin/ads/${id}/toggle`, { method: 'POST', form: {} });
    assert.doesNotMatch((await c('/')).text, /Solar Sale/);
  } finally { server.close(); }
});

test('forgotten password: emailed code resets the password once', async () => {
  const db = open(':memory:');
  const sent = [];
  const mailer = { send: async (m) => { sent.push(m); } };
  const server = createApp({ db, provider: createMock(), paystack: fakePaystack(), mailer }).listen(0);
  const base = `http://localhost:${server.address().port}`;
  try {
    const c = client(base);
    await c('/register', { method: 'POST', form: { name: 'Ada Obi', phone: '08031234567', email: 'ada@test.local', password: 'password123' } });
    await c('/logout', { method: 'POST', form: {} });
    assert.match((await c('/login')).text, /href="\/forgot"/);

    // Unknown email: same redirect, no mail.
    const anon = client(base);
    const u = await anon('/forgot', { method: 'POST', form: { email: 'nobody@test.local' } });
    assert.equal(u.status, 303);
    assert.equal(sent.length, 0);

    const f = await anon('/forgot', { method: 'POST', form: { email: 'ADA@test.local' } });
    assert.equal(f.location, '/reset?email=ada%40test.local');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'ada@test.local');
    const code = sent[0].text.match(/\b(\d{6})\b/)[1];

    // Resend is rate-limited.
    assert.equal((await anon('/forgot', { method: 'POST', form: { email: 'ada@test.local' } })).status, 429);

    const wrong = String((Number(code) + 1) % 1e6).padStart(6, '0');
    const bad = await anon('/reset', { method: 'POST', form: { email: 'ada@test.local', code: wrong, password: 'newpass456', confirm: 'newpass456' } });
    assert.equal(bad.status, 400);
    const ok = await anon('/reset', { method: 'POST', form: { email: 'ada@test.local', code, password: 'newpass456', confirm: 'newpass456' } });
    assert.equal(ok.location, '/?msg=password-reset');
    // The code is single-use, and the old session was signed out.
    assert.equal((await client(base)('/reset', { method: 'POST', form: { email: 'ada@test.local', code, password: 'x'.repeat(9), confirm: 'x'.repeat(9) } })).status, 400);
    assert.equal((await c('/wallet')).status, 302);

    const login = client(base);
    assert.equal((await login('/login', { method: 'POST', form: { email: 'ada@test.local', password: 'password123' } })).status, 401);
    assert.equal((await login('/login', { method: 'POST', form: { email: 'ada@test.local', password: 'newpass456' } })).status, 303);
  } finally { server.close(); }
});

test('VTpass response parsing', () => {
  assert.equal(parseTx({ code: '000', content: { transactions: { status: 'delivered' } } }).status, 'delivered');
  assert.equal(parseTx({ code: '000', content: { transactions: { status: 'pending' } } }).status, 'pending');
  assert.equal(parseTx({ code: '016', content: { transactions: { status: 'failed' } } }).status, 'failed');
  assert.equal(parseTx({ code: '099' }).status, 'pending');
  assert.equal(parseTx({ code: '???' }).status, 'pending'); // unknown is never refunded
  assert.equal(parseTx({ code: '000', purchased_code: 'Token : 1234-5678', content: { transactions: { status: 'delivered' } } }).token, '1234-5678');
  assert.equal(parseTx({ code: '000', cards: [{ Serial: 'S1', Pin: 'P1' }], content: { transactions: { status: 'delivered' } } }).token, 'Serial: S1  PIN: P1');
  assert.match(orders.requestId(new Date('2026-11-17T09:05:00Z')), /^202611171005[0-9a-f]{12}$/);
});
