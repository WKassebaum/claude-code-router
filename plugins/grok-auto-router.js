/**
 * Grok Auto-Router Transformer
 *
 * This transformer provides intelligent routing for xAI Grok models based on
 * request content, complexity, and performance requirements. It optimizes
 * model selection to balance speed and capability.
 */

class GrokAutoRouterTransformer {
  constructor(options = {}) {
    this.name = 'grok-auto-router';
    this.options = this.validateAndNormalizeOptions(options);

    // Model capability matrix
    this.modelCapabilities = this.initializeModelCapabilities();
  }

  /**
   * Validate and normalize configuration options
   */
  validateAndNormalizeOptions(options) {
    const validated = {
      enabled: options.enabled !== false, // Default enabled
      enableAutoRouting: options.enableAutoRouting !== false,
      enableComplexityAnalysis: options.enableComplexityAnalysis !== false,
      enablePerformanceOptimization: options.enablePerformanceOptimization !== false,
      routingStrategy: this.validateRoutingStrategy(options.routingStrategy),
      ...options
    };

    // Log configuration warnings if any
    this.logConfigurationWarnings(options, validated);

    return validated;
  }

  /**
   * Validate routing strategy
   */
  validateRoutingStrategy(strategy) {
    const validStrategies = ['balanced', 'speed', 'quality'];
    if (!strategy || !validStrategies.includes(strategy)) {
      if (strategy) {
        console.warn(`[${this.name}] Invalid routingStrategy '${strategy}', using 'balanced'`);
      }
      return 'balanced';
    }
    return strategy;
  }

  /**
   * Log configuration warnings
   */
  logConfigurationWarnings(original, validated) {
    if (original.routingStrategy && original.routingStrategy !== validated.routingStrategy) {
      console.warn(`[${this.name}] routingStrategy adjusted from '${original.routingStrategy}' to '${validated.routingStrategy}'`);
    }

    // Warn about conflicting settings
    if (validated.enableAutoRouting === false && validated.enableComplexityAnalysis === true) {
      console.warn(`[${this.name}] enableComplexityAnalysis is true but enableAutoRouting is false - complexity analysis will have no effect`);
    }
  }

  /**
   * Initialize model capability matrix
   */
  initializeModelCapabilities() {
    return {
      'grok-4-fast': {
        speed: 10,
        quality: 7,
        reasoning: 6,
        coding: 8,
        maxTokens: 100000,
        cost: 3,
        bestFor: ['quick responses', 'simple coding', 'fast iteration']
      },
      'grok-4-0709': {
        speed: 6,
        quality: 9,
        reasoning: 9,
        coding: 9,
        maxTokens: 200000,
        cost: 7,
        bestFor: ['complex reasoning', 'architecture decisions', 'deep analysis']
      },
      'grok-4-heavy': {
        speed: 4,
        quality: 10,
        reasoning: 10,
        coding: 10,
        maxTokens: 500000,
        cost: 10,
        bestFor: ['complex problems', 'large codebases', 'comprehensive analysis']
      },
      'grok-fast-code-1': {
        speed: 9,
        quality: 8,
        reasoning: 7,
        coding: 10,
        maxTokens: 150000,
        cost: 4,
        bestFor: ['code generation', 'refactoring', 'development tasks']
      },
      'grok-3': {
        speed: 7,
        quality: 8,
        reasoning: 8,
        coding: 8,
        maxTokens: 128000,
        cost: 5,
        bestFor: ['general purpose', 'balanced tasks', 'moderate complexity']
      },
      'grok-3-fast': {
        speed: 9,
        quality: 7,
        reasoning: 6,
        coding: 7,
        maxTokens: 64000,
        cost: 2,
        bestFor: ['quick queries', 'simple tasks', 'rapid prototyping']
      }
    };
  }

