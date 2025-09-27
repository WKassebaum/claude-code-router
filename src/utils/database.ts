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
export let db: Database.Database | null = null;

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

    CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp);
    CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_usage_provider_model ON usage_records(provider, model);
    CREATE INDEX IF NOT EXISTS idx_usage_composite ON usage_records(session_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_summaries(date);
  `);

  // Insert default pricing data if table is empty
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM model_pricing');
  const count = countStmt.get() as any;

  if (count.count === 0) {
    const insertPricing = db.prepare(`
      INSERT OR REPLACE INTO model_pricing
      (provider, model, input_price_per_1k, output_price_per_1k, cached_input_price_per_1k, cached_output_price_per_1k)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const defaultPricing = [
      // OpenAI
      ['openai', 'gpt-4o', 0.005, 0.015, 0.0025, 0.0075],
      ['openai', 'gpt-4-turbo', 0.01, 0.03, 0.005, 0.015],
      ['openai', 'gpt-4', 0.03, 0.06, 0.015, 0.03],
      ['openai', 'gpt-3.5-turbo', 0.0005, 0.0015, 0.00025, 0.00075],
      ['openai', 'o1-mini', 0.015, 0.06, 0.0075, 0.03],
      ['openai', 'o1', 0.015, 0.06, 0.0075, 0.03],

      // Anthropic
      ['anthropic', 'claude-opus-4-1-20250805', 0.015, 0.075, 0.0075, 0.0375],
      ['anthropic', 'claude-opus-4-1', 0.015, 0.075, 0.0075, 0.0375],
      ['anthropic', 'claude-opus-4-20250514', 0.015, 0.075, 0.0075, 0.0375],
      ['anthropic', 'claude-opus-4-0', 0.015, 0.075, 0.0075, 0.0375],
      ['anthropic', 'claude-sonnet-4-20250514', 0.003, 0.015, 0.0015, 0.0075],
      ['anthropic', 'claude-sonnet-4-0', 0.003, 0.015, 0.0015, 0.0075],
      ['anthropic', 'claude-3-7-sonnet-20250219', 0.003, 0.015, 0.0015, 0.0075],
      ['anthropic', 'claude-3-7-sonnet-latest', 0.003, 0.015, 0.0015, 0.0075],
      ['anthropic', 'claude-3.5-haiku-20241022', 0.00025, 0.00125, 0.000125, 0.000625],
      ['anthropic', 'claude-3.5-haiku-latest', 0.00025, 0.00125, 0.000125, 0.000625],
      ['anthropic', 'claude-3-haiku-20240307', 0.00025, 0.00125, 0.000125, 0.000625],

      // xAI
      ['xai', 'grok-beta', 0.0005, 0.0015, 0.00025, 0.00075],
      ['xai', 'grok-2', 0.0005, 0.0015, 0.00025, 0.00075],
      ['xai', 'grok-4-fast', 0.0002, 0.0005, 0.0001, 0.00025],
      ['xai', 'grok-fast-code-1', 0.0002, 0.0005, 0.0001, 0.00025],

      // Google
      ['gemini', 'gemini-1.5-pro', 0.00125, 0.005, 0.000625, 0.0025],
      ['gemini', 'gemini-1.5-flash', 0.000075, 0.0003, 0.0000375, 0.00015],
      ['gemini', 'gemini-2.0-flash-exp', 0.0, 0.0, 0.0, 0.0],
    ];

    defaultPricing.forEach(pricing => insertPricing.run(...pricing));
  }
} catch (error) {
  console.error('Failed to initialize database:', error);
  db = null;
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

    // Auto-fetch pricing if missing for this model
    fetchModelPricing(data.provider, data.model);

    // Handle cases where model might be null/undefined or combined with provider
    let provider = data.provider;
    let model = data.model;

    // Provider override based on model name for accuracy
    if (model) {
      const modelLower = model.toLowerCase();
      if (model.startsWith('grok-')) {
        provider = 'xai';
      } else if (modelLower.includes('claude') || modelLower.includes('opus') || modelLower.includes('sonnet') || modelLower.includes('haiku')) {
        provider = 'anthropic';
      } else if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3')) {
        provider = 'openai';
      } else if (model.startsWith('gemini-')) {
        provider = 'gemini';
      } else if (model.startsWith('deepseek-')) {
        provider = 'deepseek';
      }
    }

    // If model is null but provider contains a dash or model name, split it
    if (!model && provider) {
      // Common patterns:
      // "gemini-2.5-flash" -> provider: "gemini", model: "gemini-2.5-flash"
      // "grok-4-fast" -> provider: "xai", model: "grok-4-fast"
      if (provider.startsWith('gemini-')) {
        model = provider;
        provider = 'gemini';
      } else if (provider.startsWith('grok-')) {
        model = provider;
        provider = 'xai';
      } else if (provider.startsWith('claude-')) {
        model = provider;
        provider = 'anthropic';
      } else if (provider.startsWith('gpt-') || provider.startsWith('o3')) {
        model = provider;
        provider = 'openai';
      } else if (provider.startsWith('deepseek-')) {
        model = provider;
        provider = 'deepseek';
      }
    }

    // Try exact match first
    const pricing = db.prepare(`
      SELECT * FROM model_pricing
      WHERE provider = ? AND model = ?
      ORDER BY effective_date DESC
      LIMIT 1
    `).get(provider, model) as any;

    if (!pricing) {
      // Try to find by model name alone (some models might be stored this way)
      const modelOnlyPricing = db.prepare(`
        SELECT * FROM model_pricing
        WHERE model = ?
        ORDER BY effective_date DESC
        LIMIT 1
      `).get(model || provider) as any;

      if (modelOnlyPricing) {
        const inputCost = (data.inputTokens / 1000) * modelOnlyPricing.input_price_per_1k;
        const outputCost = (data.outputTokens / 1000) * modelOnlyPricing.output_price_per_1k;
        const cachedInputCost = ((data.cachedInputTokens || 0) / 1000) * (modelOnlyPricing.cached_input_price_per_1k || 0);
        const cachedOutputCost = ((data.cachedOutputTokens || 0) / 1000) * (modelOnlyPricing.cached_output_price_per_1k || 0);
        return inputCost + outputCost + cachedInputCost + cachedOutputCost;
      }

      // Try to find a default pricing for the provider
      const defaultPricing = db.prepare(`
        SELECT * FROM model_pricing
        WHERE provider = ?
        ORDER BY effective_date DESC
        LIMIT 1
      `).get(provider) as any;

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
      LIMIT 1000
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

export const usageTracker = UsageTracker.getInstance();

// Auto-fetch pricing for missing models
export async function fetchModelPricing(provider: string, model: string): Promise<boolean> {
  if (!db) return false;

  try {
    let pricingData: { input: number; output: number; cached_input: number; cached_output: number } | null = null;

    if (provider === 'openai') {
      type PricingType = { input: number; output: number; cached_input: number; cached_output: number };
      const openaiPricing: Record<string, PricingType> = {
        'gpt-4o': { input: 0.005, output: 0.015, cached_input: 0.0025, cached_output: 0.0075 },
        'gpt-4-turbo': { input: 0.01, output: 0.03, cached_input: 0.005, cached_output: 0.015 },
        'gpt-4': { input: 0.03, output: 0.06, cached_input: 0.015, cached_output: 0.03 },
        'gpt-3.5-turbo': { input: 0.0005, output: 0.0015, cached_input: 0.00025, cached_output: 0.00075 },
        'o1-mini': { input: 0.015, output: 0.06, cached_input: 0.0075, cached_output: 0.03 },
        'o1': { input: 0.015, output: 0.06, cached_input: 0.0075, cached_output: 0.03 },
      };

      pricingData = openaiPricing[model] || null;
    } else if (provider === 'anthropic') {
      type PricingType = { input: number; output: number; cached_input: number; cached_output: number };
      const anthropicPricing: Record<string, PricingType> = {
        'claude-opus-4-1-20250805': { input: 0.015, output: 0.075, cached_input: 0.0075, cached_output: 0.0375 },
        'claude-opus-4-1': { input: 0.015, output: 0.075, cached_input: 0.0075, cached_output: 0.0375 },
        'claude-opus-4-20250514': { input: 0.015, output: 0.075, cached_input: 0.0075, cached_output: 0.0375 },
        'claude-opus-4-0': { input: 0.015, output: 0.075, cached_input: 0.0075, cached_output: 0.0375 },
        'claude-sonnet-4-20250514': { input: 0.003, output: 0.015, cached_input: 0.0015, cached_output: 0.0075 },
        'claude-sonnet-4-0': { input: 0.003, output: 0.015, cached_input: 0.0015, cached_output: 0.0075 },
        'claude-3-7-sonnet-20250219': { input: 0.003, output: 0.015, cached_input: 0.0015, cached_output: 0.0075 },
        'claude-3-7-sonnet-latest': { input: 0.003, output: 0.015, cached_input: 0.0015, cached_output: 0.0075 },
        'claude-3.5-haiku-20241022': { input: 0.00025, output: 0.00125, cached_input: 0.000125, cached_output: 0.000625 },
        'claude-3.5-haiku-latest': { input: 0.00025, output: 0.00125, cached_input: 0.000125, cached_output: 0.000625 },
        'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125, cached_input: 0.000125, cached_output: 0.000625 },
      };

      pricingData = anthropicPricing[model] || null;
    } // Add more providers as needed

    if (pricingData) {
      const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO model_pricing
        (provider, model, input_price_per_1k, output_price_per_1k, cached_input_price_per_1k, cached_output_price_per_1k)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(provider, model, pricingData.input, pricingData.output, pricingData.cached_input, pricingData.cached_output);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to fetch pricing for ${provider}/${model}:`, error);
    return false;
  }
}