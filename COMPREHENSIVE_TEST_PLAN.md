# Claude Code Router v1.0.53 - Comprehensive Test Plan

## Test Status: ❌ NOT YET FULLY TESTED

## 1. Basic Service Operations

### ✅ Completed
- [x] Build process
- [x] Service start/stop (with issues)

### ❌ Need to Test
```bash
# Service Management
ccr start
ccr status
ccr restart
ccr stop

# Verify port is listening
lsof -i :8181
curl http://localhost:8181/health
```

## 2. Routing Capabilities

### Test Default Routing
```bash
# Should use configured default model
ccr code "What is 2+2?"
# Check logs: tail -f ~/.claude-code-router/logs/ccr-*.log
# Should see: "Using default model"
```

### Test Long Context Routing
```bash
# Create large file
echo "$(python3 -c 'print("test " * 20000)')" > large.txt

# Should trigger long context model
ccr code "$(cat large.txt) Summarize this"
# Check logs for: "Using long context model due to token count"
```

### Test Background Routing (Haiku)
```bash
# Should trigger background model
ccr code --model claude-3-5-haiku "Simple task"
# Check logs for: "Using background model for claude-3-5-haiku"
```

### Test Web Search Routing
```bash
# Should trigger web search model (if web search tools present)
ccr code "Search the web for latest AI news"
# Check logs for web search model activation
```

### Test Direct Model Selection
```bash
# Test each provider directly
ccr code --model "gemini,gemini-2.0-flash-exp" "Test Gemini"
ccr code --model "openai,gpt-4" "Test OpenAI"
ccr code --model "xai,grok-4-fast" "Test xAI"
ccr code --model "anthropic,claude-3-5-sonnet" "Test Anthropic"
```

### Test CCR Router Models
```bash
# Test new CCR model names
ccr code --model ccr-default "Test CCR default"
ccr code --model ccr-long-context "Test CCR long context"
ccr code --model ccr-background "Test CCR background"
ccr code --model ccr-web-search "Test CCR web search"
```

## 3. Anthropic Subscription Authentication

### Setup Test Provider
```json
// Add to config.json
{
  "Providers": [{
    "name": "anthropic-subscription",
    "auth_type": "subscription",
    "auth_token": "YOUR_SUBSCRIPTION_TOKEN",
    "models": ["claude-3-5-sonnet", "claude-opus-4"]
  }]
}
```

### Test Subscription Auth
```bash
# Route to subscription provider
ccr code --model "anthropic-subscription,claude-3-5-sonnet" "Test subscription"

# Check environment variables are set correctly
# Logs should show ANTHROPIC_AUTH_TOKEN being used, not ANTHROPIC_API_KEY
```

## 4. MCP Tool Schema Filtering

### Test with Gemini (Max depth 5)
```bash
# This should filter/simplify MCP tools
ccr code --model "gemini,gemini-2.0-flash-exp" "/context"

# Check logs for:
grep "Applying tool schema limitations for provider: gemini" ~/.claude-code-router/logs/ccr-*.log
grep "Filtering out problematic tool: mcp__firecrawl" ~/.claude-code-router/logs/ccr-*.log
grep "Simplifying tool schema" ~/.claude-code-router/logs/ccr-*.log
```

### Test with xAI (Max depth 10)
```bash
# Should have less restrictive filtering
ccr code --model "xai,grok-4-fast" "/context"

# Check if tools are preserved better than Gemini
```

## 5. Usage Tracking & Database

### Test Database Creation
```bash
# Check database exists and has correct permissions
ls -la ~/.claude-code-router/usage.db
# Should show: -rw------- (600 permissions)

# Check tables exist
sqlite3 ~/.claude-code-router/usage.db ".tables"
# Should show: daily_summaries model_pricing usage_records
```

### Test Usage Recording
```bash
# Make several requests
for i in {1..5}; do
  ccr code "Test request $i"
  sleep 1
done

# Check records were written
sqlite3 ~/.claude-code-router/usage.db "SELECT COUNT(*) FROM usage_records;"
# Should show 5+ records
```

### Test Batch Writing
```bash
# Monitor batch writes (100ms delay)
tail -f ~/.claude-code-router/logs/ccr-*.log &

# Make rapid requests
for i in {1..10}; do ccr code "Quick $i" & done

# Should see batched writes in logs, not individual
```

## 6. API Endpoints

### Test Authentication on Sensitive Endpoints
```bash
# Should fail without auth
curl http://localhost:8181/api/usage/summary
# Expected: 401 Unauthorized

# Should work with auth
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:8181/api/usage/summary
# Expected: 200 OK with data
```

