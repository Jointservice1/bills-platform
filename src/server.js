const config = require('./config');
const { open } = require('./db');
const { createProvider } = require('./providers');
const paystack = require('./paystack');
const orders = require('./orders');
const { createApp } = require('./app');

const db = open();
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
db.prepare("DELETE FROM orders WHERE status = 'draft' AND created_at < datetime('now', '-1 day')").run();

const provider = createProvider();

createApp({ db, provider, paystack }).listen(config.port, () => {
  console.log(`${config.appName} running at ${config.baseUrl} (port ${config.port})`);
  console.log(`Provider: ${provider.name}${provider.name === 'mock' ? ' (DEMO: nothing real is sold)' : ''}`);
  console.log(`Paystack webhook URL: ${config.baseUrl}/webhooks/paystack`);
});

// Resolve purchases whose outcome was unknown (timeouts, provider "processing").
let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try { await orders.requeryPending(db, provider); } finally { running = false; }
}, 60_000).unref();
