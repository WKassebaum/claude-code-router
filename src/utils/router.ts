import {
  MessageCreateParamsBase,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { get_encoding } from "tiktoken";
import { sessionUsageCache, sessionForcedModelCache, Usage } from "./cache";
import { readFile, access } from "fs/promises";
import { opendir, stat } from "fs/promises";
import { join } from "path";
import { CLAUDE_PROJECTS_DIR, HOME_DIR } from "../constants";
import { LRUCache } from "lru-cache";
import { filterAndSimplifyTools, needsToolFiltering } from "./toolSchemaSimplifier";
import { resolveProvider, resolveModelAlias } from "./modelProviderMap";

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

const readConfigFile = async (filePath: string) => {
  try {
    await access(filePath);
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    return null; // 文件不存在或读取失败时返回null
  }
};

const getProjectSpecificRouter = async (req: any) => {
  // 检查是否有项目特定的配置
  if (req.sessionId) {
    const project = await searchProjectBySession(req.sessionId);
    if (project) {
      const projectConfigPath = join(HOME_DIR, project, "config.json");
      const sessionConfigPath = join(
        HOME_DIR,
        project,
        `${req.sessionId}.json`
      );

      // 首先尝试读取sessionConfig文件
      const sessionConfig = await readConfigFile(sessionConfigPath);
      if (sessionConfig && sessionConfig.Router) {
        return sessionConfig.Router;
      }
      const projectConfig = await readConfigFile(projectConfigPath);
      if (projectConfig && projectConfig.Router) {
        return projectConfig.Router;
      }
    }
  }
  return undefined; // 返回undefined表示使用原始配置
};

/**
 * Intelligent Grok model selection based on request characteristics
 * Includes fallback logic for models that may not be available yet
 */
const selectOptimalGrokModel = (
  req: any,
  tokenCount: number,
  defaultModel: string,
  config: any
): string => {
  const messages = req.body.messages || [];
  const tools = req.body.tools || [];
  const lastMessage = messages[messages.length - 1];
  const userContent = typeof lastMessage?.content === 'string'
    ? lastMessage.content.toLowerCase()
    : '';

  // Extract provider and current model
  const [provider, currentModel] = defaultModel.includes(',')
    ? defaultModel.split(',')
    : ['xai', defaultModel];

  // Get available models from config for validation
  const xaiProvider = config.Providers?.find((p: any) => p.name === 'xai');
  const availableModels = xaiProvider?.models || [];

  // Helper to check if a model is available and return it with fallback
  const tryModel = (preferred: string, fallback: string): string => {
    const modelName = preferred.split(',')[1] || preferred;
    if (availableModels.includes(modelName)) {
      req.log.info(`[GROK-AUTO-ROUTER] Using preferred model: ${preferred}`);
      return preferred;
    } else {
      req.log.warn(`[GROK-AUTO-ROUTER] Model ${modelName} not available, falling back to ${fallback}`);
      return fallback;
    }
  };

  // Debugging and complex reasoning indicators
  const isDebugging = /debug|error|bug|fix|investigate|troubleshoot|analyze.*issue/.test(userContent);
  const isComplexReasoning = /architecture|design|refactor|optimize|security|audit/.test(userContent);
  const hasMultipleSteps = /first.*then|step.*step|1\.|2\.|3\./.test(userContent);

  // Code generation indicators
  const isCodeGeneration = /write.*code|implement|create.*function|generate.*class|add.*feature/.test(userContent);
  const hasCodeBlocks = /```|`[^`]+`/.test(userContent);

  // Large codebase indicators
  const isLargeCodebase = tokenCount > 50000 || tools.length > 15;
  const isComprehensiveTask = /entire|whole|all|comprehensive|complete/.test(userContent);

  // Fast code editing indicators
  const isFastEdit = /quick|simple|small change|minor|just/.test(userContent) && isCodeGeneration;

  req.log.info(`[GROK-AUTO-ROUTER] Analysis: debug=${isDebugging}, reasoning=${isComplexReasoning}, codegen=${isCodeGeneration}, large=${isLargeCodebase}, fastEdit=${isFastEdit}`);

  // Priority 1: Fast code edits -> grok-fast-code-1
  if (isFastEdit && provider === 'xai') {
    return tryModel(`${provider},grok-fast-code-1`, `${provider},grok-4-fast`);
  }

  // Priority 2: Large codebase or comprehensive tasks -> grok-4-heavy
  if ((isLargeCodebase || isComprehensiveTask) && provider === 'xai') {
    return tryModel(`${provider},grok-4-heavy`, `${provider},grok-4-0709`);
  }

  // Priority 3: Debugging or complex reasoning -> Try grok-4.1-thinking first, fallback to grok-4-fast-reasoning
  if ((isDebugging || isComplexReasoning || hasMultipleSteps) && provider === 'xai') {
    return tryModel(`${provider},grok-4.1-thinking`, `${provider},grok-4-fast-reasoning`);
  }

  // Priority 4: Pure code generation without reasoning -> grok-4-fast-non-reasoning
  if (isCodeGeneration && !isDebugging && !isComplexReasoning && provider === 'xai') {
    return tryModel(`${provider},grok-4-fast-non-reasoning`, `${provider},grok-4-fast`);
  }

  // Priority 5: High quality complex tasks -> grok-4-0709
  if ((tokenCount > 30000 || tools.length > 10) && (isComplexReasoning || hasMultipleSteps) && provider === 'xai') {
    return tryModel(`${provider},grok-4-0709`, `${provider},grok-4-fast`);
  }

  // Default: keep current model
  return defaultModel;
};

/**
 * Calculate dynamic timeout for Grok requests based on model and complexity
 */
const calculateGrokTimeout = (
  model: string,
  tokenCount: number,
  toolCount: number
): number => {
  // Base timeouts by model type (in milliseconds)
  const baseTimeouts: Record<string, number> = {
    'grok-4-heavy': 180000,        // 3 minutes - comprehensive analysis
    'grok-4.1-thinking': 90000,    // 1.5 minutes - Grok 4.1 thinking mode (Nov 2025)
    'grok-4-1-thinking': 90000,    // 1.5 minutes - Alt naming
    'grok-4.1-fast': 60000,        // 1 minute - Grok 4.1 fast mode
    'grok-4-1-fast': 60000,        // 1 minute - Alt naming
    'grok-4.1': 75000,             // 1.25 minutes - General Grok 4.1
    'grok-4-1': 75000,             // 1.25 minutes - Alt naming
    'grok-4-0709': 120000,         // 2 minutes - complex reasoning
    'grok-4-fast-reasoning': 90000, // 1.5 minutes - debugging
    'grok-4-fast': 60000,          // 1 minute - default fast
    'grok-4-fast-non-reasoning': 45000, // 45 seconds - pure codegen
    'grok-fast-code-1': 30000,     // 30 seconds - quick edits
  };

  // Find matching base timeout
  let baseTimeout = 60000; // Default 1 minute
  for (const [modelPattern, timeout] of Object.entries(baseTimeouts)) {
    if (model.includes(modelPattern)) {
      baseTimeout = timeout;
      break;
    }
  }

  // Add time for token complexity (1 second per 10k tokens)
  const tokenMultiplier = Math.floor(tokenCount / 10000) * 1000;

  // Add time for tool usage (5 seconds per tool)
  const toolMultiplier = toolCount * 5000;

  // Calculate total with reasonable bounds
  const calculatedTimeout = baseTimeout + tokenMultiplier + toolMultiplier;

  // Min 30 seconds, max 5 minutes
  return Math.max(30000, Math.min(300000, calculatedTimeout));
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

  const projectSpecificRouter = await getProjectSpecificRouter(req);
  const Router = projectSpecificRouter || config.Router;

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
  const longContextThreshold = Router.longContextThreshold || 60000;
  const lastUsageThreshold =
    lastUsage &&
    lastUsage.input_tokens > longContextThreshold &&
    tokenCount > 20000;
  const tokenCountThreshold = tokenCount > longContextThreshold;
  if ((lastUsageThreshold || tokenCountThreshold) && Router.longContext) {
    req.log.info(
      `Using long context model due to token count: ${tokenCount}, threshold: ${longContextThreshold}`
    );
    return Router.longContext;
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
  // Use the background model for any Claude Haiku variant
  if (
    req.body.model?.includes("claude") &&
    req.body.model?.includes("haiku") &&
    config.Router.background
  ) {
    req.log.info(`Using background model for ${req.body.model}`);
    return config.Router.background;
  }
  // The priority of websearch must be higher than thinking.
  if (
    Array.isArray(req.body.tools) &&
    req.body.tools.some((tool: any) => tool.type?.startsWith("web_search")) &&
    Router.webSearch
  ) {
    return Router.webSearch;
  }
  // if exits thinking, use the think model
  if (req.body.thinking && Router.think) {
    req.log.info(`Using think model for ${req.body.thinking}`);
    return Router.think;
  }

  // Grok-specific intelligent routing
  const defaultModel = Router!.default;
  if (defaultModel && (defaultModel.includes('grok') || defaultModel.includes('xai,'))) {
    const grokVariant = selectOptimalGrokModel(req, tokenCount, defaultModel, config);
    if (grokVariant !== defaultModel) {
      req.log.info(`[GROK-AUTO-ROUTER] Switching from ${defaultModel} to ${grokVariant} based on request analysis`);
      return grokVariant;
    }
  }

  return Router!.default;
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
  if (
    config.REWRITE_SYSTEM_PROMPT &&
    system.length > 1 &&
    system[1]?.text?.includes("<env>")
  ) {
    const prompt = await readFile(config.REWRITE_SYSTEM_PROMPT, "utf-8");
    system[1].text = `${prompt}<env>${system[1].text.split("<env>").pop()}`;
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
          event,
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

      // Resolve model alias to actual API model name
      const resolvedModel = resolveModelAlias(routedModel);
      if (resolvedModel !== routedModel) {
        req.log.info(`[ALIAS] Resolved model alias "${routedModel}" → "${resolvedModel}"`);
        routedModel = resolvedModel;
        model = `${provider},${routedModel}`;
        req.body.model = model;
      }
    } else {
      // Claude Code format: just "model" (e.g., "grok-4-fast-reasoning")
      // This happens in BYPASS mode when user selects model via /model command
      routedModel = model;
      provider = resolveProvider(model, config);

      // Resolve model alias to actual API model name
      const resolvedModel = resolveModelAlias(routedModel);
      if (resolvedModel !== routedModel) {
        req.log.info(`[ALIAS] Resolved model alias "${routedModel}" → "${resolvedModel}"`);
        routedModel = resolvedModel;
      }

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

    // Enhanced Grok logging
    if (provider === 'xai' || routedModel.toLowerCase().includes('grok')) {
      req.log.info(`┌─ [GROK ROUTING] ──────────────────────────────`);
      req.log.info(`│ Session: ${req.sessionId}`);
      req.log.info(`│ Model: ${routedModel} (Provider: ${provider})`);
      req.log.info(`│ Token Count: ${tokenCount.toLocaleString()}`);
      req.log.info(`│ Tool Count: ${req.body.tools?.length || 0}`);
      req.log.info(`│ Forced Model: ${forcedModel || 'none'}`);
      req.log.info(`└────────────────────────────────────────────────`);

      // Calculate dynamic timeout based on Grok model complexity
      const timeout = calculateGrokTimeout(routedModel, tokenCount, req.body.tools?.length || 0);
      if (!req.body.metadata) {
        req.body.metadata = {};
      }
      req.body.metadata.grok_timeout = timeout;
      req.log.info(`[GROK-TIMEOUT] Dynamic timeout set to ${timeout}ms (${(timeout / 1000).toFixed(1)}s)`);
    }

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

// 内存缓存，存储sessionId到项目名称的映射
// null值表示之前已查找过但未找到项目
// 使用LRU缓存，限制最大1000个条目
const sessionProjectCache = new LRUCache<string, string | null>({
  max: 1000,
});

export const searchProjectBySession = async (
  sessionId: string
): Promise<string | null> => {
  // 首先检查缓存
  if (sessionProjectCache.has(sessionId)) {
    return sessionProjectCache.get(sessionId)!;
  }

  try {
    const dir = await opendir(CLAUDE_PROJECTS_DIR);
    const folderNames: string[] = [];

    // 收集所有文件夹名称
    for await (const dirent of dir) {
      if (dirent.isDirectory()) {
        folderNames.push(dirent.name);
      }
    }

    // 并发检查每个项目文件夹中是否存在sessionId.jsonl文件
    const checkPromises = folderNames.map(async (folderName) => {
      const sessionFilePath = join(
        CLAUDE_PROJECTS_DIR,
        folderName,
        `${sessionId}.jsonl`
      );
      try {
        const fileStat = await stat(sessionFilePath);
        return fileStat.isFile() ? folderName : null;
      } catch {
        // 文件不存在，继续检查下一个
        return null;
      }
    });

    const results = await Promise.all(checkPromises);

    // 返回第一个存在的项目目录名称
    for (const result of results) {
      if (result) {
        // 缓存找到的结果
        sessionProjectCache.set(sessionId, result);
        return result;
      }
    }

    // 缓存未找到的结果（null值表示之前已查找过但未找到项目）
    sessionProjectCache.set(sessionId, null);
    return null; // 没有找到匹配的项目
  } catch (error) {
    console.error("Error searching for project by session:", error);
    // 出错时也缓存null结果，避免重复出错
    sessionProjectCache.set(sessionId, null);
    return null;
  }
};
