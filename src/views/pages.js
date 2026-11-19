const config = require('../config');
const { CATEGORIES, PREFIXES, PHONE_DIGITS, billerDigits, servicesIn, category: getCategory } = require('../catalog');
const estimator = require('../estimator');
const faq = require('./faq');
const { esc, money, when, icon, status, layout, adSlot } = require('./ui');

const initials = (name) => name.replace(/\(.*\)/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const QUICK = { airtime: [100, 200, 500, 1000, 2000, 5000], electricity: [1000, 2000, 5000, 10000, 20000] };
const phoneLimit = `data-digit-limit="${PHONE_DIGITS}" data-local-phone`;

const orderLine = (o) => `<li><a href="/orders/${o.id}">
  <span class="ib c-${esc(o.category)}">${icon(o.category, 20)}</span>
  <span class="mid"><b>${esc(o.service_name)} ${esc(o.variation_name && o.category !== 'electricity' ? `· ${o.variation_name}` : getCategory(o.category)?.name || '')}</b>
    <small>${esc(o.biller)} · ${when(o.created_at)}</small></span>
  <span class="end">${money(o.total)}${status(o.status, o.refunded)}</span></a></li>`;

const tiles = () => `<div class="tiles">${CATEGORIES.map((c) => `
  <a class="tile c-${c.id}" href="/buy/${c.id}"><span class="ib">${icon(c.id, 24)}</span>${esc(c.name)}<small>${esc(c.blurb)}</small></a>`).join('')}</div>`;

// Landing-page service cards: what it is, who you can pay, and a way in.
const SERVICE_COPY = {
  airtime: 'Recharge any MTN, Airtel, Glo or 9mobile line from ₦50. We detect the network from the number.',
  data: 'Daily, weekly and monthly bundles at provider prices, delivered straight to the phone.',
  electricity: 'Prepaid tokens and postpaid bills for every DisCo. See your units and how long they will last.',
  tv: 'Renew or change your DStv, GOtv, StarTimes or Showmax plan. We confirm the account name first.',
  internet: 'Top up your Smile or Spectranet broadband without leaving the house.',
  education: 'WAEC result checker and registration PINs, plus JAMB UTME and DE ePINs, on screen instantly.',
};
const serviceCards = (cta) => `<div class="services">${CATEGORIES.map((c) => {
  const names = [...new Set(servicesIn(c.id).map((s) => s.short || s.name))];
  return `<a class="svc c-${c.id}" href="/buy/${c.id}">
    <div class="top-row"><span class="ib">${icon(c.id, 26)}</span><div><h3>${esc(c.name)}</h3><p>${esc(c.blurb)}</p></div></div>
    <p class="muted small" style="margin:0">${esc(SERVICE_COPY[c.id] || '')}</p>
    <ul class="prov" aria-label="Providers">${names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    <span class="go">${cta} ${esc(c.name)}${icon('arrow', 16)}</span></a>`;
}).join('')}</div>`;

function field({ name, label, error, hint, children, show, id }) {
  const err = error?.field === name;
  return `<label class="field${err ? ' err' : ''}"${show ? ` data-show="${show}"` : ''}${id ? ` id="${id}"` : ''}>
    <span>${label}</span>${children}${hint ? `<small class="hint">${hint}</small>` : ''}${err ? `<small class="msg">${esc(error.error)}</small>` : ''}</label>`;
}

// ---- Electricity: "how many units, and when will it finish?" ----
function estimatorFields(values, error) {
  const t = config.tariffs;
  const custom = values.usage === 'custom';
  return `<div id="estimator" class="estimator">
    <div class="estimator-head">${icon('electricity', 18)}<b>How long will it last?</b><small class="muted">Optional</small></div>
    ${field({ name: 'band', label: 'Tariff band', error, hint: 'Your band is printed on your bill or shown on your meter/DisCo app.',
      children: `<select name="band"><option value="">I don't know my band</option>${estimator.BANDS.map((b) => `
        <option value="${b.id}" ${values.band === b.id ? 'selected' : ''}>${b.label} · ${b.supply} (₦${t[b.id]}/kWh)</option>`).join('')}</select>` })}
    ${field({ name: 'usage', label: 'How much power do you use?', error,
      children: `<select name="usage"><option value="">Select your usage</option>${estimator.USAGE.map((u) => `
        <option value="${u.id}" ${values.usage === u.id ? 'selected' : ''}>${u.label}: ${u.hint} (~${u.kwh} kWh/day)</option>`).join('')}
        <option value="appliances" ${values.usage === 'appliances' ? 'selected' : ''}>List my appliances (most accurate)</option>
        <option value="custom" ${custom ? 'selected' : ''}>I know my daily kWh</option></select>` })}
    ${field({ name: 'dailyKwh', label: 'Units used per day (kWh)', error, id: 'dailyKwhField',
      hint: 'Tip: note your meter reading today and tomorrow. The difference is your daily usage.',
      children: `<input name="dailyKwh" type="number" min="0.1" max="500" step="0.1" inputmode="decimal" value="${esc(values.dailyKwh ?? '')}" placeholder="e.g. 5">` })}
    ${applianceFields(values)}
    <div class="estimate" id="estimate" aria-live="polite" hidden>
      <div><small>Estimated units</small><b data-e="units">–</b></div>
      <div><small>Should last</small><b data-e="days">–</b></div>
      <div><small>Runs out around</small><b data-e="finish">–</b></div>
      <div class="recharge"><small>Recharge by</small><b data-e="recharge">–</b></div>
      <p data-e="note"></p>
    </div>
  </div>
  <script type="application/json" id="tariffs">${JSON.stringify(estimator.clientConfig())}</script>`;
}

// Optional appliance list. Picking a common appliance fills in its typical watts and hours.
const applianceRow = (r = {}) => `<div class="appl-row" data-appl>
  <label><span>Appliance</span><input name="applName" list="applianceList" maxlength="60" value="${esc(r.name ?? '')}" placeholder="e.g. Fridge"></label>
  <label><span>Watts</span><input name="applWatts" type="number" min="1" max="20000" step="any" inputmode="decimal" value="${esc(r.watts ?? '')}" placeholder="W"></label>
  <label><span>How many</span><input name="applQty" type="number" min="1" max="100" step="1" inputmode="numeric" value="${esc(r.qty ?? 1)}"></label>
  <label><span>Hours/day</span><input name="applHours" type="number" min="0" max="24" step="any" inputmode="decimal" value="${esc(r.hours ?? '')}" placeholder="h"></label>
  <button type="button" class="appl-remove" data-appl-remove aria-label="Remove appliance">×</button>