### Test Model Listing
```bash
# Get all available models
curl http://localhost:8181/v1/models | jq '.data[] | {id: .id, owner: .owned_by}'

# Should include:
# - ccr-default, ccr-long-context, etc. (CCR router models)
# - Direct provider models (gemini,model-name format)
```

### Test Statusline Endpoints
```bash
# Detection endpoint
curl http://localhost:8181/api/statusline/detect
# Should return: {"isActive": true, "routerVersion": "1.0.53", ...}

# Usage endpoint (needs session ID)
curl "http://localhost:8181/api/statusline/usage?sessionId=test123"
# Should return current model and usage
```

### Test Usage Export
```bash
# Export as CSV
curl -H "X-API-Key: YOUR_API_KEY" \
  "http://localhost:8181/api/usage/export?format=csv&startDate=2025-09-01" \
  -o usage.csv

# Export as JSON
curl -H "X-API-Key: YOUR_API_KEY" \
  "http://localhost:8181/api/usage/export?format=json&startDate=2025-09-01" \
  -o usage.json
```

## 7. Usage Dashboard UI

### Test Dashboard Access
```bash
# Open dashboard in browser
open http://localhost:8181/ui/

# Should show:
# - Date range selector
# - Summary cards (Cost, Tokens, Requests, Response Time)
# - Model breakdown table
# - Cost distribution chart
```

### Test Dashboard Functions
- [ ] Change date range
- [ ] Export CSV
- [ ] Export JSON
- [ ] Refresh data
- [ ] Sort table columns

## 8. Security Testing

### SQL Injection Test
```bash
# Attempt SQL injection (should fail safely)
curl -X POST http://localhost:8181/api/usage/summary \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2025-01-01'; DROP TABLE usage_records; --"}'
# Should not execute SQL, return error
```

### File Permission Test
```bash
# Check all sensitive files have correct permissions
ls -la ~/.claude-code-router/usage.db
ls -la ~/.claude-code-router/backups/*.db
# All should be -rw------- (600)
```

## 9. Performance Testing

### Load Test
```bash
# Install Apache Bench if needed
brew install httpd

# Create test request
echo '{"model":"ccr-default","messages":[{"role":"user","content":"test"}]}' > request.json

# Run load test
ab -n 100 -c 10 -H "X-API-Key: YOUR_KEY" \
   -H "Content-Type: application/json" \
   -T "application/json" \
   -p request.json \
   http://localhost:8181/v1/messages

# Check performance metrics
```

## 10. Statusline Integration

### ❌ CURRENT ISSUE: Statusline shows default model, not actual

### What Should Happen:
1. Each Claude instance gets unique session ID
2. Statusline polls `/api/statusline/usage?sessionId=XXX`
3. Shows actual model being used (not just default)
4. Updates in real-time as routing changes

### Test Statusline Accuracy
```bash
# Start with default
SESSION_ID="test-$(date +%s)"
ccr code --session "$SESSION_ID" "Test 1"
curl "http://localhost:8181/api/statusline/usage?sessionId=$SESSION_ID"
# Should show actual model used

# Switch to long context
ccr code --session "$SESSION_ID" "$(cat large.txt)"
curl "http://localhost:8181/api/statusline/usage?sessionId=$SESSION_ID"
# Should show long context model

# Use specific model
ccr code --session "$SESSION_ID" --model "gemini,gemini-2.0-flash-exp" "Test"
curl "http://localhost:8181/api/statusline/usage?sessionId=$SESSION_ID"
# Should show gemini model
```

## Test Execution Checklist

- [ ] Service starts and stops properly
- [ ] All routing modes work (default, long context, background, web search)
- [ ] Direct model selection works
- [ ] CCR model aliases work (ccr-default, etc.)
- [ ] Anthropic subscription authentication works
- [ ] MCP tool filtering works for Gemini/xAI
- [ ] Database creates with correct permissions
- [ ] Usage tracking records all requests
- [ ] Batch writing works efficiently
- [ ] API authentication blocks unauthorized access
- [ ] Model listing endpoint returns all models
- [ ] Statusline endpoints return correct data
- [ ] Usage export works (CSV and JSON)
- [ ] Dashboard UI loads and functions
- [ ] Security tests pass (no injection, correct permissions)
- [ ] Performance is acceptable under load
- [ ] Statusline shows ACTUAL model (needs fix)

## Known Issues to Fix

1. **Statusline shows default model instead of actual** - Need to track per-request model
2. **Service startup issues** - Sometimes hangs at config loading
3. **Session model tracking** - Cache doesn't track which model was used

## Next Steps

1. Fix statusline to show actual model being used
2. Add session-based model tracking
3. Complete all tests in this checklist
4. Document any new issues found
5. Update claude-statusline-fix project to poll correctly