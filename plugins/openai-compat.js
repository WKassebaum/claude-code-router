/**
 * OpenAI Compatibility Transformer
 *
 * This transformer ensures requests sent to OpenAI are compatible with their API
 * by stripping Claude-specific parameters and fixing incompatibilities.
 *
 * Handles:
 * - Strips 'reasoning' and other Claude-specific parameters
 * - Truncates tool names to 64 characters (OpenAI limit)
 */

class OpenAICompatTransformer {
  constructor(options = {}) {
    this.name = 'openai-compat';
    this.options = {
      enabled: options.enabled !== false,
      logStrippedParams: options.logStrippedParams !== false,
      maxToolNameLength: options.maxToolNameLength || 64, // OpenAI limit
      stripParams: options.stripParams || [
        'reasoning',
        'reasoning_content',
        'thinking',
        'thinking_content',
        'metadata'
      ],
      ...options
    };
    console.log(`[${this.name}] Initialized with options:`, JSON.stringify(this.options, null, 2));
  }

  /**
   * Transform the request to ensure OpenAI compatibility
   */
  transformRequestIn(request, provider, context) {
    if (!this.options.enabled) {
      return request;
    }

    const modifications = [];

    // Strip incompatible top-level parameters
    for (const param of this.options.stripParams) {
      if (request[param] !== undefined) {
        modifications.push(`stripped:${param}`);
        delete request[param];
      }
    }

    // Truncate long tool names (OpenAI has 64-char limit)
    if (request.tools && Array.isArray(request.tools)) {
      let truncatedCount = 0;
      for (const tool of request.tools) {
        if (tool.function && tool.function.name) {
          const originalName = tool.function.name;
          if (originalName.length > this.options.maxToolNameLength) {
            tool.function.name = originalName.substring(0, this.options.maxToolNameLength);
            truncatedCount++;
          }
        }
      }
      if (truncatedCount > 0) {
        modifications.push(`truncated:${truncatedCount} tool names`);
      }
    }

    // Convert max_tokens to max_completion_tokens (OpenAI newer models)
    if (request.max_tokens !== undefined) {
      request.max_completion_tokens = request.max_tokens;
      delete request.max_tokens;
      modifications.push('max_tokens→max_completion_tokens');
    }

    // Log modifications if any
    if (modifications.length > 0 && this.options.logStrippedParams) {
      console.log(`[${this.name}] OpenAI compat: ${modifications.join(', ')}`);
    }

    return request;
  }

  /**
   * Response transformation - pass through unchanged
   */
  transformResponseOut(response, context) {
    return response;
  }
}

module.exports = OpenAICompatTransformer;
