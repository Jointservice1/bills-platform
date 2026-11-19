const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

// All money columns are integers in kobo.
function open(file = config.databasePath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    -- Every balance change, so a wallet can always be reconciled.
    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
      amount INTEGER NOT NULL CHECK (amount > 0),
      balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL,          -- funding | purchase | refund | adjustment
      ref TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Paystack wallet top-ups. status: pending | success | failed | mismatch
    CREATE TABLE IF NOT EXISTS fundings (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      reference TEXT NOT NULL UNIQUE,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      channel TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- status: draft (quoted, not paid) | processing | pending (awaiting provider) | success | failed
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      request_id TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      biller TEXT NOT NULL,
      phone TEXT NOT NULL,
      meter_type TEXT,
      tv_mode TEXT,
      variation_code TEXT,
      variation_name TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      customer_name TEXT,
      customer_info TEXT,
      amount INTEGER NOT NULL,
      fee INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      status TEXT NOT NULL,
      refunded INTEGER NOT NULL DEFAULT 0,
      token TEXT,
      units TEXT,
      provider_ref TEXT,
      provider_message TEXT,
      raw TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY,
      body_hash TEXT NOT NULL UNIQUE,
      event TEXT NOT NULL,
      payload TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Ads shown in ad spaces around the site. slot: see src/ads.js (or 'all').
    CREATE TABLE IF NOT EXISTS ads (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT,
      image_url TEXT,
      link_url TEXT NOT NULL,
      cta TEXT,
      slot TEXT NOT NULL DEFAULT 'all',
      active INTEGER NOT NULL DEFAULT 1,
      starts_on TEXT,                -- YYYY-MM-DD, optional
      ends_on TEXT,                  -- YYYY-MM-DD, optional (inclusive)
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- One active password-reset code per user. code_hash is sha256; the code itself is never stored.
    CREATE TABLE IF NOT EXISTS password_resets (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_ledger_user ON wallet_ledger(user_id, id);
  `);
  return db;
}

// Run fn inside a transaction (node:sqlite is synchronous, so this is atomic in-process).
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { open, tx };
