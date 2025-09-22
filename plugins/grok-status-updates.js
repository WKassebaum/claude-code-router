/**
 * Grok Status Updates Transformer
 *
 * This transformer enhances xAI Grok models to provide periodic status updates
 * during autonomous execution, making them more compatible with Claude Code's
 * interactive expectations.
 */

class GrokStatusUpdatesTransformer {
  constructor(options = {}) {
    this.name = 'grok-status-updates';
    this.options = {
      statusInterval: options.statusInterval || 15000, // 15 seconds
      enableProgressTracking: options.enableProgressTracking !== false,
      enableTaskBreakdown: options.enableTaskBreakdown !== false,
      statusFormat: options.statusFormat || 'markdown',
      ...options
    };
  }

  /**
   * Transform the outgoing request to add status update instructions
   */
  transformRequest(request, context) {
    // Only apply to xAI Grok models
    if (!this.isGrokModel(context)) {
      return request;
    }

    // Add status update instructions to system message
    const statusInstructions = this.generateStatusInstructions();

    if (request.messages && request.messages.length > 0) {
      // Find or create system message
      let systemMessage = request.messages.find(msg => msg.role === 'system');

      if (systemMessage) {
        // Append to existing system message
        systemMessage.content += '\n\n' + statusInstructions;
      } else {
        // Create new system message at the beginning
        request.messages.unshift({
          role: 'system',
          content: statusInstructions
        });
      }
    }

    // Add metadata for tracking
    if (!request.metadata) {
      request.metadata = {};
    }
    request.metadata.grok_status_updates = {
      enabled: true,
      interval: this.options.statusInterval,
      timestamp: Date.now()
    };

    return request;
  }

  /**
   * Transform the response to inject status updates into streams
   */
  transformResponse(response, context) {
    // Only apply to xAI Grok models
    if (!this.isGrokModel(context)) {
      return response;
    }

    // If streaming response, inject periodic status updates
    if (response.stream && this.options.enableProgressTracking) {
      return this.injectStatusUpdates(response, context);
    }

    return response;
  }

  /**
   * Generate status update instructions for the system prompt
   */
  generateStatusInstructions() {
    return `## Status Update Protocol for Interactive Development

You are working in an interactive development environment where users expect regular progress updates. Please follow these guidelines:

### Status Update Requirements:
1. **Provide progress updates every 10-15 seconds** during long-running operations
2. **Break down complex tasks** into visible steps with completion status
3. **Communicate your current activity** clearly and concisely
4. **Use progress indicators** when appropriate (e.g., "Step 2/5: Analyzing code structure...")

### Status Update Format:
- Use clear, actionable language: "Currently analyzing...", "Now implementing...", "Checking..."
- Include time estimates when possible: "This will take approximately 30 seconds..."
- Show progress through multi-step operations: "Completed file analysis (3/7 files processed)"
- Explain what you're doing and why: "Searching codebase for authentication patterns to understand current implementation"

### Interactive Behavior Guidelines:
- **Think out loud** - explain your reasoning as you work
- **Ask for clarification** if requirements are unclear
- **Confirm your approach** before starting complex operations
- **Provide intermediate results** for long analysis tasks
- **Signal completion** clearly when tasks are finished

### Example Status Updates:
- "🔍 Analyzing codebase structure... (estimated 20 seconds)"
- "📝 Creating transformer files: 2/4 completed"
- "🧪 Testing configuration changes... almost done"
- "✅ File analysis complete. Found 5 relevant authentication functions."

This ensures a smooth, Claude-like interactive experience while maintaining your autonomous capabilities.`;
  }

  /**
   * Inject status updates into streaming responses
   */
  injectStatusUpdates(response, context) {
    const originalStream = response.stream;
    let lastUpdateTime = Date.now();
    let currentChunk = '';

    const statusStream = new ReadableStream({
      start(controller) {
        const reader = originalStream.getReader();

        const processChunk = async () => {
          try {
            const { done, value } = await reader.read();

            if (done) {
              controller.close();
              return;
            }

            // Accumulate content for analysis
            if (typeof value === 'string') {
              currentChunk += value;
            }

            // Check if we should inject a status update
            const now = Date.now();
            if (now - lastUpdateTime > this.options.statusInterval) {
              const statusUpdate = this.generateRuntimeStatusUpdate(currentChunk, context);
              if (statusUpdate) {
                // Inject status update into stream
                controller.enqueue('\n\n' + statusUpdate + '\n\n');
                lastUpdateTime = now;
              }
            }

            controller.enqueue(value);
            processChunk();
          } catch (error) {
            controller.error(error);
          }
        };

        processChunk();
      }
    });

    return {
      ...response,
      stream: statusStream
    };
  }

  /**
   * Generate runtime status updates based on current progress
   */
  generateRuntimeStatusUpdate(currentContent, context) {
    const contentLength = currentContent.length;
    const hasCodeBlocks = /```/.test(currentContent);
    const hasLists = /^\s*[-*]\s/m.test(currentContent);

    // Generate contextual status messages
    if (contentLength > 500 && hasCodeBlocks) {
      return "📝 *Continuing code implementation... generating detailed solution*";
    } else if (contentLength > 300 && hasLists) {
      return "📋 *Working through analysis steps... building comprehensive response*";
    } else if (contentLength > 200) {
      return "💭 *Processing your request... developing detailed response*";
    }

    return null; // No status update needed
  }

  /**
   * Check if the current model is a Grok model
   */
  isGrokModel(context) {
    if (!context || !context.model) {
      return false;
    }

    const modelName = context.model.toLowerCase();
    return modelName.includes('grok') ||
           (context.provider && context.provider.toLowerCase().includes('xai'));
  }

  /**
   * Get transformer metadata
   */
  getMetadata() {
    return {
      name: this.name,
      version: '1.0.0',
      description: 'Adds status updates and progress tracking to Grok models for better Claude Code integration',
      supportedProviders: ['xai'],
      supportedModels: ['grok-*'],
      options: this.options
    };
  }
}

// Export the transformer
module.exports = GrokStatusUpdatesTransformer;