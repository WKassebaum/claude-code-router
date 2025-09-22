import { Tool } from "@anthropic-ai/sdk/resources/messages";

/**
 * Configuration for providers with tool schema limitations
 */
const PROVIDER_LIMITATIONS = {
  // Gemini has a maximum nesting depth of 5 for function schemas
  gemini: {
    maxNestingDepth: 5,
    problematicTools: [
      'mcp__firecrawl-mcp__firecrawl_crawl',
      'mcp__firecrawl-mcp__firecrawl_scrape',
      'mcp__firecrawl-mcp__firecrawl_extract',
      'mcp__firecrawl-mcp__firecrawl_search',
      'mcp__firecrawl-mcp__firecrawl_map'
    ]
  },
  // Add other providers with limitations here
  xai: {
    maxNestingDepth: 10,
    problematicTools: []
  }
};

/**
 * Calculate the nesting depth of a JSON schema
 */
function getSchemaDepth(obj: any, depth = 0): number {
  if (typeof obj !== 'object' || obj === null) {
    return depth;
  }

  let maxDepth = depth;

  for (const key in obj) {
    if (key === 'properties' || key === 'items' || key === 'additionalProperties') {
      const childDepth = getSchemaDepth(obj[key], depth + 1);
      maxDepth = Math.max(maxDepth, childDepth);
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      const childDepth = getSchemaDepth(obj[key], depth);
      maxDepth = Math.max(maxDepth, childDepth);
    }
  }

  return maxDepth;
}

/**
 * Simplify a deeply nested schema by flattening it
 */
function simplifySchema(schema: any, maxDepth: number): any {
  const depth = getSchemaDepth(schema);

  if (depth <= maxDepth) {
    return schema;
  }

  // For deeply nested schemas, create a simplified version
  // This maintains the basic structure but removes deep nesting
  const simplified: any = {
    type: schema.type || 'object',
    description: schema.description
  };

  if (schema.required) {
    simplified.required = schema.required;
  }

  if (schema.properties) {
    simplified.properties = {};
    for (const key in schema.properties) {
      const prop = schema.properties[key];
      // Flatten nested objects into strings with descriptions
      if (prop.type === 'object' && getSchemaDepth(prop) > 2) {
        simplified.properties[key] = {
          type: 'string',
          description: `JSON string: ${prop.description || 'Complex nested object'}`
        };
      } else if (prop.type === 'array' && prop.items && getSchemaDepth(prop.items) > 2) {
        simplified.properties[key] = {
          type: 'array',
          items: {
            type: 'string',
            description: `JSON string: ${prop.items.description || 'Complex nested item'}`
          }
        };
      } else {
        simplified.properties[key] = simplifyPropSchema(prop, maxDepth - 1);
      }
    }
  }

  return simplified;
}

/**
 * Recursively simplify property schemas
 */
function simplifyPropSchema(prop: any, remainingDepth: number): any {
  if (remainingDepth <= 0) {
    return {
      type: 'string',
      description: prop.description || 'Simplified from complex nested structure'
    };
  }

  const simplified: any = {
    type: prop.type,
    description: prop.description
  };

  if (prop.enum) {
    simplified.enum = prop.enum;
  }

  if (prop.type === 'object' && prop.properties) {
    simplified.properties = {};
    for (const key in prop.properties) {
      simplified.properties[key] = simplifyPropSchema(prop.properties[key], remainingDepth - 1);
    }
  } else if (prop.type === 'array' && prop.items) {
    simplified.items = simplifyPropSchema(prop.items, remainingDepth - 1);
  }

  return simplified;
}

/**
 * Get the provider name from a model string
 */
function getProviderFromModel(model: string): string {
  if (model.includes(',')) {
    return model.split(',')[0].toLowerCase();
  }
  // Default provider mappings
  if (model.startsWith('gemini')) return 'gemini';
  if (model.includes('grok')) return 'xai';
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt')) return 'openai';

  return 'unknown';
}

/**
 * Filter and simplify tools based on provider limitations
 */
export function filterAndSimplifyTools(tools: Tool[] | undefined, model: string, req: any): Tool[] | undefined {
  if (!tools || tools.length === 0) {
    return tools;
  }

  const provider = getProviderFromModel(model);
  const limitations = PROVIDER_LIMITATIONS[provider];

  if (!limitations) {
    // No known limitations for this provider
    return tools;
  }

  req.log?.info(`Applying tool schema limitations for provider: ${provider}`);

  const filteredTools: Tool[] = [];

  for (const tool of tools) {
    // Check if this tool is problematic for the provider
    if (limitations.problematicTools.includes(tool.name)) {
      req.log?.info(`Filtering out problematic tool: ${tool.name} for provider: ${provider}`);
      continue;
    }

    // Check and simplify schema depth if needed
    if (tool.input_schema) {
      const depth = getSchemaDepth(tool.input_schema);

      if (depth > limitations.maxNestingDepth) {
        req.log?.info(`Simplifying tool schema: ${tool.name} (depth ${depth} > ${limitations.maxNestingDepth})`);

        // Create a simplified version of the tool
        const simplifiedTool: Tool = {
          ...tool,
          input_schema: simplifySchema(tool.input_schema, limitations.maxNestingDepth)
        };

        filteredTools.push(simplifiedTool);
      } else {
        filteredTools.push(tool);
      }
    } else {
      filteredTools.push(tool);
    }
  }

  req.log?.info(`Filtered tools from ${tools.length} to ${filteredTools.length} for provider: ${provider}`);

  return filteredTools;
}

/**
 * Check if a provider needs tool filtering
 */
export function needsToolFiltering(model: string): boolean {
  const provider = getProviderFromModel(model);
  return provider in PROVIDER_LIMITATIONS;
}