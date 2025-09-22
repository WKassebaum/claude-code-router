/**
 * Grok Heartbeat Transformer
 *
 * This transformer provides heartbeat functionality for long-running Grok operations,
 * preventing timeouts and providing connection health monitoring during extended
 * autonomous execution periods.
 */

class GrokHeartbeatTransformer {
  constructor(options = {}) {
    this.name = 'grok-heartbeat';
    this.options = {
      heartbeatInterval: options.heartbeatInterval || 30000, // 30 seconds
      maxOperationTime: options.maxOperationTime || 300000, // 5 minutes
      enableKeepAlive: options.enableKeepAlive !== false,
      enableTimeoutPrevention: options.enableTimeoutPrevention !== false,
      heartbeatFormat: options.heartbeatFormat || 'minimal',
      ...options
    };

    this.activeOperations = new Map();
    this.heartbeatTimers = new Map();
  }

  /**
   * Transform the outgoing request to set up heartbeat monitoring
   */
  transformRequest(request, context) {
    // Only apply to xAI Grok models
    if (!this.isGrokModel(context)) {
      return request;
    }

    // Add heartbeat instructions to system message
    const heartbeatInstructions = this.generateHeartbeatInstructions();

    if (request.messages && request.messages.length > 0) {
      // Find or create system message
      let systemMessage = request.messages.find(msg => msg.role === 'system');

      if (systemMessage) {
        // Append to existing system message
        systemMessage.content += '\n\n' + heartbeatInstructions;
      } else {
        // Create new system message at the beginning
        request.messages.unshift({
          role: 'system',
          content: heartbeatInstructions
        });
      }
    }

    // Set up operation tracking
    const operationId = this.generateOperationId();
    this.startOperationTracking(operationId, context);

    // Add metadata for tracking
    if (!request.metadata) {
      request.metadata = {};
    }
    request.metadata.grok_heartbeat = {
      enabled: true,
      operationId: operationId,
      startTime: Date.now(),
      heartbeatInterval: this.options.heartbeatInterval
    };

    return request;
  }

  /**
   * Transform the response to implement heartbeat functionality
   */
  transformResponse(response, context) {
    // Only apply to xAI Grok models
    if (!this.isGrokModel(context)) {
      return response;
    }

    // If streaming response, implement heartbeat keepalive
    if (response.stream && this.options.enableKeepAlive) {
      return this.implementHeartbeatStream(response, context);
    }

    // For non-streaming responses, clean up operation tracking
    const operationId = context.request?.metadata?.grok_heartbeat?.operationId;
    if (operationId) {
      this.stopOperationTracking(operationId);
    }

    return response;
  }

  /**
   * Generate heartbeat instructions for the system prompt
   */
  generateHeartbeatInstructions() {
    return `## Long-Running Operation Guidelines

For operations that may take extended time:

### Heartbeat Protocol:
1. **Signal your progress regularly** - provide updates every 20-30 seconds during long operations
2. **Use heartbeat markers** when processing large amounts of data or performing extensive analysis
3. **Maintain connection health** by sending periodic progress signals
4. **Break down long operations** into smaller, reportable chunks

### Heartbeat Signals:
Use these patterns for different operation types:

**Data Processing:**
- "🔄 Processing data... [X%] complete"
- "📊 Analyzing dataset: batch [X] of [Y]"
- "⚙️ Transformation in progress... [estimated time remaining]"

**Code Analysis:**
- "🔍 Scanning codebase... [X] files processed"
- "📝 Generating analysis... [component] of [total]"
- "🧪 Running tests... [test suite] [X/Y] complete"

**Long Computations:**
- "💭 Computing results... please wait"
- "🔧 Optimizing solution... iteration [X]"
- "📈 Building comprehensive response..."

### Timeout Prevention:
- Send a heartbeat signal at least every 30 seconds
- Use "..." or progress indicators to show ongoing work
- Provide estimated completion times when possible
- Signal clearly when operations are complete

### Connection Health:
- Maintain steady output during long operations
- Use minimal but consistent progress indicators
- Ensure the stream remains active with periodic updates

This prevents timeouts and maintains user awareness during autonomous execution.`;
  }