  /**
   * Transform the outgoing request to implement auto-routing
   */
  transformRequest(request, context) {
    // Check if transformer is enabled
    if (!this.options.enabled) {
      return request;
    }

    // Only apply to xAI provider requests
    if (!this.isXAIProvider(context)) {
      return request;
    }

    // Analyze request to determine optimal model
    const analysis = this.analyzeRequest(request, context);
    const recommendedModel = this.selectOptimalModel(analysis);

    // If we have a better model recommendation, update the context
    if (recommendedModel && recommendedModel !== context.model) {
      console.log(`[Grok Auto-Router] Recommending ${recommendedModel} for this request (was: ${context.model})`);

      // Add routing metadata to request
      if (!request.metadata) {
        request.metadata = {};
      }
      request.metadata.grok_auto_router = {
        enabled: true,
        originalModel: context.model,
        recommendedModel: recommendedModel,
        analysis: analysis,
        routingReason: this.getRoutingReason(analysis, recommendedModel),
        timestamp: Date.now()
      };

      // Update context model (this might require CCR support)
      if (context.setModel) {
        context.setModel(recommendedModel);
      }
    }

    // Add auto-routing guidance to system message
    const routingGuidance = this.generateRoutingGuidance(analysis, recommendedModel);
    if (routingGuidance) {
      this.addSystemMessage(request, routingGuidance);
    }

    return request;
  }

  /**
   * Analyze the request to determine complexity and requirements
   */
  analyzeRequest(request, context) {
    const analysis = {
      complexity: 'medium',
      category: 'general',
      requiresReasoning: false,
      requiresCoding: false,
      isLongContext: false,
      isTimesensitive: false,
      contentLength: 0,
      hasCode: false,
      hasMultipleSteps: false,
      requiresDeepAnalysis: false
    };

    // Analyze message content
    if (request.messages && request.messages.length > 0) {
      const allContent = request.messages
        .filter(msg => msg.role === 'user')
        .map(msg => msg.content)
        .join('\n');

      analysis.contentLength = allContent.length;
      analysis.hasCode = this.detectCode(allContent);
      analysis.hasMultipleSteps = this.detectMultipleSteps(allContent);
      analysis.requiresReasoning = this.detectReasoningNeed(allContent);
      analysis.requiresCoding = this.detectCodingNeed(allContent);
      analysis.requiresDeepAnalysis = this.detectDeepAnalysisNeed(allContent);
      analysis.isTimeS_Sensitive = this.detectTimeSensitivity(allContent);
      analysis.isLongContext = this.detectLongContext(allContent, request);

      // Categorize the request
      analysis.category = this.categorizeRequest(allContent);

      // Determine overall complexity
      analysis.complexity = this.calculateComplexity(analysis);
    }

    return analysis;
  }

