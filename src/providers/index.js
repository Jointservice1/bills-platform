// Every provider implements the same interface (amounts in kobo):
//   listVariations(serviceId)                 -> [{ code, name, amount, fixed }]
//   verify({ serviceId, billersCode, type })  -> { ok, name, address, currentPackage, renewalAmount, error }
//   pay({ requestId, serviceId, billersCode, variationCode, amount, phone, subscriptionType, quantity })
//                                             -> { status: 'delivered'|'pending'|'failed', token, units, providerRef, message, raw }
//   requery(requestId)                        -> same shape as pay
//   balance()                                 -> kobo | null
// To add another aggregator (Flutterwave Bills, Baxi, ClubKonnect...), write an adapter and register it here.

const config = require('../config');
const { createVtpass } = require('./vtpass');
const { createMock } = require('./mock');

function withVariationCache(provider, ttlMs = 10 * 60 * 1000) {
  const cache = new Map();
  return {
    ...provider,
    async listVariations(serviceId) {
      const hit = cache.get(serviceId);
      if (hit && hit.expires > Date.now()) return hit.value;
      const value = await provider.listVariations(serviceId);
      if (value.length) cache.set(serviceId, { value, expires: Date.now() + ttlMs });
      return value;
    },
  };
}

function createProvider(name = config.provider) {
  if (name === 'vtpass') return withVariationCache(createVtpass(config.vtpass));
  if (name === 'mock') return createMock();
  throw new Error(`Unknown PROVIDER "${name}". Use "vtpass" or "mock".`);
}

module.exports = { createProvider, withVariationCache };
