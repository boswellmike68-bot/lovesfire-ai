/**
 * Credit Store — Programmable Revenue Engine
 *
 * Tracks API keys, credit balances, and usage for the LovesfireAI API.
 * Every render costs credits. Credits are purchased via Stripe webhooks.
 *
 * This is the "financial lung" of the system.
 */

import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export interface ApiKey {
  key: string;
  userId: string;
  credits: number;
  createdAt: string;
  lastUsedAt?: string;
}

export interface Transaction {
  id: number;
  apiKey: string;
  amount: number; // negative for usage, positive for purchase
  type: 'render' | 'advisory' | 'purchase' | 'refund' | 'mint';
  jobId?: string;
  stripePaymentId?: string;
  paymentMethod?: PaymentMethod;
  paymentRef?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Double-Entry Ledger Types
// ---------------------------------------------------------------------------

export type PaymentMethod = 'stripe' | 'e-transfer' | 'cash' | 'barter' | 'admin_mint';

export interface Account {
  id: string;
  name: string;
  type: 'system' | 'user';
  createdAt: string;
}

export interface LedgerEntry {
  id: number;
  debitAccount: string;   // account being debited (funds leave)
  creditAccount: string;  // account being credited (funds arrive)
  amount: number;
  description: string;
  paymentMethod?: PaymentMethod;
  paymentRef?: string;
  createdAt: string;
  createdBy?: string;
}

export interface MintRequest {
  id: string;
  apiKey: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentRef?: string;
  verificationCode: string;
  expiresAt: string;
  confirmed: boolean;
  createdAt: string;
}

export interface IntegrityReport {
  healthy: boolean;
  totalLedgerDebits: number;
  totalLedgerCredits: number;
  balanceDrift: number;
  cachedBalanceSum: number;
  ledgerBalanceSum: number;
  accountCount: number;
  entryCount: number;
  lockedOut: boolean;
  checkedAt: string;
}

// System account IDs
const TREASURY_ACCOUNT = 'SYSTEM:TREASURY';
const REVENUE_ACCOUNT = 'SYSTEM:REVENUE';

// ---------------------------------------------------------------------------
// Credit Store
// ---------------------------------------------------------------------------

export class CreditStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    // Use DATA_DIR env var in production, local data/ in development
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    const defaultPath = path.join(dataDir, 'credits.db');
    
