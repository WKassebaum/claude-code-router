import {
  MessageCreateParamsBase,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { get_encoding } from "tiktoken";
import { sessionUsageCache, sessionForcedModelCache, Usage } from "./cache";
import { readFile } from 'fs/promises'
import { filterAndSimplifyTools, needsToolFiltering } from "./toolSchemaSimplifier";
import { resolveProvider } from "./modelProviderMap";

const enc = get_encoding("cl100k_base");

export const calculateTokenCount = (
  messages: MessageParam[],
  system: any,
  tools: Tool[]
) => {
  let tokenCount = 0;
  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      if (typeof message.content === "string") {
        tokenCount += enc.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        message.content.forEach((contentPart: any) => {
          if (contentPart.type === "text") {
            tokenCount += enc.encode(contentPart.text).length;
          } else if (contentPart.type === "tool_use") {
            tokenCount += enc.encode(JSON.stringify(contentPart.input)).length;
          } else if (contentPart.type === "tool_result") {
            tokenCount += enc.encode(
              typeof contentPart.content === "string"
                ? contentPart.content
                : JSON.stringify(contentPart.content)
            ).length;
          }
        });
      }
    });
  }
  if (typeof system === "string") {
    tokenCount += enc.encode(system).length;
  } else if (Array.isArray(system)) {
    system.forEach((item: any) => {
      if (item.type !== "text") return;
      if (typeof item.text === "string") {
        tokenCount += enc.encode(item.text).length;
      } else if (Array.isArray(item.text)) {
        item.text.forEach((textPart: any) => {
          tokenCount += enc.encode(textPart || "").length;
        });
      }
    });
  }
  if (tools) {
    tools.forEach((tool: Tool) => {
      if (tool.description) {
        tokenCount += enc.encode(tool.name + tool.description).length;
      }
      if (tool.input_schema) {
        tokenCount += enc.encode(JSON.stringify(tool.input_schema)).length;
      }
    });
  }
  return tokenCount;
};

const getUseModel = async (
  req: any,
  tokenCount: number,
  config: any,
  lastUsage?: Usage | undefined
) => {
  // Handle CCR router models
  if (req.body.model.startsWith("ccr-")) {
    const routerType = req.body.model.replace("ccr-", "").replace("-", "");
    if (config.Router && config.Router[routerType]) {
      req.log.info(`Using CCR router model: ${req.body.model} -> ${config.Router[routerType]}`);
      return config.Router[routerType];
    } else if (routerType === "default" && config.Router?.default) {
      return config.Router.default;
    } else if (routerType === "longcontext" && config.Router?.longContext) {
      return config.Router.longContext;
    } else if (routerType === "websearch" && config.Router?.webSearch) {
      return config.Router.webSearch;
    }
  }

  if (req.body.model.includes(",")) {
    const [provider, model] = req.body.model.split(",");
    const finalProvider = config.Providers.find(
        (p: any) => p.name.toLowerCase() === provider
    );
    const finalModel = finalProvider?.models?.find(
        (m: any) => m.toLowerCase() === model
    );
    if (finalProvider && finalModel) {
      return `${finalProvider.name},${finalModel}`;
    }
    return req.body.model;
  }

  // Find model in providers and return if found
  if (config.Providers && Array.isArray(config.Providers)) {
    for (const provider of config.Providers) {
      if (provider.models && Array.isArray(provider.models) && provider.models.find((m: string) => m.toLowerCase() === req.body.model.toLowerCase())) {
        req.log.info(`Found model '${req.body.model}' in provider '${provider.name}'`);
        return `${provider.name},${req.body.model}`;
      }
    }
  }

  // if tokenCount is greater than the configured threshold, use the long context model
  const longContextThreshold = config.Router.longContextThreshold || 60000;
  const lastUsageThreshold =
    lastUsage &&
    lastUsage.input_tokens > longContextThreshold &&
    tokenCount > 20000;
  const tokenCountThreshold = tokenCount > longContextThreshold;
  if (
    (lastUsageThreshold || tokenCountThreshold) &&
    config.Router.longContext
  ) {
        req.log.info(
      `Using long context model due to token count: ${tokenCount}, threshold: ${longContextThreshold}`
    );
    return config.Router.longContext;
  }
  if (
    req.body?.system?.length > 1 &&
    req.body?.system[1]?.text?.startsWith("<CCR-SUBAGENT-MODEL>")
  ) {
    const model = req.body?.system[1].text.match(
      /<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s
    );
    if (model) {
      req.body.system[1].text = req.body.system[1].text.replace(
        `<CCR-SUBAGENT-MODEL>${model[1]}</CCR-SUBAGENT-MODEL>`,
        ""
      );
      return model[1];
    }
  }
  // If the model is claude-3-5-haiku, use the background model
  if (
    req.body.model?.startsWith("claude-3-5-haiku") &&
    config.Router.background
  ) {
    req.log.info(`Using background model for ${req.body.model}`);
    return config.Router.background;
  }
  // if exits thinking, use the think model
  if (req.body.thinking && config.Router.think) {
    req.log.info(`Using think model for ${req.body.thinking}`);
    return config.Router.think;
  }
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
    config.Router.webSearch
  ) {
    return config.Router.webSearch;
  }
  return config.Router!.default;
};

