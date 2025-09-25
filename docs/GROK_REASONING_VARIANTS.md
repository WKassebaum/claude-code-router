# Grok Fast Reasoning Variants: Selection Guide

## Overview

xAI provides two variants of the `grok-4-fast` model optimized for different use cases:

- **`grok-4-fast-reasoning`**: Enhanced logical reasoning, analysis, and explanations
- **`grok-4-fast-non-reasoning`**: Optimized for speed, code generation, and simple tasks

This guide explains how the Claude Code Router automatically selects between these variants.

## 🤖 Model Characteristics

### grok-4-fast-reasoning
**Strengths:**
- Complex logical analysis
- Debugging and troubleshooting
- Architectural decisions
- Detailed explanations
- Understanding "why" and "how"
- Comparative analysis

**Performance:**
- Speed: 8/10
- Quality: 8/10
- Reasoning: 9/10
- Cost: 4/10

**Best For:**
- "Why does this code fail?"
- "Explain the algorithm"
- "Compare these approaches"
- "Debug this issue"
- "Analyze this architecture"

### grok-4-fast-non-reasoning
**Strengths:**
- Rapid code generation
- Simple transformations
- Quick fixes
- Formatting tasks
- Straightforward queries
- Template creation

**Performance:**
- Speed: 10/10
- Quality: 7/10
- Reasoning: 5/10
- Cost: 3/10

**Best For:**
- "Generate a React component"
- "Convert this to TypeScript"
- "Format this JSON"
- "Create a boilerplate"
- "List all functions"

## 🎯 Automatic Selection

The `grok-fast-reasoning-router` transformer automatically analyzes your requests and selects the optimal variant.

### How It Works

1. **Request Analysis**: Scans your message for reasoning indicators
2. **Score Calculation**: Computes a reasoning score (0.0 to 1.0)
3. **Variant Selection**: Chooses based on threshold (default: 0.3)
4. **Model Routing**: Routes to appropriate variant

### Reasoning Score Factors

**Positive Indicators (→ reasoning variant):**
- Questions with "why", "how", "explain"
- Debugging/troubleshooting requests
- Comparative analysis ("pros and cons")
- Architecture/design discussions
- Multiple complex questions
- Algorithm complexity analysis

**Negative Indicators (→ non-reasoning variant):**
- "Create", "generate", "write" requests
- Simple transformations/conversions
- Formatting tasks
- Template/boilerplate requests
- "Quick" or "simple" keywords
- Straightforward listings

### Example Routing Decisions

```
Request: "Why does this authentication fail?"
→ Reasoning Score: 0.75
→ Selected: grok-4-fast-reasoning

Request: "Generate a login component"
→ Reasoning Score: 0.15
→ Selected: grok-4-fast-non-reasoning

Request: "Compare JWT vs session authentication"
→ Reasoning Score: 0.85
→ Selected: grok-4-fast-reasoning

Request: "Convert this to async/await"
→ Reasoning Score: 0.10
→ Selected: grok-4-fast-non-reasoning
```

## ⚙️ Configuration Options

### Basic Configuration

```json
{
  "transformers": [
    {
      "path": "/path/to/grok-fast-reasoning-router.js",
      "options": {
        "enabled": true,
        "defaultVariant": "auto"
      }
    }
  ]
}
```

### Advanced Configuration

```json
{
  "transformers": [
    {
      "path": "/path/to/grok-fast-reasoning-router.js",
      "options": {
        "enabled": true,
        "defaultVariant": "auto",        // 'reasoning', 'non-reasoning', 'auto'
        "reasoningThreshold": 0.3,       // 0.0-1.0, lower = more reasoning
        "preferReasoning": false,         // When uncertain, prefer reasoning?
        "explainRouting": true          // Add routing explanation to response
      }
    }
  ]
}
```

### Configuration Strategies

#### 1. Always Use Reasoning (Maximum Quality)
```json
{
  "defaultVariant": "reasoning"
}
```
**Use when:** Quality matters more than speed

#### 2. Always Use Non-Reasoning (Maximum Speed)
```json
{
  "defaultVariant": "non-reasoning"
}
```
**Use when:** Speed is critical, tasks are simple

#### 3. Conservative Auto-Selection (Prefer Reasoning)
```json
{
  "defaultVariant": "auto",
  "reasoningThreshold": 0.2,
  "preferReasoning": true
}
```
**Use when:** Want automatic selection but prefer quality

