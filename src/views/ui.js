const config = require('../config');
const { CATEGORIES } = require('../catalog');
const faq = require('./faq');

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (kobo) => `₦${((kobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const when = (v) => {
  if (!v) return '';
  const d = new Date(String(v).includes('T') ? v : `${String(v).replace(' ', 'T')}Z`);
  return isNaN(d) ? esc(v) : d.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

// Simple line icons (24×24, stroke = currentColor).
const P = {
  airtime: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  data: '<path d="M4 18V14M9 18V10M14 18V6M19 18V3"/>',
  electricity: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  tv: '<rect x="2.5" y="5" width="19" height="13" rx="2"/><path d="M8 21h8M12 18v3"/>',
  internet: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19M12 2.5c2.6 2.8 3.9 6 3.9 9.5s-1.3 6.7-3.9 9.5c-2.6-2.8-3.9-6-3.9-9.5S9.4 5.3 12 2.5z"/>',
  education: '<path d="M2 9l10-5 10 5-10 5L2 9z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6"/>',
  home: '<path d="M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19v4M3 7.5V18a2 2 0 0 0 2 2h15V9H5.5A2.5 2.5 0 0 1 3 7.5z"/><circle cx="16" cy="14.5" r="1.2"/>',
  admin: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  megaphone: '<path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  refund: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/><path d="M12 8v4l2.5 1.5"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',
  support: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19c0 1.5-2 2.5-5 2.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.1.7 3.5 2.8 3.5 5.7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.6-2.4-2.9-5.5-3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
};
const icon = (name, size = 24) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

const STATUS = {
  success: ['ok', 'Successful'], pending: ['warn', 'Processing'], processing: ['warn', 'Processing'],
  failed: ['bad', 'Failed'], draft: ['neutral', 'Not paid'], mismatch: ['bad', 'Amount mismatch'],
};
const status = (s, refunded) => {
  const [tone, label] = STATUS[s] || ['neutral', s];
  return `<span class="chip chip-${tone}">${label}${s === 'failed' && refunded ? ' · refunded' : ''}</span>`;
};

const CSS = `
:root{--bg:#f6f5fb;--surface:#fff;--surface-2:#f8f7fd;--text:#16132b;--muted:#625e7a;--border:#e8e5f3;
--accent:#5b3df5;--accent-strong:#4327d4;--accent-soft:#efebff;--accent-text:#fff;
--ok-bg:#e4f6ec;--ok:#0f7a45;--warn-bg:#fff3d9;--warn:#8a5800;--bad-bg:#fde8e7;--bad:#b42318;--neutral-bg:#efedf5;--neutral:#4d4963;
--hero:linear-gradient(135deg,#3f22cf 0%,#5b3df5 50%,#8b4dff 100%);--hero-solid:#4327d4;--hero-text:#fff;
--c-airtime:#ea580c;--c-data:#0284c7;--c-electricity:#d97706;--c-tv:#db2777;--c-internet:#0d9488;--c-education:#4f46e5;
--shadow:0 1px 2px rgba(22,19,43,.04),0 6px 20px rgba(22,19,43,.06);--shadow-lg:0 12px 40px rgba(67,39,212,.18);--radius:18px}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0e0c18;--surface:#17142a;--surface-2:#1e1a35;--text:#eceaf7;--muted:#a29dbd;
--border:#2b2745;--accent:#8f7bff;--accent-strong:#ab9cff;--accent-soft:#251f48;--accent-text:#0e0c18;
--ok-bg:#11301f;--ok:#6fdca5;--warn-bg:#33270f;--warn:#f3c86d;--bad-bg:#3a1714;--bad:#f6a197;--neutral-bg:#24213a;--neutral:#bdb8d4;
--hero:linear-gradient(135deg,#2a1793 0%,#4327d4 55%,#6d3be0 100%);--hero-solid:#2f1ba3;
--c-airtime:#fb923c;--c-data:#38bdf8;--c-electricity:#fbbf24;--c-tv:#f472b6;--c-internet:#2dd4bf;--c-education:#818cf8;
--shadow:none;--shadow-lg:0 12px 40px rgba(0,0,0,.4)}}
.c-airtime{--c:var(--c-airtime)}.c-data{--c:var(--c-data)}.c-electricity{--c:var(--c-electricity)}.c-tv{--c:var(--c-tv)}.c-internet{--c:var(--c-internet)}.c-education{--c:var(--c-education)}
*{box-sizing:border-box}[hidden]{display:none!important}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 "Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}
body>main{flex:1 0 auto;width:100%}
a{color:var(--accent)}button,input,select{font:inherit;color:inherit}.ic{flex:none;display:block}
.top{background:color-mix(in srgb,var(--surface) 88%,transparent);backdrop-filter:saturate(1.4) blur(10px);-webkit-backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:5}
.top .in{max-width:1120px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:12px}
.brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:1.12rem;text-decoration:none;color:var(--text);margin-right:auto;letter-spacing:-.01em}
.brand i{width:32px;height:32px;border-radius:10px;background:var(--hero);color:#fff;display:grid;place-items:center;font-style:normal;font-size:.95rem;box-shadow:0 4px 12px rgba(91,61,245,.35)}
.links{display:none;gap:2px}.links a{text-decoration:none;color:var(--muted);padding:8px 12px;border-radius:10px;font-weight:600}
.links a:hover,.links a[aria-current]{color:var(--accent-strong);background:var(--accent-soft)}
.balance-chip{display:flex;align-items:center;gap:6px;text-decoration:none;color:var(--accent-strong);background:var(--accent-soft);padding:6px 12px;border-radius:999px;font-weight:700;font-variant-numeric:tabular-nums}
.top .guest-link{display:none;color:var(--muted);text-decoration:none;font-weight:600}
@media (min-width:600px){.top .guest-link{display:inline}}
.tabbar{position:fixed;bottom:0;left:0;right:0;background:var(--surface);border-top:1px solid var(--border);display:flex;z-index:5;padding-bottom:env(safe-area-inset-bottom)}
.tabbar a{flex:1;display:grid;justify-items:center;gap:2px;padding:9px 0 8px;font-size:.72rem;color:var(--muted);text-decoration:none;font-weight:600}
.tabbar a[aria-current]{color:var(--accent)}
body.has-tabbar{padding-bottom:calc(64px + env(safe-area-inset-bottom))}
@media (min-width:760px){.links{display:flex}.tabbar{display:none}body.has-tabbar{padding-bottom:0}}
.demo{background:var(--warn-bg);color:var(--warn);text-align:center;font-size:.85rem;padding:6px 16px;font-weight:600}
main{max-width:640px;margin:0 auto;padding:22px 16px}main.wide{max-width:1120px}
h1{font-size:1.5rem;line-height:1.25;margin:0 0 4px;letter-spacing:-.02em;font-weight:800}h2{font-size:1.08rem;margin:30px 0 12px;font-weight:750;letter-spacing:-.01em}
.muted{color:var(--muted)}.small{font-size:.86rem}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow)}
.hero{position:relative;overflow:hidden;background:var(--hero);color:var(--hero-text);border-radius:22px;padding:22px;display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;box-shadow:var(--shadow-lg)}
.hero::after{content:"";position:absolute;right:-60px;top:-80px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.18),transparent 70%);pointer-events:none}
.hero>*{position:relative;z-index:1}
.hero .k{opacity:.85;font-size:.9rem}.hero .v{font-size:2.1rem;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.2}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}
.tile{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px 8px 14px;text-decoration:none;color:var(--text);
display:grid;justify-items:center;gap:8px;text-align:center;font-weight:700;font-size:.9rem;box-shadow:var(--shadow);transition:transform .15s,border-color .15s,box-shadow .15s}
.tile:hover{border-color:var(--c,var(--accent));transform:translateY(-2px);box-shadow:0 10px 24px color-mix(in srgb,var(--c,var(--accent)) 18%,transparent)}
.tile .ib,.list .ib,.svc .ib{background:color-mix(in srgb,var(--c,var(--accent)) 14%,var(--surface));color:var(--c,var(--accent))}
.cat-badge{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--c) 14%,var(--surface));color:var(--c)}
.tile .ib{width:48px;height:48px;border-radius:15px;display:grid;place-items:center}
.tile small{display:none;color:var(--muted);font-weight:500;font-size:.76rem;line-height:1.3}
@media (min-width:560px){.tile small{display:block}.tile{padding:20px 12px}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:12px;padding:13px 20px;font-weight:700;cursor:pointer;
text-decoration:none;background:var(--accent);color:var(--accent-text);min-height:48px;transition:filter .15s,transform .15s;box-shadow:0 4px 14px color-mix(in srgb,var(--accent) 30%,transparent)}
.btn:hover{filter:brightness(1.08)}.btn:active{transform:translateY(1px)}
.btn:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}.btn-block{width:100%}.btn-light{background:#fff;color:#4327d4;box-shadow:0 6px 18px rgba(0,0,0,.15)}
.btn-ghost{background:var(--surface);color:var(--text);border:1px solid var(--border);box-shadow:none}.btn-ghost:hover{border-color:var(--accent);color:var(--accent-strong);filter:none}
.btn-sm{min-height:36px;padding:7px 13px;font-size:.9rem;border-radius:10px}
.linkbtn{background:none;border:0;padding:0;color:var(--muted);cursor:pointer;font-weight:600}
.field{display:grid;gap:6px;margin-bottom:16px}.field>span{font-weight:650;font-size:.92rem}.field .hint{font-size:.82rem;color:var(--muted)}
.field.err input,.field.err select{border-color:var(--bad)}.field .msg{color:var(--bad);font-size:.85rem;font-weight:600}
.numeric-warning{display:block;color:var(--bad);font-size:.85rem;font-weight:600}
.numeric-warning:empty{display:none}
input.numeric-limit,input.numeric-limit:focus{border-color:var(--bad)}
input,select{width:100%;min-height:50px;padding:12px 14px;border:1.5px solid var(--border);border-radius:12px;background:var(--surface);font-size:1.02rem}
input:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.money-in{position:relative}.money-in::before{content:"₦";position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);font-weight:650}
.money-in input{padding-left:32px;font-weight:650}
.opts{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.opt{position:relative}.opt input{position:absolute;opacity:0;inset:0;min-height:0;cursor:pointer}
.opt span{display:flex;flex-direction:column;align-items:center;gap:6px;border:1.5px solid var(--border);border-radius:14px;padding:12px 6px;
font-weight:650;font-size:.9rem;text-align:center;background:var(--surface);height:100%;transition:border-color .15s}
.opt b{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-strong);font-size:.85rem}
.opt input:checked+span{border-color:var(--accent);background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent)}
.opt input:checked+span b{background:var(--accent);color:var(--accent-text)}
.opt input:focus-visible+span{outline:3px solid var(--accent-soft)}
.seg{display:flex;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:4px;gap:4px}
.seg label{flex:1;position:relative}.seg input{position:absolute;opacity:0;inset:0;min-height:0}
.seg span{display:block;text-align:center;padding:9px;border-radius:9px;font-weight:650;font-size:.92rem;cursor:pointer}
.seg input:checked+span{background:var(--surface);box-shadow:0 1px 4px rgba(22,19,43,.1);color:var(--accent-strong)}
.quick{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.quick button{border:1px solid var(--border);background:var(--surface);border-radius:999px;padding:6px 14px;cursor:pointer;font-weight:600;font-size:.9rem}
.quick button:hover{border-color:var(--accent);color:var(--accent-strong);background:var(--accent-soft)}
.recent{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:16px}
.recent button{flex:none;text-align:left;border:1px solid var(--border);background:var(--surface);border-radius:12px;padding:8px 12px;cursor:pointer}
.recent button b{display:block;font-size:.88rem}.recent button small{color:var(--muted);font-size:.78rem}
.alert{padding:12px 14px;border-radius:12px;margin-bottom:16px;font-weight:550}.alert-error{background:var(--bad-bg);color:var(--bad)}
.alert-ok{background:var(--ok-bg);color:var(--ok)}.alert-warn{background:var(--warn-bg);color:var(--warn)}
.rows{margin:0}.rows div{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px solid var(--border)}
.rows div:last-child{border-bottom:0}.rows dt{color:var(--muted)}.rows dd{margin:0;font-weight:650;text-align:right;overflow-wrap:anywhere}
.rows .total dd{font-size:1.15rem}
.verified{display:flex;gap:10px;align-items:center;background:var(--ok-bg);color:var(--ok);border-radius:12px;padding:12px 14px;margin-bottom:14px}
.verified b{display:block;color:var(--text)}
.list{list-style:none;margin:0;padding:0}.list li{border-bottom:1px solid var(--border)}.list li:last-child{border-bottom:0}
.list a,.list .row{display:flex;align-items:center;gap:12px;padding:12px 4px;text-decoration:none;color:var(--text)}
.list a:hover .mid b{color:var(--accent-strong)}
.list .ib{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;flex:none}
.list .mid{flex:1;min-width:0}.list .mid b{display:block;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.list .mid small{color:var(--muted)}.list .end{text-align:right;display:grid;justify-items:end;gap:3px;font-weight:700;font-variant-numeric:tabular-nums}
.chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:.74rem;font-weight:700;white-space:nowrap}
.chip-ok{background:var(--ok-bg);color:var(--ok)}.chip-warn{background:var(--warn-bg);color:var(--warn)}.chip-bad{background:var(--bad-bg);color:var(--bad)}
.chip-neutral{background:var(--neutral-bg);color:var(--neutral)}.chip-accent{background:var(--accent-soft);color:var(--accent-strong)}
.receipt-head{text-align:center;padding:8px 0 14px}.receipt-head .big{width:68px;height:68px;border-radius:50%;display:grid;place-items:center;margin:0 auto 10px}
.big.ok{background:var(--ok-bg);color:var(--ok)}.big.warn{background:var(--warn-bg);color:var(--warn)}.big.bad{background:var(--bad-bg);color:var(--bad)}
.receipt-head .amt{font-size:2rem;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.token{background:var(--accent-soft);border:1.5px dashed var(--accent);border-radius:14px;padding:14px;margin:6px 0 16px;text-align:center}
.token pre{margin:4px 0 10px;font:700 1.25rem/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;word-break:break-all;letter-spacing:.04em}
.tabs{display:flex;gap:6px;overflow-x:auto;margin-bottom:12px}.tabs a{flex:none;text-decoration:none;color:var(--muted);padding:7px 14px;border-radius:999px;border:1px solid var(--border);font-weight:600;font-size:.9rem;background:var(--surface)}
.tabs a:hover{color:var(--accent-strong);border-color:var(--accent)}
.tabs a[aria-current]{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}
.stats{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}.stat .k{color:var(--muted);font-size:.85rem}
.stat .v{font-size:1.4rem;font-weight:750;font-variant-numeric:tabular-nums}
.table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow)}
table{border-collapse:collapse;width:100%;min-width:720px;font-size:.9rem}th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--border);white-space:nowrap;vertical-align:top}
th{font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);background:var(--surface-2);font-weight:700}tr:last-child td{border-bottom:0}
tbody tr:hover td{background:var(--surface-2)}.num{text-align:right;font-variant-numeric:tabular-nums}
.backlink{display:inline-flex;align-items:center;gap:4px;color:var(--muted);text-decoration:none;font-weight:600;margin-bottom:10px}.backlink:hover{color:var(--accent)}
.stack-sm>*+*{margin-top:10px}
.estimator{border-top:1px solid var(--border);margin:6px 0 16px;padding-top:16px}
.estimator-head{display:flex;align-items:center;gap:8px;margin-bottom:12px;color:var(--c-electricity)}.estimator-head b{color:var(--text)}
.estimator-head small{margin-left:auto}
.estimate{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:var(--accent-soft);border-radius:14px;padding:14px}
.estimate small{display:block;color:var(--muted);font-size:.78rem}.estimate b{font-variant-numeric:tabular-nums;font-size:1rem}
.estimate .recharge b{color:var(--c-electricity)}
.estimate p{grid-column:1/-1;margin:0;font-size:.8rem;color:var(--muted)}
@media (max-width:560px){.estimate{grid-template-columns:1fr 1fr}}
.appliances{margin:-4px 0 16px}
.appl-row{display:grid;grid-template-columns:minmax(0,2.4fr) repeat(3,minmax(0,1fr)) 36px;gap:6px;align-items:end;margin-bottom:8px}
.appl-row label{display:grid;gap:3px;min-width:0}.appl-row label span{font-size:.72rem;color:var(--muted);font-weight:600}
.appl-row input{min-height:42px;padding:8px 10px;font-size:.95rem}
.appl-remove{height:42px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--muted);font-size:1.2rem;cursor:pointer}
.appl-remove:hover{color:var(--bad);border-color:var(--bad)}
.appl-row+.appl-row label span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.appl-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
@media (max-width:480px){.appl-row{grid-template-columns:1fr 1fr 1fr 36px}.appl-row label:first-child{grid-column:1/-1}
  .appl-row+.appl-row label span{position:static;width:auto;height:auto;clip:auto}.appl-row{padding-bottom:8px;border-bottom:1px dashed var(--border)}}