  /**
   * Generate a unique operation ID
   */
  generateOperationId() {
    return `grok_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start tracking a long-running operation
   */
  startOperationTracking(operationId, context) {
    const operation = {
      id: operationId,
      startTime: Date.now(),
      context: context,
      heartbeatCount: 0,
      lastHeartbeat: Date.now()
    };

    this.activeOperations.set(operationId, operation);

    // Set up heartbeat timer
    if (this.options.enableKeepAlive) {
      const timer = setInterval(() => {
        this.sendHeartbeat(operationId);
      }, this.options.heartbeatInterval);

      this.heartbeatTimers.set(operationId, timer);
    }
  }

  /**
   * Stop tracking an operation
   */
  stopOperationTracking(operationId) {
    this.activeOperations.delete(operationId);

    const timer = this.heartbeatTimers.get(operationId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(operationId);
    }
  }

  /**
   * Send a heartbeat signal for an operation
   */
  sendHeartbeat(operationId) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      return;
    }

    const now = Date.now();
    const elapsed = now - operation.startTime;

    // Check if operation has exceeded maximum time
    if (elapsed > this.options.maxOperationTime) {
      console.warn(`Operation ${operationId} has exceeded maximum time (${elapsed}ms)`);
      this.stopOperationTracking(operationId);
      return;
    }

    operation.heartbeatCount++;
    operation.lastHeartbeat = now;

    // Log heartbeat (can be extended to send actual signals if needed)
    if (this.options.heartbeatFormat === 'verbose') {
      console.log(`[Heartbeat] Operation ${operationId}: ${Math.floor(elapsed/1000)}s elapsed`);
    }
  }

  /**
   * Implement heartbeat stream wrapper
   */
  implementHeartbeatStream(response, context) {
    const originalStream = response.stream;
    const operationId = context.request?.metadata?.grok_heartbeat?.operationId;

    let lastActivity = Date.now();
    let heartbeatTimer;

    const heartbeatStream = new ReadableStream({
      start(controller) {
        const reader = originalStream.getReader();

        // Set up heartbeat monitoring
        heartbeatTimer = setInterval(() => {
          const now = Date.now();
          const timeSinceActivity = now - lastActivity;

          // If no activity for longer than heartbeat interval, send a keepalive
          if (timeSinceActivity > this.options.heartbeatInterval) {
            const keepalive = this.generateKeepAliveSignal(timeSinceActivity);
            controller.enqueue(keepalive);
            lastActivity = now;
          }
        }, this.options.heartbeatInterval);

        const processChunk = async () => {
          try {
            const { done, value } = await reader.read();

            if (done) {
              // Clean up on completion
              if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
              }
              if (operationId) {
                this.stopOperationTracking(operationId);
              }
              controller.close();
              return;
            }

            // Update activity timestamp
            lastActivity = Date.now();

            controller.enqueue(value);
            processChunk();
          } catch (error) {
            if (heartbeatTimer) {
              clearInterval(heartbeatTimer);
            }
            if (operationId) {
              this.stopOperationTracking(operationId);
            }
            controller.error(error);
          }
        };

        processChunk();
      }
    });

    return {
      ...response,
      stream: heartbeatStream
    };
  }

  /**
   * Generate a keep-alive signal
   */
  generateKeepAliveSignal(timeSinceActivity) {
    const seconds = Math.floor(timeSinceActivity / 1000);

    switch (this.options.heartbeatFormat) {
      case 'minimal':
        return '⚡'; // Just a simple signal
      case 'verbose':
        return `\n*[Heartbeat: processing continues... ${seconds}s]*\n`;
      case 'progress':
        return `\n🔄 *Working... ${seconds}s elapsed*\n`;
      default:
        return '...'; // Default minimal indicator
    }
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
      description: 'Provides heartbeat and timeout prevention for long-running Grok operations',
      supportedProviders: ['xai'],
      supportedModels: ['grok-*'],
      options: this.options,
      activeOperations: this.activeOperations.size
    };
  }

  /**
   * Get status of active operations
   */
  getActiveOperations() {
    const operations = [];
    for (const [id, operation] of this.activeOperations) {
      operations.push({
        id: id,
        startTime: operation.startTime,
        elapsed: Date.now() - operation.startTime,
        heartbeatCount: operation.heartbeatCount,
        lastHeartbeat: operation.lastHeartbeat
      });
    }
    return operations;
  }

  /**
   * Clean up all operations (useful for shutdown)
   */
  cleanup() {
    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();
    this.activeOperations.clear();
  }
}

// Export the transformer
module.exports = GrokHeartbeatTransformer;