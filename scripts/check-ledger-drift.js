#!/usr/bin/env node
/**
 * Ledger Drift Check — CI Pipeline Guard
 *
 * Initializes a fresh CreditStore, runs the integrity check,
 * and verifies that drift equals the expected value.
 *
 * Usage: node ./scripts/check-ledger-drift.js --expected 0
 * Exit code 0 = healthy, 1 = drift detected
 */

const path = require('path');
const fs = require('fs');

// Parse --expected flag
const args = process.argv.slice(2);
const expectedIdx = args.indexOf('--expected');
const expectedDrift = expectedIdx !== -1 ? parseInt(args[expectedIdx + 1], 10) : 0;

// Ensure data directory exists
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load the compiled CreditStore
const distPath = path.join(process.cwd(), 'dist', 'monetization', 'credit_store.js');
if (!fs.existsSync(distPath)) {
  console.error('[DRIFT CHECK] ERROR: dist/monetization/credit_store.js not found.');
  console.error('[DRIFT CHECK] Run "npm run build" first.');
  process.exit(1);
}

const { initCreditStore } = require(distPath);

try {
  const store = initCreditStore(path.join(dataDir, 'credits.db'));
  const report = store.integrityCheck();

  console.log('[DRIFT CHECK] Ledger Integrity Report');
  console.log('─────────────────────────────────────');
  console.log(`  Healthy:        ${report.healthy}`);
  console.log(`  Drift:          ${report.balanceDrift}`);
  console.log(`  Expected Drift: ${expectedDrift}`);
  console.log(`  Ledger Debits:  ${report.totalLedgerDebits}`);
  console.log(`  Ledger Credits: ${report.totalLedgerCredits}`);
  console.log(`  Cached Sum:     ${report.cachedBalanceSum}`);
  console.log(`  Ledger Sum:     ${report.ledgerBalanceSum}`);
  console.log(`  Accounts:       ${report.accountCount}`);
  console.log(`  Entries:        ${report.entryCount}`);
  console.log(`  Locked Out:     ${report.lockedOut}`);
  console.log('─────────────────────────────────────');

  if (report.balanceDrift !== expectedDrift) {
    console.error(`[DRIFT CHECK] FAIL — drift is ${report.balanceDrift}, expected ${expectedDrift}`);
    process.exit(1);
  }

  if (report.lockedOut) {
    console.error('[DRIFT CHECK] FAIL — ledger is locked out');
    process.exit(1);
  }

  console.log('[DRIFT CHECK] PASS — ledger integrity verified');
  store.close();
  process.exit(0);
} catch (err) {
  console.error(`[DRIFT CHECK] ERROR: ${err.message}`);
  process.exit(1);
}
