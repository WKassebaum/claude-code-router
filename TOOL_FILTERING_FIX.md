# MCP Tool Schema Filtering Fix

**Version**: 1.0.51
**Date**: September 21, 2025

## Issue
When using MCP tools with certain providers (like Gemini), errors occurred due to deeply nested function schemas exceeding the provider's maximum nesting depth:
```
FunctionDeclaration 'mcp__firecrawl-mcp__firecrawl_crawl' in the request exceeds the maximum allowed nesting depth
```

## Root Cause
Different LLM providers have varying limitations on how deeply nested function/tool schemas can be:
- **Gemini**: Maximum nesting depth of 5
- **xAI**: Maximum nesting depth of 10 (estimated)
- **Anthropic/OpenAI**: No known strict limits

MCP tools, particularly the Firecrawl tools, have complex nested schemas that exceed these limits.

## Solution

### 1. Created Tool Schema Simplifier (`src/utils/toolSchemaSimplifier.ts`)
- Detects provider from model name
- Calculates schema nesting depth
- Simplifies deeply nested schemas by flattening them
- Filters out known problematic tools for specific providers

### 2. Integrated into Router (`src/utils/router.ts`)
- Applied after model selection
- Applied before request is sent to provider
- Preserves original functionality for providers without limitations

## Configuration

The tool filtering is configured in `PROVIDER_LIMITATIONS`:

```typescript
const PROVIDER_LIMITATIONS = {
  gemini: {
    maxNestingDepth: 5,
    problematicTools: [
      'mcp__firecrawl-mcp__firecrawl_crawl',
      'mcp__firecrawl-mcp__firecrawl_scrape',
      // ... other tools
    ]
  },
  xai: {
    maxNestingDepth: 10,
    problematicTools: []
  }
};
```

## How It Works

1. **Detection**: When a request is routed to a provider with known limitations
2. **Analysis**: Each tool's schema is analyzed for nesting depth
3. **Action**:
   - **Filter**: Remove tools that are known to be problematic
   - **Simplify**: Flatten schemas that exceed the provider's nesting limit
   - **Preserve**: Keep tools that meet the provider's requirements

## Schema Simplification Example

**Before** (Deeply nested):
```json
{
  "type": "object",
  "properties": {
    "scrapeOptions": {
      "type": "object",
      "properties": {
        "formats": {
          "type": "array",
          "items": {
            "anyOf": [
              { "type": "string" },
              {
                "type": "object",
                "properties": {
                  "schema": {
                    "type": "object",
                    "additionalProperties": { ... }
                  }
                }
              }
            ]
          }
        }
      }
    }
  }
}
```

**After** (Simplified):
```json
{
  "type": "object",
  "properties": {
    "scrapeOptions": {
      "type": "string",
      "description": "JSON string: Complex nested object for scrape options"
    }
  }
}
```

## Testing

To test the fix:
1. Start CCR: `ccr start`
2. Use a model that routes to Gemini or xAI
3. Run a query that would normally trigger MCP tools
4. Verify no schema nesting errors occur

## Future Improvements

1. **Dynamic Detection**: Automatically detect provider limitations from error responses
2. **User Configuration**: Allow users to customize tool filtering per provider
3. **Smart Simplification**: Preserve more schema structure while staying within limits
4. **Tool Prioritization**: Keep most important tools when filtering

## Impact

This fix ensures CCR works seamlessly with all providers, regardless of their schema complexity limitations, while maintaining functionality for providers without such restrictions.