# Claude Code Router Enhancement Implementation Guide

## Quick Start Implementation

### 1. Anthropic Subscription Support (Immediate Implementation)

#### Step 1: Update Configuration Schema

**File: `src/types/config.ts`** (create if doesn't exist)
```typescript
export interface Provider {
  name: string;
  api_base_url: string;
  auth_type?: 'api_key' | 'subscription' | 'oauth';
  api_key?: string;
  auth_token?: string;
  models: string[];
  transformer?: any;
}

export interface Config {
  Providers: Provider[];
  Router: RouterConfig;
  APIKEY?: string;
  HOST?: string;
  PORT?: number;
  // ... existing fields
}
```

#### Step 2: Modify Command Execution

**File: `src/utils/codeCommand.ts`** (modifications)
```typescript
export async function executeCodeCommand(args: string[] = []) {
  const config = await readConfigFile();
  const port = config.PORT || 3456;

  // Determine if we're using Anthropic directly
  const activeModel = config.Router.default;
  const [providerName] = activeModel.split(',');
  const provider = config.Providers.find(p => p.name === providerName);

  const env: Record<string, string> = {
    ...process.env,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    API_TIMEOUT_MS: String(config.API_TIMEOUT_MS ?? 600000),
  };

  // Handle Anthropic subscription vs API key
  if (provider?.name === 'anthropic-subscription') {
    // For subscription, use AUTH_TOKEN
    env.ANTHROPIC_AUTH_TOKEN = provider.auth_token || '';
    env.ANTHROPIC_API_KEY = ''; // Clear API key
  } else if (provider?.name === 'anthropic-api') {
    // For API access, use API_KEY
    env.ANTHROPIC_API_KEY = provider.api_key || '';
    delete env.ANTHROPIC_AUTH_TOKEN; // Remove AUTH_TOKEN
  } else {
    // Default routing behavior
    env.ANTHROPIC_AUTH_TOKEN = config?.APIKEY || "test";
    env.ANTHROPIC_API_KEY = '';
  }

  // ... rest of existing code
}
```

#### Step 3: Example Configuration

**File: `~/.claude-code-router/config.json`**
```json
{
  "Providers": [
    {
      "name": "anthropic-subscription",
      "api_base_url": "https://api.anthropic.com/v1/messages",
      "auth_type": "subscription",
      "auth_token": "YOUR_SUBSCRIPTION_TOKEN_HERE",
      "models": ["claude-3.5-haiku", "claude-opus-4", "claude-sonnet-4"],
      "transformer": {
        "use": ["anthropic"]
      }
    },
    {
      "name": "anthropic-api",
      "api_base_url": "https://api.anthropic.com/v1/messages",
      "auth_type": "api_key",
      "api_key": "sk-ant-api03-...",
      "models": ["claude-3.5-haiku", "claude-opus-4", "claude-sonnet-4"],
      "transformer": {
        "use": ["anthropic"]
      }
    }
  ],
  "Router": {
    "default": "anthropic-subscription,claude-sonnet-4",
    "background": "anthropic-subscription,claude-3.5-haiku",
    "think": "xai,grok-4-0709",
    "longContext": "xai,grok-4-fast"
  }
}
```

---

## 2. Enhanced Token Tracking Implementation

### Phase 1: Database Setup

#### Step 1: Install Dependencies

```bash
npm install better-sqlite3 @types/better-sqlite3
```

#### Step 2: Create Database Schema

**File: `src/utils/database.ts`**
```typescript
import Database from 'better-sqlite3';
import { join } from 'path';
import { HOME_DIR } from '../constants';

const db = new Database(join(HOME_DIR, 'usage.db'));

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

  CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp);
  CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_records(session_id);
  CREATE INDEX IF NOT EXISTS idx_usage_provider_model ON usage_records(provider, model);
`);

