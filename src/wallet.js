// Wallet primitives. Call these inside db.tx() together with whatever caused the change.

function credit(db, userId, amount, reason, ref) {
  if (!(amount > 0)) throw new Error('credit amount must be positive');
  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId);
  const { balance } = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
  db.prepare('INSERT INTO wallet_ledger (user_id, direction, amount, balance_after, reason, ref) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, 'credit', amount, balance, reason, ref ?? null);
  return balance;
}

// Returns false (and changes nothing) if the balance is too low.
function debit(db, userId, amount, reason, ref) {
  if (!(amount > 0)) throw new Error('debit amount must be positive');
  const r = db.prepare('UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?').run(amount, userId, amount);
  if (r.changes !== 1) return false;
  const { balance } = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
  db.prepare('INSERT INTO wallet_ledger (user_id, direction, amount, balance_after, reason, ref) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, 'debit', amount, balance, reason, ref ?? null);
  return true;
}

module.exports = { credit, debit };
