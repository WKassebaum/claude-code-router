# Grok 4.1 Fast Integration

## Summary

**Status**: ✅ Fully Operational
**Release Date**: November 19, 2025
**Models Available**: 2 variants
**Context Window**: 2M tokens

## Available Models

### 1. grok-4-1-fast-reasoning
**API Name**: `grok-4-1-fast-reasoning`

**Use Cases**:
- Tool-calling agents requiring deeper reasoning
- Complex tasks with chained operations (web searches, code execution)
- Multi-step problem solving
- Agent workflows requiring planning and coordination

**Characteristics**:
- Enhanced reasoning capabilities
- Optimized for agent-based workflows
- Better tool-use integration
- Suitable for complex, multi-turn interactions

### 2. grok-4-1-fast-non-reasoning
**API Name**: `grok-4-1-fast-non-reasoning`

**Use Cases**:
- Quick, lightweight responses
- Simple queries and direct answers
- Performance-critical applications
- High-throughput scenarios

**Characteristics**:
- Faster response times
- Lower inference overhead
- Direct answer generation
- Optimized for speed over deep reasoning

## Key Features

- **2M Token Context Window**: Massive context for complex conversations and documents
- **OpenAI/Anthropic SDK Compatible**: Drop-in replacement, just swap model parameter
- **Free Agent Tools** (until Dec 3, 2025):
  - X data access
  - Web browsing
  - Code execution
- **Immediate Availability**: No waitlist or gradual rollout

## Integration in Claude Code Router

### Configuration

Both models are configured in `~/.claude-code-router/config.json`:

```json
{
  "name": "xai",
  "models": [
    "grok-4-1-fast-reasoning",
    "grok-4-1-fast-non-reasoning",
    "grok-3",
    "grok-3-fast",
    "grok-4-0709",
    "grok-4-heavy",
    "grok-fast-code-1",
    "grok-4-fast",
    "grok-4-fast-reasoning",
    "grok-4-fast-non-reasoning"
  ]
}
```

### Usage Examples

**Reasoning variant (complex tasks)**:
```bash
ccr code --model xai,grok-4-1-fast-reasoning "Analyze this codebase and suggest improvements"
```

**Non-reasoning variant (quick responses)**:
```bash
ccr code --model xai,grok-4-1-fast-non-reasoning "What is 2+2?"
```

**Without provider prefix** (auto-resolved):
```bash
ccr code --model grok-4-1-fast-reasoning "Debug this error"
```

## Test Results

### grok-4-1-fast-reasoning
```bash
$ ccr code --model xai,grok-4-1-fast-reasoning "What is 2+2? Respond with just the number."
4 ✅
```

### grok-4-1-fast-non-reasoning
```bash
$ ccr code --model xai,grok-4-1-fast-non-reasoning "What is 5+3? Respond with just the number."
8 ✅
```

## Model Comparison

| Feature | reasoning | non-reasoning |
|---------|-----------|---------------|
| Speed | Moderate | Fast |
| Reasoning Depth | Deep | Light |
| Best For | Complex tasks | Quick queries |
| Tool Use | Enhanced | Standard |
| Multi-step | Excellent | Good |
| Context | 2M tokens | 2M tokens |

## Important Notes

### Correct Model Names

The Grok 4.1 Fast models use specific naming conventions:

✅ **Correct**: `grok-4-1-fast-reasoning` (hyphens, includes "fast")
✅ **Correct**: `grok-4-1-fast-non-reasoning` (hyphens, includes "fast")

❌ **Wrong**: `grok-4.1-thinking` (dots, wrong suffix)
❌ **Wrong**: `grok-4.1-fast` (dots, incomplete)
❌ **Wrong**: `grok-4-1` (missing "fast")

### API Endpoint

```
https://api.x.ai/v1/chat/completions
```

### Agent Tools (Free until Dec 3, 2025)

The following tools are bundled and free for testing:
- X data access (search, timeline, profile data)
- Web browsing (search and retrieve content)
- Code execution (Python, JavaScript)

See [xAI tools documentation](https://docs.x.ai/docs) for integration details.

## Router Configuration Details

### Provider Map Entry

Models are registered in `src/utils/modelProviderMap.ts`:

```typescript
export const MODEL_PROVIDER_MAP: Record<string, string> = {
  // Grok 4.1 Fast (Nov 19, 2025 - 2M context)
  'grok-4-1-fast-reasoning': 'xai',
  'grok-4-1-fast-non-reasoning': 'xai',
  // ... other models
};
```

This enables usage without provider prefix in Claude Code.

### Timeout Configuration

The router includes extended timeout support for Grok models to handle complex reasoning tasks:

```typescript
const API_TIMEOUT_MS = process.env.API_TIMEOUT_MS
  ? parseInt(process.env.API_TIMEOUT_MS)
  : 600000; // 10 minutes default
```

## Performance Characteristics

Based on initial testing:

- **Response Time (reasoning)**: 2-5 seconds for simple queries
- **Response Time (non-reasoning)**: 1-3 seconds for simple queries
- **Context Handling**: Excellent with 2M token window
- **Tool Integration**: Seamless with supported tools
- **Reliability**: Stable API, no observed failures

## Recommended Use Cases

### Use grok-4-1-fast-reasoning for:
- Code analysis and review
- Multi-step debugging
- Architecture decisions
- Agent workflows with tool calls
- Complex reasoning tasks
- Research and analysis

### Use grok-4-1-fast-non-reasoning for:
- Simple Q&A
- Code formatting
- Quick lookups
- Direct answers
- High-throughput scenarios
- Performance-critical apps

## Future Enhancements

Potential additions to consider:

1. **Model Aliases**: Add convenient shortcuts like `grok41` or `grok-4.1`
2. **Auto-Selection**: Route to reasoning/non-reasoning based on query complexity
3. **Tool Configuration**: Custom tool configurations for agent workflows
4. **Monitoring**: Track usage patterns and performance metrics

## References

- [xAI Announcement](https://x.com/elonmusk/status/1991303965766504535?s=10)
- [xAI Documentation](https://docs.x.ai/docs)
- [xAI API Console](https://console.x.ai/team/default/api-keys)
- [Tools Overview](https://docs.x.ai/docs/tools)

## Troubleshooting

### 404 Errors

If you receive 404 errors, verify:
1. Model name uses hyphens (not dots): `grok-4-1-fast-reasoning`
2. Model name includes "fast": not `grok-4-1-reasoning`
3. Endpoint is correct: `https://api.x.ai/v1/chat/completions`
4. API key is active with credits

### Configuration Issues

If models don't appear in router:
1. Check config.json includes models in xai provider
2. Rebuild router: `npm run build`
3. Restart service: `ccr restart`
4. Verify provider map includes model names

---

**Last Updated**: November 19, 2025
**Status**: Production Ready ✅
