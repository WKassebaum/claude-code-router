# Claude Code Router - Enhanced Statusline Integration

## Overview

This document describes the enhanced statusline integration for Claude Code Router (CCR) that provides:
1. **Real-time usage tracking** for each model through a dedicated endpoint
2. **CCR detection** to show when routing is active
3. **Integration with claude-statusline-fix** for token tracking

---

## New Features Implementation

### 1. Usage Information Endpoint

Add a new API endpoint that provides real-time usage data per model:

**File: `src/server.ts`** (additions)
```typescript
// Real-time usage endpoint
server.app.get("/api/statusline/usage", async (req, reply) => {
  try {
    const { sessionId } = req.query as any;

    // Get current session usage from cache
    const currentUsage = sessionUsageCache.get(sessionId);

    // Get historical usage from database (if implemented)
    const historicalUsage = db?.prepare(`
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
    `).all(sessionId) || [];

    // Get active routing info
    const config = await readConfigFile();
    const activeRoute = config.Router.default;
    const [provider, model] = activeRoute.split(',');

    return {
      isUsingCCR: true,  // Always true when this endpoint is hit
      currentModel: {
        provider,
        model,
        route: activeRoute
      },
      currentSession: {
        inputTokens: currentUsage?.input_tokens || 0,
        outputTokens: currentUsage?.output_tokens || 0,
        totalTokens: (currentUsage?.input_tokens || 0) + (currentUsage?.output_tokens || 0)
      },
      modelUsage: historicalUsage,
      routerVersion: version,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    reply.status(500).send({ error: "Failed to get usage data" });
  }
});

// CCR detection endpoint
server.app.get("/api/statusline/detect", async (req, reply) => {
  try {
    const config = await readConfigFile();

    return {
      isActive: true,
      routerVersion: version,
      routingMode: config.Router.default ? "active" : "passthrough",
      providers: config.Providers.map(p => ({
        name: p.name,
        modelsCount: p.models.length,
        isActive: config.Router.default?.startsWith(p.name)
      })),
      features: {
        tokenTracking: !!config.EnableTokenTracking,
        costTracking: !!config.EnableCostTracking,
        statusLine: !!config.StatusLine?.enabled,
        customRouter: !!config.CUSTOM_ROUTER_PATH
      }
    };
  } catch (error) {
    reply.status(500).send({ error: "Failed to detect CCR status" });
  }
});
```

### 2. Enhanced Statusline Data Parser

Update the statusline parser to include CCR information:

