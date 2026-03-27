/**
 * Audit Store — Persistent SQLite storage for the Reflection module.
 *
 * Three tables:
 *   1. audit_events    — every governance event (birth, rejection, state transition)
 *   2. birth_certs     — full lineage data for every Bozitive born
 *   3. render_stats    — performance metrics per completed render
 *
 * File-based SQLite — survives server restarts.
 * WAL mode for concurrent reads during writes.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditEventType =
  | 'intake_accepted'
  | 'intake_rejected'
  | 'alignment_passed'
  | 'alignment_rejected'
  | 'bozitive_born'
  | 'job_queued'
  | 'job_transition'
  | 'job_completed'
  | 'job_failed'
  | 'job_timeout'
  | 'cache_hit';

export interface AuditEvent {
  id?: number;
  eventType: AuditEventType;
  jobId?: string;
  manifestHash?: string;
  governanceStamp?: string;
  details: string;
  createdAt: string;
}

export interface BirthCert {
  id?: number;
  jobId: string;
  manifestHash: string;
  governanceStamp: string;
  specVersion: string;
  sceneCount: number;
  contentFlag: string;
  capabilities: string;
  intakeWarnings: string;
  alignmentAdjustments: string;
  alignmentWarnings: string;
  bornAt: string;
}

export interface RenderStat {
  id?: number;
  jobId: string;
  manifestHash: string;
  sceneCount: number;
  totalDurationSeconds: number;
  renderTimeMs: number;
  fileSizeBytes: number;
  fromCache: boolean;
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const DEFAULT_DB_DIR = path.join(process.env.APPDATA || process.env.HOME || '.', 'lovesfire-ai');
const DEFAULT_DB_PATH = path.join(DEFAULT_DB_DIR, 'audit.db');

export class AuditStore {
  private db: Database.Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();

    console.log(`[Reflection] Audit store opened: ${dbPath}`);
  }

  // -----------------------------------------------------------------------
  // Schema Migration
  // -----------------------------------------------------------------------

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        job_id TEXT,
        manifest_hash TEXT,
        governance_stamp TEXT,
        details TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS birth_certs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        manifest_hash TEXT NOT NULL,
        governance_stamp TEXT NOT NULL,
        spec_version TEXT NOT NULL,
        scene_count INTEGER NOT NULL,
        content_flag TEXT NOT NULL,
        capabilities TEXT NOT NULL DEFAULT '[]',
        intake_warnings TEXT NOT NULL DEFAULT '[]',
        alignment_adjustments TEXT NOT NULL DEFAULT '[]',
        alignment_warnings TEXT NOT NULL DEFAULT '[]',
        born_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS render_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        manifest_hash TEXT NOT NULL,
        scene_count INTEGER NOT NULL,
        total_duration_seconds REAL NOT NULL,
        render_time_ms INTEGER NOT NULL,
        file_size_bytes INTEGER NOT NULL,
        from_cache INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_events_type ON audit_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_job ON audit_events(job_id);
      CREATE INDEX IF NOT EXISTS idx_births_hash ON birth_certs(manifest_hash);
      CREATE INDEX IF NOT EXISTS idx_stats_job ON render_stats(job_id);
    `);
  }

  // -----------------------------------------------------------------------
  // Write Operations
  // -----------------------------------------------------------------------

  logEvent(event: AuditEvent): number {
    const stmt = this.db.prepare(`
      INSERT INTO audit_events (event_type, job_id, manifest_hash, governance_stamp, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      event.eventType,
      event.jobId ?? null,
      event.manifestHash ?? null,
      event.governanceStamp ?? null,
      event.details,
      event.createdAt,
    );
    return result.lastInsertRowid as number;
  }

  saveBirthCert(cert: BirthCert): number {
    const stmt = this.db.prepare(`
      INSERT INTO birth_certs (job_id, manifest_hash, governance_stamp, spec_version, scene_count, content_flag, capabilities, intake_warnings, alignment_adjustments, alignment_warnings, born_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      cert.jobId,
      cert.manifestHash,
      cert.governanceStamp,
      cert.specVersion,
      cert.sceneCount,
      cert.contentFlag,
      cert.capabilities,
      cert.intakeWarnings,
      cert.alignmentAdjustments,
      cert.alignmentWarnings,
      cert.bornAt,
    );
    return result.lastInsertRowid as number;
  }

  saveRenderStat(stat: RenderStat): number {
    const stmt = this.db.prepare(`
      INSERT INTO render_stats (job_id, manifest_hash, scene_count, total_duration_seconds, render_time_ms, file_size_bytes, from_cache, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      stat.jobId,
      stat.manifestHash,
      stat.sceneCount,
      stat.totalDurationSeconds,
      stat.renderTimeMs,
      stat.fileSizeBytes,
      stat.fromCache ? 1 : 0,
      stat.completedAt,
    );
    return result.lastInsertRowid as number;
  }

  // -----------------------------------------------------------------------
  // Read Operations
  // -----------------------------------------------------------------------

  getEvents(filter?: { eventType?: AuditEventType; jobId?: string; limit?: number }): AuditEvent[] {
    let sql = 'SELECT * FROM audit_events WHERE 1=1';
    const params: any[] = [];

    if (filter?.eventType) {
      sql += ' AND event_type = ?';
      params.push(filter.eventType);
    }
    if (filter?.jobId) {
      sql += ' AND job_id = ?';
      params.push(filter.jobId);
    }

    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(filter?.limit ?? 100);

    return this.db.prepare(sql).all(...params).map(this.mapEvent);
  }

  getBirthCerts(filter?: { manifestHash?: string; limit?: number }): BirthCert[] {
    let sql = 'SELECT * FROM birth_certs WHERE 1=1';
    const params: any[] = [];

    if (filter?.manifestHash) {
      sql += ' AND manifest_hash = ?';
      params.push(filter.manifestHash);
    }

    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(filter?.limit ?? 100);

    return this.db.prepare(sql).all(...params).map(this.mapBirthCert);
  }

  getBirthCertByJobId(jobId: string): BirthCert | undefined {
    const row = this.db.prepare('SELECT * FROM birth_certs WHERE job_id = ?').get(jobId);
    return row ? this.mapBirthCert(row) : undefined;
  }

  getRenderStats(filter?: { limit?: number }): RenderStat[] {
    let sql = 'SELECT * FROM render_stats ORDER BY id DESC LIMIT ?';
    const params = [filter?.limit ?? 100];
    return this.db.prepare(sql).all(...params).map(this.mapRenderStat);
  }

  getRenderStatByJobId(jobId: string): RenderStat | undefined {
    const row = this.db.prepare('SELECT * FROM render_stats WHERE job_id = ?').get(jobId);
    return row ? this.mapRenderStat(row) : undefined;
  }

  // -----------------------------------------------------------------------
  // Aggregate Queries
  // -----------------------------------------------------------------------

  getSummary(): {
    totalBirths: number;
    totalRenders: number;
    totalRejections: number;
    totalCacheHits: number;
    avgRenderTimeMs: number;
    totalFileSizeBytes: number;
  } {
    const births = (this.db.prepare('SELECT COUNT(*) as c FROM birth_certs').get() as any).c;
    const renders = (this.db.prepare('SELECT COUNT(*) as c FROM render_stats').get() as any).c;
    const rejections = (this.db.prepare("SELECT COUNT(*) as c FROM audit_events WHERE event_type IN ('intake_rejected', 'alignment_rejected')").get() as any).c;
    const cacheHits = (this.db.prepare("SELECT COUNT(*) as c FROM audit_events WHERE event_type = 'cache_hit'").get() as any).c;
    const avgRender = (this.db.prepare('SELECT COALESCE(AVG(render_time_ms), 0) as avg FROM render_stats WHERE from_cache = 0').get() as any).avg;
    const totalSize = (this.db.prepare('SELECT COALESCE(SUM(file_size_bytes), 0) as total FROM render_stats').get() as any).total;

    return {
      totalBirths: births,
      totalRenders: renders,
      totalRejections: rejections,
      totalCacheHits: cacheHits,
      avgRenderTimeMs: Math.round(avgRender),
      totalFileSizeBytes: totalSize,
    };
  }

  // -----------------------------------------------------------------------
  // Row Mappers
  // -----------------------------------------------------------------------

  private mapEvent(row: any): AuditEvent {
    return {
      id: row.id,
      eventType: row.event_type,
      jobId: row.job_id,
      manifestHash: row.manifest_hash,
      governanceStamp: row.governance_stamp,
      details: row.details,
      createdAt: row.created_at,
    };
  }

  private mapBirthCert(row: any): BirthCert {
    return {
      id: row.id,
      jobId: row.job_id,
      manifestHash: row.manifest_hash,
      governanceStamp: row.governance_stamp,
      specVersion: row.spec_version,
      sceneCount: row.scene_count,
      contentFlag: row.content_flag,
      capabilities: row.capabilities,
      intakeWarnings: row.intake_warnings,
      alignmentAdjustments: row.alignment_adjustments,
      alignmentWarnings: row.alignment_warnings,
      bornAt: row.born_at,
    };
  }

  private mapRenderStat(row: any): RenderStat {
    return {
      id: row.id,
      jobId: row.job_id,
      manifestHash: row.manifest_hash,
      sceneCount: row.scene_count,
      totalDurationSeconds: row.total_duration_seconds,
      renderTimeMs: row.render_time_ms,
      fileSizeBytes: row.file_size_bytes,
      fromCache: row.from_cache === 1,
      completedAt: row.completed_at,
    };
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  close() {
    this.db.close();
  }
}
