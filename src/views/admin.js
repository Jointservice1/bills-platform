const { esc, money, when, icon, status, layout } = require('./ui');
const { CATEGORIES } = require('../catalog');

const catName = (id) => CATEGORIES.find((c) => c.id === id)?.name || id;
const naira = (kobo) => (kobo || 0) / 100;

// A round axis maximum and step (1/2/5 × 10^n) for the sales chart.
function niceScale(max, ticks = 4) {
  if (!(max > 0)) return { top: 4, step: 1 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return { top: step * Math.ceil(max / step), step };
}
const short = (n) => (n >= 1e6 ? `₦${+(n / 1e6).toFixed(1)}m` : n >= 1e3 ? `₦${+(n / 1e3).toFixed(1)}k` : `₦${n}`);

function salesChart(daily) {
  const { top, step } = niceScale(Math.max(...daily.map((d) => naira(d.value))));
  const lines = [];
  for (let v = 0; v <= top; v += step) lines.push(v);
  const total = daily.reduce((a, d) => a + d.value, 0);
  const orders = daily.reduce((a, d) => a + d.n, 0);
  return `<div class="card panel">
    <div class="ph"><div><h3>Sales, last 14 days</h3><span class="muted small">Successful orders, Lagos time</span></div>
      <div style="text-align:right"><b style="font-size:1.15rem">${money(total)}</b><div class="muted small">${orders} orders</div></div></div>
    <div class="chart" role="img" aria-label="Daily sales for the last 14 days">
      <div class="grid">${lines.map((v) => `<div style="bottom:${(v / top) * 100}%"><span>${short(v)}</span></div>`).join('')}</div>
      <div class="bars" style="--n:${daily.length}">${daily.map((d, i) => `<div class="col${i === daily.length - 1 ? ' today' : ''}" tabindex="0"
        data-tip="${esc(`${d.long}\n${money(d.value)} · ${d.n} order${d.n === 1 ? '' : 's'}`)}">
        <div class="bar" style="height:${(naira(d.value) / top) * 100}%"></div></div>`).join('')}</div>
      <div class="xlabels" style="--n:${daily.length}">${daily.map((d, i) => `<span>${i === daily.length - 1 ? 'Today' : esc(d.label)}</span>`).join('')}</div>
    </div>
    <details class="small" style="margin-top:12px"><summary class="muted" style="cursor:pointer">Show as table</summary>
      <div class="table-wrap" style="margin-top:8px;box-shadow:none"><table style="min-width:0"><thead><tr><th>Day</th><th class="num">Orders</th><th class="num">Sales</th></tr></thead>
      <tbody>${daily.slice().reverse().map((d) => `<tr><td>${esc(d.long)}</td><td class="num">${d.n}</td><td class="num">${money(d.value)}</td></tr>`).join('')}</tbody></table></div></details>
  </div>`;
}

function categoryPanel(byCategory) {
  const max = Math.max(1, ...byCategory.map((r) => r.value));
  const total = byCategory.reduce((a, r) => a + r.value, 0);
  return `<div class="card panel">
    <div class="ph"><div><h3>Sales by service</h3><span class="muted small">Last 30 days</span></div></div>
    ${byCategory.length ? `<ul class="hbars">${byCategory.map((r) => `<li class="c-${esc(r.category)}"
        data-tip="${esc(`${catName(r.category)}\n${r.n} orders · ${money(r.value)}\nFees earned ${money(r.fees)}`)}">
      <div class="lbl"><b><span class="ib">${icon(r.category, 15)}</span>${esc(catName(r.category))}</b>
        <span><strong>${money(r.value)}</strong> · ${Math.round((r.value / total) * 100)}%</span></div>
      <div class="track"><div class="fill" style="width:${(r.value / max) * 100}%"></div></div></li>`).join('')}</ul>`
      : '<p class="muted" style="margin:0">No sales in the last 30 days yet.</p>'}
  </div>`;
}

function feedPanel(feed) {
  const row = (e) => {
    if (e.kind === 'signup') {
      return `<li><span class="ib">${icon('users', 17)}</span><div class="mid"><b>${esc(e.name)}</b> created an account<small>${esc(e.label)} · ${when(e.at)}</small></div></li>`;
    }
    if (e.kind === 'funding') {
      return `<li style="--c:var(--ok)"><span class="ib">${icon('plus', 17)}</span><div class="mid"><b>${esc(e.name)}</b> funded their wallet
        <small>${esc(e.label || 'Paystack')} · ${when(e.at)}</small></div><div class="end">${money(e.amount)}${status(e.status)}</div></li>`;
    }
    return `<li class="c-${esc(e.category)}"><span class="ib">${icon(e.category, 17)}</span><div class="mid"><b>${esc(e.name)}</b> bought ${esc(e.label)}
      <small>${esc(catName(e.category))} · ${when(e.at)}</small></div><div class="end">${money(e.amount)}${status(e.status, e.refunded)}</div></li>`;
  };
  return `<div class="card panel" style="padding-bottom:8px">
    <div class="ph"><div><h3>Live activity</h3><span class="muted small">Latest sign-ups, top-ups and purchases</span></div></div>
    ${feed.length ? `<ul class="feed">${feed.map(row).join('')}</ul>` : '<p class="muted">Nothing has happened yet.</p>'}
  </div>`;
}

function systemPanel({ sys, providerName, providerBalance, s, demo }) {
  const item = (tone, title, sub) => `<div class="card"><span class="dot ${tone}"></span><div><b>${title}</b><small>${sub}</small></div></div>`;
  const low = providerBalance != null && providerBalance < s.liabilities;
  return `<div class="sys">
    ${item(demo ? 'warn' : 'ok', `Provider: ${esc(providerName)}`, demo ? 'Demo mode, nothing real is delivered' : 'Live purchases enabled')}
    ${item(providerBalance == null ? 'bad' : low ? 'warn' : 'ok', `Provider balance: ${providerBalance == null ? 'unavailable' : money(providerBalance)}`,
      providerBalance == null ? 'Could not reach the provider' : low ? 'Below customer wallet balances' : 'Covers customer balances')}
    ${item(sys.paystack ? 'ok' : 'bad', `Paystack ${sys.paystack ? 'connected' : 'not configured'}`, sys.paystack ? 'Wallet top-ups enabled' : 'Set PAYSTACK_SECRET_KEY in .env')}
    ${item(sys.webhooks24 ? 'ok' : 'warn', `${sys.webhooks24} webhook${sys.webhooks24 === 1 ? '' : 's'} in 24h`, sys.lastWebhook ? `Last received ${when(sys.lastWebhook)}` : 'None received yet')}
    ${item(s.pending ? 'warn' : 'ok', `${s.pending} order${s.pending === 1 ? '' : 's'} processing`, s.pending ? 'Rechecked automatically, or requery below' : 'Nothing stuck')}
    ${item('ok', `${sys.sessions} active session${sys.sessions === 1 ? '' : 's'}`, 'Logged-in devices')}
  </div>`;
}

function adsSection({ ads = [], adSlots = [], adError, adValues = {} }) {
  const v = (k) => esc(adValues[k] ?? '');
  const slotName = (id) => adSlots.find((s) => s.id === id)?.label || id;
  return `<div class="sec-title" id="ads"><h2>Ads</h2></div>
    <p class="muted small" style="margin-top:-4px">Ads show in ad spaces on the landing, home, buy, receipt, history and wallet pages.
      While logged in as admin you'll see dashed boxes where empty ad spaces are. Customers never see empty spaces.</p>
    <div class="table-wrap"><table style="min-width:760px"><thead><tr><th>Ad</th><th>Ad space</th><th>Dates</th><th class="num">Views</th><th class="num">Clicks</th><th class="num">CTR</th><th>Status</th><th></th></tr></thead><tbody>
      ${ads.length ? ads.map((a) => `<tr>
        <td style="white-space:normal;max-width:260px"><b>${esc(a.title)}</b>${a.body ? `<div class="small muted">${esc(a.body)}</div>` : ''}
          <div class="small"><a href="${esc(a.link_url)}" target="_blank" rel="noopener">${esc(a.link_url)}</a></div></td>
        <td>${esc(slotName(a.slot))}</td>
        <td class="small">${a.starts_on || a.ends_on ? `${esc(a.starts_on || 'now')} → ${esc(a.ends_on || 'no end')}` : 'Always'}</td>
        <td class="num">${a.impressions}</td><td class="num">${a.clicks}</td>
        <td class="num">${a.impressions ? `${((a.clicks / a.impressions) * 100).toFixed(1)}%` : '—'}</td>
        <td>${a.active ? '<span class="chip chip-ok">Running</span>' : '<span class="chip chip-neutral">Paused</span>'}</td>
        <td style="display:flex;gap:6px">
          <form method="post" action="/admin/ads/${a.id}/toggle"><button class="btn btn-ghost btn-sm">${a.active ? 'Pause' : 'Resume'}</button></form>
          <form method="post" action="/admin/ads/${a.id}/delete" onsubmit="return confirm('Delete this ad?')"><button class="btn btn-ghost btn-sm">Delete</button></form></td></tr>`).join('')
        : '<tr><td colspan="8" class="muted">No ads yet. Add your first one below.</td></tr>'}
    </tbody></table></div>

    <form method="post" action="/admin/ads" class="card" style="margin-top:12px;max-width:640px">
      <b style="display:block;margin-bottom:12px">Add an ad</b>
      ${adError ? `<div class="alert alert-error">${esc(adError)}</div>` : ''}
      <label class="field"><span>Title</span><input name="title" required maxlength="80" value="${v('title')}" placeholder="e.g. 20% off solar inverters this week"></label>
      <label class="field"><span>Short description (optional)</span><input name="body" maxlength="200" value="${v('body')}"></label>
      <label class="field"><span>Link (where the ad goes when clicked)</span><input name="link_url" type="url" required value="${v('link_url')}" placeholder="https://"></label>
      <label class="field"><span>Image (optional)</span><input name="image_url" value="${v('image_url')}" placeholder="https://… or /ads/banner.jpg">
        <small class="hint">A web address, or a file you put in the <code>public</code> folder. Wide images (about 800×350) look best.</small></label>
      <label class="field"><span>Button text</span><input name="cta" maxlength="30" value="${v('cta')}" placeholder="Learn more"></label>
      <label class="field"><span>Where should it show?</span><select name="slot">${adSlots.map((s) => `<option value="${s.id}" ${adValues.slot === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field"><span>Start date (optional)</span><input name="starts_on" type="date" value="${v('starts_on')}"></label>
        <label class="field"><span>End date (optional)</span><input name="ends_on" type="date" value="${v('ends_on')}"></label>
      </div>
      <button class="btn">Save ad</button>
    </form>`;
}

function kpi({ ic, label, value, sub = '', warn = false, tip = '' }) {
  return `<div class="card kpi${warn ? ' warn' : ''}"${tip ? ` data-tip="${esc(tip)}"` : ''}>
    <div class="kh"><span class="ib">${icon(ic, 16)}</span>${label}</div><div class="v">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}

function delta(now, before) {
  if (!before) return now ? '<b class="delta-up">New</b> vs yesterday' : 'No sales yesterday either';
  const pct = Math.round(((now - before) / before) * 100);
  return `<b class="${pct >= 0 ? 'delta-up' : 'delta-down'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</b> vs yesterday (${money(before)})`;
}

module.exports = {
  dashboard: (d) => {
    const { user, s, providerBalance, providerName, byCategory, orders, filter, q, users, fundings, feed, daily, sys, flash, demo } = d;
    const low = providerBalance != null && providerBalance < s.liabilities;
    const rate = s.success7 + s.failed7 ? Math.round((s.success7 / (s.success7 + s.failed7)) * 100) : null;
    const alerts = [
      s.pending && ['warn', 'clock', `${s.pending} order${s.pending === 1 ? ' is' : 's are'} still processing with the provider.`, '/admin?status=pending#orders', 'Review'],
      low && ['error', 'alert', `Provider balance (${money(providerBalance)}) is below what customers hold in wallets (${money(s.liabilities)}). Top up your provider account.`],
      providerBalance == null && ['error', 'alert', 'Could not fetch the provider balance. Check your provider API keys.'],
      sys.mismatches && ['error', 'alert', `${sys.mismatches} Paystack payment${sys.mismatches === 1 ? '' : 's'} had an amount mismatch and were not credited.`, '#fundings', 'View'],
    ].filter(Boolean);
    const qs = (extra) => { const p = new URLSearchParams({ ...(q && { q }), ...extra }); const t = p.toString(); return `/admin${t ? `?${t}` : ''}`; };

    return layout({ title: 'Admin dashboard', user, active: 'admin', wide: true, flash, demo, body: `
    <div class="adm-head">
      <div><h1>Admin dashboard</h1>
        <span class="chip chip-accent private">${icon('lock', 13)} Private: only ${esc(user.email)} can see this page</span></div>
      <div class="adm-tools no-print">
        <label class="toggle"><input type="checkbox" id="autoRefresh"> Auto-refresh every 30s</label>
        <a class="btn btn-ghost btn-sm" href="${esc(qs(filter ? { status: filter } : {}))}">${icon('refresh', 16)}Refresh</a>
      </div>
    </div>

    <nav class="adm-nav no-print" aria-label="Dashboard sections">
      <a href="#overview">${icon('admin', 16)}Overview</a><a href="#activity">${icon('activity', 16)}Activity</a>
      <a href="#orders">${icon('receipt', 16)}Orders${s.pending ? `<span class="count">${s.pending}</span>` : ''}</a>
      <a href="#fundings">${icon('wallet', 16)}Wallet top-ups</a><a href="#customers">${icon('users', 16)}Customers</a>
      <a href="#ads">${icon('megaphone', 16)}Ads</a><a href="#system">${icon('server', 16)}System</a>
    </nav>

    ${alerts.length ? `<div class="adm-alerts">${alerts.map(([t, ic, text, href, link]) => `<div class="alert alert-${t}">${icon(ic, 18)}<span>${text}</span>${href ? `<a href="${href}">${link} →</a>` : ''}</div>`).join('')}</div>` : ''}

    <section id="overview" style="scroll-margin-top:120px">
      <div class="kpis">
        ${kpi({ ic: 'coins', label: 'Sales today', value: money(s.salesToday), sub: `${s.countToday} orders · ${delta(s.salesToday, s.salesYesterday)}` })}
        ${kpi({ ic: 'admin', label: 'Sales, last 7 days', value: money(s.sales7), sub: `${s.count7} orders` })}
        ${kpi({ ic: 'bolt', label: 'Fees earned, 30 days', value: money(s.fees30), sub: 'Your service-fee revenue', tip: 'Sum of service fees on successful orders.\nSet fees with FEE_* in .env.' })}
        ${kpi({ ic: 'check', label: 'Success rate, 7 days', value: rate == null ? '—' : `${rate}%`, sub: `${s.success7} delivered · ${s.failed7} failed`, warn: rate != null && rate < 90 })}
        ${kpi({ ic: 'plus', label: 'Wallet funding today', value: money(s.fundedToday), sub: `${s.fundCountToday} top-up${s.fundCountToday === 1 ? '' : 's'}` })}
        ${kpi({ ic: 'wallet', label: 'Customer wallet balances', value: money(s.liabilities), sub: 'Money you owe customers' })}
        ${kpi({ ic: 'server', label: 'Provider balance', value: providerBalance == null ? '—' : money(providerBalance), warn: low || providerBalance == null,
          sub: providerBalance == null ? 'Unavailable' : low ? '<b class="delta-down">Below customer balances</b>' : 'Covers customer balances' })}
        ${kpi({ ic: 'users', label: 'Customers', value: s.customers.toLocaleString('en-NG'), sub: `<b class="${s.newToday ? 'delta-up' : ''}">+${s.newToday}</b> today · +${s.new7} this week` })}
      </div>
      <div class="grid-2" style="margin-top:14px">${salesChart(daily)}${categoryPanel(byCategory)}</div>
    </section>

    <section id="activity" class="grid-2" style="margin-top:14px;scroll-margin-top:120px">
      ${feedPanel(feed)}
      <div class="card panel"><div class="ph"><div><h3>Top customers</h3><span class="muted small">By spend, last 30 days</span></div></div>
        ${d.topCustomers.length ? `<ul class="feed">${d.topCustomers.map((c, i) => `<li><span class="ib">${i + 1}</span>
          <div class="mid"><b>${esc(c.name)}</b><small>${esc(c.email)}</small></div><div class="end">${money(c.spent)}<small class="muted" style="font-weight:500">${c.n} orders</small></div></li>`).join('')}</ul>`
          : '<p class="muted" style="margin:0">No purchases yet.</p>'}</div>
    </section>

    <form class="sec-title no-print" method="get" action="/admin" style="margin-top:34px;justify-content:flex-start">
      <div class="search">${icon('search', 18)}<input type="search" name="q" value="${esc(q)}" placeholder="Search name, email, phone, number or reference" aria-label="Search orders and customers"></div>
      ${filter ? `<input type="hidden" name="status" value="${esc(filter)}">` : ''}
      <button class="btn btn-sm">Search</button>${q ? `<a class="btn btn-ghost btn-sm" href="/admin${filter ? `?status=${filter}` : ''}">Clear</a>` : ''}
    </form>
    ${q ? `<p class="muted small" style="margin:-4px 0 0">Showing orders and customers matching <b>“${esc(q)}”</b>.</p>` : ''}

    <div class="sec-title" id="orders"><h2>Orders</h2>
      <nav class="tabs" style="margin:0">${[['', 'All'], ['pending', 'Processing'], ['failed', 'Failed'], ['success', 'Successful']]
        .map(([k, l]) => `<a href="${esc(qs(k ? { status: k } : {}))}#orders"${filter === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Customer</th><th>Service</th><th>Recipient</th><th class="num">Total</th><th>Status</th><th>Provider message</th><th></th></tr></thead><tbody>
      ${orders.length ? orders.map((o) => `<tr><td>${when(o.created_at)}</td><td>${esc(o.name)}<div class="small muted">${esc(o.email)}</div></td>
        <td>${esc(o.service_name)}${o.variation_name ? `<div class="small muted">${esc(o.variation_name)}</div>` : ''}</td>
        <td>${esc(o.biller)}${o.customer_name ? `<div class="small muted">${esc(o.customer_name)}</div>` : ''}</td>
        <td class="num">${money(o.total)}${o.fee ? `<div class="small muted">fee ${money(o.fee)}</div>` : ''}</td><td>${status(o.status, o.refunded)}</td>
        <td class="small muted" style="white-space:normal;max-width:240px">${esc(o.provider_message || '')}<div><code>${esc(o.request_id)}</code></div></td>
        <td>${['pending', 'processing'].includes(o.status) ? `<form method="post" action="/admin/orders/${o.id}/requery"><button class="btn btn-ghost btn-sm">Requery</button></form>` : ''}</td></tr>`).join('')
        : '<tr><td colspan="8" class="muted">No orders.</td></tr>'}
    </tbody></table></div>

    <div class="sec-title" id="fundings"><h2>Wallet top-ups</h2><span class="muted small">Latest 50 Paystack payments</span></div>
    <div class="table-wrap"><table style="min-width:640px"><thead><tr><th>Date</th><th>Customer</th><th class="num">Amount</th><th>Channel</th><th>Status</th><th>Reference</th></tr></thead><tbody>
      ${fundings.length ? fundings.map((f) => `<tr><td>${when(f.paid_at || f.created_at)}</td><td>${esc(f.name)}<div class="small muted">${esc(f.email)}</div></td>
        <td class="num">${money(f.amount)}</td><td>${esc(f.channel || '—')}</td>
        <td>${f.status === 'pending' ? '<span class="chip chip-neutral">Not completed</span>' : status(f.status)}</td><td class="small"><code>${esc(f.reference)}</code></td></tr>`).join('')
        : '<tr><td colspan="6" class="muted">No wallet top-ups yet.</td></tr>'}
    </tbody></table></div>

    <div class="sec-title" id="customers"><h2>Customers</h2><span class="muted small">${q ? 'Matching your search' : 'Newest first'}</span></div>
    <div class="table-wrap"><table style="min-width:680px"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th class="num">Balance</th><th class="num">Orders</th><th class="num">Spent</th><th>Joined</th></tr></thead><tbody>
      ${users.length ? users.map((u) => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${esc(u.phone)}</td><td class="num">${money(u.balance)}</td>
        <td class="num">${u.orders}</td><td class="num">${money(u.spent)}</td><td>${when(u.created_at)}</td></tr>`).join('')
        : '<tr><td colspan="7" class="muted">No customers found.</td></tr>'}
    </tbody></table></div>

    ${adsSection(d)}

    <div class="sec-title" id="system"><h2>System health</h2></div>
    ${systemPanel({ sys, providerName, providerBalance, s, demo })}` });
  },
};
