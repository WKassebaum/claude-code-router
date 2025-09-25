/**
 * Grok Fast Reasoning Router
 *
 * This transformer intelligently selects between grok-4-fast-reasoning and
 * grok-4-fast-non-reasoning variants based on request analysis. It extends
 * the auto-router to handle these specific model variants.
 */

class GrokFastReasoningRouter {
  constructor(options = {}) {
    this.name = 'grok-fast-reasoning-router';
    this.options = {
      enabled: options.enabled !== false,
      defaultVariant: options.defaultVariant || 'auto', // 'reasoning', 'non-reasoning', 'auto'
      reasoningThreshold: options.reasoningThreshold || 0.3, // 30% confidence triggers reasoning
      preferReasoning: options.preferReasoning || false, // When uncertain, prefer reasoning variant
      ...options
    };

    // Model variant specifications
    this.modelVariants = {
      'grok-4-fast-reasoning': {
        speed: 8,
        quality: 8,
        reasoning: 9,
        cost: 4,
        bestFor: ['logic puzzles', 'analysis', 'explanations', 'debugging', 'architecture']
      },
      'grok-4-fast-non-reasoning': {
        speed: 10,
        quality: 7,
        reasoning: 5,
        cost: 3,
        bestFor: ['code generation', 'transformations', 'formatting', 'simple queries']
      }
    };
  }

  /**
   * Transform request to select appropriate grok-4-fast variant
   */
  transformRequest(request, context) {
    // Check if enabled
    if (!this.options.enabled) {
      return request;
    }

    // Only process if the current model is grok-4-fast (base)
    if (!context.model || !context.model.includes('grok-4-fast')) {
      return request;
    }

    // Skip if already a specific variant
    if (context.model.includes('-reasoning') || context.model.includes('-non-reasoning')) {
      return request;
    }

    // Analyze request to determine if reasoning is needed
    const reasoningScore = this.calculateReasoningScore(request);
    const selectedVariant = this.selectVariant(reasoningScore, request);

    // Update model selection
    if (selectedVariant !== context.model) {
      console.log(`[${this.name}] Routing to ${selectedVariant} (reasoning score: ${reasoningScore.toFixed(2)})`);

      // Add metadata
      if (!request.metadata) {
        request.metadata = {};
      }
      request.metadata.grok_fast_reasoning_router = {
        enabled: true,
        originalModel: context.model,
        selectedVariant: selectedVariant,
        reasoningScore: reasoningScore,
        defaultVariant: this.options.defaultVariant,
        timestamp: Date.now()
      };

      // Update context if possible
      if (context.setModel) {
        context.setModel(selectedVariant);
      }

      // Add routing explanation to system prompt if verbose
      if (this.options.explainRouting) {
        this.addRoutingExplanation(request, selectedVariant, reasoningScore);
      }
    }

    return request;
  }

  /**
   * Calculate reasoning score based on request content
   */
  calculateReasoningScore(request) {
    let score = 0;
    let factors = 0;

    if (!request.messages || request.messages.length === 0) {
      return 0;
    }

    // Analyze all user messages
    const userMessages = request.messages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content || '')
      .join('\n');

    // Reasoning indicators (high weight)
    const strongReasoningPatterns = [
      /\b(why|explain|reason|analyze|understand|logic|deduce|infer)\b/gi,
      /\b(how does.*work|what.*mean|cause.*effect)\b/gi,
      /\b(compare|contrast|evaluate|assess|judge)\b/gi,
      /\b(pros and cons|trade-?offs?|advantages|disadvantages)\b/gi,
      /\b(debug|troubleshoot|diagnose|root cause)\b/gi,
      /\b(architecture|design pattern|system design)\b/gi,
      /\b(algorithm|complexity|optimization)\b/gi
    ];

    // Non-reasoning indicators (negative weight)
    const nonReasoningPatterns = [
      /\b(convert|transform|format|refactor)\b/gi,
      /\b(create|generate|write|implement)\s+(a|an|the)?\s*\w+/gi,
      /\b(fix|update|change|modify)\s+(this|the)?\s*code\b/gi,
      /\b(list|show|display|output)\b/gi,
      /\b(simple|quick|fast|straightforward)\b/gi,
      /\b(template|boilerplate|scaffold)\b/gi
    ];

    // Calculate positive score for reasoning
    strongReasoningPatterns.forEach(pattern => {
      const matches = userMessages.match(pattern);
      if (matches) {
        score += matches.length * 0.15;
        factors++;
      }
    });

    // Calculate negative score for non-reasoning
    nonReasoningPatterns.forEach(pattern => {
      const matches = userMessages.match(pattern);
      if (matches) {
        score -= matches.length * 0.10;
        factors++;
      }
    });

    // Check for question complexity
    const questions = userMessages.match(/\?/g);
    if (questions && questions.length > 2) {
      score += 0.2; // Multiple questions suggest reasoning need
      factors++;
    }

    // Check for code complexity
    const codeBlocks = userMessages.match(/```/g);
    if (codeBlocks && codeBlocks.length >= 2) {
      // Code present - check if it's for analysis vs generation
      if (/\b(bug|error|issue|problem|wrong)\b/i.test(userMessages)) {
        score += 0.3; // Debugging requires reasoning
      } else {
        score -= 0.1; // Code generation might not need reasoning
      }
      factors++;
    }

    // Check message length (longer often needs more reasoning)
    if (userMessages.length > 500) {
      score += 0.1;
      factors++;
    }

    // Normalize score to 0-1 range
    const normalizedScore = Math.max(0, Math.min(1, score));

    return normalizedScore;
  }

  /**
   * Select variant based on reasoning score and configuration
   */
  selectVariant(reasoningScore, request) {
    // Handle explicit default variant setting
    if (this.options.defaultVariant === 'reasoning') {
      return 'grok-4-fast-reasoning';
    }
    if (this.options.defaultVariant === 'non-reasoning') {
      return 'grok-4-fast-non-reasoning';
    }

    // Auto selection based on score
    if (reasoningScore >= this.options.reasoningThreshold) {
      return 'grok-4-fast-reasoning';
    } else if (reasoningScore <= -this.options.reasoningThreshold) {
      return 'grok-4-fast-non-reasoning';
    } else {
      // In the uncertainty zone
      return this.options.preferReasoning ?
        'grok-4-fast-reasoning' :
        'grok-4-fast-non-reasoning';
    }
  }

  /**
   * Add routing explanation to system prompt
   */
  addRoutingExplanation(request, variant, score) {
    const explanation = `
[Model Routing: Selected ${variant} based on reasoning score ${score.toFixed(2)}]
${variant === 'grok-4-fast-reasoning' ?
  'Optimized for: logical analysis, explanations, debugging, and complex reasoning' :
  'Optimized for: quick responses, code generation, and straightforward tasks'}
`;

    if (request.messages && request.messages.length > 0) {
      const systemMessage = request.messages.find(msg => msg.role === 'system');
      if (systemMessage) {
        systemMessage.content = explanation + '\n\n' + systemMessage.content;
      } else {
        request.messages.unshift({
          role: 'system',
          content: explanation
        });
      }
    }
  }

  /**
   * Get metadata about the transformer
   */
  getMetadata() {
    return {
      name: this.name,
      version: '1.0.0',
      description: 'Intelligently routes between grok-4-fast-reasoning and non-reasoning variants',
      supportedModels: ['grok-4-fast', 'grok-4-fast-reasoning', 'grok-4-fast-non-reasoning'],
      options: this.options,
      modelVariants: this.modelVariants
    };
  }
}

// Export the transformer
module.exports = GrokFastReasoningRouter;