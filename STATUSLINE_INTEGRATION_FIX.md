# Claude Code Router - Statusline Integration Fix

## Current Issues

The statusline integration has several issues that need to be addressed:

### 1. **Model Tracking Problem**
- Currently only shows the **default** router model, not the **actual** model being used
- Session cache only tracks tokens, not which model/provider was used
- No per-request model tracking

### 2. **Missing Session Context**
- Statusline needs to know which specific model is being used for each Claude instance
- Should update in real-time as routing decisions change

## Required Fixes

### Fix 1: Enhance Session Cache
```typescript
// Update src/utils/cache.ts
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  model?: string;  // Add current model
  provider?: string;  // Add current provider
  route?: string;  // Add full route string
  timestamp?: string;  // Add last update time
}
```

### Fix 2: Track Actual Model in Router
```typescript
// In src/utils/router.ts after model selection
sessionUsageCache.put(req.sessionId, {
  ...existingUsage,
  model: model.split(',')[1],
  provider: model.split(',')[0],
  route: model,
  timestamp: new Date().toISOString()
});
```

### Fix 3: Update Statusline Endpoint
```typescript
// In src/server.ts - /api/statusline/usage endpoint
const currentUsage = sessionUsageCache.get(sessionId);

return {
  isUsingCCR: true,
  currentModel: {
    provider: currentUsage?.provider || provider,
    model: currentUsage?.model || model,
    route: currentUsage?.route || activeRoute,
    isActual: !!currentUsage?.route  // true if we have actual usage
  },
  // ... rest of response
};
```

## How Statusline Should Work

### For Each Claude Instance:
1. **Query**: `GET /api/statusline/usage?sessionId={sessionId}`
2. **Response Shows**:
   - Which router/model is **currently** being used
   - Real-time token usage for this session
   - Whether it's using default routing or specific model

### Example Statusline Display:
```
Claude Code [CCR: gemini,gemini-2.0-flash-exp | 12.5k/8.3k tokens | $0.0023]
```

### When Model Changes:
```
Claude Code [CCR: switching to openrouter,google/gemini-exp-1206 | Long context mode]
```

## Testing Plan

### 1. Test Default Routing
```bash
# Start a session with default routing
ccr code "Test default routing"
# Check statusline shows default model

# Query statusline
curl "http://localhost:8181/api/statusline/usage?sessionId=test123"
```

### 2. Test Long Context Switching
```bash
# Send large context to trigger long context model
ccr code "$(cat large-file.txt)"
# Statusline should show switch to longContext model
```

### 3. Test Direct Model Selection
```bash
# Use specific model
ccr code --model "gemini,gemini-2.0-flash-exp" "Test direct model"
# Statusline should show the specific model
```

### 4. Test Web Search Model
```bash
# Trigger web search
ccr code "Search the web for latest AI news"
# Statusline should show webSearch model
```

## Implementation Priority

1. **Immediate**: Fix session cache to track actual model
2. **Next**: Update router to save model info
3. **Then**: Update statusline endpoint
4. **Finally**: Test with actual Claude statusline

## Expected Behavior

The statusline should:
- Show the **actual** model being used, not just the default
- Update in real-time as routing decisions change
- Persist model info across requests in the same session
- Show cost accumulation for the session
- Indicate when special routing modes are active (long context, web search, etc.)

## Integration with claude-statusline-fix

Your `/Users/wrk/WorkDev/MCP-Dev/claude-statusline-fix` project should:
1. Poll `/api/statusline/usage` with the current session ID
2. Parse the response to get current model and usage
3. Format and display on the statusline
4. Update every few seconds or after each request

The CCR side needs to provide accurate, real-time model information for this to work properly.