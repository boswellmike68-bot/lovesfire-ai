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
  type: 'render' | 'advisory' | 'purchase' | 'refund';
  jobId?: string;
  stripePaymentId?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Credit Store
// ---------------------------------------------------------------------------

export class CreditStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    // Use Railway volume path in production, local data/ in development
    const defaultPath = process.env.NODE_ENV === 'production'
      ? '/app/data/credits.db'
      : path.join(process.cwd(), 'data', 'credits.db');
    
    this.db = new Database(dbPath || defaultPath);
    this.initSchema();
  }

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
        created_at TEXT NOT NULL,
        FOREIGN KEY (api_key) REFERENCES api_keys(key)
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_api_key ON transactions(api_key);
      CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
    `);
  }

  // -----------------------------------------------------------------------
  // API Key Management
  // -----------------------------------------------------------------------

  createApiKey(userId: string, initialCredits: number = 0): string {
    const key = `lf_${crypto.randomBytes(24).toString('hex')}`;
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO api_keys (key, user_id, credits, created_at)
      VALUES (?, ?, ?, ?)
    `).run(key, userId, initialCredits, now);

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
    const apiKey = this.getApiKey(key);
    if (!apiKey || apiKey.credits < amount) {
      return false;
    }

    const now = new Date().toISOString();

    // Deduct credits
    this.db.prepare(`
      UPDATE api_keys
      SET credits = credits - ?, last_used_at = ?
      WHERE key = ?
    `).run(amount, now, key);

    // Log transaction
    this.db.prepare(`
      INSERT INTO transactions (api_key, amount, type, job_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(key, -amount, type, jobId, now);

    console.log(`[CreditStore] Deducted ${amount} credits from ${key} (${type})`);
    return true;
  }

  addCredits(key: string, amount: number, stripePaymentId?: string): void {
    const now = new Date().toISOString();

    // Add credits
    this.db.prepare(`
      UPDATE api_keys
      SET credits = credits + ?
      WHERE key = ?
    `).run(amount, key);

    // Log transaction
    this.db.prepare(`
      INSERT INTO transactions (api_key, amount, type, stripe_payment_id, created_at)
      VALUES (?, ?, 'purchase', ?, ?)
    `).run(key, amount, stripePaymentId, now);

    console.log(`[CreditStore] Added ${amount} credits to ${key} (Stripe: ${stripePaymentId})`);
  }

  // -----------------------------------------------------------------------
  // Transaction History
  // -----------------------------------------------------------------------

  getTransactions(key: string, limit: number = 50): Transaction[] {
    const rows = this.db.prepare(`
      SELECT id, api_key, amount, type, job_id, stripe_payment_id, created_at
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
      WHERE type = 'purchase'
    `).get() as any;

    return result?.total ?? 0;
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