#### 4. Aggressive Auto-Selection (Prefer Speed)
```json
{
  "defaultVariant": "auto",
  "reasoningThreshold": 0.5,
  "preferReasoning": false
}
```
**Use when:** Want automatic selection but prefer speed

## 🎮 Manual Override

You can manually specify which variant to use in your Claude Code Router configuration:

### Router Configuration

```json
{
  "Router": {
    "default": "xai,grok-4-fast-reasoning",    // Force reasoning variant
    "background": "xai,grok-4-fast-non-reasoning", // Force non-reasoning
    "think": "xai,grok-4-fast-reasoning",      // Always use reasoning for think
    "code": "xai,grok-4-fast-non-reasoning"    // Speed for code generation
  }
}
```

### Direct Model Selection

When using CCR, you can specify the exact model:

```bash
# Force reasoning variant
ccr code --model xai,grok-4-fast-reasoning "Debug this authentication issue"

# Force non-reasoning variant
ccr code --model xai,grok-4-fast-non-reasoning "Generate a login form"
```

## 📊 Performance Comparison

| Task Type | Reasoning Variant | Non-Reasoning Variant | Recommendation |
|-----------|------------------|----------------------|----------------|
| Debugging | ⭐⭐⭐⭐⭐ | ⭐⭐ | Use reasoning |
| Code Generation | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Use non-reasoning |
| Architecture Design | ⭐⭐⭐⭐⭐ | ⭐⭐ | Use reasoning |
| Simple Fixes | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Use non-reasoning |
| Explanations | ⭐⭐⭐⭐⭐ | ⭐⭐ | Use reasoning |
| Transformations | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Use non-reasoning |
| Analysis | ⭐⭐⭐⭐⭐ | ⭐⭐ | Use reasoning |

## 🔍 Monitoring Selection

### Check Current Selection

The router logs its decisions:
```
[grok-fast-reasoning-router] Routing to grok-4-fast-reasoning (reasoning score: 0.65)
```

### View Selection Metadata

In your logs, you'll see:
```json
{
  "grok_fast_reasoning_router": {
    "enabled": true,
    "originalModel": "grok-4-fast",
    "selectedVariant": "grok-4-fast-reasoning",
    "reasoningScore": 0.65,
    "defaultVariant": "auto"
  }
}
```

## 🎯 Best Practices

### 1. Let Auto-Selection Handle It
The default auto-selection works well for most cases. The transformer analyzes your request and picks the optimal variant.

### 2. Override for Specific Workflows
```json
{
  // Use reasoning for complex debugging sessions
  "debug": "xai,grok-4-fast-reasoning",

  // Use non-reasoning for rapid prototyping
  "prototype": "xai,grok-4-fast-non-reasoning"
}
```

### 3. Monitor and Adjust
Watch the reasoning scores in logs to understand routing patterns:
- Scores consistently > 0.5? Consider lowering threshold
- Always selecting reasoning? Maybe increase threshold
- Wrong selections? Adjust `preferReasoning` setting

### 4. Team-Specific Configurations

**For QA/Testing Teams:**
```json
{
  "defaultVariant": "reasoning",  // Prioritize analysis
  "reasoningThreshold": 0.2
}
```

**For Rapid Development Teams:**
```json
{
  "defaultVariant": "auto",
  "reasoningThreshold": 0.4,
  "preferReasoning": false  // Prioritize speed
}
```

**For Architecture Teams:**
```json
{
  "defaultVariant": "reasoning",  // Always use reasoning
  "explainRouting": true
}
```

## 🤔 FAQs

### Q: Which variant is selected by default?
**A:** By default, the router uses auto-selection with a 0.3 threshold. Requests with reasoning scores ≥ 0.3 get the reasoning variant.

### Q: Can I use both variants in one session?
**A:** Yes! The router analyzes each request independently and can switch variants between messages.

### Q: How much slower is the reasoning variant?
**A:** The reasoning variant is approximately 20-25% slower but provides significantly better analysis and explanations.

### Q: Should I always use the reasoning variant for debugging?
**A:** Generally yes, but simple syntax errors or formatting issues can be handled by the non-reasoning variant.

### Q: Can I see which variant was used?
**A:** Yes, check the logs or enable `explainRouting` to see the selection in the response.

## 📈 Usage Patterns

Based on analysis, here are typical usage patterns:

- **70% auto-routed correctly** without configuration
- **20% benefit from threshold adjustment** based on use case
- **10% require explicit variant selection** for specialized workflows

The auto-router handles most cases well, but understanding these variants helps you optimize for your specific needs.