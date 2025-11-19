# Gemini 3.0 Integration

## Overview

Support for Google Gemini 3.0 models has been added to the Claude Code Router, following the same graceful fallback pattern established for Grok 4.1. This ensures the router is ready to use Gemini 3.0 models when they become available via API, without breaking when they're not yet accessible.

**Release Date**: November 18, 2025
**Integration Date**: November 18, 2025

## Key Capabilities

### Performance
- **LMArena Elo Score**: 1501 (highest scoring model as of Nov 2025)
- **Outperforms**: GPT-5, Grok 4.1, Claude Opus 4.1, and all other major models

### Benchmarks
- **Humanity's Last Exam**: 37.5% (PhD-level reasoning)
- **GPQA Diamond**: 91.9% (graduate-level science questions)
- **MathArena Apex**: 23.4% (advanced mathematics)

### Features
- **Context Window**: >2 million tokens (extended from Gemini 2.5's 2M)
- **Multimodal Understanding**: Text, images, video, audio, code
- **Reasoning Capabilities**: PhD-level reasoning across domains
- **Agentic Coding**: Integration with Google Antigravity platform
- **Deep Think Mode**: Coming soon for Gemini Ultra subscribers

## Model Identifiers

### Added to Configuration
The following model identifiers have been added to `config.json` in the `_gemini_3.0_models_when_available` field:

```json
"_gemini_3.0_models_when_available": [
  "gemini-3-pro",
  "gemini-3-pro-preview",
  "gemini-3-pro-preview-11-2025"
]
```

### Model Variants

1. **gemini-3-pro**: Stable release (expected general availability)
2. **gemini-3-pro-preview**: Preview access model
3. **gemini-3-pro-preview-11-2025**: Dated preview release (Nov 2025)

## Availability

- **AI Studio**: Available now
- **Vertex AI**: Available now
- **Gemini API**: Available now (generativelanguage.googleapis.com)
- **Direct API Access**: May be limited initially

## Integration Approach

### Graceful Fallback Pattern

Following the same pattern as Grok 4.1:

1. **Comment Field Storage**: Models stored in `_gemini_3.0_models_when_available` field
2. **No Breaking Changes**: Router continues using Gemini 2.5 models until 3.0 confirmed working
3. **Easy Activation**: Move models from comment field to `models` array when ready
4. **Existing Infrastructure**: Uses same API endpoint and transformer as Gemini 2.5/2.0

### Configuration Location

**File**: `~/.claude-code-router/config.json`

**Section**: Gemini provider (lines 88-106)

```json
{
  "name": "gemini",
  "api_base_url": "https://generativelanguage.googleapis.com/v1beta/models/",
  "api_key": "AIzaSyA...",
  "models": [
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash"
  ],
  "_gemini_3.0_models_when_available": [
    "gemini-3-pro",
    "gemini-3-pro-preview",
    "gemini-3-pro-preview-11-2025"
  ],
  "transformer": {
    "use": [
      "gemini"
    ]
  }
}
```

## Activation Instructions

When Gemini 3.0 API access is confirmed working:

### Step 1: Move Models to Active List

```json
"models": [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-3-pro"
]
```

### Step 2: Remove or Keep Comment Field

You can either:
- Remove the comment field entirely
- Keep it for future model variants (e.g., Deep Think mode)

### Step 3: Restart Router

```bash
ccr restart
```

### Step 4: Test the New Model

```bash
ccr code --model gemini,gemini-3-pro "Test prompt to verify Gemini 3.0 works"
```

## Router Logic

### No Special Routing Required

Unlike Grok models, Gemini 3.0 doesn't require special auto-routing logic:

- **Same API Endpoint**: Uses existing `generativelanguage.googleapis.com` endpoint
- **Same Transformer**: Uses existing `gemini` transformer
- **Same Authentication**: Uses existing API key
- **Default Timeouts**: Works with standard timeout configuration

### Optional: Update Default Routes

Consider updating router defaults when Gemini 3.0 proves stable:

```json
"Router": {
  "default": "gemini,gemini-3-pro",
  "background": "gemini,gemini-2.5-flash",
  "think": "gemini,gemini-3-pro",
  "longContext": "gemini,gemini-3-pro"
}
```

## Future Enhancements

### Deep Think Mode
When Google releases Deep Think mode for Ultra subscribers:

1. Add model identifier (e.g., `gemini-3-pro-deep-think`)
2. Consider adding timeout configuration similar to Grok thinking modes
3. Update router to prefer Deep Think for complex reasoning tasks

### Potential Router Logic
If Deep Think becomes available, consider adding:

```typescript
// Similar to selectOptimalGrokModel
const selectOptimalGeminiModel = (req, tokenCount, defaultModel) => {
  // Detect complex reasoning tasks
  if (isComplexReasoning) {
    return tryModel('gemini,gemini-3-pro-deep-think', 'gemini,gemini-3-pro');
  }
  return defaultModel;
};
```

## Testing Checklist

When API access becomes available:

- [ ] Test basic completion with gemini-3-pro
- [ ] Verify long context handling (>1M tokens)
- [ ] Test multimodal capabilities (if applicable)
- [ ] Verify streaming responses work correctly
- [ ] Compare performance vs Gemini 2.5 Pro
- [ ] Monitor response quality and accuracy
- [ ] Check timeout handling for complex tasks
- [ ] Verify cost tracking and usage analytics

## Comparison with Other Models

### LMArena Elo Scores (Nov 2025)
1. **Gemini 3.0 Pro**: 1501 Elo ⭐️
2. **Grok 4.1 Thinking**: 1483 Elo
3. **GPT-5**: ~1470 Elo
4. **Claude Opus 4.1**: ~1460 Elo
5. **o3**: ~1450 Elo

### Use Case Recommendations

**Gemini 3.0 Pro Best For**:
- Complex reasoning and analysis
- PhD-level domain expertise
- Multimodal understanding
- Long context processing (>1M tokens)
- Code generation and review

**Gemini 2.5 Flash Best For**:
- Fast background tasks
- Simple queries
- Cost-sensitive operations
- High-volume requests

## Resources

- **Official Announcement**: https://blog.google/products/gemini/gemini-3/
- **X Announcement**: https://x.i/trending/1990747487942881422
- **API Documentation**: https://ai.google.dev/gemini-api/docs
- **Vertex AI Docs**: https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini

## Change Log

### 2025-11-18: Initial Integration
- Added Gemini 3.0 model identifiers to config
- Documented activation process
- Prepared for future Deep Think mode
- Built and deployed router v1.0.65+

## Notes

- Integration follows same graceful fallback pattern as Grok 4.1
- No router code changes required (uses existing Gemini infrastructure)
- Models stored in comment field until API access confirmed
- Ready for immediate activation when available
- Future-proofed for Deep Think mode and additional variants
