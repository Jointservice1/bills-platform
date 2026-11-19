const crypto = require('node:crypto');
const config = require('./config');

async function call(method, path, body) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.paystackSecret}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) throw new Error(`Paystack ${path}: ${json.message || res.status}`);
  return json.data;
}

function verifySignature(rawBody, signature, secret = config.paystackSecret) {
  if (!signature || !secret) return false;
  const a = Buffer.from(crypto.createHmac('sha512', secret).update(rawBody).digest('hex'));
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  enabled: () => !!config.paystackSecret,
  verifySignature,
  initialize: ({ email, amount, reference, callbackUrl }) =>
    call('POST', '/transaction/initialize', { email, amount, reference, callback_url: callbackUrl, currency: 'NGN' }),
  verify: (reference) => call('GET', `/transaction/verify/${encodeURIComponent(reference)}`),
};