// Insert default pricing data
const insertPricing = db.prepare(`
  INSERT OR REPLACE INTO model_pricing
  (provider, model, input_price_per_1k, output_price_per_1k, cached_input_price_per_1k, cached_output_price_per_1k)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Default pricing (example values - update with actual pricing)
const defaultPricing = [
  ['openai', 'gpt-4', 0.03, 0.06, 0.015, 0.03],
  ['anthropic', 'claude-opus-4', 0.015, 0.075, 0.0075, 0.0375],
  ['anthropic', 'claude-sonnet-4', 0.003, 0.015, 0.0015, 0.0075],
  ['xai', 'grok-4-fast', 0.0002, 0.0005, 0.0001, 0.00025],
  ['gemini', 'gemini-2.5-pro', 0.00125, 0.005, 0.0003125, 0.00125],
];

defaultPricing.forEach(pricing => insertPricing.run(...pricing));

export { db };
```

#### Step 3: Create Usage Tracker Middleware

**File: `src/middleware/usageTracker.ts`**
```typescript
import { db } from '../utils/database';
import { v4 as uuidv4 } from 'uuid';

interface UsageData {
  sessionId: string;
  requestId: string;
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

export class UsageTracker {
  private static instance: UsageTracker;

  static getInstance(): UsageTracker {
    if (!UsageTracker.instance) {
      UsageTracker.instance = new UsageTracker();
    }
    return UsageTracker.instance;
  }

  recordUsage(data: UsageData): void {
    const cost = this.calculateCost(data);

    const stmt = db.prepare(`
      INSERT INTO usage_records
      (session_id, request_id, provider, model, input_tokens, output_tokens,
       cached_input_tokens, cached_output_tokens, cost_usd, response_time_ms, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.sessionId,
      data.requestId,
      data.provider,
      data.model,
      data.inputTokens,
      data.outputTokens,
      data.cachedInputTokens || 0,
      data.cachedOutputTokens || 0,
      cost,
      data.responseTime,
      data.status,
      data.errorMessage || null
    );
  }

  private calculateCost(data: UsageData): number {
    const pricing = db.prepare(`
      SELECT * FROM model_pricing
      WHERE provider = ? AND model = ?
      ORDER BY effective_date DESC
      LIMIT 1
    `).get(data.provider, data.model) as any;

    if (!pricing) return 0;

    const inputCost = (data.inputTokens / 1000) * pricing.input_price_per_1k;
    const outputCost = (data.outputTokens / 1000) * pricing.output_price_per_1k;
    const cachedInputCost = ((data.cachedInputTokens || 0) / 1000) * (pricing.cached_input_price_per_1k || 0);
    const cachedOutputCost = ((data.cachedOutputTokens || 0) / 1000) * (pricing.cached_output_price_per_1k || 0);

    return inputCost + outputCost + cachedInputCost + cachedOutputCost;
  }

  getUsageSummary(startDate?: Date, endDate?: Date): any {
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

    return db.prepare(query).all(start.toISOString(), end.toISOString());
  }
}

export const usageTracker = UsageTracker.getInstance();
```

#### Step 4: Integrate with Request Flow

**File: `src/index.ts`** (modifications)
```typescript
import { usageTracker } from './middleware/usageTracker';

// In the router middleware, after getting response:
server.addHook("onSend", async (req, reply, payload) => {
  const requestStart = (req as any).requestStart || Date.now();
  const responseTime = Date.now() - requestStart;

  // Extract provider and model from request
  const [provider, model] = req.body.model.split(',');

  // Track usage if we have the data
  if ((req as any).sessionId && sessionUsageCache.get((req as any).sessionId)) {
    const usage = sessionUsageCache.get((req as any).sessionId);

    usageTracker.recordUsage({
      sessionId: (req as any).sessionId,
      requestId: (req as any).requestId || uuidv4(),
      provider,
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      responseTime,
      status: 'success'
    });
  }

  event.emit('onSend', req, reply, payload);
  return payload;
});
```

---

## 3. Analytics Dashboard UI

### Step 1: Create API Endpoints

**File: `src/server.ts`** (additions)
```typescript
// Usage summary endpoint
server.app.get("/api/usage/summary", async (req, reply) => {
  try {
    const { startDate, endDate } = req.query as any;
    const summary = usageTracker.getUsageSummary(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );
    return summary;
  } catch (error) {
    reply.status(500).send({ error: "Failed to get usage summary" });
  }
});

