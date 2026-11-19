// Everything the platform sells. `id` is the provider service ID (VTpass naming).
//
// kind decides the purchase form:
//   amount       – customer types any amount (airtime)
//   variation    – customer picks a plan; price comes from the provider (data, internet, Showmax, JAMB)
//   tv           – smartcard is verified, then "renew current package" or "change package"
//   electricity  – meter is verified, prepaid/postpaid, any amount
//   pin          – pick a product + quantity; provider returns PINs (WAEC)

const CATEGORIES = [
  { id: 'airtime', name: 'Airtime', blurb: 'Top up any network instantly' },
  { id: 'data', name: 'Data', blurb: 'Daily, weekly and monthly bundles' },
  { id: 'electricity', name: 'Electricity', blurb: 'Prepaid tokens and postpaid bills' },
  { id: 'tv', name: 'TV', blurb: 'DStv, GOtv, StarTimes, Showmax' },
  { id: 'internet', name: 'Internet', blurb: 'Smile and Spectranet' },
  { id: 'education', name: 'Exam PINs', blurb: 'WAEC and JAMB' },
];

const N = 100; // kobo per naira

const SERVICES = [
  // Airtime
  { id: 'mtn', category: 'airtime', name: 'MTN', network: 'mtn', kind: 'amount', billerLabel: 'Phone number', min: 50 * N, max: 50000 * N },
  { id: 'airtel', category: 'airtime', name: 'Airtel', network: 'airtel', kind: 'amount', billerLabel: 'Phone number', min: 50 * N, max: 50000 * N },
  { id: 'glo', category: 'airtime', name: 'Glo', network: 'glo', kind: 'amount', billerLabel: 'Phone number', min: 50 * N, max: 50000 * N },
  { id: 'etisalat', category: 'airtime', name: '9mobile', network: '9mobile', kind: 'amount', billerLabel: 'Phone number', min: 50 * N, max: 50000 * N },

  // Data
  { id: 'mtn-data', category: 'data', name: 'MTN', network: 'mtn', kind: 'variation', billerLabel: 'Phone number' },
  { id: 'airtel-data', category: 'data', name: 'Airtel', network: 'airtel', kind: 'variation', billerLabel: 'Phone number' },
  { id: 'glo-data', category: 'data', name: 'Glo', network: 'glo', kind: 'variation', billerLabel: 'Phone number' },
  { id: 'glo-sme-data', category: 'data', name: 'Glo SME', network: 'glo', kind: 'variation', billerLabel: 'Phone number' },
  { id: 'etisalat-data', category: 'data', name: '9mobile', network: '9mobile', kind: 'variation', billerLabel: 'Phone number' },

  // Electricity
  ...[
    ['ikeja-electric', 'Ikeja Electric', 'IKEDC'],
    ['eko-electric', 'Eko Electric', 'EKEDC'],
    ['abuja-electric', 'Abuja Electric', 'AEDC'],
    ['ibadan-electric', 'Ibadan Electric', 'IBEDC'],
    ['enugu-electric', 'Enugu Electric', 'EEDC'],
    ['portharcourt-electric', 'Port Harcourt Electric', 'PHED'],
    ['kano-electric', 'Kano Electric', 'KEDCO'],
    ['kaduna-electric', 'Kaduna Electric', 'KAEDCO'],
    ['jos-electric', 'Jos Electric', 'JED'],
    ['benin-electric', 'Benin Electric', 'BEDC'],
    ['yola-electric', 'Yola Electric', 'YEDC'],
    ['aba-electric', 'Aba Power', 'APLE'],
  ].map(([id, name, short]) => ({
    id, category: 'electricity', name, short, kind: 'electricity', verify: true,
    billerLabel: 'Meter number', min: 1000 * N, max: 500000 * N,
  })),

  // TV
  { id: 'dstv', category: 'tv', name: 'DStv', kind: 'tv', verify: true, billerLabel: 'Smartcard / IUC number' },
  { id: 'gotv', category: 'tv', name: 'GOtv', kind: 'tv', verify: true, billerLabel: 'IUC number' },
  { id: 'startimes', category: 'tv', name: 'StarTimes', kind: 'tv', verify: true, billerLabel: 'Smartcard number' },
  { id: 'showmax', category: 'tv', name: 'Showmax', kind: 'variation', billerLabel: 'Phone number' },

  // Internet
  { id: 'smile-direct', category: 'internet', name: 'Smile', kind: 'variation', verify: true, billerLabel: 'Smile account number' },
  { id: 'spectranet', category: 'internet', name: 'Spectranet', kind: 'variation', billerLabel: 'Phone number' },

  // Education
  { id: 'waec', category: 'education', name: 'WAEC Result Checker', kind: 'pin', billerLabel: 'Phone number' },
  { id: 'waec-registration', category: 'education', name: 'WAEC Registration', kind: 'pin', billerLabel: 'Phone number' },
  { id: 'jamb', category: 'education', name: 'JAMB (UTME / DE)', kind: 'variation', verify: true, billerLabel: 'JAMB Profile ID' },
];

// Kinds whose biller field is a phone number (validated and normalised as one).
const PHONE_BILLER = new Set(['airtime', 'data']);

// First four digits → network. Ported numbers exist, so the UI lets users override.
const PREFIXES = {
  mtn: ['0703', '0704', '0706', '0803', '0806', '0810', '0813', '0814', '0816', '0903', '0906', '0913', '0916', '0702'],
  airtel: ['0701', '0708', '0802', '0808', '0812', '0901', '0902', '0904', '0907', '0911', '0912'],
  glo: ['0705', '0805', '0807', '0811', '0815', '0905', '0915'],
  '9mobile': ['0809', '0817', '0818', '0908', '0909'],
};

const byId = Object.fromEntries(SERVICES.map((s) => [s.id, s]));
const category = (id) => CATEGORIES.find((c) => c.id === id);
const servicesIn = (cat) => SERVICES.filter((s) => s.category === cat);
const PHONE_DIGITS = 11;
const billerDigits = (s) => s.billerLabel === 'Phone number' ? PHONE_DIGITS
  : ({ electricity: 13, tv: 12 })[s.category] || (s.id === 'jamb' ? 10 : 0);

// Accepts 0803..., 234803..., +234 803 ...; returns 08031234567 or null.
function normalisePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('234')) d = `0${d.slice(3)}`;
  if (d.length === 10 && !d.startsWith('0')) d = `0${d}`;
  return /^0[789][01]\d{8}$/.test(d) ? d : null;
}

module.exports = { CATEGORIES, SERVICES, PREFIXES, PHONE_BILLER, PHONE_DIGITS, billerDigits, byId, category, servicesIn, normalisePhone };