**File: `src/utils/statusline.ts`** (modifications)
```typescript
// Add CCR detection module
interface CCRStatusModule {
  type: 'ccr_status';
  icon: string;
  text: string;
  color: string;
}

// Add to parseStatusLineData function
export async function parseStatusLineData(input: StatusLineInput): Promise<string> {
  const modules: any[] = [];

  // CCR Detection Module
  try {
    const ccrDetection = await detectCCR();
    if (ccrDetection.isActive) {
      modules.push({
        type: 'ccr_status',
        icon: '🔀',
        text: `CCR:${ccrDetection.model}`,
        color: 'bright_green'
      });
    }
  } catch (e) {
    // CCR not active, show direct connection
    modules.push({
      type: 'ccr_status',
      icon: '🔗',
      text: 'Direct',
      color: 'dim'
    });
  }

  // Token Usage Module with CCR data
  try {
    const usage = await getCCRUsage(input.session_id);
    if (usage) {
      modules.push({
        type: 'token_usage',
        icon: '📊',
        text: `${(usage.totalTokens / 1000).toFixed(1)}k`,
        color: usage.isFromCCR ? 'bright_cyan' : 'cyan'
      });

      // Cost tracking if available
      if (usage.totalCost) {
        modules.push({
          type: 'cost',
          icon: '💰',
          text: `$${usage.totalCost.toFixed(2)}`,
          color: usage.totalCost > 10 ? 'bright_red' : 'yellow'
        });
      }
    }
  } catch (e) {
    // Fallback to basic token display
  }

  // ... rest of existing modules
}

// Helper function to detect CCR
async function detectCCR(): Promise<{ isActive: boolean; model?: string }> {
  try {
    // Check if CCR is running
    const response = await fetch('http://127.0.0.1:8181/api/statusline/detect', {
      timeout: 500 // Quick timeout
    });

    if (response.ok) {
      const data = await response.json();
      return {
        isActive: true,
        model: data.providers.find(p => p.isActive)?.name
      };
    }
  } catch (e) {
    // CCR not running
  }

  return { isActive: false };
}

// Helper function to get CCR usage
async function getCCRUsage(sessionId: string): Promise<any> {
  try {
    const response = await fetch(
      `http://127.0.0.1:8181/api/statusline/usage?sessionId=${sessionId}`,
      { timeout: 500 }
    );

    if (response.ok) {
      const data = await response.json();
      return {
        totalTokens: data.currentSession.totalTokens,
        totalCost: data.modelUsage.reduce((acc: number, m: any) =>
          acc + (m.total_cost || 0), 0
        ),
        isFromCCR: true
      };
    }
  } catch (e) {
    // Fallback to local metrics
  }

  return null;
}
```

### 3. Statusline Configuration Enhancement

Add CCR-specific configuration options:

**File: `config.json`** (example configuration)
```json
{
  "StatusLine": {
    "enabled": true,
    "showCCRStatus": true,
    "showModelUsage": true,
    "showCostTracking": true,
    "modules": [
      {
        "type": "ccr_status",
        "enabled": true,
        "position": 1
      },
      {
        "type": "model",
        "enabled": true,
        "position": 2
      },
      {
        "type": "tokens",
        "enabled": true,
        "showActual": true,
        "position": 3
      },
      {
        "type": "cost",
        "enabled": true,
        "warningThreshold": 10,
        "position": 4
      }
    ]
  }
}
```

---

## Integration with claude-statusline-fix

### 1. Token Metrics Proxy Integration

CCR can read token metrics from the claude-statusline-fix proxy:

```typescript
// Read token metrics from claude-statusline-fix
async function getActualTokenMetrics(): Promise<any> {
  try {
    const metricsPath = path.join(os.homedir(), '.claude', 'token-metrics.json');
    const metrics = await fs.readFile(metricsPath, 'utf-8');
    const data = JSON.parse(metrics);

    // Check freshness (ignore if older than 60 seconds)
    const age = Date.now() - data.timestamp;
    if (age > 60000) return null;

    return {
      input: data.metrics['claude_code.token.usage']?.input || 0,
      output: data.metrics['claude_code.token.usage']?.output || 0,
      cacheRead: data.metrics['claude_code.token.usage']?.cacheRead || 0,
      cacheCreation: data.metrics['claude_code.token.usage']?.cacheCreation || 0,
      isActual: true,
      timestamp: data.timestamp
    };
  } catch (e) {
    return null;
  }
}
```

### 2. Combined Statusline Display

The enhanced statusline shows:

```
🔀 CCR:gemini | 🤖 Gemini-2.5 | 📊 54.2k (actual) | 💰 $0.15 | 🔥 850 tok/min
```

Where:
- `🔀 CCR:gemini` - Shows CCR is active and routing to Gemini
- `🤖 Gemini-2.5` - Current model being used
- `📊 54.2k (actual)` - Real token count from OpenTelemetry
- `💰 $0.15` - Session cost (calculated by CCR)
- `🔥 850 tok/min` - Token generation rate

---

## API Reference

### GET `/api/statusline/usage`

Returns current usage information for the session.

**Query Parameters:**
- `sessionId` (string, required) - The session ID to get usage for

**Response:**
```json
{
  "isUsingCCR": true,
  "currentModel": {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "route": "gemini,gemini-2.5-flash"
  },
  "currentSession": {
    "inputTokens": 12500,
    "outputTokens": 8300,
    "totalTokens": 20800
  },
  "modelUsage": [
    {
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "total_input": 50000,
      "total_output": 35000,
      "total_cost": 0.15,
      "request_count": 25,
      "last_used": "2025-01-21T12:30:00Z"
    }
  ],
  "routerVersion": "1.0.47",
  "timestamp": "2025-01-21T12:35:00Z"
}
```

### GET `/api/statusline/detect`

Detects if CCR is active and returns configuration info.

**Response:**
```json
{
  "isActive": true,
  "routerVersion": "1.0.47",
  "routingMode": "active",
  "providers": [
    {
      "name": "gemini",
      "modelsCount": 3,
      "isActive": true
    }
  ],
  "features": {
    "tokenTracking": true,
    "costTracking": true,
    "statusLine": true,
    "customRouter": false
  }
}
```

---

## Implementation Steps

### Step 1: Add API Endpoints (30 minutes)
1. Add `/api/statusline/usage` endpoint
2. Add `/api/statusline/detect` endpoint
3. Test endpoints with curl

### Step 2: Update Statusline Parser (1 hour)
1. Add CCR detection logic
2. Integrate usage data fetching
3. Add cost display module
4. Test with Claude Code

### Step 3: Database Integration (Optional, 2 hours)
1. Add usage tracking database
2. Store per-model usage
3. Calculate costs

### Step 4: Testing (1 hour)
1. Test with CCR running
2. Test without CCR (fallback)
3. Test with token-metrics-proxy
4. Verify cost calculations

---

## Usage Examples

### Basic Usage Check
```bash
# Check if CCR is active
curl http://127.0.0.1:8181/api/statusline/detect

# Get usage for session
curl "http://127.0.0.1:8181/api/statusline/usage?sessionId=abc123"
```

### Statusline Configuration
```bash
# Enable in config
{
  "StatusLine": {
    "enabled": true,
    "showCCRStatus": true,
    "showModelUsage": true
  }
}

# Restart CCR
ccr restart
```

### With Token Metrics Proxy
```bash
# Start token proxy (from claude-statusline-fix)
./start-token-proxy.sh

# Start CCR with statusline
ccr start

# Use Claude Code
claude
```

---

## Benefits

1. **Visibility**: Always know when CCR is routing your requests
2. **Cost Awareness**: Real-time cost tracking per model
3. **Token Accuracy**: Actual token counts from OpenTelemetry
4. **Model Usage**: Track which models are being used most
5. **Integration**: Works with existing claude-statusline-fix tools

---

## Troubleshooting

### CCR Status Not Showing
- Ensure CCR is running: `ccr status`
- Check port 8181 is accessible
- Verify statusline config enabled

### Token Counts Incorrect
- Check token-metrics-proxy is running
- Verify OTEL environment variables set
- Ensure metrics file is fresh (<60s old)

### Cost Not Displaying
- Enable cost tracking in config
- Add model pricing data
- Check database permissions

---

*Statusline Integration v1.0 - January 2025*