// Usage details endpoint
server.app.get("/api/usage/details", async (req, reply) => {
  try {
    const { sessionId, limit = 100, offset = 0 } = req.query as any;

    const query = sessionId
      ? `SELECT * FROM usage_records WHERE session_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`
      : `SELECT * FROM usage_records ORDER BY timestamp DESC LIMIT ? OFFSET ?`;

    const params = sessionId ? [sessionId, limit, offset] : [limit, offset];
    const details = db.prepare(query).all(...params);

    return details;
  } catch (error) {
    reply.status(500).send({ error: "Failed to get usage details" });
  }
});

// Export endpoint
server.app.get("/api/usage/export", async (req, reply) => {
  try {
    const { format = 'json', startDate, endDate } = req.query as any;

    const data = db.prepare(`
      SELECT * FROM usage_records
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp DESC
    `).all(
      startDate || '1970-01-01',
      endDate || new Date().toISOString()
    );

    if (format === 'csv') {
      const csv = convertToCSV(data);
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="usage.csv"');
      return csv;
    }

    return data;
  } catch (error) {
    reply.status(500).send({ error: "Failed to export usage data" });
  }
});
```

### Step 2: Create React Components

**File: `ui/src/components/UsageDashboard.tsx`**
```tsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { api } from '@/lib/api';

export function UsageDashboard() {
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    end: new Date()
  });

  useEffect(() => {
    fetchUsageData();
  }, [dateRange]);

  const fetchUsageData = async () => {
    try {
      setLoading(true);
      const data = await api.get('/usage/summary', {
        params: {
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString()
        }
      });
      setSummary(data);
    } finally {
      setLoading(false);
    }
  };

  const totalCost = summary.reduce((acc, item) => acc + item.total_cost, 0);
  const totalTokens = summary.reduce((acc, item) =>
    acc + item.total_input_tokens + item.total_output_tokens, 0
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCost.toFixed(4)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(totalTokens / 1000).toFixed(1)}K
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.reduce((acc, item) => acc + item.request_count, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cost by Model</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart width={600} height={300} data={summary}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="model" />
            <YAxis />
            <Tooltip formatter={(value: any) => `$${value.toFixed(4)}`} />
            <Bar dataKey="total_cost" fill="#8884d8" />
          </BarChart>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>Requests</th>
                  <th>Input Tokens</th>
                  <th>Output Tokens</th>
                  <th>Cost</th>
                  <th>Avg Response Time</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.provider}</td>
                    <td>{item.model}</td>
                    <td>{item.request_count}</td>
                    <td>{(item.total_input_tokens / 1000).toFixed(1)}K</td>
                    <td>{(item.total_output_tokens / 1000).toFixed(1)}K</td>
                    <td>${item.total_cost.toFixed(4)}</td>
                    <td>{item.avg_response_time.toFixed(0)}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Testing & Validation

### 1. Test Anthropic Subscription
```bash
# Update config with your subscription token
ccr restart

# Test routing to subscription model
ccr code "Test subscription routing"

# Verify in logs
tail -f ~/.claude-code-router/logs/app.log
```

### 2. Test Usage Tracking
```bash
# Make several requests
ccr code "Generate a function"
ccr code "Explain this concept"

# Check database
sqlite3 ~/.claude-code-router/usage.db "SELECT * FROM usage_records;"
```

### 3. Test Analytics Dashboard
```bash
# Open UI
ccr ui

# Navigate to Usage Dashboard
# Verify data displays correctly
```

---

## Migration Guide for Existing Users

### Step 1: Backup Current Configuration
```bash
cp ~/.claude-code-router/config.json ~/.claude-code-router/config.backup.json
```

### Step 2: Update Configuration
Add the new provider configurations as shown above.

### Step 3: Rebuild and Restart
```bash
cd /path/to/claude-code-router
npm run build
ccr restart
```

### Step 4: Verify
```bash
ccr status
ccr code "Test the new features"
```

---

## Troubleshooting

### Common Issues

1. **Anthropic Authentication Failed**
   - Verify AUTH_TOKEN is correct
   - Check token hasn't expired
   - Ensure correct auth_type is set

2. **Database Errors**
   - Check write permissions in HOME_DIR
   - Verify SQLite is installed
   - Run migration manually if needed

3. **Usage Not Tracking**
   - Check sessionId is being set
   - Verify token capture in streams
   - Check database write permissions

---

*Implementation Guide v1.0 - January 2025*