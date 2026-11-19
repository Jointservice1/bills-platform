// Electricity estimate: how many kWh a prepaid purchase buys, and roughly when it will run out.
// These are estimates for the customer. The DisCo decides the real units (shown on the token receipt).

const config = require('./config');

const VAT = 0.075; // 7.5% VAT is deducted from the amount before units are calculated.

const BANDS = [
  { id: 'A', label: 'Band A', supply: '20+ hours of light daily' },
  { id: 'B', label: 'Band B', supply: '16–20 hours daily' },
  { id: 'C', label: 'Band C', supply: '12–16 hours daily' },
  { id: 'D', label: 'Band D', supply: '8–12 hours daily' },
  { id: 'E', label: 'Band E', supply: '4–8 hours daily' },
];

// Typical daily consumption, in kWh.
const USAGE = [
  { id: 'low', label: 'Light use', hint: 'Bulbs, fans, TV, phone charging', kwh: 3 },
  { id: 'medium', label: 'Average home', hint: 'Plus a fridge, pressing iron, decoder', kwh: 6 },
  { id: 'high', label: 'Heavy use', hint: 'Plus AC, freezer or water heater', kwh: 15 },
];

// Common household appliances: typical running watts and hours used per day.
// Customers can change both; these only pre-fill the form.
const APPLIANCES = [
  { name: 'LED bulb', watts: 10, hours: 6 },
  { name: 'Fluorescent tube', watts: 40, hours: 6 },
  { name: 'Energy-saving bulb', watts: 20, hours: 6 },
  { name: 'Ceiling fan', watts: 75, hours: 8 },
  { name: 'Standing fan', watts: 55, hours: 8 },
  { name: 'Rechargeable fan / lamp (charging)', watts: 20, hours: 4 },
  { name: 'TV (32"–43" LED)', watts: 60, hours: 6 },
  { name: 'TV (50"+ LED)', watts: 120, hours: 6 },
  { name: 'Decoder (DStv/GOtv)', watts: 20, hours: 6 },
  { name: 'Sound system / home theatre', watts: 100, hours: 3 },
  { name: 'Phone charging', watts: 10, hours: 3 },
  { name: 'Laptop', watts: 60, hours: 5 },
  { name: 'Desktop computer', watts: 200, hours: 4 },
  { name: 'Wi-Fi router / MiFi', watts: 10, hours: 24 },
  { name: 'Fridge', watts: 150, hours: 10 },
  { name: 'Deep freezer', watts: 200, hours: 12 },
  { name: 'Air conditioner (1 HP)', watts: 900, hours: 6 },
  { name: 'Air conditioner (1.5 HP)', watts: 1300, hours: 6 },
  { name: 'Air conditioner (2 HP)', watts: 1800, hours: 6 },
  { name: 'Pressing iron', watts: 1000, hours: 0.5 },
  { name: 'Electric kettle', watts: 1500, hours: 0.25 },
  { name: 'Microwave', watts: 1000, hours: 0.25 },
  { name: 'Blender', watts: 400, hours: 0.2 },
  { name: 'Electric cooker / hot plate', watts: 1500, hours: 1 },
  { name: 'Washing machine', watts: 500, hours: 1 },
  { name: 'Water pump (1 HP)', watts: 750, hours: 1 },
  { name: 'Water heater', watts: 3000, hours: 0.5 },
  { name: 'Hair dryer', watts: 1200, hours: 0.2 },
];
const MAX_APPLIANCES = 40;

const DAY_MS = 86400000;
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

const band = (id) => (config.tariffs[String(id || '').toUpperCase()] ? String(id).toUpperCase() : null);

// Form fields arrive as a string (one row) or an array (several rows).
const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

// Cleans the appliance rows from the form. Rows without a positive wattage are dropped.
function appliances(input = {}) {
  const names = list(input.applName), watts = list(input.applWatts), qty = list(input.applQty), hours = list(input.applHours);
  const rows = [];
  for (let i = 0; i < Math.min(watts.length, MAX_APPLIANCES); i++) {
    const w = parseFloat(watts[i]);
    if (!(w > 0 && w <= 20000)) continue;
    const q = Math.min(Math.max(Math.round(parseFloat(qty[i])) || 1, 1), 100);
    const h = Math.min(Math.max(parseFloat(hours[i]) || 0, 0), 24);
    rows.push({ name: String(names[i] || '').trim().slice(0, 60) || 'Appliance', watts: w, qty: q, hours: h });
  }
  return rows;
}

// kWh per day if the appliances run for their hours each day (assumes light is always available).
const appliancesKwh = (rows) => round2(rows.reduce((t, r) => t + (r.watts * r.qty * r.hours) / 1000, 0));

// Daily kWh from the form: a preset id, the appliance list, or a custom number.
function dailyKwh(usage, custom, input) {
  const preset = USAGE.find((u) => u.id === usage);
  if (preset) return preset.kwh;
  if (usage === 'appliances') {
    const kwh = appliancesKwh(appliances(input));
    return kwh > 0 ? kwh : null;
  }
  const n = parseFloat(custom);
  return n > 0 && n <= 500 ? round1(n) : null;
}

// When to recharge: when about a fifth of the units are left, 1 to 3 days before they run out.
function rechargeBy(start, days) {
  const buffer = Math.min(3, Math.max(1, days * 0.2));
  return new Date(Math.max(start.getTime(), start.getTime() + (days - buffer) * DAY_MS));
}

// "29.4 kWh", "Units: 29.4", "29.40" → 29.4
function parseUnits(text) {
  const m = String(text ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * amount: naira paid to the DisCo, in kobo (exclude our service fee).
 * units: actual units, when the DisCo has already returned them.
 * Returns null if the band or daily usage is unknown.
 */
function estimate({ amount, band: b, dailyKwh: perDay, units, from = new Date() }) {
  const rate = config.tariffs[band(b)];
  if (!rate && units == null) return null;
  const kwh = units != null ? Number(units) : (amount / 100) / (1 + VAT) / rate;
  if (!(kwh > 0)) return null;
  const out = { units: round1(kwh), rate, actual: units != null };
  if (perDay > 0) {
    const start = new Date(from);
    out.perDay = perDay;
    out.days = kwh / perDay;
    out.finish = new Date(start.getTime() + out.days * DAY_MS);
    out.recharge = rechargeBy(start, out.days);
  }
  return out;
}

const fmtDate = (d) => d.toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtDays = (days) => {
  if (days < 1) return 'less than a day';
  const n = Math.floor(days);
  return `about ${n} day${n === 1 ? '' : 's'}`;
};

// What the client-side calculator needs.
const clientConfig = () => ({ vat: VAT, tariffs: config.tariffs, usage: Object.fromEntries(USAGE.map((u) => [u.id, u.kwh])), max: MAX_APPLIANCES });

module.exports = {
  VAT, BANDS, USAGE, APPLIANCES, band, appliances, appliancesKwh, dailyKwh, rechargeBy, parseUnits, estimate, fmtDate, fmtDays, clientConfig,
};
