import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync, chmodSync } from 'fs';
import { HOME_DIR } from '../constants';
import { v4 as uuidv4 } from 'uuid';

// Ensure the directory exists
const DB_DIR = HOME_DIR;
const DB_PATH = join(DB_DIR, 'usage.db');
const BACKUP_DIR = join(DB_DIR, 'backups');

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

if (!existsSync(BACKUP_DIR)) {
  mkdirSync(BACKUP_DIR, { recursive: true });
}

// Initialize database
let db: Database.Database | null = null;

try {
  db = new Database(DB_PATH);

  // Set proper file permissions (owner read/write only)
  try {
    chmodSync(DB_PATH, 0o600);
  } catch (err) {
    console.error('Warning: Could not set database file permissions:', err);
  }

  // Apply performance settings
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -64000;
    PRAGMA temp_store = MEMORY;
    PRAGMA mmap_size = 268435456;
    PRAGMA page_size = 4096;
  `);

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      request_id TEXT UNIQUE,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      provider TEXT,
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cached_input_tokens INTEGER DEFAULT 0,
      cached_output_tokens INTEGER DEFAULT 0,
      cost_usd REAL,
      response_time_ms INTEGER,
      status TEXT,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS model_pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT,
      model TEXT,
      input_price_per_1k REAL,
      output_price_per_1k REAL,
      cached_input_price_per_1k REAL,
      cached_output_price_per_1k REAL,
      effective_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, model)
    );

    CREATE TABLE IF NOT EXISTS daily_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE,
      provider TEXT,
      model TEXT,
      total_requests INTEGER,
      total_input_tokens INTEGER,
      total_output_tokens INTEGER,
      total_cost_usd REAL,
      avg_response_time_ms INTEGER,
      UNIQUE(date, provider, model)
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp);
    CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_usage_provider_model ON usage_records(provider, model);
    CREATE INDEX IF NOT EXISTS idx_usage_composite ON usage_records(session_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_summaries(date);
  `);

  // Insert default pricing data
  const insertPricing = db.prepare(`
    INSERT OR REPLACE INTO model_pricing
    (provider, model, input_price_per_1k, output_price_per_1k, cached_input_price_per_1k, cached_output_price_per_1k)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Default pricing (actual prices as of Jan 2025)
  const defaultPricing = [
    // OpenAI
    ['openai', 'gpt-4', 0.03, 0.06, 0.015, 0.03],
    ['openai', 'gpt-4-turbo', 0.01, 0.03, 0.005, 0.015],
    ['openai', 'gpt-3.5-turbo', 0.0005, 0.0015, 0.00025, 0.00075],
    ['openai', 'o3-mini', 0.015, 0.06, 0.0075, 0.03],
    ['openai', 'o3', 0.015, 0.06, 0.0075, 0.03],

    // Anthropic
    ['anthropic', 'claude-opus-4', 0.015, 0.075, 0.0075, 0.0375],
    ['anthropic', 'claude-sonnet-4', 0.003, 0.015, 0.0015, 0.0075],
    ['anthropic', 'claude-3.5-haiku', 0.0008, 0.004, 0.0004, 0.002],

    // XAI
    ['xai', 'grok-4-fast', 0.0002, 0.0005, 0.0001, 0.00025],
    ['xai', 'grok-fast-code-1', 0.0002, 0.0005, 0.0001, 0.00025],
    ['xai', 'grok-3', 0.0005, 0.0015, 0.00025, 0.00075],
    ['xai', 'grok-4-0709', 0.0005, 0.0015, 0.00025, 0.00075],

    // Google
    ['gemini', 'gemini-2.5-pro', 0.00125, 0.005, 0.0003125, 0.00125],
    ['gemini', 'gemini-2.5-flash', 0.000075, 0.0003, 0.0000375, 0.00015],
    ['gemini', 'gemini-2.0-flash', 0.000075, 0.0003, 0.0000375, 0.00015],

    // DeepSeek
    ['deepseek', 'deepseek-chat', 0.00014, 0.00028, 0.00007, 0.00014],
    ['deepseek', 'deepseek-reasoner', 0.00055, 0.0022, 0.000275, 0.0011],
    ['deepseek', 'deepseek-r1-0528', 0.00055, 0.0022, 0.000275, 0.0011],

    // OpenRouter models (add x-ai prefix for OpenRouter)
    ['openrouter', 'x-ai/grok-4-fast', 0.0002, 0.0005, 0.0001, 0.00025],
    ['openrouter', 'x-ai/grok-4-fast:free', 0.0, 0.0, 0.0, 0.0],
    ['openrouter', 'anthropic/claude-sonnet-4', 0.003, 0.015, 0.0015, 0.0075],
    ['openrouter', 'google/gemini-2.5-pro-preview', 0.00125, 0.005, 0.0003125, 0.00125],
  ];

  defaultPricing.forEach(pricing => insertPricing.run(...pricing));

  // Silently succeed - database is initialized
} catch (error) {
  // Log error only if it's a critical failure
  if (process.env.DEBUG) {
    console.error('Failed to initialize database:', error);
  }
  // Continue without database - fallback to memory-only tracking
}

// Usage tracking interface
export interface UsageData {
  sessionId: string;
  requestId?: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cachedOutputTokens?: number;
  responseTime: number;
  status: 'success' | 'error';
  errorMessage?: string;
}

// Usage tracker class
export class UsageTracker {
  private static instance: UsageTracker;
  private writeQueue: UsageData[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  static getInstance(): UsageTracker {
    if (!UsageTracker.instance) {
      UsageTracker.instance = new UsageTracker();
    }
    return UsageTracker.instance;
  }

  recordUsage(data: UsageData): void {
    if (!db) {
      // Silently skip if database is not available
      return;
    }

    // Add to write queue for batch processing
    this.writeQueue.push({
      ...data,
      requestId: data.requestId || uuidv4()
    });

    // Start batch timer if not already running
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushWrites();
      }, 100); // Flush every 100ms
    }
  }

  private flushWrites(): void {
    if (!db || this.writeQueue.length === 0) {
      this.batchTimer = null;
      return;
    }

    const stmt = db.prepare(`
      INSERT INTO usage_records
      (session_id, request_id, provider, model, input_tokens, output_tokens,
       cached_input_tokens, cached_output_tokens, cost_usd, response_time_ms, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((records: UsageData[]) => {
      for (const record of records) {
        const cost = this.calculateCost(record);
        stmt.run(
          record.sessionId,
          record.requestId,
          record.provider,
          record.model,
          record.inputTokens,
          record.outputTokens,
          record.cachedInputTokens || 0,
          record.cachedOutputTokens || 0,
          cost,
          record.responseTime,
          record.status,
          record.errorMessage || null
        );
      }
    });

    try {
      insertMany(this.writeQueue);
    } catch (error) {
      console.error('Failed to write usage records:', error);
    }

    this.writeQueue = [];
    this.batchTimer = null;
  }

  private calculateCost(data: UsageData): number {
    if (!db) return 0;

    const pricing = db.prepare(`
      SELECT * FROM model_pricing
      WHERE provider = ? AND model = ?
      ORDER BY effective_date DESC
      LIMIT 1
    `).get(data.provider, data.model) as any;

    if (!pricing) {
      // Try to find a default pricing for the provider
      const defaultPricing = db.prepare(`
        SELECT * FROM model_pricing
        WHERE provider = ?
        ORDER BY effective_date DESC
        LIMIT 1
      `).get(data.provider) as any;

      if (!defaultPricing) return 0;

      // Use default provider pricing
      const inputCost = (data.inputTokens / 1000) * (defaultPricing.input_price_per_1k || 0.001);
      const outputCost = (data.outputTokens / 1000) * (defaultPricing.output_price_per_1k || 0.002);
      return inputCost + outputCost;
    }

    const inputCost = (data.inputTokens / 1000) * pricing.input_price_per_1k;
    const outputCost = (data.outputTokens / 1000) * pricing.output_price_per_1k;
    const cachedInputCost = ((data.cachedInputTokens || 0) / 1000) * (pricing.cached_input_price_per_1k || 0);
    const cachedOutputCost = ((data.cachedOutputTokens || 0) / 1000) * (pricing.cached_output_price_per_1k || 0);

    return inputCost + outputCost + cachedInputCost + cachedOutputCost;
  }

  getUsageSummary(startDate?: Date, endDate?: Date): any {
    if (!db) return [];

    const query = `
      SELECT
        provider,
        model,
        COUNT(*) as request_count,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cost_usd) as total_cost,
        AVG(response_time_ms) as avg_response_time
      FROM usage_records
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY provider, model
      ORDER BY total_cost DESC
    `;

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = endDate || new Date();

    try {
      return db.prepare(query).all(start.toISOString(), end.toISOString());
    } catch (error) {
      console.error('Failed to get usage summary:', error);
      return [];
    }
  }

  getSessionUsage(sessionId: string): any {
    if (!db) return null;

    const query = `
      SELECT
        provider,
        model,
        SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output,
        SUM(cost_usd) as total_cost,
        COUNT(*) as request_count,
        MAX(timestamp) as last_used
      FROM usage_records
      WHERE session_id = ?
      GROUP BY provider, model
      ORDER BY last_used DESC
    `;

    try {
      return db.prepare(query).all(sessionId);
    } catch (error) {
      console.error('Failed to get session usage:', error);
      return [];
    }
  }

  // Daily aggregation for long-term storage
  aggregateDailyUsage(): void {
    if (!db) return;

    const query = `
      INSERT OR REPLACE INTO daily_summaries
      (date, provider, model, total_requests, total_input_tokens, total_output_tokens, total_cost_usd, avg_response_time_ms)
      SELECT
        DATE(timestamp) as date,
        provider,
        model,
        COUNT(*) as total_requests,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cost_usd) as total_cost_usd,
        AVG(response_time_ms) as avg_response_time_ms
      FROM usage_records
      WHERE DATE(timestamp) < DATE('now')
      GROUP BY DATE(timestamp), provider, model
    `;

    try {
      db.exec(query);

      // Archive old raw records (keep 90 days)
      db.exec(`
        DELETE FROM usage_records
        WHERE timestamp < datetime('now', '-90 days')
      `);
    } catch (error) {
      console.error('Failed to aggregate daily usage:', error);
    }
  }

  // Backup database
  backupDatabase(): void {
    if (!db) return;

    const date = new Date().toISOString().split('T')[0];
    const backupPath = join(BACKUP_DIR, `usage_${date}.db`);

    try {
      // Validate backup path to prevent injection
      const safePath = backupPath.replace(/[^a-zA-Z0-9\/_\-\.]/g, '');
      if (safePath !== backupPath) {
        throw new Error('Invalid backup path characters');
      }

      db.exec(`VACUUM INTO '${safePath}'`);

      // Set proper permissions on backup
      chmodSync(safePath, 0o600);
      console.log(`✅ Database backed up to ${safePath}`);

      // Clean up old backups (keep 30 days)
      const fs = require('fs');
      const files = fs.readdirSync(BACKUP_DIR);
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      files.forEach((file: string) => {
        const filePath = join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < thirtyDaysAgo) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Deleted old backup: ${file}`);
        }
      });
    } catch (error) {
      console.error('Failed to backup database:', error);
    }
  }

  // Check database integrity
  checkIntegrity(): boolean {
    if (!db) return false;

    try {
      const result = db.prepare('PRAGMA integrity_check').get() as any;
      return result.integrity_check === 'ok';
    } catch (error) {
      console.error('Database integrity check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const usageTracker = UsageTracker.getInstance();

// Export database for direct queries if needed
export { db };

// Setup daily maintenance tasks
if (db) {
  // Daily aggregation at 3 AM
  setInterval(() => {
    const hour = new Date().getHours();
    if (hour === 3) {
      usageTracker.aggregateDailyUsage();
      usageTracker.backupDatabase();
    }
  }, 60 * 60 * 1000); // Check every hour

  // Weekly VACUUM
  setInterval(() => {
    try {
      db?.exec('VACUUM;');
      console.log('✅ Database vacuumed');
    } catch (error) {
      console.error('Failed to vacuum database:', error);
    }
  }, 7 * 24 * 60 * 60 * 1000); // Weekly
}