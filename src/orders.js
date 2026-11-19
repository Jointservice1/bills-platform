// Purchase pipeline:
//   quote()   validate input, verify meter/smartcard, price it from the provider → order in 'draft'
//   execute() atomically: draft→processing + debit wallet; then call provider.pay()
//   settle()  delivered → success | failed → refund | unknown → 'pending' (requeried later, never refunded blindly)

const crypto = require('node:crypto');
const config = require('./config');
const { tx } = require('./db');
const wallet = require('./wallet');
const estimator = require('./estimator');
const { byId, PHONE_BILLER, billerDigits, normalisePhone } = require('./catalog');

function requestId(now = new Date()) {
  // VTpass requires request IDs to start with YYYYMMDDHHmm in Lagos time.
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${crypto.randomBytes(6).toString('hex')}`;
}

const fail = (error, field) => ({ ok: false, error, field });
const naira = (k) => `₦${(k / 100).toLocaleString('en-NG')}`;

async function quote(db, provider, user, category, input) {
  const s = byId[input.service];
  if (!s || s.category !== category) return fail('Choose a provider.', 'service');

  const phoneBiller = PHONE_BILLER.has(category) || s.billerLabel === 'Phone number';
  let biller = String(input.biller || '').trim();
  if (phoneBiller) {
    biller = normalisePhone(biller);
    if (!biller) return fail('Enter a valid 11-digit Nigerian phone number.', 'biller');
  } else if (billerDigits(s) && (!/^\d{4,}$/.test(biller) || biller.length > billerDigits(s))) {
    return fail(`Enter a valid ${s.billerLabel.toLowerCase()} with up to ${billerDigits(s)} digits.`, 'biller');
  } else if (!/^[A-Za-z0-9@._-]{4,40}$/.test(biller)) {
    return fail(`Enter a valid ${s.billerLabel.toLowerCase()}.`, 'biller');
  }
  const phone = normalisePhone(input.phone) || (phoneBiller ? biller : normalisePhone(user.phone));
  if (!phone) return fail('Enter a valid phone number for notifications.', 'phone');

  const o = {
    category, service_id: s.id, service_name: s.name, biller, phone, quantity: 1,
    meter_type: null, tv_mode: null, variation_code: null, variation_name: null, customer_name: null, customer_info: null,
  };

  const pickVariation = async () => {
    let list;
    try {
      list = await provider.listVariations(s.id);
    } catch (err) {
      console.error('[variations]', s.id, err.message);
      return null;
    }
    return list.find((v) => v.code === input.variation) || null;
  };
  const verify = async (type) => {
    let v;
    try {
      v = await provider.verify({ serviceId: s.id, billersCode: biller, type });
    } catch (err) {
      console.error('[verify]', s.id, err.message);
      return { ok: false, error: 'We could not reach the provider to verify. Please try again.' };
    }
    if (v.ok) {
      o.customer_name = v.name || null;
      o.customer_info = JSON.stringify({ address: v.address, currentPackage: v.currentPackage, renewalAmount: v.renewalAmount, dueDate: v.dueDate });
    }
    return v;
  };

  switch (s.kind) {
    case 'amount': {
      o.amount = Math.round(parseFloat(input.amount) * 100);
      if (!(o.amount >= s.min && o.amount <= s.max)) return fail(`Amount must be between ${naira(s.min)} and ${naira(s.max)}.`, 'amount');
      break;
    }
    case 'electricity': {
      o.meter_type = input.meterType === 'postpaid' ? 'postpaid' : 'prepaid';
      o.variation_code = o.meter_type;
      o.variation_name = o.meter_type === 'prepaid' ? 'Prepaid' : 'Postpaid';
      o.amount = Math.round(parseFloat(input.amount) * 100);
      if (!(o.amount >= s.min && o.amount <= s.max)) return fail(`Amount must be between ${naira(s.min)} and ${naira(s.max)}.`, 'amount');
      const v = await verify(o.meter_type);
      if (!v.ok) return fail(v.error || 'Meter number not found.', 'biller');
      // Optional, for the "how long will it last" estimate.
      const band = estimator.band(input.band);
      const perDay = estimator.dailyKwh(input.usage, input.dailyKwh, input);
      if (o.meter_type === 'prepaid' && (band || perDay)) {
        const appliances = input.usage === 'appliances' && perDay ? estimator.appliances(input) : undefined;
        o.customer_info = JSON.stringify({ ...JSON.parse(o.customer_info || '{}'), band, dailyKwh: perDay, usage: input.usage || null, appliances });
      }
      break;
    }
    case 'tv': {
      const v = await verify();
      if (!v.ok) return fail(v.error || 'Smartcard number not found.', 'biller');
      if (input.tvMode === 'renew') {
        if (!v.renewalAmount) return fail('This card cannot be renewed automatically. Choose a package instead.', 'tvMode');
        o.tv_mode = 'renew';
        o.amount = v.renewalAmount;
        o.variation_name = `Renew ${v.currentPackage || 'current package'}`;
      } else {
        const p = await pickVariation();
        if (!p) return fail('Choose a package.', 'variation');
        o.tv_mode = 'change';
        Object.assign(o, { variation_code: p.code, variation_name: p.name, amount: p.amount });
      }
      break;
    }
    case 'variation':
    case 'pin': {
      const p = await pickVariation();
      if (!p) return fail('Choose a plan.', 'variation');
      o.quantity = s.kind === 'pin' ? Math.min(10, Math.max(1, parseInt(input.quantity, 10) || 1)) : 1;
      Object.assign(o, { variation_code: p.code, variation_name: p.name, amount: p.amount * o.quantity });
      if (s.verify) {
        const v = await verify(p.code);
        if (!v.ok) return fail(v.error || `${s.billerLabel} not found.`, 'biller');
      }
      break;
    }
    default:
      return fail('Unsupported service.');
  }

  if (!(o.amount > 0)) return fail('The provider returned no price for this item. Please try again.');
  o.fee = config.fees[category] || 0;
  o.total = o.amount + o.fee;

  const r = db.prepare(`INSERT INTO orders (user_id, request_id, category, service_id, service_name, biller, phone, meter_type, tv_mode,
      variation_code, variation_name, quantity, customer_name, customer_info, amount, fee, total, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`).run(
    user.id, requestId(), o.category, o.service_id, o.service_name, o.biller, o.phone, o.meter_type, o.tv_mode,
    o.variation_code, o.variation_name, o.quantity, o.customer_name, o.customer_info, o.amount, o.fee, o.total);
  return { ok: true, order: getOrder(db, Number(r.lastInsertRowid)) };
}

const getOrder = (db, id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

function settle(db, orderId, result) {
  return tx(db, () => {
    const order = getOrder(db, orderId);
    if (!order || !['processing', 'pending'].includes(order.status)) return order; // already final
    const common = [result.token ?? order.token, result.units ?? order.units, result.providerRef ?? order.provider_ref,
      String(result.message ?? '').slice(0, 300), JSON.stringify(result.raw ?? {}).slice(0, 20000)];

    if (result.status === 'delivered') {
      db.prepare(`UPDATE orders SET status = 'success', token = ?, units = ?, provider_ref = ?, provider_message = ?, raw = ?,
        updated_at = datetime('now') WHERE id = ?`).run(...common, orderId);
    } else if (result.status === 'failed') {
      db.prepare(`UPDATE orders SET status = 'failed', refunded = 1, token = ?, units = ?, provider_ref = ?, provider_message = ?, raw = ?,
        updated_at = datetime('now') WHERE id = ?`).run(...common, orderId);
      if (!order.refunded) wallet.credit(db, order.user_id, order.total, 'refund', order.request_id);
    } else {
      db.prepare(`UPDATE orders SET status = 'pending', provider_message = ?, raw = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(common[3], common[4], orderId);
    }
    return getOrder(db, orderId);
  });
}

