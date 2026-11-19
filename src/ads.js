// Ad spaces. Admins create ads on /admin; each page asks for the slots it shows.

const SLOTS = [
  { id: 'all', label: 'All ad spaces' },
  { id: 'landing', label: 'Landing page (visitors not logged in)' },
  { id: 'home', label: 'Home page (logged-in customers)' },
  { id: 'buy', label: 'Buy pages (below the form)' },
  { id: 'receipt', label: 'Receipts (after payment)' },
  { id: 'history', label: 'History page' },
  { id: 'wallet', label: 'Wallet page' },
];
const SLOT_IDS = new Set(SLOTS.map((s) => s.id));

const lagosToday = () => new Date(Date.now() + 3600000).toISOString().slice(0, 10);
const isUrl = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d));

function validate(input) {
  const t = (k, max) => String(input[k] ?? '').trim().slice(0, max);
  const ad = {
    title: t('title', 80), body: t('body', 200), image_url: t('image_url', 500), link_url: t('link_url', 500),
    cta: t('cta', 30) || 'Learn more', slot: SLOT_IDS.has(input.slot) ? input.slot : 'all',
    starts_on: t('starts_on', 10) || null, ends_on: t('ends_on', 10) || null,
  };
  if (!ad.title) return { error: 'Give the ad a title.' };
  if (!isUrl(ad.link_url)) return { error: 'Link must be a full web address starting with https://' };
  if (ad.image_url && !isUrl(ad.image_url) && !/^\/[\w\-/.]+$/.test(ad.image_url)) return { error: 'Image must be a web address (https://…) or a file in /public, e.g. /ads/banner.jpg' };
  if ((ad.starts_on && !isDate(ad.starts_on)) || (ad.ends_on && !isDate(ad.ends_on))) return { error: 'Dates must be valid.' };
  if (ad.starts_on && ad.ends_on && ad.ends_on < ad.starts_on) return { error: 'End date is before the start date.' };
  return { ad };
}

function create(db, input) {
  const { ad, error } = validate(input);
  if (error) return { error };
  db.prepare(`INSERT INTO ads (title, body, image_url, link_url, cta, slot, starts_on, ends_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(ad.title, ad.body || null, ad.image_url || null, ad.link_url, ad.cta, ad.slot, ad.starts_on, ad.ends_on);
  return { ok: true };
}

// One random running ad per requested slot (ads in 'all' can fill any slot). Counts an impression for each shown.
function pick(db, slots) {
  const today = lagosToday();
  const running = db.prepare(`SELECT * FROM ads WHERE active = 1
    AND (starts_on IS NULL OR starts_on <= ?) AND (ends_on IS NULL OR ends_on >= ?)`).all(today, today);
  const out = {};
  const used = new Set();
  for (const slot of slots) {
    let pool = running.filter((a) => a.slot === slot && !used.has(a.id));
    if (!pool.length) pool = running.filter((a) => a.slot === 'all' && !used.has(a.id));
    if (!pool.length) continue;
    const ad = pool[Math.floor(Math.random() * pool.length)];
    used.add(ad.id);
    out[slot] = ad;
  }
  const ids = [...used];
  if (ids.length) db.prepare(`UPDATE ads SET impressions = impressions + 1 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  return out;
}

// Records a click and returns where to send the visitor.
function click(db, id) {
  const ad = db.prepare('SELECT link_url FROM ads WHERE id = ?').get(id);
  if (!ad || !isUrl(ad.link_url)) return null;
  db.prepare('UPDATE ads SET clicks = clicks + 1 WHERE id = ?').run(id);
  return ad.link_url;
}

const list = (db) => db.prepare('SELECT * FROM ads ORDER BY active DESC, id DESC').all();
const toggle = (db, id) => db.prepare('UPDATE ads SET active = 1 - active WHERE id = ?').run(id);
const remove = (db, id) => db.prepare('DELETE FROM ads WHERE id = ?').run(id);

module.exports = { SLOTS, validate, create, pick, click, list, toggle, remove, lagosToday };
