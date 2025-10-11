/**
 * Grok Interactive Transformer
 *
 * This transformer modifies xAI Grok models to adopt a more interactive,
 * Claude-like communication style with step-by-step explanations and
 * conversational engagement patterns.
 */

class GrokInteractiveTransformer {
  constructor(options = {}) {
    this.name = 'grok-interactive';
    this.options = this.validateAndNormalizeOptions(options);
  }

  /**
   * Validate and normalize configuration options
   */
  validateAndNormalizeOptions(options) {
    const validated = {
      enabled: options.enabled !== false, // Default enabled
      enableStepByStep: options.enableStepByStep !== false,
      enableQuestions: options.enableQuestions !== false,
      enableConfirmations: options.enableConfirmations !== false,
      conversationalStyle: this.validateConversationalStyle(options.conversationalStyle),
      verbosityLevel: this.validateVerbosityLevel(options.verbosityLevel),
      ...options
    };

    // Log configuration warnings if any
    this.logConfigurationWarnings(options, validated);

    return validated;
  }

  /**
   * Validate conversational style
   */
  validateConversationalStyle(style) {
    const validStyles = ['friendly', 'professional', 'casual', 'formal'];
    if (!style || !validStyles.includes(style)) {
      if (style) {
        console.warn(`[${this.name}] Invalid conversationalStyle '${style}', using 'friendly'`);
      }
      return 'friendly';
    }
    return style;
  }

  /**
   * Validate verbosity level
   */
  validateVerbosityLevel(level) {
    const validLevels = ['concise', 'detailed', 'verbose'];
    if (!level || !validLevels.includes(level)) {
      if (level) {
        console.warn(`[${this.name}] Invalid verbosityLevel '${level}', using 'detailed'`);
      }
      return 'detailed';
    }
    return level;
  }

  /**
   * Log configuration warnings
   */
  logConfigurationWarnings(original, validated) {
    if (original.conversationalStyle && original.conversationalStyle !== validated.conversationalStyle) {
      console.warn(`[${this.name}] conversationalStyle adjusted from '${original.conversationalStyle}' to '${validated.conversationalStyle}'`);
    }

    if (original.verbosityLevel && original.verbosityLevel !== validated.verbosityLevel) {
      console.warn(`[${this.name}] verbosityLevel adjusted from '${original.verbosityLevel}' to '${validated.verbosityLevel}'`);
    }
  }

  /**
   * Transform the outgoing request to add interactive behavior instructions
   */
  transformRequest(request, context) {
    // Check if transformer is enabled
    if (!this.options.enabled) {
      return request;
    }

    // Only apply to xAI Grok models
    if (!this.isGrokModel(context)) {
      return request;
    }

    // Add interactive style instructions to system message
    const interactiveInstructions = this.generateInteractiveInstructions();

    if (request.messages && request.messages.length > 0) {
      // Find or create system message
      let systemMessage = request.messages.find(msg => msg.role === 'system');

      if (systemMessage) {
        // Append to existing system message
        systemMessage.content += '\n\n' + interactiveInstructions;
      } else {
        // Create new system message at the beginning
        request.messages.unshift({
          role: 'system',
          content: interactiveInstructions
        });
      }

      // Enhance user messages for better interaction
      request.messages = this.enhanceUserMessages(request.messages);
    }

    // Add metadata for tracking
    if (!request.metadata) {
      request.metadata = {};
    }
    request.metadata.grok_interactive = {
      enabled: true,
      style: this.options.conversationalStyle,
      verbosity: this.options.verbosityLevel,
      timestamp: Date.now()
    };

    return request;
  }

  /**
   * Transform the response to enhance interactivity
   */
  transformResponse(response, context) {
    // Check if transformer is enabled
    if (!this.options.enabled) {
      return response;
    }

    // Only apply to xAI Grok models
    if (!this.isGrokModel(context)) {
      return response;
    }

    // Enhance response with interactive elements
    if (response.choices && response.choices.length > 0) {
      response.choices = response.choices.map(choice =>
        this.enhanceResponseChoice(choice, context)
      );
    }

    return response;
  }