export const router = async (req: any, _res: any, context: any) => {
  const { config, event } = context;
  // Parse sessionId from metadata.user_id
  if (req.body.metadata?.user_id) {
    const parts = req.body.metadata.user_id.split("_session_");
    if (parts.length > 1) {
      req.sessionId = parts[1];
      req.log.info(`[SESSION] Extracted sessionId: ${req.sessionId} from metadata: ${req.body.metadata.user_id}`);
    }
  } else {
    req.log.info(`[SESSION] No metadata.user_id found, sessionId will be undefined`);
  }
  const lastMessageUsage = sessionUsageCache.get(req.sessionId);
  const { messages, system = [], tools }: MessageCreateParamsBase = req.body;
  if (config.REWRITE_SYSTEM_PROMPT && Array.isArray(system) && system.length > 1 && typeof system[1] === 'object' && 'text' in system[1] && system[1].text?.includes('<env>')) {
    const prompt = await readFile(config.REWRITE_SYSTEM_PROMPT, 'utf-8');
    system[1].text = `${prompt}<env>${system[1].text.split('<env>').pop()}`
  }

  try {
    const tokenCount = calculateTokenCount(
      messages as MessageParam[],
      system,
      tools as Tool[]
    );

    let model;

    // Check for forced model first (highest priority)
    const forcedModel = sessionForcedModelCache.get(req.sessionId);
    req.log.info(`[SESSION] Looking up forced model for sessionId: ${req.sessionId}, found: ${forcedModel || 'none'}`);
    if (forcedModel) {
      if (forcedModel === "BYPASS") {
        // Use whatever model Claude sent in the request (bypass routing)
        model = req.body.model;
        req.log.info(`[SESSION] Session ${req.sessionId} bypassing routing, using Claude model: ${model}`);
      } else {
        // Use the forced model
        model = forcedModel;
        req.log.info(`[SESSION] Session ${req.sessionId} using forced model: ${model}`);
      }
    } else if (config.CUSTOM_ROUTER_PATH) {
      try {
        const customRouter = require(config.CUSTOM_ROUTER_PATH);
        req.tokenCount = tokenCount; // Pass token count to custom router
        model = await customRouter(req, config, {
          event
        });
      } catch (e: any) {
        req.log.error(`failed to load custom router: ${e.message}`);
      }
    }

    if (!model) {
      model = await getUseModel(req, tokenCount, config, lastMessageUsage);
    }
    req.body.model = model;

    // Update session cache with actual routed model
    const existingUsage = sessionUsageCache.get(req.sessionId) || { input_tokens: 0, output_tokens: 0 };

    let provider: string;
    let routedModel: string;

    if (model.includes(',')) {
      // CCR format: "provider,model" (e.g., "xai,grok-4-fast-reasoning")
      [provider, routedModel] = model.split(',');
    } else {
      // Claude Code format: just "model" (e.g., "grok-4-fast-reasoning")
      // This happens in BYPASS mode when user selects model via /model command
      routedModel = model;
      provider = resolveProvider(model, config);

      // Convert to CCR format for downstream processing
      model = `${provider},${routedModel}`;
      req.body.model = model;

      req.log.info(`[BYPASS] Resolved provider for model "${routedModel}" → "${provider}"`);

      if (provider === 'unknown') {
        req.log.warn(
          `[BYPASS] Unknown model "${routedModel}" - please add to MODEL_PROVIDER_MAP or config.Providers`
        );
      }
    }

    sessionUsageCache.put(req.sessionId, {
      ...existingUsage,
      model: routedModel,
      provider,
      route: model,
      timestamp: new Date().toISOString()
    });

    // Apply tool filtering and simplification based on provider limitations
    if (needsToolFiltering(model) && req.body.tools) {
      req.body.tools = filterAndSimplifyTools(req.body.tools, model, req);
    }
  } catch (error: any) {
    req.log.error(`Error in router middleware: ${error.message}`);
    req.body.model = config.Router!.default;
  }
  return;
};