    this.db = new Database(dbPath || defaultPath);
    this.initSchema();
  }

  private lockedOut: boolean = false;

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        key TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        credits INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key TEXT NOT NULL,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL,
        job_id TEXT,
        stripe_payment_id TEXT,
        payment_method TEXT,
        payment_ref TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (api_key) REFERENCES api_keys(key)
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_api_key ON transactions(api_key);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

      -- Double-Entry Ledger: Accounts
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('system', 'user')),
        created_at TEXT NOT NULL
      );

      -- Double-Entry Ledger: Entries
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        debit_account TEXT NOT NULL,
        credit_account TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK(amount > 0),
        description TEXT NOT NULL,
        payment_method TEXT,
        payment_ref TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT,
        FOREIGN KEY (debit_account) REFERENCES accounts(id),
        FOREIGN KEY (credit_account) REFERENCES accounts(id)
      );

      CREATE INDEX IF NOT EXISTS idx_ledger_debit ON ledger_entries(debit_account);
      CREATE INDEX IF NOT EXISTS idx_ledger_credit ON ledger_entries(credit_account);
      CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger_entries(created_at);

      -- Mint Verification (email-verified manual minting)
      CREATE TABLE IF NOT EXISTS mint_verifications (
        id TEXT PRIMARY KEY,
        api_key TEXT NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        payment_ref TEXT,
        verification_code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        confirmed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);

    this.seedSystemAccounts();
  }

  private seedSystemAccounts() {
    const now = new Date().toISOString();
    const seed = this.db.prepare(`
      INSERT OR IGNORE INTO accounts (id, name, type, created_at)
      VALUES (?, ?, ?, ?)
    `);
    seed.run(TREASURY_ACCOUNT, 'Treasury', 'system', now);
    seed.run(REVENUE_ACCOUNT, 'Revenue', 'system', now);
  }

  private ensureUserAccount(apiKey: string) {
    const accountId = `USER:${apiKey}`;
    const exists = this.db.prepare('SELECT id FROM accounts WHERE id = ?').get(accountId);
    if (!exists) {
      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO accounts (id, name, type, created_at)
        VALUES (?, ?, 'user', ?)
      `).run(accountId, `User account for ${apiKey.slice(0, 12)}...`, now);
    }
    return accountId;
  }

  private assertNotLocked() {
    if (this.lockedOut) {
      throw new Error('[LEDGER LOCKED] Integrity violation detected. All transactions suspended. Run integrityCheck() for details.');
    }
  }

  // -----------------------------------------------------------------------
  // API Key Management
  // -----------------------------------------------------------------------

  createApiKey(userId: string, initialCredits: number = 0): string {
    const key = `lf_${crypto.randomBytes(24).toString('hex')}`;
    const now = new Date().toISOString();

    const run = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO api_keys (key, user_id, credits, created_at)
        VALUES (?, ?, ?, ?)
      `).run(key, userId, initialCredits, now);

      // Write ledger entry for initial credits (Treasury → User)
      if (initialCredits > 0) {
        const userAccount = this.ensureUserAccount(key);
        this.db.prepare(`
          INSERT INTO ledger_entries (debit_account, credit_account, amount, description, payment_method, created_at, created_by)
          VALUES (?, ?, ?, ?, 'admin_mint', ?, 'system')
        `).run(TREASURY_ACCOUNT, userAccount, initialCredits, `Initial credits for new key (${userId})`, now);
      }
    });

    run();
    console.log(`[CreditStore] Created API key for user ${userId} with ${initialCredits} credits`);
    return key;
  }

  getApiKey(key: string): ApiKey | undefined {
    const row = this.db.prepare(`
      SELECT key, user_id, credits, created_at, last_used_at
      FROM api_keys
      WHERE key = ?
    `).get(key) as any;

    if (!row) return undefined;

    return {
      key: row.key,
      userId: row.user_id,
      credits: row.credits,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
    };
  }

  updateLastUsed(key: string) {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE api_keys
      SET last_used_at = ?
      WHERE key = ?
    `).run(now, key);
  }

  // -----------------------------------------------------------------------
  // Credit Operations
  // -----------------------------------------------------------------------

  getBalance(key: string): number {
    const apiKey = this.getApiKey(key);
    return apiKey?.credits ?? 0;
  }

  deductCredits(key: string, amount: number, type: 'render' | 'advisory', jobId?: string): boolean {
    this.assertNotLocked();
    const apiKey = this.getApiKey(key);
    if (!apiKey || apiKey.credits < amount) {
      return false;
    }

    const now = new Date().toISOString();
    const userAccount = this.ensureUserAccount(key);

    const run = this.db.transaction(() => {
      // Deduct credits (cached balance)
      this.db.prepare(`
        UPDATE api_keys
        SET credits = credits - ?, last_used_at = ?
        WHERE key = ?
      `).run(amount, now, key);

      // Log transaction (legacy table)
      this.db.prepare(`
        INSERT INTO transactions (api_key, amount, type, job_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(key, -amount, type, jobId, now);

      // Double-entry: User → Revenue
      this.db.prepare(`
        INSERT INTO ledger_entries (debit_account, credit_account, amount, description, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(userAccount, REVENUE_ACCOUNT, amount, `${type} charge${jobId ? ` (job: ${jobId})` : ''}`, now);
    });

    run();
    console.log(`[CreditStore] Deducted ${amount} credits from ${key} (${type})`);
    return true;
  }

  addCredits(key: string, amount: number, stripePaymentId?: string): void {
    this.assertNotLocked();
    const now = new Date().toISOString();
    const userAccount = this.ensureUserAccount(key);

    const run = this.db.transaction(() => {
      // Add credits (cached balance)
      this.db.prepare(`
        UPDATE api_keys
        SET credits = credits + ?
        WHERE key = ?
      `).run(amount, key);

      // Log transaction (legacy table)
      this.db.prepare(`
        INSERT INTO transactions (api_key, amount, type, stripe_payment_id, payment_method, created_at)
        VALUES (?, ?, 'purchase', ?, 'stripe', ?)
      `).run(key, amount, stripePaymentId, now);

      // Double-entry: Treasury → User
      this.db.prepare(`
        INSERT INTO ledger_entries (debit_account, credit_account, amount, description, payment_method, payment_ref, created_at, created_by)
        VALUES (?, ?, ?, ?, 'stripe', ?, ?, 'stripe_webhook')
      `).run(TREASURY_ACCOUNT, userAccount, amount, `Stripe purchase (${amount} credits)`, stripePaymentId, now);
    });

    run();
    console.log(`[CreditStore] Added ${amount} credits to ${key} (Stripe: ${stripePaymentId})`);
  }

  // -----------------------------------------------------------------------
  // Sovereign Credit Mint (Manual — no Stripe)
  // -----------------------------------------------------------------------

  mintCredits(
    key: string,
    amount: number,
    paymentMethod: PaymentMethod,
    paymentRef?: string,
    mintedBy?: string
  ): void {
    this.assertNotLocked();
    const apiKey = this.getApiKey(key);
    if (!apiKey) {
      throw new Error(`API key not found: ${key}`);
    }

    const now = new Date().toISOString();
    const userAccount = this.ensureUserAccount(key);

    const run = this.db.transaction(() => {
      // Add credits (cached balance)
      this.db.prepare(`
        UPDATE api_keys
        SET credits = credits + ?
        WHERE key = ?
      `).run(amount, key);

      // Log transaction (legacy table with new fields)
      this.db.prepare(`
        INSERT INTO transactions (api_key, amount, type, payment_method, payment_ref, created_at)
        VALUES (?, ?, 'mint', ?, ?, ?)
      `).run(key, amount, paymentMethod, paymentRef, now);

      // Double-entry: Treasury → User
      this.db.prepare(`
        INSERT INTO ledger_entries (debit_account, credit_account, amount, description, payment_method, payment_ref, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        TREASURY_ACCOUNT,
        userAccount,
        amount,
        `Manual mint: ${amount} credits via ${paymentMethod}${paymentRef ? ` (ref: ${paymentRef})` : ''}`,
        paymentMethod,
        paymentRef,
        now,
        mintedBy || 'admin'
      );
    });

    run();
    console.log(`[CreditStore] MINTED ${amount} credits to ${key} via ${paymentMethod} (ref: ${paymentRef || 'none'})`);
  }

  // -----------------------------------------------------------------------
  // Mint Verification (Email-based 2-step confirmation)
  // -----------------------------------------------------------------------

  createMintVerification(
    apiKey: string,
    amount: number,
    paymentMethod: PaymentMethod,
    paymentRef?: string
  ): MintRequest {
    const id = crypto.randomBytes(16).toString('hex');
    const code = crypto.randomInt(100000, 999999).toString();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    this.db.prepare(`
      INSERT INTO mint_verifications (id, api_key, amount, payment_method, payment_ref, verification_code, expires_at, confirmed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, apiKey, amount, paymentMethod, paymentRef || null, code, expiresAt.toISOString(), now.toISOString());

    console.log(`[CreditStore] Mint verification created: ${id} (${amount} credits for ${apiKey.slice(0, 12)}...)`);

    return {
      id,
      apiKey,
      amount,
      paymentMethod,
      paymentRef,
      verificationCode: code,
      expiresAt: expiresAt.toISOString(),
      confirmed: false,
      createdAt: now.toISOString(),
    };
  }

  confirmMintVerification(mintId: string, code: string): { success: boolean; error?: string } {
    const row = this.db.prepare(`
      SELECT * FROM mint_verifications WHERE id = ?
    `).get(mintId) as any;

    if (!row) return { success: false, error: 'Mint request not found' };
    if (row.confirmed) return { success: false, error: 'Mint already confirmed' };
    if (new Date(row.expires_at) < new Date()) return { success: false, error: 'Verification code expired' };
    if (row.verification_code !== code) return { success: false, error: 'Invalid verification code' };

    // Mark as confirmed
    this.db.prepare('UPDATE mint_verifications SET confirmed = 1 WHERE id = ?').run(mintId);

    // Execute the mint
    this.mintCredits(row.api_key, row.amount, row.payment_method, row.payment_ref, 'admin_verified');

    console.log(`[CreditStore] Mint verification CONFIRMED: ${mintId}`);
    return { success: true };
  }

  // -----------------------------------------------------------------------
  // Transaction History
  // -----------------------------------------------------------------------

  getTransactions(key: string, limit: number = 50): Transaction[] {
    const rows = this.db.prepare(`
      SELECT id, api_key, amount, type, job_id, stripe_payment_id, payment_method, payment_ref, created_at
      FROM transactions
      WHERE api_key = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(key, limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      apiKey: r.api_key,
      amount: r.amount,
      type: r.type,
      jobId: r.job_id,
      stripePaymentId: r.stripe_payment_id,
      paymentMethod: r.payment_method,
      paymentRef: r.payment_ref,
      createdAt: r.created_at,
    }));
  }

  // -----------------------------------------------------------------------
  // Admin
  // -----------------------------------------------------------------------

  getAllKeys(): ApiKey[] {
    const rows = this.db.prepare(`
      SELECT key, user_id, credits, created_at, last_used_at
      FROM api_keys
      ORDER BY created_at DESC
    `).all() as any[];

    return rows.map((r) => ({
      key: r.key,
      userId: r.user_id,
      credits: r.credits,
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
    }));
  }

  getTotalRevenue(): number {
    const result = this.db.prepare(`
      SELECT SUM(amount) as total
      FROM transactions
      WHERE type IN ('purchase', 'mint')
    `).get() as any;

    return result?.total ?? 0;
  }

  // -----------------------------------------------------------------------
  // Double-Entry Ledger Queries
  // -----------------------------------------------------------------------

  getLedgerEntries(limit: number = 100): LedgerEntry[] {
    const rows = this.db.prepare(`
      SELECT id, debit_account, credit_account, amount, description,
             payment_method, payment_ref, created_at, created_by
      FROM ledger_entries
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      debitAccount: r.debit_account,
      creditAccount: r.credit_account,
      amount: r.amount,
      description: r.description,
      paymentMethod: r.payment_method,
      paymentRef: r.payment_ref,
      createdAt: r.created_at,
      createdBy: r.created_by,
    }));
  }

  getAccountBalance(accountId: string): number {
    const credited = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM ledger_entries
      WHERE credit_account = ?
    `).get(accountId) as any;

    const debited = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM ledger_entries
      WHERE debit_account = ?
    `).get(accountId) as any;

    return (credited?.total ?? 0) - (debited?.total ?? 0);
  }

  // -----------------------------------------------------------------------
  // Integrity Check — The "Auto-Lock"
  // -----------------------------------------------------------------------

  integrityCheck(): IntegrityReport {
    const now = new Date().toISOString();

    // Total debits and credits across all ledger entries
    const totals = this.db.prepare(`
      SELECT
        COALESCE(SUM(amount), 0) as total_debits,
        COALESCE(SUM(amount), 0) as total_credits,
        COUNT(*) as entry_count
      FROM ledger_entries
    `).get() as any;

    // Sum of all cached balances in api_keys
    const cachedSum = this.db.prepare(`
      SELECT COALESCE(SUM(credits), 0) as total FROM api_keys
    `).get() as any;

    // Sum of all user account balances from ledger
    const userAccounts = this.db.prepare(`
      SELECT id FROM accounts WHERE type = 'user'
    `).all() as any[];

    let ledgerBalanceSum = 0;
    for (const acc of userAccounts) {
      ledgerBalanceSum += this.getAccountBalance(acc.id);
    }

    // Drift = difference between cached balances and ledger-derived balances
    const drift = Math.abs(cachedSum.total - ledgerBalanceSum);

    const accountCount = this.db.prepare('SELECT COUNT(*) as cnt FROM accounts').get() as any;

    const healthy = drift === 0;

    // AUTO-LOCK if unhealthy
    if (!healthy && totals.entry_count > 0) {
      this.lockedOut = true;
      console.error(`[LEDGER] INTEGRITY VIOLATION — drift=${drift}, cached=${cachedSum.total}, ledger=${ledgerBalanceSum}. SYSTEM LOCKED.`);
    } else if (healthy && this.lockedOut) {
      this.lockedOut = false;
      console.log('[LEDGER] Integrity restored. System unlocked.');
    }

    return {
      healthy,
      totalLedgerDebits: totals.total_debits,
      totalLedgerCredits: totals.total_credits,
      balanceDrift: drift,
      cachedBalanceSum: cachedSum.total,
      ledgerBalanceSum,
      accountCount: accountCount.cnt,
      entryCount: totals.entry_count,
      lockedOut: this.lockedOut,
      checkedAt: now,
    };
  }

  // -----------------------------------------------------------------------
  // Revenue Breakdown (Sovereign)
  // -----------------------------------------------------------------------

  getRevenueByMethod(): Record<string, { credits: number; count: number }> {
    const rows = this.db.prepare(`
      SELECT payment_method, SUM(amount) as total, COUNT(*) as cnt
      FROM ledger_entries
      WHERE debit_account = ?
      GROUP BY payment_method
    `).all(TREASURY_ACCOUNT) as any[];

    const result: Record<string, { credits: number; count: number }> = {};
    for (const r of rows) {
      result[r.payment_method || 'unknown'] = { credits: r.total, count: r.cnt };
    }
    return result;
  }

  close() {
    this.db.close();
  }
}

// Singleton
let creditStore: CreditStore | null = null;

export function initCreditStore(dbPath?: string): CreditStore {
  if (!creditStore) {
    creditStore = new CreditStore(dbPath);
  }
  return creditStore;
}

export function getCreditStore(): CreditStore {
  if (!creditStore) {
    throw new Error('CreditStore not initialized. Call initCreditStore() first.');
  }
  return creditStore;
}
