const path = require('node:path');

try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // No .env: use real environment variables.
}

const env = process.env;
const fee = (cat) => Math.round(Number(env[`FEE_${cat.toUpperCase()}`] || 0) * 100);

const config = {
  appName: env.APP_NAME || 'PayBills',
  port: Number(env.PORT || 3000),
  baseUrl: (env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  databasePath: env.DATABASE_PATH === ':memory:' ? ':memory:' : path.resolve(__dirname, '..', env.DATABASE_PATH || './data/bills.db'),
  isProduction: env.NODE_ENV === 'production',
  provider: (env.PROVIDER || 'mock').toLowerCase(),
  vtpass: {
    baseUrl: (env.VTPASS_BASE_URL || 'https://sandbox.vtpass.com/api').replace(/\/$/, ''),
    apiKey: env.VTPASS_API_KEY || '',
    publicKey: env.VTPASS_PUBLIC_KEY || '',
    secretKey: env.VTPASS_SECRET_KEY || '',
  },
  paystackSecret: env.PAYSTACK_SECRET_KEY || '',
  smtp: {
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(env.SMTP_PORT || 465),
    user: env.SMTP_USER || '',
    pass: (env.SMTP_PASS || '').replace(/\s+/g, ''), // Gmail shows app passwords with spaces
    from: env.MAIL_FROM || '',
  },
  fees: Object.fromEntries(['airtime', 'data', 'electricity', 'tv', 'internet', 'education'].map((c) => [c, fee(c)])),
  supportEmail: env.SUPPORT_EMAIL || '',
  supportPhone: env.SUPPORT_PHONE || '',
  // Electricity tariff per kWh in naira, by NERC service band (used only for estimates; actual units come from the DisCo).
  tariffs: Object.fromEntries(Object.entries({ A: 209.5, B: 64, C: 52, D: 43, E: 40 })
    .map(([b, d]) => [b, Number(env[`TARIFF_BAND_${b}`]) > 0 ? Number(env[`TARIFF_BAND_${b}`]) : d])),
};

if (config.paystackSecret.startsWith('pk_')) throw new Error('PAYSTACK_SECRET_KEY must be the secret key (sk_), not the public key.');
if (config.provider === 'mock' && config.isProduction) throw new Error('PROVIDER=mock cannot run with NODE_ENV=production.');

module.exports = config;