async function execute(db, provider, userId, orderId) {
  const started = tx(db, () => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").get(orderId, userId);
    if (!order) return { ok: false, error: 'not-found' };
    if (order.status !== 'draft') return { ok: true, order }; // double-click: just show the existing result
    if (!wallet.debit(db, userId, order.total, 'purchase', order.request_id)) {
      const { balance } = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
      return { ok: false, error: 'insufficient', shortBy: order.total - balance, order };
    }
    db.prepare("UPDATE orders SET status = 'processing', updated_at = datetime('now') WHERE id = ?").run(orderId);
    return { ok: true, order: getOrder(db, orderId), fresh: true };
  });
  if (!started.ok || !started.fresh) return started;

  const o = started.order;
  let result;
  try {
    result = await provider.pay({
      requestId: o.request_id, serviceId: o.service_id, billersCode: o.biller, variationCode: o.variation_code ?? undefined,
      amount: o.amount, phone: o.phone, quantity: o.quantity,
      subscriptionType: o.tv_mode ?? undefined,
    });
  } catch (err) {
    // Timeout / network error: the provider may still have delivered. Requery later.
    console.error('[pay]', o.request_id, err.message);
    result = { status: 'pending', message: 'Awaiting provider confirmation' };
  }
  return { ok: true, order: settle(db, o.id, result) };
}

// Resolve orders whose outcome is unknown. Run on a timer.
async function requeryPending(db, provider, { olderThanSec = 30, limit = 25 } = {}) {
  const rows = db.prepare(`SELECT id, request_id FROM orders WHERE status IN ('pending','processing')
    AND updated_at <= datetime('now', ?) ORDER BY id LIMIT ?`).all(`-${olderThanSec} seconds`, limit);
  for (const r of rows) {
    try {
      settle(db, r.id, await provider.requery(r.request_id));
    } catch (err) {
      console.error('[requery]', r.request_id, err.message);
      db.prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").run(r.id); // back off
    }
  }
  return rows.length;
}

// ---- Wallet funding ----

function creditFunding(db, reference, paid) {
  return tx(db, () => {
    const f = db.prepare('SELECT * FROM fundings WHERE reference = ?').get(reference);
    if (!f || f.status !== 'pending') return f; // unknown or already handled (idempotent)
    if (paid.status !== 'success') {
      if (paid.status === 'failed' || paid.status === 'abandoned') db.prepare("UPDATE fundings SET status = 'failed' WHERE id = ?").run(f.id);
      return db.prepare('SELECT * FROM fundings WHERE id = ?').get(f.id);
    }
    if (Number(paid.amount) < f.amount) {
      db.prepare("UPDATE fundings SET status = 'mismatch' WHERE id = ?").run(f.id);
      console.error('[funding] amount mismatch', reference, paid.amount, f.amount);
    } else {
      db.prepare("UPDATE fundings SET status = 'success', channel = ?, paid_at = ? WHERE id = ?")
        .run(paid.channel ?? null, paid.paid_at ?? new Date().toISOString(), f.id);
      wallet.credit(db, f.user_id, f.amount, 'funding', reference);
    }
    return db.prepare('SELECT * FROM fundings WHERE id = ?').get(f.id);
  });
}

module.exports = { quote, execute, settle, requeryPending, creditFunding, getOrder, requestId };
