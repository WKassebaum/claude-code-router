# Claude Code Router (CCR) Cheat Sheet

## 🚀 Quick Start
```bash
# Install CCR (one-time)
npm install -g @musistudio/claude-code-router

# Install Grok transformers (enhanced experience)
./install-grok-transformers.sh

# Start router service
ccr start

# Use Claude Code through router
ccr code "your prompt here"
```

## 📌 Essential Commands
| Command | Description |
|---------|-------------|
| `ccr start` | Start the router service |
| `ccr stop` | Stop the router service |
| `ccr restart` | Restart service (after config changes) |
| `ccr status` | Check service status |
| `ccr code "prompt"` | Run Claude Code with routing |
| `ccr ui` | Open web UI for config |
| `ccr -v` | Show version |

## 🔄 Dynamic Model Switching
Inside Claude Code, use `/model` command:
```bash
/model provider,model_name

# Examples:
/model xai,grok-4-fast          # Auto-selects reasoning variant
/model xai,grok-4-fast-reasoning # Force reasoning variant
/model xai,grok-4-fast-non-reasoning # Force non-reasoning variant
/model xai,grok-fast-code-1      # Coding optimized
/model gemini,gemini-2.5-pro     # Gemini Pro
/model openrouter,x-ai/grok-4-fast:free  # Free tier
```

## 🎯 Direct Model Selection
```bash
# Specify model directly in command
ccr code "xai,grok-4-fast" "analyze this codebase"
ccr code "openrouter,deepseek/deepseek-r1-0528" "solve this"
```

## ⚙️ Configuration Location
- Config file: `~/.claude-code-router/config.json`
- Logs: `~/.claude-code-router/logs/`
- Edit config → `ccr restart` to apply

## 🗂️ Default Routing (Your Setup)
| Task Type | Model | Context |
|-----------|-------|---------|
| Default | `gemini-2.5-flash` | General tasks |
| Background | `gemini-2.5-flash` | Low-priority |
| Thinking | `grok-4-0709` | Reasoning |
| Long Context | `grok-4-fast` → auto-variant | >1.5M tokens (2M max) |
| Coding | `grok-fast-code-1` | Code-specific |

## 🤖 Grok Reasoning Variants
**Auto-selected based on request analysis:**
| Model | Best For | Speed | Reasoning |
|-------|----------|-------|-----------|
| `grok-4-fast-reasoning` | Debugging, analysis, explanations | 8/10 | 9/10 |
| `grok-4-fast-non-reasoning` | Code generation, transformations | 10/10 | 5/10 |

## 🔧 Grok Transformers Management
```bash
# Install all transformers
./scripts/grok-transformers.sh install

# Check status
./scripts/grok-transformers.sh status

# Enable/disable specific transformer
./scripts/grok-transformers.sh disable grok-heartbeat
./scripts/grok-transformers.sh enable grok-status-updates

# Uninstall all
./scripts/grok-transformers.sh uninstall
```

**Available Transformers:**
- `grok-status-updates` - Progress tracking & status updates
- `grok-interactive` - Claude-like conversational style
- `grok-heartbeat` - Timeout prevention for long ops
- `grok-auto-router` - Intelligent model selection
- `grok-fast-reasoning-router` - Reasoning variant selection

## 💡 Pro Tips
- **Auto-start**: `ccr code` starts router if not running
- **Free models**: `openrouter,x-ai/grok-4-fast:free` (limited time)
- **Web UI**: `ccr ui` for visual config editing
- **Multiple prompts**: Use quotes for complex prompts
- **Reasoning auto-select**: `grok-4-fast` automatically picks variant
- **Force variant**: Use `grok-4-fast-reasoning` or `-non-reasoning`

## 🔧 Troubleshooting
```bash
# Service won't start?
ccr stop && ccr start

# Config not loading?
ccr restart

# Check if running
ccr status

# View logs
tail -f ~/.claude-code-router/logs/app.log
```

---
*CCR v1.1.0 | Config: ~/.claude-code-router/config.json | [Grok Transformers Installed]*