/* ---- Landing ---- */
.landing-hero{display:grid;gap:28px;padding:36px 24px;align-items:center}
@media (min-width:880px){.landing-hero{grid-template-columns:1.15fr .85fr;padding:52px 48px}}
.landing-hero h1{font-size:clamp(1.9rem,5vw,2.9rem);margin:14px 0 12px;line-height:1.12;letter-spacing:-.03em}
.landing-hero p{opacity:.9;margin:0 0 22px;max-width:540px;font-size:1.04rem}
.pill{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);padding:5px 13px;border-radius:999px;font-size:.8rem;font-weight:650}
.cta-row{display:flex;gap:10px;flex-wrap:wrap}
.btn-outline-light{background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.45);box-shadow:none}.btn-outline-light:hover{background:rgba(255,255,255,.1)}
.trust{list-style:none;padding:0;margin:22px 0 0;display:flex;flex-wrap:wrap;gap:8px 18px;font-size:.88rem;opacity:.92}
.trust li{display:flex;align-items:center;gap:6px}
.preview{display:none;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);border-radius:22px;padding:18px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
@media (min-width:880px){.preview{display:block}}
.preview .bal{background:#fff;color:var(--text);border-radius:16px;padding:16px;margin-bottom:12px}
.preview .bal small{color:var(--muted)}.preview .bal b{display:block;font-size:1.6rem;letter-spacing:-.02em}
.preview .mini{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.preview .mini span{background:rgba(255,255,255,.92);color:var(--c);border-radius:14px;padding:12px 4px;display:grid;justify-items:center;gap:4px;font-size:.74rem;font-weight:700}
.preview .mini span em{font-style:normal;color:var(--text)}
.preview .tok{margin-top:12px;background:rgba(255,255,255,.92);color:var(--text);border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:10px;font-size:.85rem}
.preview .tok i{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:var(--ok-bg);color:var(--ok);flex:none}
.preview .tok code{display:block;font-weight:700;letter-spacing:.04em}
.sec{margin-top:56px}
.sec-head{text-align:center;max-width:620px;margin:0 auto 22px}
.sec-head h2{font-size:clamp(1.35rem,3.5vw,1.85rem);margin:6px 0 8px;letter-spacing:-.02em;font-weight:800}
.sec-head p{margin:0;color:var(--muted)}
.eyebrow{display:inline-block;font-size:.76rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-strong);background:var(--accent-soft);padding:4px 12px;border-radius:999px}
.services{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
@media (max-width:360px){.services{grid-template-columns:1fr}}
.svc{position:relative;display:flex;flex-direction:column;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;
text-decoration:none;color:var(--text);box-shadow:var(--shadow);transition:transform .15s,border-color .15s,box-shadow .15s;overflow:hidden}
.svc::before{content:"";position:absolute;inset:0 0 auto;height:4px;background:var(--c)}
.svc:hover{transform:translateY(-3px);border-color:var(--c);box-shadow:0 14px 32px color-mix(in srgb,var(--c) 20%,transparent)}
.svc .top-row{display:flex;align-items:center;gap:12px}
.svc .ib{width:50px;height:50px;border-radius:15px;display:grid;place-items:center;flex:none}
.svc h3{margin:0;font-size:1.1rem;font-weight:750}.svc .top-row p{margin:2px 0 0;color:var(--muted);font-size:.88rem;line-height:1.35}
.prov{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.prov li{background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:3px 10px;font-size:.78rem;font-weight:650;color:var(--muted)}
.svc .go{margin-top:auto;display:flex;align-items:center;gap:6px;font-weight:700;font-size:.9rem;color:var(--c)}
.svc:hover .go .ic{transform:translateX(3px)}.svc .go .ic{transition:transform .15s}
.features{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.feature .ib{width:44px;height:44px;border-radius:13px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;margin-bottom:12px}
.feature b{display:block;font-size:1.02rem}.feature p{margin:6px 0 0;color:var(--muted);font-size:.9rem}
.steps{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-top:12px}.steps b{display:block;margin-bottom:4px}
.step{position:relative}.num-badge{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:var(--hero);color:#fff;font-weight:800;font-size:.9rem;margin-bottom:12px}
.tag{background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:2px 10px;font-size:.8rem;font-weight:600}
.faq{padding:4px 20px;max-width:780px;margin:0 auto}.faq details{border-bottom:1px solid var(--border);padding:16px 0}.faq details:last-child{border-bottom:0}
.faq summary{cursor:pointer;font-weight:700;list-style:none;display:flex;justify-content:space-between;gap:12px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--accent);font-size:1.3rem;line-height:1;font-weight:500}.faq details[open] summary::after{content:"−"}
.faq p{margin:8px 0 0;color:var(--muted)}
.cta-final{margin-top:48px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;background:var(--hero);color:#fff;border:0;padding:28px;box-shadow:var(--shadow-lg)}
.cta-final b{display:block;font-size:1.2rem;margin-bottom:2px}.cta-final .muted{color:rgba(255,255,255,.85)}

/* ---- Ads ---- */
.ad{display:block;margin:18px 0}
.ad>a{display:flex;align-items:center;gap:14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px;text-decoration:none;color:var(--text);box-shadow:var(--shadow)}
.ad>a:hover{border-color:var(--accent)}
.ad img{width:96px;height:72px;object-fit:cover;border-radius:10px;flex:none;background:var(--surface-2)}
.ad .ad-ic{width:48px;height:48px;border-radius:12px;background:var(--accent-soft);color:var(--accent-strong);display:grid;place-items:center;flex:none}
.ad .ad-txt{flex:1;min-width:0;display:grid;gap:1px}.ad .ad-txt span{color:var(--muted);font-size:.88rem;line-height:1.35}
.ad .ad-tag{font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:700}
.ad .btn{flex:none}
@media (max-width:480px){.ad>a{flex-wrap:wrap}.ad img{width:100%;height:auto;aspect-ratio:16/7}.ad .btn{width:100%}}
.ad-empty{display:flex;align-items:center;gap:12px;border:2px dashed var(--border);border-radius:var(--radius);padding:14px;color:var(--muted);text-decoration:none}
.ad-empty b{display:block;color:var(--text)}.ad-empty small{font-size:.8rem}

/* ---- Footer ---- */
.foot{flex:none;margin-top:56px;background:var(--surface);border-top:1px solid var(--border);font-size:.9rem;color:var(--muted)}
.foot .in{max-width:1120px;margin:0 auto;padding:32px 16px;display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
.foot .brand{margin:0 0 8px}.foot p{margin:0;max-width:280px}
.foot h4{margin:0 0 10px;font-size:.76rem;text-transform:uppercase;letter-spacing:.07em;color:var(--text)}
.foot ul{list-style:none;margin:0;padding:0;display:grid;gap:7px}.foot ul a{color:var(--muted);text-decoration:none}.foot ul a:hover{color:var(--accent)}
.foot .bottom{border-top:1px solid var(--border);padding:14px 16px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;font-size:.8rem;max-width:1120px;margin:0 auto}

/* ---- Admin dashboard ---- */
.adm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px}
.adm-head .private{display:inline-flex;align-items:center;gap:6px;margin-top:6px}
.adm-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.adm-tools label.toggle{display:flex;align-items:center;gap:8px;font-size:.88rem;font-weight:600;color:var(--muted);cursor:pointer}
.adm-tools label.toggle input{width:18px;height:18px;min-height:0;accent-color:var(--accent)}
.adm-nav{position:sticky;top:57px;z-index:4;display:flex;gap:6px;overflow-x:auto;padding:8px 0;margin-bottom:8px;background:var(--bg)}
.adm-nav a{flex:none;text-decoration:none;color:var(--muted);padding:7px 13px;border-radius:10px;font-weight:650;font-size:.88rem;display:flex;align-items:center;gap:6px}
.adm-nav a:hover{background:var(--accent-soft);color:var(--accent-strong)}
.adm-nav .count{background:var(--warn-bg);color:var(--warn);border-radius:999px;padding:0 7px;font-size:.72rem}
.adm-alerts{display:grid;gap:8px;margin-bottom:14px}.adm-alerts .alert{margin:0;display:flex;align-items:center;gap:10px}
.adm-alerts .alert a{margin-left:auto;font-weight:700;color:inherit;white-space:nowrap}
.kpis{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.kpi{display:flex;flex-direction:column;gap:4px;position:relative}
.kpi .kh{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:.85rem;font-weight:600}
.kpi .kh .ib{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-strong)}
.kpi .v{font-size:1.6rem;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.25}
.kpi .sub{font-size:.82rem;color:var(--muted)}.kpi .sub b{font-weight:700}
.delta-up{color:var(--ok)}.delta-down{color:var(--bad)}
.kpi.warn{border-color:color-mix(in srgb,var(--bad) 45%,var(--border))}
.grid-2{display:grid;gap:14px;grid-template-columns:1fr}
@media (min-width:900px){.grid-2{grid-template-columns:1.6fr 1fr}}
.panel h3{margin:0 0 2px;font-size:1rem;font-weight:750}.panel .ph{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.chart{position:relative;padding-left:52px}
.chart .grid{position:absolute;left:52px;right:0;top:0;height:200px;pointer-events:none}
.chart .grid div{position:absolute;left:0;right:0;border-top:1px solid var(--border)}
.chart .grid span{position:absolute;right:calc(100% + 8px);transform:translateY(-50%);font-size:.72rem;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.bars{position:relative;display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2px;height:200px;align-items:end}
.bars .col{height:100%;display:flex;align-items:flex-end;justify-content:center;cursor:default;border-radius:6px;outline:none}
.bars .col:hover,.bars .col:focus-visible{background:var(--surface-2)}
.bars .bar{width:min(70%,28px);background:var(--accent);border-radius:4px 4px 0 0;min-height:0}
.bars .col.today .bar{background:var(--accent-strong)}
.xlabels{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2px;margin-top:6px;font-size:.72rem;color:var(--muted);text-align:center;border-top:1px solid var(--border);padding-top:6px}
.xlabels span:nth-child(even){visibility:hidden}
@media (min-width:700px){.xlabels span:nth-child(even){visibility:visible}}
.hbars{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.hbars .lbl{display:flex;justify-content:space-between;gap:8px;font-size:.88rem;margin-bottom:6px}
.hbars .lbl b{display:flex;align-items:center;gap:8px}.hbars .lbl .ib{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:color-mix(in srgb,var(--c) 14%,var(--surface));color:var(--c)}
.hbars .lbl span{color:var(--muted);font-variant-numeric:tabular-nums}.hbars .lbl span strong{color:var(--text)}
.hbars .track{height:8px;border-radius:999px;background:var(--surface-2);overflow:hidden}
.hbars .fill{height:100%;background:var(--accent);border-radius:999px}
.feed{list-style:none;margin:0;padding:0}
.feed li{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)}.feed li:last-child{border-bottom:0}
.feed .ib{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--c,var(--accent)) 14%,var(--surface));color:var(--c,var(--accent))}
.feed .mid{flex:1;min-width:0;font-size:.9rem}.feed .mid small{display:block;color:var(--muted);font-size:.78rem}
.feed .end{text-align:right;display:grid;justify-items:end;gap:3px;font-weight:700;font-size:.88rem;font-variant-numeric:tabular-nums}
.sys{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.sys .card{display:flex;align-items:center;gap:12px;padding:14px 16px}
.sys .dot{width:10px;height:10px;border-radius:50%;flex:none}.dot.ok{background:var(--ok)}.dot.warn{background:var(--warn)}.dot.bad{background:var(--bad)}
.sys b{display:block;font-size:.92rem}.sys small{color:var(--muted);font-size:.8rem}
.search{position:relative;flex:1;min-width:220px;max-width:420px}.search .ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted)}
.search input{padding-left:38px;min-height:42px;font-size:.95rem}
.sec-title{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:34px 0 12px;scroll-margin-top:120px}
.sec-title h2{margin:0}
.tip{position:fixed;z-index:50;pointer-events:none;background:var(--text);color:var(--surface);padding:7px 10px;border-radius:9px;font-size:.8rem;line-height:1.35;box-shadow:0 6px 20px rgba(0,0,0,.2);max-width:240px;white-space:pre-line}
.help-launcher{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:6}
.help-launcher[hidden]{display:none}
#help-chat{position:fixed;inset:auto 16px calc(16px + env(safe-area-inset-bottom)) auto;margin:0;width:min(390px,calc(100% - 32px));max-height:calc(100dvh - 32px - env(safe-area-inset-bottom));padding:16px;border:1px solid var(--border);border-radius:16px;background:var(--surface);color:var(--text);box-shadow:0 12px 36px #0003}
#help-chat[open]{display:flex;flex-direction:column;gap:12px}
#help-chat::backdrop{background:#0005}
.help-head,.help-form{display:flex;align-items:center;justify-content:space-between;gap:8px}
.help-head h2{margin:0;font-size:1.1rem}
.help-log{min-height:0;max-height:240px;overflow:auto;overflow-wrap:anywhere}
.help-log p{margin:0 0 8px;padding:8px 10px;border-radius:8px;background:var(--bg)}
.help-log .help-user{background:var(--accent-soft)}
.help-log a{text-decoration:underline}
.help-prompts{display:flex;flex-wrap:wrap;gap:6px}
.help-head button,.help-prompts button{border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;font-size:.8rem;padding:6px 8px;cursor:pointer}
.help-form input{flex:1;min-width:0}
@media(max-width:759px){
  .has-tabbar .help-launcher,.has-tabbar #help-chat{bottom:calc(68px + env(safe-area-inset-bottom))}
  .has-tabbar #help-chat{max-height:calc(100dvh - 84px - env(safe-area-inset-bottom))}
}
@media print{.top,.tabbar,.demo,.no-print,.foot{display:none!important}body{padding:0}.card{box-shadow:none;border:0}}
`;

// An ad space. Empty spaces are invisible to customers; admins see a placeholder so they know where ads will appear.
function adSlot(ads, slot, user) {
  const ad = ads?.[slot];
  if (!ad) {
    return user?.isAdmin ? `<a class="ad ad-empty no-print" href="/admin#ads">${icon('megaphone', 20)}<span><b>Ad space: ${esc(slot)}</b>
      <small>Only admins see this. Add an ad in Admin to show it here.</small></span></a>` : '';
  }
  return `<aside class="ad no-print" aria-label="Advertisement">
    <a href="/ads/${ad.id}/click" target="_blank" rel="sponsored noopener">
      ${ad.image_url ? `<img src="${esc(ad.image_url)}" alt="" loading="lazy">` : `<span class="ad-ic">${icon('megaphone', 22)}</span>`}
      <span class="ad-txt"><small class="ad-tag">Sponsored</small><b>${esc(ad.title)}</b>${ad.body ? `<span>${esc(ad.body)}</span>` : ''}</span>
      <span class="btn btn-sm">${esc(ad.cta || 'Learn more')}</span>
    </a></aside>`;
}

function footer(user, demo) {
  const links = (rows) => `<ul>${rows.map(([h, l]) => `<li><a href="${esc(h)}">${esc(l)}</a></li>`).join('')}</ul>`;
  const account = user ? [['/', 'Home'], ['/orders', 'History'], ['/wallet', 'Fund wallet']] : [['/login', 'Log in'], ['/register', 'Create account']];
  const phone = config.supportPhone.replace(/[^\d+]/g, '').replace(/^(?:\+234|234(?=\d{10}$)|0)/, '');
  const supportPhone = phone ? (phone.startsWith('+') ? phone : `+234${phone}`) : '';
  const support = [
    config.supportEmail && [`mailto:${config.supportEmail}`, config.supportEmail],
    config.supportEmail && [`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(config.supportEmail)}`, 'Email support in Gmail'],
    supportPhone && [`tel:${supportPhone}`, supportPhone],
    config.supportEmail && [`mailto:${config.supportEmail}?subject=${encodeURIComponent(`Advertising on ${config.appName}`)}`, 'Advertise with us'],
  ].filter(Boolean);
  return `<footer class="foot">
  <div class="in">
    <div><a class="brand" href="/"><i>${esc(config.appName[0])}</i>${esc(config.appName)}</a>
      <p>Airtime, data, electricity, TV and exam PINs, paid in seconds. Failed purchases are refunded automatically.</p></div>
    <div><h4>Services</h4>${links(CATEGORIES.map((c) => [`/buy/${c.id}`, c.name]))}</div>
    <div><h4>Account</h4>${links(account)}</div>
    <div><h4>Support</h4>${support.length ? links(support) : ''}
      ${supportPhone && config.supportEmail ? `<p id="support-phone-email" hidden>On a computer, you can <a href="mailto:${esc(config.supportEmail)}">email support</a>.</p>` : ''}
      <p style="margin-top:${support.length ? 8 : 0}px">Problem with a payment? Quote the reference on your receipt.</p></div>
  </div>
  <div class="bottom"><span>© ${new Date().getFullYear()} ${esc(config.appName)}. All rights reserved.</span>
    <span>${demo ? 'Demo mode · ' : ''}Payments secured by Paystack</span></div>
</footer>`;
}

function helpChat() {
  const answers = faq.map(([question, answer, pattern]) => [question, answer, pattern.source]);
  const prompts = [faq[1], faq[2], ...faq.slice(-2)];
  return `<div class="help-chat no-print">
    <button type="button" class="btn help-launcher" aria-haspopup="dialog" aria-controls="help-chat" hidden>Help</button>
    <dialog id="help-chat" aria-labelledby="help-title" data-answers="${esc(JSON.stringify(answers))}">
      <div class="help-head"><h2 id="help-title">Help chat</h2><button type="button" data-help-close>Close</button></div>
      <div class="help-log" role="log" aria-label="Conversation">
        <p>Ask a question about using ${esc(config.appName)}.</p>
      </div>
      <div class="help-prompts">${prompts.map(([question]) => `<button type="button" data-help-question>${esc(question)}</button>`).join('')}</div>
      <form class="help-form">
        <input type="text" aria-label="Your question" placeholder="Type a question" maxlength="240" required>
        <button class="btn btn-sm" type="submit">Send</button>
      </form>
      ${config.supportEmail ? `<template><a href="mailto:${esc(config.supportEmail)}">Email support</a></template>` : ''}
    </dialog>
  </div>`;
}

function layout({ title, user, body, active, wide = false, flash, demo = false, head = '', showFooter = true }) {
  const nav = [['/', 'home', 'Home'], ['/orders', 'history', 'History'], ['/wallet', 'wallet', 'Wallet']];
  if (user?.isAdmin) nav.push(['/admin', 'admin', 'Admin']);
  const cur = (k) => (k === active ? ' aria-current="page"' : '');
  return `<!DOCTYPE html><html lang="en" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#252052">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700;800&display=swap">
<title>${esc(title)} · ${esc(config.appName)}</title><style>${CSS}</style><link rel="stylesheet" href="/design.css">${head}</head><body${user ? ' class="has-tabbar"' : ''}>
<header class="top"><div class="in">
  <a class="brand" href="/"><i>${esc(config.appName[0])}</i>${esc(config.appName)}</a>
  ${user ? `<nav class="links">${nav.map(([h, k, l]) => `<a href="${h}"${cur(k)}>${l}</a>`).join('')}</nav>
    <a class="balance-chip" href="/wallet" title="Wallet balance">${icon('wallet', 18)}${money(user.balance)}</a>
    <form method="post" action="/logout" class="no-print"><button class="linkbtn small">Log out</button></form>`
    : '<a href="/#services" class="guest-link">Services</a><a href="/login" class="linkbtn">Log in</a><a class="btn btn-sm" href="/register">Sign up</a>'}
</div></header>
${demo ? '<div class="demo">Demo mode: purchases are simulated and nothing real is delivered.</div>' : ''}
<main class="${wide ? 'wide' : ''}">${flash ? `<div class="alert alert-${esc(flash.type)}">${esc(flash.text)}</div>` : ''}${body}</main>
${showFooter ? footer(user, demo) : ''}
${helpChat()}
${user ? `<nav class="tabbar">${nav.map(([h, k, l]) => `<a href="${h}"${cur(k)}>${icon(k, 22)}${l}</a>`).join('')}</nav>` : ''}
<script src="/app.js" defer></script></body></html>`;
}

module.exports = { esc, money, when, icon, status, layout, adSlot };
