# Grok Status Update Transformers

This directory contains specialized transformers designed to enhance xAI Grok models with interactive status updates and Claude-like behavior patterns for better integration with Claude Code.

## Overview

The new XAI models are designed for agentic behavior and can work independently, but this makes them difficult to track when using Claude Code. These transformers bridge the communication gap between Claude's interactive style and Grok's autonomous execution pattern.

## Transformers

### 1. `grok-status-updates.js`
**Purpose**: Adds periodic status updates and progress tracking during autonomous execution

**Features**:
- Injects status update instructions into system prompts
- Provides real-time progress indicators every 15 seconds
- Enhances streaming responses with contextual status messages
- Prevents user confusion during long-running operations

**Configuration Options**:
```json
{
  "statusInterval": 15000,
  "enableProgressTracking": true,
  "enableTaskBreakdown": true,
  "statusFormat": "markdown"
}
```

### 2. `grok-interactive.js`
**Purpose**: Makes Grok models adopt Claude-like interactive communication patterns

**Features**:
- Adds conversational, step-by-step explanations
- Encourages clarifying questions and confirmations
- Enhances responses with interactive elements when missing
- Promotes "thinking out loud" behavior

**Configuration Options**:
```json
{
  "enableStepByStep": true,
  "enableQuestions": true,
  "enableConfirmations": true,
  "conversationalStyle": "friendly",
  "verbosityLevel": "detailed"
}
```

### 3. `grok-heartbeat.js`
**Purpose**: Provides heartbeat functionality for long-running operations

**Features**:
- Prevents timeouts during extended autonomous execution
- Monitors connection health with periodic signals
- Tracks operation status and duration
- Provides keep-alive functionality for streaming responses

**Configuration Options**:
```json
{
  "heartbeatInterval": 30000,
  "maxOperationTime": 300000,
  "enableKeepAlive": true,
  "enableTimeoutPrevention": true,
  "heartbeatFormat": "minimal"
}
```

### 4. `grok-auto-router.js`
**Purpose**: Intelligent model selection based on request complexity analysis

**Features**:
- Analyzes request complexity and requirements
- Automatically selects optimal Grok model variant
- Balances speed vs quality based on task type
- Routes coding tasks, reasoning tasks, and simple queries appropriately

**Model Routing Matrix**:
- **grok-4-fast**: Quick responses, simple coding, fast iteration
- **grok-4-0709**: Complex reasoning, architecture decisions, deep analysis
- **grok-4-heavy**: Complex problems, large codebases, comprehensive analysis
- **grok-fast-code-1**: Code generation, refactoring, development tasks
- **grok-3**: General purpose, balanced tasks, moderate complexity
- **grok-3-fast**: Quick queries, simple tasks, rapid prototyping

**Configuration Options**:
```json
{
  "enableAutoRouting": true,
  "enableComplexityAnalysis": true,
  "enablePerformanceOptimization": true,
  "routingStrategy": "balanced"
}
```

## Installation

1. **Copy transformer files** to your Claude Code Router plugins directory:
   ```bash
   cp plugins/*.js ~/.claude-code-router/plugins/
   ```

2. **Update your configuration** (`~/.claude-code-router/config.json`):

   Add the transformers section:
   ```json
   {
     "transformers": [
       {
         "path": "/Users/[username]/.claude-code-router/plugins/grok-status-updates.js",
         "options": {
           "statusInterval": 15000,
           "enableProgressTracking": true,
           "enableTaskBreakdown": true,
           "statusFormat": "markdown"
         }
       },
       {
         "path": "/Users/[username]/.claude-code-router/plugins/grok-interactive.js",
         "options": {
           "enableStepByStep": true,
           "enableQuestions": true,
           "enableConfirmations": true,
           "conversationalStyle": "friendly",
           "verbosityLevel": "detailed"
         }
       },
       {
         "path": "/Users/[username]/.claude-code-router/plugins/grok-heartbeat.js",
         "options": {
           "heartbeatInterval": 30000,
           "maxOperationTime": 300000,
           "enableKeepAlive": true,
           "enableTimeoutPrevention": true,
           "heartbeatFormat": "minimal"
         }
       },
       {
         "path": "/Users/[username]/.claude-code-router/plugins/grok-auto-router.js",
         "options": {
           "enableAutoRouting": true,
           "enableComplexityAnalysis": true,
           "enablePerformanceOptimization": true,
           "routingStrategy": "balanced"
         }
       }
     ]
   }
   ```

   Update your xAI provider configuration:
   ```json
   {
     "name": "xai",
     "api_base_url": "https://api.x.ai/v1/chat/completions",
     "api_key": "your-xai-api-key",
     "models": ["grok-3", "grok-3-fast", "grok-4-0709", "grok-4-heavy", "grok-fast-code-1", "grok-4-fast"],
     "transformer": {
       "use": [
         "grok-status-updates",
         "grok-interactive",
         "grok-heartbeat",
         "grok-auto-router"
       ]
     }
   }
   ```

3. **Restart Claude Code Router**:
   ```bash
   ccr restart
   ```

## Benefits

- **Enhanced User Experience**: Grok models provide Claude-like interactive feedback
- **Timeout Prevention**: Long operations won't time out due to heartbeat functionality
- **Intelligent Routing**: Automatic model selection optimizes for speed/quality balance
- **Progress Tracking**: Real-time status updates during autonomous execution
- **Better Integration**: Seamless Claude Code compatibility with status line support

## Verification

After installation, you can verify the transformers are loaded by checking the logs:

```bash
tail -f ~/.claude-code-router/logs/ccr-*.log | grep "grok-"
```

You should see entries like:
```
register transformer: grok-status-updates (no endpoint)
register transformer: grok-interactive (no endpoint)
register transformer: grok-heartbeat (no endpoint)
register transformer: grok-auto-router (no endpoint)
```

## Troubleshooting

- **Transformers not loading**: Check file paths in config.json match your actual plugin directory
- **Permission errors**: Ensure transformer files have read permissions
- **Configuration errors**: Validate your config.json syntax with a JSON validator
- **API issues**: Verify your xAI API key is valid and has appropriate permissions

## Development

These transformers are designed to be:
- **Modular**: Each can be enabled/disabled independently
- **Configurable**: Extensive options for customization
- **Extensible**: Easy to modify for specific use cases
- **Compatible**: Works with existing CCR infrastructure

For advanced customization, modify the transformer files directly or create variants for specific workflows.