# Installing from Feature Branch

This guide explains how to install claude-code-router from our `integration/analytics-v2` feature branch instead of the upstream npm package.

## Why Use This Branch?

The `integration/analytics-v2` branch includes enhancements not yet in upstream:

| Feature | Description |
|---------|-------------|
| **OpenAI Direct Routing** | Full compatibility with OpenAI API (gpt-5.x, o3, o4-mini) |
| **Grok Stall Detection** | Monitor streaming for silent periods, timeout warnings |
| **Grok Transformers** | Status updates, interactive mode, heartbeat, auto-routing |
| **UI Timezone Fixes** | Correct date range handling in UsageDashboard |
| **New Model Support** | Claude Opus 4.5, GPT-5.2, Gemini 3 Pro, Grok 4.1 Fast |

## Quick Install (Recommended)

```bash
# Install directly from GitHub feature branch
npm install -g github:WKassebaum/claude-code-router#integration/analytics-v2
```

## Install from Clone (For Development)

```bash
# Clone the repository
git clone https://github.com/WKassebaum/claude-code-router.git
cd claude-code-router

# Switch to feature branch
git checkout integration/analytics-v2

# Install dependencies and build
npm install
npm run build

# Link globally
npm link
```

## Post-Install Setup

### 1. Copy Plugin Files

The plugins need to be in your config directory:

```bash
# Create plugins directory
mkdir -p ~/.claude-code-router/plugins

# Copy plugins from installed package
cp -r $(npm root -g)/@musistudio/claude-code-router/plugins/* ~/.claude-code-router/plugins/

# Or if installed from clone:
cp -r plugins/* ~/.claude-code-router/plugins/
```

### 2. Configure Plugins

Add transformers to your `~/.claude-code-router/config.json`:

```json
{
  "transformers": [
    {
      "path": "~/.claude-code-router/plugins/openai-compat.js",
      "options": {
        "enabled": true,
        "logStrippedParams": true
      }
    },
    {
      "path": "~/.claude-code-router/plugins/grok-status-updates.js",
      "options": {
        "statusInterval": 15000,
        "enableProgressTracking": true
      }
    }
  ]
}
```

### 3. Configure OpenAI Provider (Example)

```json
{
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "$OPENAI_API_KEY",
      "models": [
        "gpt-5.2",
        "gpt-5.1",
        "gpt-5.1-codex",
        "o3",
        "o3-mini"
      ],
      "transformer": {
        "use": ["openai-compat"]
      }
    }
  ]
}
```

## Verify Installation

```bash
# Check version
ccr --version

# Test OpenAI routing
ccr code --model openai,gpt-5.1 "What is 2+2? Just the number."

# Test Grok routing
ccr code --model xai,grok-4-fast "Hello, respond briefly."
```

## Updating

```bash
# If installed from GitHub
npm update -g github:WKassebaum/claude-code-router#integration/analytics-v2

# If installed from clone
cd claude-code-router
git pull origin integration/analytics-v2
npm install
npm run build
```

## Reverting to Upstream

```bash
# Remove feature branch version
npm uninstall -g @musistudio/claude-code-router

# Install upstream
npm install -g @musistudio/claude-code-router
```

## Plugin Reference

| Plugin | Purpose |
|--------|---------|
| `openai-compat.js` | Strip Claude params, fix tool names, convert max_tokens |
| `grok-status-updates.js` | Periodic progress updates during execution |
| `grok-interactive.js` | Claude-like interactive communication |
| `grok-heartbeat.js` | Timeout prevention for long operations |
| `grok-auto-router.js` | Route by task complexity |
| `grok-fast-reasoning-router.js` | Route between reasoning/non-reasoning variants |

## Troubleshooting

### OpenAI "Unknown parameter" errors
Ensure `openai-compat` transformer is configured for the OpenAI provider.

### Grok appears stuck
Check logs at `~/.claude-code-router/logs/` for `[GROK-STALL]` warnings.

### Plugin not loading
Verify the path in config.json uses full absolute path or `~/` expansion.

---

**Branch**: `integration/analytics-v2`
**Upstream**: https://github.com/musistudio/claude-code-router