  /**
   * Detect if content contains code
   */
  detectCode(content) {
    const codePatterns = [
      /```[\s\S]*?```/g,
      /`[^`\n]+`/g,
      /\b(function|class|import|export|const|let|var|def|async|await)\b/i,
      /[{}\[\];]/,
      /\b(npm|pip|git|docker|kubectl)\s+/i
    ];
    return codePatterns.some(pattern => pattern.test(content));
  }

  /**
   * Detect if request involves multiple steps
   */
  detectMultipleSteps(content) {
    const stepPatterns = [
      /\b(step\s+\d+|first|second|third|then|next|after|finally)\b/i,
      /\b\d+\.\s/g,
      /\b(and then|followed by|afterwards)\b/i
    ];
    return stepPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Detect if request requires reasoning
   */
  detectReasoningNeed(content) {
    const reasoningPatterns = [
      /\b(why|how|explain|analyze|reason|logic|because|therefore|however)\b/i,
      /\b(compare|contrast|evaluate|assess|judge|decide|choose)\b/i,
      /\b(pros and cons|advantages|disadvantages|trade-?offs?)\b/i,
      /\b(what if|scenario|alternative|option)\b/i
    ];
    return reasoningPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Detect if request involves coding tasks
   */
  detectCodingNeed(content) {
    const codingPatterns = [
      /\b(implement|code|program|develop|build|create|write)\b.*\b(function|class|api|component|module)\b/i,
      /\b(refactor|optimize|debug|fix|test)\b/i,
      /\b(framework|library|package|dependency)\b/i,
      /\b(typescript|javascript|python|java|rust|go|c\+\+)\b/i
    ];
    return codingPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Detect if request requires deep analysis
   */
  detectDeepAnalysisNeed(content) {
    const deepAnalysisPatterns = [
      /\b(comprehensive|thorough|detailed|in-depth|extensive)\b/i,
      /\b(architecture|design pattern|system design|scalability)\b/i,
      /\b(performance|optimization|bottleneck|security)\b/i,
      /\b(complex|complicated|sophisticated|advanced)\b/i
    ];
    return deepAnalysisPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Detect if request is time-sensitive
   */
  detectTimeSensitivity(content) {
    const urgentPatterns = [
      /\b(urgent|quickly|fast|asap|immediately|now|quick)\b/i,
      /\b(deadline|time|rush|hurry)\b/i
    ];
    return urgentPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Detect if request involves long context
   */
  detectLongContext(content, request) {
    const totalTokens = this.estimateTokens(request);
    const hasLargeFiles = /\b(large|big|huge|massive)\s+(file|codebase|project|repository)\b/i.test(content);
    const hasMultipleFiles = /multiple.*files?|many.*files?|several.*files?/i.test(content);

    return totalTokens > 50000 || hasLargeFiles || hasMultipleFiles;
  }

  /**
   * Categorize the request type
   */
  categorizeRequest(content) {
    if (this.detectCodingNeed(content)) return 'coding';
    if (this.detectReasoningNeed(content)) return 'reasoning';
    if (this.detectDeepAnalysisNeed(content)) return 'analysis';
    if (/\b(question|what|how|why)\b/i.test(content)) return 'question';
    if (/\b(help|assist|support)\b/i.test(content)) return 'assistance';
    return 'general';
  }

  /**
   * Calculate overall complexity score
   */
  calculateComplexity(analysis) {
    let score = 0;

    if (analysis.contentLength > 1000) score += 2;
    if (analysis.hasCode) score += 2;
    if (analysis.hasMultipleSteps) score += 1;
    if (analysis.requiresReasoning) score += 2;
    if (analysis.requiresCoding) score += 2;
    if (analysis.requiresDeepAnalysis) score += 3;
    if (analysis.isLongContext) score += 3;

    if (score <= 2) return 'low';
    if (score <= 5) return 'medium';
    if (score <= 8) return 'high';
    return 'very_high';
  }

  /**
   * Select optimal model based on analysis
   */
  selectOptimalModel(analysis) {
    const { routingStrategy } = this.options;
    const available = Object.keys(this.modelCapabilities);

    // Apply routing strategy
    switch (routingStrategy) {
      case 'speed':
        return this.selectForSpeed(analysis, available);
      case 'quality':
        return this.selectForQuality(analysis, available);
      case 'balanced':
      default:
        return this.selectBalanced(analysis, available);
    }
  }

  /**
   * Select model optimized for speed
   */
  selectForSpeed(analysis, available) {
    if (analysis.isTimeS_Sensitive || analysis.complexity === 'low') {
      return 'grok-3-fast';
    }
    if (analysis.requiresCoding) {
      return 'grok-fast-code-1';
    }
    return 'grok-4-fast';
  }

  /**
   * Select model optimized for quality
   */
  selectForQuality(analysis, available) {
    if (analysis.complexity === 'very_high' || analysis.isLongContext) {
      return 'grok-4-heavy';
    }
    if (analysis.requiresReasoning || analysis.requiresDeepAnalysis) {
      return 'grok-4-0709';
    }
    if (analysis.requiresCoding) {
      return 'grok-fast-code-1';
    }
    return 'grok-4-0709';
  }

  /**
   * Select model with balanced approach
   */
  selectBalanced(analysis, available) {
    // Very high complexity -> heavy model
    if (analysis.complexity === 'very_high' || analysis.isLongContext) {
      return 'grok-4-heavy';
    }

    // High complexity with reasoning -> premium model
    if (analysis.complexity === 'high' && analysis.requiresReasoning) {
      return 'grok-4-0709';
    }

    // Coding tasks -> specialized model
    if (analysis.requiresCoding && !analysis.isTimeS_Sensitive) {
      return 'grok-fast-code-1';
    }

    // Time sensitive or simple -> fast model
    if (analysis.isTimeS_Sensitive || analysis.complexity === 'low') {
      return 'grok-4-fast';
    }

    // Medium complexity -> balanced model
    if (analysis.complexity === 'medium') {
      return 'grok-3';
    }

    // Default fallback
    return 'grok-4-fast';
  }

  /**
   * Get reasoning for routing decision
   */
  getRoutingReason(analysis, model) {
    const capabilities = this.modelCapabilities[model];
    if (!capabilities) return 'Unknown model';

    const reasons = [];

    if (analysis.complexity === 'very_high') {
      reasons.push('high complexity detected');
    }
    if (analysis.requiresCoding && model === 'grok-fast-code-1') {
      reasons.push('coding task optimization');
    }
    if (analysis.isTimeS_Sensitive && capabilities.speed >= 9) {
      reasons.push('time-sensitive request');
    }
    if (analysis.requiresReasoning && capabilities.reasoning >= 8) {
      reasons.push('reasoning capability required');
    }
    if (analysis.isLongContext && capabilities.maxTokens > 200000) {
      reasons.push('long context support needed');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'balanced selection';
  }

  /**
   * Generate routing guidance for system message
   */
  generateRoutingGuidance(analysis, recommendedModel) {
    if (!recommendedModel) return null;

    const capabilities = this.modelCapabilities[recommendedModel];
    if (!capabilities) return null;

    return `## Model Selection Guidance

Selected: ${recommendedModel}
Rationale: ${this.getRoutingReason(analysis, recommendedModel)}
Strengths: ${capabilities.bestFor.join(', ')}

Optimize your response for: ${this.getOptimizationTips(analysis, capabilities)}`;
  }

  /**
   * Get optimization tips based on model capabilities
   */
  getOptimizationTips(analysis, capabilities) {
    const tips = [];

    if (capabilities.speed >= 9) {
      tips.push('quick, efficient responses');
    }
    if (capabilities.quality >= 9) {
      tips.push('high-quality, detailed analysis');
    }
    if (capabilities.coding >= 9) {
      tips.push('excellent code quality and best practices');
    }
    if (capabilities.reasoning >= 9) {
      tips.push('deep reasoning and logical explanations');
    }

    return tips.join(', ') || 'balanced performance';
  }

  /**
   * Add system message to request
   */
  addSystemMessage(request, content) {
    if (!request.messages) {
      request.messages = [];
    }

    const systemMessage = request.messages.find(msg => msg.role === 'system');
    if (systemMessage) {
      systemMessage.content += '\n\n' + content;
    } else {
      request.messages.unshift({
        role: 'system',
        content: content
      });
    }
  }

  /**
   * Estimate token count for a request
   */
  estimateTokens(request) {
    if (!request.messages) return 0;

    const totalContent = request.messages
      .map(msg => msg.content || '')
      .join(' ');

    // Rough estimation: ~4 characters per token
    return Math.ceil(totalContent.length / 4);
  }

  /**
   * Check if the current provider is xAI
   */
  isXAIProvider(context) {
    if (!context || !context.provider) {
      return false;
    }
    return context.provider.toLowerCase().includes('xai');
  }

  /**
   * Get transformer metadata
   */
  getMetadata() {
    return {
      name: this.name,
      version: '1.0.0',
      description: 'Intelligent auto-routing for xAI Grok models based on request analysis',
      supportedProviders: ['xai'],
      supportedModels: Object.keys(this.modelCapabilities),
      options: this.options,
      modelCapabilities: this.modelCapabilities
    };
  }
}

// Export the transformer
module.exports = GrokAutoRouterTransformer;