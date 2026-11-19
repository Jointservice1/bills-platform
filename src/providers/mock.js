// Demo provider: nothing real is sold. Lets you click through every flow without keys.
//
// Magic numbers for testing:
//   biller ending in 0000  → verification fails
//   biller ending in 9999  → purchase fails (wallet is refunded)
//   biller ending in 8888  → purchase stays pending, then succeeds on requery

const crypto = require('node:crypto');

const N = 100;
const plans = (rows) => rows.map(([code, name, naira]) => ({ code, name, amount: naira * N, fixed: true }));

const DATA = plans([
  ['d-100mb', '100MB · 1 day', 100], ['d-1gb', '1GB · 1 day', 350], ['d-2gb', '2GB · 7 days', 750],
  ['d-6gb', '6GB · 7 days', 1500], ['d-10gb', '10GB · 30 days', 3500], ['d-25gb', '25GB · 30 days', 6500],
  ['d-75gb', '75GB · 30 days', 15000],
]);
const VARIATIONS = {
  'mtn-data': DATA, 'airtel-data': DATA, 'glo-data': DATA, 'glo-sme-data': DATA, 'etisalat-data': DATA,
  dstv: plans([['dstv-padi', 'Padi', 4400], ['dstv-yanga', 'Yanga', 6000], ['dstv-confam', 'Confam', 11000],
    ['dstv-compact', 'Compact', 19000], ['dstv-compact-plus', 'Compact Plus', 30000], ['dstv-premium', 'Premium', 44500]]),
  gotv: plans([['gotv-smallie', 'Smallie', 1900], ['gotv-jinja', 'Jinja', 3900], ['gotv-jolli', 'Jolli', 5800],
    ['gotv-max', 'Max', 8500], ['gotv-supa', 'Supa', 11400]]),
  startimes: plans([['nova', 'Nova', 1900], ['basic', 'Basic', 3700], ['smart', 'Smart', 4700],
    ['classic', 'Classic', 5500], ['super', 'Super', 9000]]),
  showmax: plans([['mobile', 'Mobile · 1 month', 1600], ['pro-mobile', 'Pro Mobile · 1 month', 4200], ['full', 'Entertainment · 1 month', 3500]]),
  'smile-direct': plans([['smile-1gb', '1GB · 30 days', 1000], ['smile-10gb', '10GB · 30 days', 5000], ['smile-unl', 'Unlimited Lite · 30 days', 10000]]),
  spectranet: plans([['spec-7gb', '7GB · 30 days', 2000], ['spec-30gb', '30GB · 30 days', 7000], ['spec-unl', 'Unlimited · 30 days', 15000]]),
  waec: plans([['waecdirect', 'Result Checker PIN', 3900]]),
  'waec-registration': plans([['waec-reg', 'Registration PIN', 18000]]),
  jamb: plans([['utme', 'UTME (with mock)', 7700], ['de', 'Direct Entry', 6200]]),
};

const digits = (n) => Array.from(crypto.randomBytes(n), (b) => b % 10).join('');

function result(o) {
  const pending = o.billersCode.endsWith('8888');
  const failed = o.billersCode.endsWith('9999');
  if (failed) return { status: 'failed', message: 'Demo: transaction failed', token: null, units: null, providerRef: null, raw: {} };
  if (pending) return { status: 'pending', message: 'Demo: processing', token: null, units: null, providerRef: null, raw: {} };
  let token = null;
  let units = null;
  if (o.serviceId.endsWith('-electric') && o.variationCode === 'prepaid') {
    token = digits(20).match(/.{4}/g).join('-');
    units = `${(o.amount / 100 / 68).toFixed(1)} kWh`;
  }
  if (o.serviceId.startsWith('waec')) {
    token = Array.from({ length: o.quantity || 1 }, () => `Serial: WRN${digits(9)}  PIN: ${digits(12)}`).join('\n');
  }
  return { status: 'delivered', token, units, providerRef: `DEMO${digits(10)}`, message: 'Demo: delivered', raw: {} };
}

function createMock() {
  const seen = new Map();
  return {
    name: 'mock',
    async listVariations(serviceId) { return VARIATIONS[serviceId] || []; },
    async verify({ serviceId, billersCode }) {
      if (billersCode.endsWith('0000')) return { ok: false, error: 'Invalid number. Please check and try again.' };
      const tv = ['dstv', 'gotv', 'startimes'].includes(serviceId);
      return {
        ok: true,
        name: 'Demo Customer',
        address: serviceId.endsWith('-electric') ? '12 Sample Street, Lagos' : '',
        currentPackage: tv ? VARIATIONS[serviceId][1].name : '',
        renewalAmount: tv ? VARIATIONS[serviceId][1].amount : null,
      };
    },
    async pay(o) {
      seen.set(o.requestId, o);
      return result(o);
    },
    async requery(requestId) {
      const o = seen.get(requestId);
      if (!o) return { status: 'failed', message: 'Demo: unknown request', raw: {} };
      return o.billersCode.endsWith('8888') ? result({ ...o, billersCode: `${o.billersCode}-done` }) : result(o);
    },
    async balance() { return 1_000_000 * N; },
  };
}

module.exports = { createMock };