</div>`;

function applianceFields(values) {
  const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
  const names = arr(values.applName), watts = arr(values.applWatts), qty = arr(values.applQty), hours = arr(values.applHours);
  const rows = watts.map((w, i) => ({ name: names[i], watts: w, qty: qty[i], hours: hours[i] }));
  return `<div class="appliances" id="applianceField"${values.usage === 'appliances' ? '' : ' hidden'}>
    <p class="muted small" style="margin:0 0 8px">Add the appliances in your home. Watts are usually on a sticker at the back or under the appliance. Leave out anything you rarely use.</p>
    <div id="applRows">${(rows.length ? rows : [{}]).map(applianceRow).join('')}</div>
    <template id="applTemplate">${applianceRow()}</template>
    <datalist id="applianceList">${estimator.APPLIANCES.map((a) => `<option value="${esc(a.name)}" data-watts="${a.watts}" data-hours="${a.hours}">${a.watts} W</option>`).join('')}</datalist>
    <div class="appl-foot"><button type="button" class="btn btn-ghost btn-sm" data-appl-add>+ Add appliance</button>
      <span class="small">Total: <b data-e="perDay">0 kWh/day</b></span></div>
  </div>`;
}

// Estimate for a saved order. On receipts, uses the units the DisCo actually delivered when available.
function orderEstimate(order) {
  if (order.category !== 'electricity' || order.meter_type !== 'prepaid' || order.status === 'failed') return null;
  const info = JSON.parse(order.customer_info || '{}');
  const units = order.status === 'success' ? estimator.parseUnits(order.units) : null;
  const from = order.created_at ? new Date(`${String(order.created_at).replace(' ', 'T')}Z`) : new Date();
  const e = estimator.estimate({ amount: order.amount, band: info.band, dailyKwh: info.dailyKwh, units, from });
  if (e && info.appliances?.length) e.appliances = info.appliances;
  return e;
}

function estimateCard(e) {
  if (!e || (e.actual && !e.days)) return ''; // actual units with no usage info: the Units row already says it all
  const n = e.appliances?.length;
  const usageText = n ? ` and your ${n} appliance${n === 1 ? '' : 's'} (≈ ${e.perDay} kWh/day), assuming constant light` : e.days ? ' and your typical daily usage' : '';
  return `<div class="estimate" style="margin-top:12px">
    <div><small>${e.actual ? 'Units bought' : 'Estimated units'}</small><b>${e.actual ? '' : '≈ '}${e.units} kWh</b></div>
    ${e.days ? `<div><small>Should last</small><b>${estimator.fmtDays(e.days)}</b></div>
      <div><small>Runs out around</small><b>${estimator.fmtDate(e.finish)}</b></div>
      <div class="recharge"><small>Recharge by</small><b>${estimator.fmtDate(e.recharge)}</b></div>` : ''}
    <p>${e.actual ? 'Based on the units your DisCo delivered' : `Estimate after ${estimator.VAT * 100}% VAT at ₦${e.rate}/kWh`}${usageText}.
      Actual duration depends on how much power you use${n ? ' and how many hours of light you get' : ''}.</p>
  </div>`;
}

module.exports = {
  landing: ({ demo, ads, user }) => {
    const app = esc(config.appName);
    const features = [
      ['bolt', 'Instant delivery', 'Airtime, data and TV go through in seconds. Electricity tokens and exam PINs appear on screen, ready to copy.'],
      ['refund', 'Automatic refunds', 'If a provider fails to deliver, the money goes straight back to your wallet. No forms, no calls.'],
      ['check', 'Name check before you pay', 'We confirm the name on the meter, smartcard or JAMB profile first, so your money never goes to the wrong account.'],
      ['electricity', 'Know how long your light will last', 'See roughly how many units you are buying and the date they should run out, based on your band and usage.'],
      ['shield', 'Secure payments', 'Wallet top-ups are processed by Paystack: card, bank transfer or USSD. We never see or store your card details.'],
      ['receipt', 'Receipts and history', 'Every purchase has a receipt you can print or share, and your full history is one tap away.'],
    ];
    return layout({ title: 'Pay bills in seconds', demo, user, wide: true, body: `
    <section class="hero landing-hero">
      <div>
        <span class="pill">${icon('shield', 14)}Instant · Secure · Refunds guaranteed</span>
        <h1>Everyday bills.<br>Effortlessly handled.</h1>
        <p>${app} brings your payments together. Recharge your phone, keep the lights on and renew your subscriptions from one simple wallet.</p>
        <div class="cta-row"><a class="btn btn-light" href="/register">Create free account</a><a class="btn btn-outline-light" href="#services">See our services</a></div>
        <ul class="trust">${['Delivered in seconds', 'Auto refund if it fails', 'Paystack-secured payments'].map((t) => `<li>${icon('check', 16)}${t}</li>`).join('')}</ul>
      </div>
      <div class="preview" aria-hidden="true">
        <div class="bal"><small>Wallet balance</small><b>₦25,000</b></div>
        <div class="mini">${CATEGORIES.map((c) => `<span class="c-${c.id}">${icon(c.id, 22)}<em>${esc(c.name)}</em></span>`).join('')}</div>
        <div class="tok"><i>${icon('check', 18)}</i><div><small>Electricity token</small><code>1234-5678-9012-3456</code></div></div>
      </div>
    </section>

    ${adSlot(ads, 'landing', user)}

    <section class="sec" id="services" style="scroll-margin-top:80px">
      <div class="sec-head"><span class="eyebrow">Our services</span><h2>Everything you can pay for, in one place</h2>
        <p>Six kinds of payment, every major provider, one wallet.</p></div>
      ${serviceCards('Pay for')}
    </section>

    <section class="sec">
      <div class="sec-head"><span class="eyebrow">Why ${app}</span><h2>Built so your money never gets stuck</h2></div>
      <div class="features">${features.map(([ic, t, d]) => `<div class="card feature"><span class="ib">${icon(ic, 22)}</span><b>${t}</b><p>${d}</p></div>`).join('')}</div>
    </section>

    <section class="sec">
      <div class="sec-head"><span class="eyebrow">How it works</span><h2>From sign-up to paid in four steps</h2></div>
      <div class="steps">
        <div class="card step"><span class="num-badge">1</span><b>Create an account</b><span class="muted small">Just your name, phone and email. It takes under a minute.</span></div>
        <div class="card step"><span class="num-badge">2</span><b>Fund your wallet</b><span class="muted small">Card, bank transfer or USSD via Paystack, from ₦100.</span></div>
        <div class="card step"><span class="num-badge">3</span><b>Pick a service and pay</b><span class="muted small">We confirm the recipient's name before you pay.</span></div>
        <div class="card step"><span class="num-badge">4</span><b>Done</b><span class="muted small">Tokens and PINs show instantly. Failed purchases are refunded automatically.</span></div>
      </div>
    </section>

    <section class="sec">
      <div class="sec-head"><span class="eyebrow">FAQ</span><h2>Frequently asked questions</h2></div>
      <div class="card faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
    </section>

    <section class="card cta-final">
      <div><b>Ready to stop queueing for recharge cards and tokens?</b><span class="muted">Join ${app} free and make your first payment in minutes.</span></div>
      <a class="btn btn-light" href="/register">Get started free</a>
    </section>` });
  },

  home: ({ user, recent, demo, flash, ads }) => layout({ title: 'Overview', user, active: 'home', demo, flash, wide: true, body: `
    <div class="dashboard-heading"><div><span class="dashboard-label">Your overview</span><h1>Welcome back, ${esc(user.name.split(' ')[0])}.</h1><p class="muted">A little less life admin. All your bills in one place.</p></div><a class="btn btn-ghost btn-sm" href="/orders">${icon('receipt', 16)}View history</a></div>
    <div class="dashboard-layout"><section aria-label="Wallet and services">
      <div class="hero"><div><div class="k">AVAILABLE WALLET BALANCE</div><div class="v">${money(user.balance)}</div></div><a class="btn btn-light btn-sm" href="/wallet">${icon('plus', 18)}Add money</a></div>
      <p class="dashboard-note">${icon('shield', 16)}Wallet funding secured by Paystack</p>
      <h2>Make a payment</h2>${tiles()}${adSlot(ads, 'home', user)}
    </section><aside class="dashboard-aside"><h2 style="display:flex;justify-content:space-between;align-items:center;gap:12px">Recent activity <a href="/orders" class="small" style="font-weight:500">View all</a></h2>
      ${recent.length ? `<div class="card"><ul class="list">${recent.map(orderLine).join('')}</ul></div>` : `<div class="empty-activity">${icon('receipt', 30)}<b>A fresh start</b>Your payments and receipts will appear here after your first purchase.</div>`}
    </aside></div>` }),

  buy: ({ user, cat, values = {}, error, recent, demo, ads }) => {
    const services = servicesIn(cat.id);
    const useSelect = services.length > 6;
    const selected = values.service || (services.length === 1 ? services[0].id : '');
    const billerService = services.find((s) => s.id === selected) || services[0];
    const attrs = (s) => `data-kind="${s.kind}" data-label="${esc(s.billerLabel)}" data-network="${esc(s.network || '')}"
      data-verify="${s.verify ? 1 : ''}" data-min="${s.min ? s.min / 100 : ''}" data-max="${s.max ? s.max / 100 : ''}" data-biller-digits="${billerDigits(s)}"`;
    const phoneCat = cat.id === 'airtime' || cat.id === 'data';
    const v = (k) => esc(values[k] ?? '');

    return layout({ title: `Buy ${cat.name}`, user, demo, active: 'home', body: `
      <a class="backlink" href="/">${icon('back', 18)}Home</a>
      <div class="c-${cat.id}" style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
        <span class="cat-badge">${icon(cat.id, 24)}</span>
        <div><h1>${esc(cat.name)}</h1><p class="muted" style="margin:0">${esc(cat.blurb)}</p></div></div>
      ${error && !error.field ? `<div class="alert alert-error">${esc(error.error)}</div>` : ''}
      ${recent.length ? `<div class="small muted" style="margin-bottom:6px;font-weight:600">Recent</div><div class="recent">${recent.map((r) => `
        <button type="button" data-fill='${esc(JSON.stringify({ service: r.service_id, biller: r.biller, meterType: r.meter_type || '' }))}'>
          <b>${esc(r.customer_name || r.biller)}</b><small>${esc(r.service_name)}${r.customer_name ? ` · ${esc(r.biller)}` : ''}</small></button>`).join('')}</div>` : ''}

      <form method="post" action="/buy/${cat.id}" id="buy" class="card" data-category="${cat.id}" novalidate>
        ${field({
          name: 'service', label: cat.id === 'electricity' ? 'Electricity company' : 'Provider', error,
          children: useSelect
            ? `<select name="service" required><option value="">Select your DisCo</option>${services.map((s) => `
                <option value="${s.id}" ${attrs(s)} ${s.id === selected ? 'selected' : ''}>${esc(s.name)}${s.short ? ` (${s.short})` : ''}</option>`).join('')}</select>`
            : `<div class="opts">${services.map((s) => `<label class="opt"><input type="radio" name="service" value="${s.id}" ${attrs(s)} ${s.id === selected ? 'checked' : ''}>
                <span><b>${esc(initials(s.name))}</b>${esc(s.name)}</span></label>`).join('')}</div>`,
        })}

        ${cat.id === 'electricity' ? field({ name: 'meterType', label: 'Meter type', error, children: `<div class="seg">
          <label><input type="radio" name="meterType" value="prepaid" ${values.meterType !== 'postpaid' ? 'checked' : ''}><span>Prepaid</span></label>
          <label><input type="radio" name="meterType" value="postpaid" ${values.meterType === 'postpaid' ? 'checked' : ''}><span>Postpaid</span></label></div>` }) : ''}

        ${field({
          name: 'biller', label: `<span id="billerLabel">${esc(billerService.billerLabel)}</span>`, error,
          hint: phoneCat ? '<span id="netHint">We detect the network from the number.</span>' : '',
          children: `<input name="biller" value="${v('biller')}" required autocomplete="${phoneCat ? 'tel' : 'off'}"
            data-digit-limit="${billerDigits(billerService)}" ${billerService.billerLabel === 'Phone number' ? 'data-local-phone' : ''}
            inputmode="${billerDigits(billerService) ? 'numeric' : 'text'}" placeholder="${phoneCat ? '08030000000' : ''}">`,
        })}

        ${cat.id === 'tv' ? field({ name: 'tvMode', label: 'What do you want to do?', error, show: 'tv', children: `<div class="seg">
          <label><input type="radio" name="tvMode" value="renew" ${values.tvMode !== 'change' ? 'checked' : ''}><span>Renew current plan</span></label>
          <label><input type="radio" name="tvMode" value="change" ${values.tvMode === 'change' ? 'checked' : ''}><span>Change plan</span></label></div>`,
          hint: 'For renewals we look up your current package and price on the next screen.' }) : ''}

        ${field({ name: 'variation', label: cat.id === 'tv' ? 'Package' : 'Plan', error, show: 'variation pin tv-change', id: 'variationField',
          children: `<select name="variation" data-selected="${v('variation')}"><option value="">Choose a provider first</option></select>`,
          hint: '<span id="variationHint"></span>' })}

        ${cat.id === 'education' ? field({ name: 'quantity', label: 'How many PINs?', error, show: 'pin',
          children: `<input name="quantity" type="number" min="1" max="10" value="${v('quantity') || 1}" inputmode="numeric">` }) : ''}

        ${QUICK[cat.id] ? field({ name: 'amount', label: 'Amount', error,
          children: `<div class="money-in"><input name="amount" type="number" inputmode="decimal" min="0" step="any" value="${v('amount')}" placeholder="0"></div>
            <div class="quick">${QUICK[cat.id].map((n) => `<button type="button" data-amount="${n}">₦${n.toLocaleString('en-NG')}</button>`).join('')}</div>`,
          hint: '<span id="amountHint"></span>' }) : ''}

        ${cat.id === 'electricity' ? estimatorFields(values, error) : ''}

        ${!phoneCat ? field({ name: 'phone', label: 'Phone number', error, hint: 'For delivery notifications from the provider.',
          children: `<input name="phone" type="tel" inputmode="numeric" ${phoneLimit} value="${v('phone') || esc(user.phone)}" autocomplete="tel">` }) : ''}

        <button class="btn btn-block" style="margin-top:6px">Continue</button>
      </form>
      ${adSlot(ads, 'buy', user)}
      ${phoneCat ? `<script type="application/json" id="prefixes">${JSON.stringify(PREFIXES)}</script>` : ''}` });
  },

  review: ({ user, order, info, demo }) => {
    const enough = user.balance >= order.total;
    const rows = [
      ['Service', `${order.service_name}`],
      [{ electricity: 'Meter number', tv: 'Smartcard', airtime: 'Phone number', data: 'Phone number' }[order.category] || 'Account', order.biller],
      order.variation_name && ['Plan', order.variation_name + (order.quantity > 1 ? ` × ${order.quantity}` : '')],
      info.address && ['Address', info.address],
      info.currentPackage && order.tv_mode === 'change' && ['Current package', info.currentPackage],
      ['Amount', money(order.amount)],
      order.fee && ['Service fee', money(order.fee)],
    ].filter(Boolean);
    return layout({ title: 'Confirm payment', user, demo, active: 'home', body: `
      <a class="backlink" href="/buy/${order.category}?${new URLSearchParams({ service: order.service_id, biller: order.biller, meterType: order.meter_type || '' })}">${icon('back', 18)}Edit</a>
      <h1>Confirm payment</h1><p class="muted" style="margin:0 0 16px">Check the details. Payments to the wrong number can't be reversed.</p>
      <div class="card">
        ${order.customer_name ? `<div class="verified">${icon('check', 22)}<div><small>Verified customer name</small><b>${esc(order.customer_name)}</b></div></div>` : ''}
        <dl class="rows">${rows.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join('')}
          <div class="total"><dt>Total</dt><dd>${money(order.total)}</dd></div></dl>
      </div>
      ${estimateCard(orderEstimate(order))}
      <div class="card" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div><small class="muted">Wallet balance</small><div style="font-weight:700">${money(user.balance)}</div></div>
        ${enough ? `<div class="small muted">After payment: <b>${money(user.balance - order.total)}</b></div>`
          : `<a class="btn btn-ghost btn-sm" href="/wallet?${new URLSearchParams({ amount: Math.ceil((order.total - user.balance) / 100), next: `/orders/${order.id}/review` })}">${icon('plus', 16)}Add ${money(order.total - user.balance)}</a>`}
      </div>
      ${!enough ? '<div class="alert alert-warn" style="margin-top:12px">Your balance is too low for this payment. Fund your wallet and you\'ll come straight back here.</div>' : ''}
      <form method="post" action="/orders/${order.id}/pay" data-once style="margin-top:14px">
        <button class="btn btn-block" ${enough ? '' : 'disabled'}>Pay ${money(order.total)}</button>
      </form>` });
  },

  receipt: ({ user, order, demo, flash, ads }) => {
    const tone = { success: 'ok', failed: 'bad' }[order.status] || 'warn';
    const head = { success: 'Payment successful', failed: 'Payment failed', draft: 'Not paid yet' }[order.status] || 'Processing your payment';
    const sub = {
      success: order.category === 'electricity' && order.meter_type === 'prepaid' ? 'Enter this token on your meter.' : 'Delivered. Enjoy!',
      failed: order.refunded ? `${money(order.total)} has been refunded to your wallet.` : 'The provider could not complete this payment.',
    }[order.status] || "We're confirming with the provider. This page updates automatically, and you don't need to pay again.";
    const tokenLabel = order.category === 'electricity' ? 'Electricity token' : 'Your PIN(s)';
    const rows = [
      ['Service', order.service_name], ['Recipient', order.biller], order.customer_name && ['Customer', order.customer_name],
      order.variation_name && ['Plan', order.variation_name], order.units && ['Units', order.units],
      ['Amount', money(order.amount)], order.fee && ['Service fee', money(order.fee)], ['Total paid', money(order.total)],
      ['Date', when(order.created_at)], ['Reference', order.request_id],
    ].filter(Boolean);
    const again = `/buy/${order.category}?${new URLSearchParams({ service: order.service_id, biller: order.biller, meterType: order.meter_type || '' })}`;
    return layout({
      title: head, user, demo, flash, active: 'history',
      head: ['pending', 'processing'].includes(order.status) ? '<meta http-equiv="refresh" content="8">' : '',
      body: `<div class="card">
        <div class="receipt-head"><div class="big ${tone}">${icon({ ok: 'check', bad: 'x' }[tone] || 'clock', 32)}</div>
          <div style="font-weight:700">${head}</div><div class="amt">${money(order.total)}</div><div class="muted small">${esc(sub)}</div></div>
        ${order.token && order.status === 'success' ? `<div class="token"><small class="muted">${tokenLabel}</small><pre id="tok">${esc(order.token)}</pre>
          <button class="btn btn-sm" type="button" data-copy="#tok">${icon('copy', 16)}Copy</button></div>` : ''}
        <dl class="rows">${rows.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join('')}</dl>
      </div>
      ${estimateCard(orderEstimate(order))}
      <div class="no-print" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
        <a class="btn btn-ghost" href="${again}">Buy again</a><button class="btn btn-ghost" type="button" onclick="print()">Save / print</button>
      </div>
      ${adSlot(ads, 'receipt', user)}
      <p class="muted small" style="text-align:center;margin-top:16px">Issue with this payment? Quote reference <b>${esc(order.request_id)}</b> to support.</p>`,
    });
  },

  history: ({ user, orders, filter, demo, ads }) => layout({ title: 'History', user, demo, active: 'history', body: `
    <h1>History</h1>
    ${adSlot(ads, 'history', user)}
    <nav class="tabs" style="margin-top:12px">${[['', 'All'], ['success', 'Successful'], ['pending', 'Processing'], ['failed', 'Failed']]
      .map(([k, l]) => `<a href="/orders${k ? `?status=${k}` : ''}"${filter === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    ${orders.length ? `<div class="card" style="padding:4px 14px"><ul class="list">${orders.map(orderLine).join('')}</ul></div>`
      : '<div class="card muted">Nothing here yet.</div>'}` }),

  wallet: ({ user, ledger, amount, next, canPaystack, demo, flash, ads }) => layout({ title: 'Wallet', user, demo, flash, active: 'wallet', body: `
    <h1>Wallet</h1>
    <div class="hero" style="margin-top:12px"><div><div class="k">Available balance</div><div class="v">${money(user.balance)}</div></div></div>
    <h2>Fund wallet</h2>
    <form method="post" action="/wallet/fund" class="card" data-once>
      <input type="hidden" name="next" value="${esc(next || '')}">
      ${field({ name: 'amount', label: 'Amount', children: `<div class="money-in"><input name="amount" type="number" min="100" max="500000" step="any" inputmode="decimal" required value="${esc(amount || '')}" placeholder="0"></div>
        <div class="quick">${[1000, 2000, 5000, 10000, 20000].map((n) => `<button type="button" data-amount="${n}">₦${n.toLocaleString('en-NG')}</button>`).join('')}</div>`,
        hint: 'Pay by card, bank transfer or USSD on Paystack. Minimum ₦100.' })}
      ${canPaystack ? '<button class="btn btn-block">Continue to Paystack</button>' : '<div class="alert alert-warn">Paystack is not configured yet (PAYSTACK_SECRET_KEY).</div>'}
      ${demo ? '<button class="btn btn-ghost btn-block" style="margin-top:8px" name="demo" value="1">Add demo money (no real payment)</button>' : ''}
    </form>
    ${adSlot(ads, 'wallet', user)}
    <h2>Transactions</h2>
    ${ledger.length ? `<div class="card" style="padding:4px 14px"><ul class="list">${ledger.map((l) => `<li><div class="row">
        <span class="ib">${icon(l.reason === 'funding' ? 'plus' : l.reason === 'refund' ? 'back' : 'wallet', 20)}</span>
        <span class="mid"><b>${{ funding: 'Wallet funding', purchase: 'Purchase', refund: 'Refund', adjustment: 'Adjustment' }[l.reason] || esc(l.reason)}</b>
          <small>${when(l.created_at)} · Balance ${money(l.balance_after)}</small></span>
        <span class="end" style="color:var(--${l.direction === 'credit' ? 'ok' : 'text'})">${l.direction === 'credit' ? '+' : '−'}${money(l.amount)}</span></div></li>`).join('')}</ul></div>`
      : '<div class="card muted">No wallet activity yet.</div>'}` }),

  auth: ({ mode, error, values = {}, next = '' }) => {
    const reg = mode === 'register';
    return layout({ title: reg ? 'Sign up' : 'Log in', showFooter: false, body: `
      <div class="card" style="max-width:420px;margin:12px auto">
        <h1>${reg ? 'Create your account' : 'Welcome back'}</h1>
        <p class="muted" style="margin:0 0 16px">${reg ? 'It takes less than a minute.' : 'Log in to pay your bills.'}</p>
        ${error ? `<div class="alert alert-error">${esc(error)}</div>` : ''}
        <form method="post">
          <input type="hidden" name="next" value="${esc(next)}">
          ${reg ? `<label class="field"><span>Full name</span><input name="name" required maxlength="100" autocomplete="name" value="${esc(values.name)}"></label>
          <label class="field"><span>Phone number</span><input name="phone" type="tel" required autocomplete="tel" inputmode="numeric" ${phoneLimit} value="${esc(values.phone)}" placeholder="08030000000"></label>` : ''}
          <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email" value="${esc(values.email)}"></label>
          <label class="field"><span>Password</span><input name="password" type="password" required minlength="${reg ? 8 : 1}" autocomplete="${reg ? 'new-password' : 'current-password'}">
            ${reg ? '<small class="hint">At least 8 characters.</small>' : ''}</label>
          ${reg ? '' : `<p class="small" style="text-align:right;margin:-6px 0 14px"><a href="/forgot${values.email ? `?email=${encodeURIComponent(values.email)}` : ''}">Forgot password?</a></p>`}
          <button class="btn btn-block">${reg ? 'Create account' : 'Log in'}</button>
        </form>
        <p class="muted small" style="text-align:center;margin-bottom:0">${reg ? 'Already have an account? <a href="/login">Log in</a>' : 'New here? <a href="/register">Create an account</a>'}</p>
      </div>` });
  },

  forgot: ({ error, values = {} }) => layout({ title: 'Forgot password', body: `
    <div class="card" style="max-width:420px;margin:12px auto">
      <h1>Forgot your password?</h1>
      <p class="muted" style="margin:0 0 16px">Enter the email on your account and we will send you a 6-digit code to reset it.</p>
      ${error ? `<div class="alert alert-error">${esc(error)}</div>` : ''}
      <form method="post" action="/forgot" data-once>
        <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email" value="${esc(values.email)}"></label>
        <button class="btn btn-block">Send code</button>
      </form>
      <p class="muted small" style="text-align:center;margin-bottom:0">Remembered it? <a href="/login">Log in</a></p>
    </div>` }),

  reset: ({ email = '', error }) => layout({ title: 'Reset password', body: `
    <div class="card" style="max-width:420px;margin:12px auto">
      <h1>Reset your password</h1>
      <p class="muted" style="margin:0 0 16px">If an account exists for <b>${esc(email)}</b>, we have emailed it a 6-digit code. It expires in 10 minutes. Check your spam folder if you can't see it.</p>
      ${error ? `<div class="alert alert-error">${esc(error)}</div>` : ''}
      <form method="post" action="/reset">
        <input type="hidden" name="email" value="${esc(email)}">
        <label class="field"><span>Code</span><input name="code" required inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" data-digit-limit="6" placeholder="123456"></label>
        <label class="field"><span>New password</span><input name="password" type="password" required minlength="8" autocomplete="new-password">
          <small class="hint">At least 8 characters.</small></label>
        <label class="field"><span>Confirm new password</span><input name="confirm" type="password" required minlength="8" autocomplete="new-password"></label>
        <button class="btn btn-block">Change password</button>
      </form>
      <form method="post" action="/forgot" style="text-align:center;margin-top:12px">
        <input type="hidden" name="email" value="${esc(email)}">
        <button class="btn btn-ghost">Send a new code</button>
      </form>
    </div>` }),

  message: ({ user, title, text, type = 'ok', link = '/', linkText = 'Go home', demo }) => layout({ title, user, demo, body: `
    <div class="card" style="text-align:center"><h1>${esc(title)}</h1>
    <div class="alert alert-${esc(type)}" style="margin:14px 0">${esc(text)}</div><a class="btn" href="${esc(link)}">${esc(linkText)}</a></div>` }),
};

module.exports.appName = config.appName;