  /**
   * Generate interactive style instructions for the system prompt
   */
  generateInteractiveInstructions() {
    return `## Interactive Communication Style Guidelines

You are an AI assistant designed to work in an interactive development environment. Adopt a helpful, step-by-step communication style similar to Claude.

### Core Interactive Principles:

1. **Think Out Loud**: Explain your reasoning process as you work through problems
2. **Break Down Complex Tasks**: Divide large tasks into clear, logical steps
3. **Ask Clarifying Questions**: When requirements are unclear, ask for specifics
4. **Confirm Your Understanding**: Restate complex requirements before proceeding
5. **Provide Running Commentary**: Explain what you're doing and why

### Communication Style:

**Be Conversational but Professional:**
- Use phrases like "Let me analyze this...", "I'll start by...", "Now I'll..."
- Acknowledge complexity: "This is a complex request, so I'll break it down..."
- Express confidence appropriately: "I can help you with that" vs "Let me investigate..."

**Use Step-by-Step Structure:**
- Number your steps when working through processes
- Use clear section headers and organization
- Provide progress indicators: "Step 1 of 3 completed"

**Encourage Interaction:**
- End complex explanations with: "Does this approach make sense?"
- Offer alternatives: "I can approach this in two ways..."
- Invite feedback: "Would you like me to explain any of these steps in more detail?"

### Specific Patterns:

**When Starting Tasks:**
- "I'll help you with [task]. Let me break this down into steps..."
- "To accomplish this, I need to: 1) [step], 2) [step], 3) [step]"
- "Let me start by understanding [aspect]..."

**During Work:**
- "Currently working on [specific task]..."
- "I've completed [step] and now moving to [next step]..."
- "I notice [observation] - this means [explanation]..."

**When Asking Questions:**
- "To give you the best solution, I need to understand..."
- "Could you clarify [specific aspect]?"
- "I have two approaches in mind - would you prefer [option A] or [option B]?"

**When Concluding:**
- "I've completed [task]. Here's what I accomplished..."
- "The solution is ready. Would you like me to explain any part in more detail?"
- "Is there anything else you'd like me to adjust or explain?"

### Error Handling:
- Acknowledge mistakes clearly: "I made an error in my previous response..."
- Explain what went wrong and how you're fixing it
- Ask for clarification if unsure: "I want to make sure I understand correctly..."

This interactive style ensures clear communication and builds user confidence in the development process.`;
  }

  /**
   * Enhance user messages to encourage better responses
   */
  enhanceUserMessages(messages) {
    return messages.map((message, index) => {
      if (message.role === 'user' && index === messages.length - 1) {
        // Enhance the last user message to encourage interactive response
        const enhancement = this.generateMessageEnhancement(message.content);
        if (enhancement) {
          return {
            ...message,
            content: message.content + '\n\n' + enhancement
          };
        }
      }
      return message;
    });
  }

  /**
   * Generate message enhancement based on content analysis
   */
  generateMessageEnhancement(content) {
    const hasCode = /```|`[^`]+`/.test(content);
    const hasQuestion = /\?/.test(content);
    const isComplex = content.length > 200;
    const hasMultipleParts = /\d+\.|first|second|third|next|then|also|additionally/.test(content);

    let enhancement = '';

    if (isComplex && !hasQuestion) {
      enhancement += 'Please break this down step-by-step and explain your approach. ';
    }

    if (hasCode && !hasQuestion) {
      enhancement += 'Please explain the code changes you make and why they\'re needed. ';
    }

    if (hasMultipleParts) {
      enhancement += 'Please address each part of this request clearly. ';
    }

    if (enhancement) {
      return `(Interactive guidance: ${enhancement.trim()})`;
    }

    return null;
  }

  /**
   * Enhance response choices with interactive elements
   */
  enhanceResponseChoice(choice, context) {
    if (!choice.message || !choice.message.content) {
      return choice;
    }

    let content = choice.message.content;

    // Add interactive elements if missing
    content = this.addInteractiveElements(content);

    return {
      ...choice,
      message: {
        ...choice.message,
        content: content
      }
    };
  }

  /**
   * Add interactive elements to response content
   */
  addInteractiveElements(content) {
    // Check if the response already has interactive elements
    const hasSteps = /step \d+|first|then|next|finally/i.test(content);
    const hasQuestions = /\?/.test(content);
    const hasThinking = /let me|i'll|i need to|i'm going to/i.test(content);

    // If the response lacks interactive elements, enhance it
    if (!hasSteps && !hasQuestions && !hasThinking && content.length > 100) {
      // Add a thinking introduction if missing
      if (!content.match(/^(let me|i'll|i need to|i'm going to)/i)) {
        content = 'Let me help you with this. ' + content;
      }

      // Add step structure to long responses without clear organization
      if (content.length > 500 && !hasSteps) {
        // This is a simple heuristic - in a real implementation you might want
        // more sophisticated content analysis
        const sections = content.split('\n\n');
        if (sections.length > 2) {
          content = sections.map((section, index) => {
            if (index === 0) return section;
            return `**Step ${index}:** ${section}`;
          }).join('\n\n');
        }
      }
    }

    return content;
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
      description: 'Enhances Grok models with Claude-like interactive communication patterns',
      supportedProviders: ['xai'],
      supportedModels: ['grok-*'],
      options: this.options
    };
  }
}

// Export the transformer
module.exports = GrokInteractiveTransformer;