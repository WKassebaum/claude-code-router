import Server from "@musistudio/llms";
import { readConfigFile, writeConfigFile, backupConfigFile } from "./utils";
import { checkForUpdates, performUpdate } from "./utils";
import { join } from "path";
import fastifyStatic from "@fastify/static";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "fs";
import { homedir } from "os";
import { calculateTokenCount } from "./utils/router";
import { usageTracker, db, fetchModelPricing } from "./utils/database";
import { sessionUsageCache, sessionForcedModelCache } from "./utils/cache";
import { version } from "../package.json";

export const createServer = (config: any): Server => {
  const server = new Server(config);

  // Grok progress monitoring hook - detects stalls in streaming responses
  server.app.addHook('onSend', async (request: any, reply: any, payload: any) => {
    // Only monitor Grok requests
    const sessionId = request.body?.metadata?.user_id?.split('_session_')[1];
    const sessionUsage = sessionId ? sessionUsageCache.get(sessionId) : null;
    const isGrokRequest = sessionUsage?.provider === 'xai' || sessionUsage?.model?.toLowerCase().includes('grok');

    if (!isGrokRequest || !payload || typeof payload.pipe !== 'function') {
      return payload;
    }

    const grokTimeout = request.body?.metadata?.grok_timeout || 60000;
    let lastChunkTime = Date.now();
    let totalChunks = 0;
    let silenceWarningIssued = false;

    request.log.info(`[GROK-MONITOR] Starting progress monitor for session ${sessionId}, timeout: ${grokTimeout}ms`);

    // Monitor stream for silence
    const monitorInterval = setInterval(() => {
      const silenceDuration = Date.now() - lastChunkTime;

      if (silenceDuration > 15000 && !silenceWarningIssued) {
        request.log.warn(`[GROK-STALL] Silent for ${(silenceDuration / 1000).toFixed(1)}s | Session: ${sessionId} | Model: ${sessionUsage?.model} | Chunks: ${totalChunks}`);
        silenceWarningIssued = true;
      }

      // Clear interval if we've exceeded the dynamic timeout
      if (silenceDuration > grokTimeout) {
        request.log.error(`[GROK-TIMEOUT] Exceeded timeout of ${(grokTimeout / 1000).toFixed(1)}s | Session: ${sessionId}`);
        clearInterval(monitorInterval);
      }
    }, 5000); // Check every 5 seconds

    // Wrap the stream to track chunks
    const originalStream = payload;
    const { PassThrough } = require('stream');
    const monitoredStream = new PassThrough();

    originalStream.on('data', (chunk: any) => {
      lastChunkTime = Date.now();
      totalChunks++;
      silenceWarningIssued = false; // Reset warning on new data
      monitoredStream.write(chunk);
    });

    originalStream.on('end', () => {
      clearInterval(monitorInterval);
      request.log.info(`[GROK-MONITOR] Stream completed | Session: ${sessionId} | Total chunks: ${totalChunks}`);
      monitoredStream.end();
    });

    originalStream.on('error', (err: any) => {
      clearInterval(monitorInterval);
      request.log.error(`[GROK-MONITOR] Stream error: ${err.message}`);
      monitoredStream.destroy(err);
    });

    return monitoredStream;
  });

  server.app.post("/v1/messages/count_tokens", async (req, reply) => {
    const {messages, tools, system} = req.body;
    const tokenCount = calculateTokenCount(messages, system, tools);
    return { "input_tokens": tokenCount }
  });

  // Add endpoint to read config.json with access control
  server.app.get("/api/config", async (req, reply) => {
    return await readConfigFile();
  });

  server.app.get("/api/transformers", async () => {
    const transformers =
      server.app._server!.transformerService.getAllTransformers();
    const transformerList = Array.from(transformers.entries()).map(
      ([name, transformer]: any) => ({
        name,
        endpoint: transformer.endPoint || null,
      })
    );
    return { transformers: transformerList };
  });

  // Add endpoint to save config.json with access control
  server.app.post("/api/config", async (req, reply) => {
    const newConfig = req.body;

    // Backup existing config file if it exists
    const backupPath = await backupConfigFile();
    if (backupPath) {
      console.log(`Backed up existing configuration file to ${backupPath}`);
    }

    await writeConfigFile(newConfig);
    return { success: true, message: "Config saved successfully" };
  });

  // Add endpoint to restart the service with access control
  server.app.post("/api/restart", async (req, reply) => {
    reply.send({ success: true, message: "Service restart initiated" });

    // Restart the service after a short delay to allow response to be sent
    setTimeout(() => {
      const { spawn } = require("child_process");
      spawn(process.execPath, [process.argv[1], "restart"], {
        detached: true,
        stdio: "ignore",
      });
    }, 1000);
  });

  // Register static file serving with caching
  server.app.register(fastifyStatic, {
    root: join(__dirname, "..", "dist"),
    prefix: "/ui/",
    maxAge: "1h",
  });

  // Redirect /ui to /ui/ for proper static file serving
  server.app.get("/ui", async (_, reply) => {
    return reply.redirect("/ui/");
  });

  // 版本检查端点
  server.app.get("/api/update/check", async (req, reply) => {
    try {
      // 获取当前版本
      const currentVersion = require("../package.json").version;
      const { hasUpdate, latestVersion, changelog } = await checkForUpdates(currentVersion);

      return {
        hasUpdate,
        latestVersion: hasUpdate ? latestVersion : undefined,
        changelog: hasUpdate ? changelog : undefined
      };
    } catch (error) {
      console.error("Failed to check for updates:", error);
      reply.status(500).send({ error: "Failed to check for updates" });
    }
  });

  // 执行更新端点
  server.app.post("/api/update/perform", async (req, reply) => {
    try {
      // 只允许完全访问权限的用户执行更新
      const accessLevel = (req as any).accessLevel || "restricted";
      if (accessLevel !== "full") {
        reply.status(403).send("Full access required to perform updates");
        return;
      }

      // 执行更新逻辑
      const result = await performUpdate();

      return result;
    } catch (error) {
      console.error("Failed to perform update:", error);
      reply.status(500).send({ error: "Failed to perform update" });
    }
  });

  // 获取日志文件列表端点
  server.app.get("/api/logs/files", async (req, reply) => {
    try {
      const logDir = join(homedir(), ".claude-code-router", "logs");
      const logFiles: Array<{ name: string; path: string; size: number; lastModified: string }> = [];

      if (existsSync(logDir)) {
        const files = readdirSync(logDir);

        for (const file of files) {
          if (file.endsWith('.log')) {
            const filePath = join(logDir, file);
            const stats = statSync(filePath);

            logFiles.push({
              name: file,
              path: filePath,
              size: stats.size,
              lastModified: stats.mtime.toISOString()
            });
          }
        }

        // 按修改时间倒序排列
        logFiles.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      }

      return logFiles;
    } catch (error) {
      console.error("Failed to get log files:", error);
      reply.status(500).send({ error: "Failed to get log files" });
    }
  });

  // 获取日志内容端点
  server.app.get("/api/logs", async (req, reply) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // 如果指定了文件路径，使用指定的路径
        logFilePath = filePath;
      } else {
        // 如果没有指定文件路径，使用默认的日志文件路径
        logFilePath = join(homedir(), ".claude-code-router", "logs", "app.log");
      }

      if (!existsSync(logFilePath)) {
        return [];
      }

      const logContent = readFileSync(logFilePath, 'utf8');
      const logLines = logContent.split('\n').filter(line => line.trim())

      return logLines;
    } catch (error) {
      console.error("Failed to get logs:", error);
      reply.status(500).send({ error: "Failed to get logs" });
    }
  });

  // 清除日志内容端点
  server.app.delete("/api/logs", async (req, reply) => {
    try {
      const filePath = (req.query as any).file as string;
      let logFilePath: string;

      if (filePath) {
        // 如果指定了文件路径，使用指定的路径
        logFilePath = filePath;
      } else {
        // 如果没有指定文件路径，使用默认的日志文件路径
        logFilePath = join(homedir(), ".claude-code-router", "logs", "app.log");
      }

      if (existsSync(logFilePath)) {
        writeFileSync(logFilePath, '', 'utf8');
      }

      return { success: true, message: "Logs cleared successfully" };
    } catch (error) {
      console.error("Failed to clear logs:", error);
      reply.status(500).send({ error: "Failed to clear logs" });
    }
  });

  // Models endpoint - Expose available models to Claude Code
  server.app.get("/v1/models", async (req, reply) => {
    const config = await readConfigFile();
    const models: any[] = [];

    // Add router-based models with descriptions
    if (config.Router) {
      if (config.Router.default) {
        models.push({
          id: "ccr-default",
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "ccr-router",
          description: `Default routing (${config.Router.default})`
        });
      }

      if (config.Router.longContext) {
        models.push({
          id: "ccr-long-context",
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "ccr-router",
          description: `Long context model (${config.Router.longContext})`
        });
      }

      if (config.Router.background) {
        models.push({
          id: "ccr-background",
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "ccr-router",
          description: `Background/Haiku routing (${config.Router.background})`
        });
      }

      if (config.Router.webSearch) {
        models.push({
          id: "ccr-web-search",
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "ccr-router",
          description: `Web search model (${config.Router.webSearch})`
        });
      }

      if (config.Router.think) {
        models.push({
          id: "ccr-think",
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: "ccr-router",
          description: `Thinking model (${config.Router.think})`
        });
      }
    }

    // Add all configured provider models
    if (config.Providers && Array.isArray(config.Providers)) {
      for (const provider of config.Providers) {
        if (provider.models && Array.isArray(provider.models)) {
          for (const model of provider.models) {
            // Direct model access format: provider,model
            const modelId = `${provider.name},${model}`;
            models.push({
              id: modelId,
              object: "model",
              created: Math.floor(Date.now() / 1000),
              owned_by: provider.name,
              description: `Direct: ${provider.name} - ${model}`
            });
          }
        }
      }
    }

    // Return in OpenAI-compatible format
    return reply.send({
      object: "list",
      data: models
    });
  });

  // Statusline API endpoint - Real-time usage information
  server.app.get("/api/statusline/usage", async (req, reply) => {
    try {
      const { sessionId } = req.query as any;

      // Get current session usage from cache
      const currentUsage = sessionUsageCache.get(sessionId);

      // Get historical usage from database
      const historicalUsage = sessionId ? usageTracker.getSessionUsage(sessionId) : [];

      // Get active routing info with correct priority order:
      // 1. Check forced model cache (highest priority)
      // 2. Check session usage cache (actual routed model)
      // 3. Fall back to config.Router.default
      const config = await readConfigFile();
      let activeRoute = '';
      let isActual = false;

      // DEBUG: Log cache state
      console.log(`[STATUSLINE DEBUG] Session ID: ${sessionId}`);
      console.log(`[STATUSLINE DEBUG] forcedModelCache.get:`, sessionId ? sessionForcedModelCache.get(sessionId) : undefined);
      console.log(`[STATUSLINE DEBUG] sessionUsageCache.get:`, currentUsage);

      // PRIORITY 1: Check forced model cache
      const forcedModel = sessionId ? sessionForcedModelCache.get(sessionId) : undefined;
      if (forcedModel && forcedModel !== "BYPASS") {
        activeRoute = forcedModel;
        isActual = true;
        console.log(`[STATUSLINE DEBUG] Using forced model: ${forcedModel}`);
      }

      // PRIORITY 2: Check session usage cache (actual routed model)
      if (!activeRoute && currentUsage?.route) {
        activeRoute = currentUsage.route;
        isActual = true;
        console.log(`[STATUSLINE DEBUG] Using session usage cache: ${activeRoute}`);
      }

      // PRIORITY 3: Fall back to config default
      if (!activeRoute) {
        activeRoute = config.Router?.default || '';
        isActual = false;
        console.log(`[STATUSLINE DEBUG] Using config default: ${activeRoute}`);
      }

      const [provider, model] = activeRoute.split(',');

      // Auto-fetch pricing if missing
      await fetchModelPricing(provider, model);

      return {
        isUsingCCR: true,  // Always true when this endpoint is hit
        currentModel: {
          provider,
          model,
          route: activeRoute,
          isActual: isActual
        },
        currentSession: {
          inputTokens: currentUsage?.input_tokens || 0,
          outputTokens: currentUsage?.output_tokens || 0,
          totalTokens: (currentUsage?.input_tokens || 0) + (currentUsage?.output_tokens || 0)
        },
        modelUsage: historicalUsage,
        routerVersion: version,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error("Failed to get usage data:", error);
      reply.status(500).send({ error: "Failed to get usage data" });
    }
  });

  // Statusline API endpoint - CCR detection
  server.app.get("/api/statusline/detect", async (req, reply) => {
    try {
      const config = await readConfigFile();

      return {
        isActive: true,
        routerVersion: version,
        routingMode: config.Router?.default ? "active" : "passthrough",
        providers: config.Providers?.map((p: any) => ({
          name: p.name,
          modelsCount: p.models?.length || 0,
          isActive: config.Router?.default?.startsWith(p.name)
        })) || [],
        features: {
          tokenTracking: true,
          costTracking: true,
          statusLine: !!config.StatusLine?.enabled,
          customRouter: !!config.CUSTOM_ROUTER_PATH,
          databaseEnabled: !!db
        }
      };
    } catch (error) {
      console.error("Failed to detect CCR status:", error);
      reply.status(500).send({ error: "Failed to detect CCR status" });
    }
  });

  // Session forced model registration endpoint
  server.app.post("/api/session/force-model", async (req, reply) => {
    try {
      const { sessionId, model } = req.body as { sessionId: string; model?: string };

      if (!sessionId) {
        return reply.status(400).send({ error: "sessionId is required" });
      }

      // If no model specified or empty string, use "BYPASS" to bypass routing
      const forcedModel = model || "BYPASS";

      sessionForcedModelCache.put(sessionId, forcedModel);

      req.log.info(`Registered forced model for session ${sessionId}: ${forcedModel}`);

      return {
        success: true,
        sessionId,
        forcedModel,
        message: forcedModel === "BYPASS"
          ? "Session will bypass routing and use model specified by Claude"
          : `Session will use forced model: ${forcedModel}`
      };
    } catch (error) {
      console.error("Failed to register forced model:", error);
      reply.status(500).send({ error: "Failed to register forced model" });
    }
  });

  // Get forced model for a session
  server.app.get("/api/session/force-model", async (req, reply) => {
    try {
      const { sessionId } = req.query as { sessionId?: string };

      if (!sessionId) {
        return reply.status(400).send({ error: "sessionId is required" });
      }

      const forcedModel = sessionForcedModelCache.get(sessionId);

      return {
        sessionId,
        forcedModel: forcedModel || null,
        isBypass: forcedModel === "BYPASS",
        isForced: !!forcedModel
      };
    } catch (error) {
      console.error("Failed to get forced model:", error);
      reply.status(500).send({ error: "Failed to get forced model" });
    }
  });

  // Usage summary endpoint for dashboard
  server.app.get("/api/usage/summary", async (req, reply) => {
    try {
      const { startDate, endDate } = req.query as any;
      const summary = usageTracker.getUsageSummary(
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
      );
      return summary;
    } catch (error) {
      console.error("Failed to get usage summary:", error);
      reply.status(500).send({ error: "Failed to get usage summary" });
    }
  });

  // Usage details endpoint
  server.app.get("/api/usage/details", async (req, reply) => {
    try {
      const { sessionId, limit = 100, offset = 0 } = req.query as any;

      if (!db) {
        return [];
      }

      const query = sessionId
        ? `SELECT * FROM usage_records WHERE session_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`
        : `SELECT * FROM usage_records ORDER BY timestamp DESC LIMIT ? OFFSET ?`;

      const params = sessionId ? [sessionId, limit, offset] : [limit, offset];
      const details = db.prepare(query).all(...params);

      return details;
    } catch (error) {
      console.error("Failed to get usage details:", error);
      reply.status(500).send({ error: "Failed to get usage details" });
    }
  });

  // Daily usage endpoint for charts
  server.app.get("/api/usage/daily", async (req, reply) => {
    try {
      const { startDate, endDate } = req.query as any;

      if (!db) {
        return [];
      }

      const query = `
        SELECT
          DATE(timestamp) as date,
          SUM(cost_usd) as total_cost,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          COUNT(*) as request_count
        FROM usage_records
        WHERE DATE(timestamp) BETWEEN ? AND ?
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
      `;

      // Extract just the date part (YYYY-MM-DD) from ISO timestamps
      const startDateOnly = startDate ? new Date(startDate).toISOString().split('T')[0] : '1970-01-01';
      const endDateOnly = endDate ? new Date(endDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

      const dailyData = db.prepare(query).all(startDateOnly, endDateOnly);

      return dailyData;
    } catch (error) {
      console.error("Failed to get daily usage:", error);
      reply.status(500).send({ error: "Failed to get daily usage" });
    }
  });

  // Daily usage per model endpoint for line charts
  server.app.get("/api/usage/daily-by-model", async (req, reply) => {
    try {
      const { startDate, endDate } = req.query as any;

      if (!db) {
        return [];
      }

      const query = `
        SELECT
          DATE(timestamp) as date,
          provider,
          model,
          SUM(cost_usd) as cost,
          SUM(input_tokens) as input_tokens,
          SUM(output_tokens) as output_tokens,
          COUNT(*) as request_count
        FROM usage_records
        WHERE DATE(timestamp) BETWEEN ? AND ?
        GROUP BY DATE(timestamp), provider, model
        ORDER BY date ASC, cost DESC
      `;

      // Extract just the date part (YYYY-MM-DD) from ISO timestamps
      const startDateOnly = startDate ? new Date(startDate).toISOString().split('T')[0] : '1970-01-01';
      const endDateOnly = endDate ? new Date(endDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

      const dailyByModel = db.prepare(query).all(startDateOnly, endDateOnly);

      return dailyByModel;
    } catch (error) {
      console.error("Failed to get daily usage by model:", error);
      reply.status(500).send({ error: "Failed to get daily usage by model" });
    }
  });

  // Export endpoint for usage data
  server.app.get("/api/usage/export", async (req, reply) => {
    try {
      const { format = 'json', startDate, endDate } = req.query as any;

      if (!db) {
        return [];
      }

      const data = db.prepare(`
        SELECT * FROM usage_records
        WHERE timestamp BETWEEN ? AND ?
        ORDER BY timestamp DESC
      `).all(
        startDate || '1970-01-01',
        endDate || new Date().toISOString()
      );

      if (format === 'csv') {
        // Convert to CSV
        const headers = Object.keys(data[0] || {}).join(',');
        const rows = data.map(row => Object.values(row).join(','));
        const csv = [headers, ...rows].join('\n');

        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', 'attachment; filename="usage.csv"');
        return csv;
      }

      return data;
    } catch (error) {
      console.error("Failed to export usage data:", error);
      reply.status(500).send({ error: "Failed to export usage data" });
    }
  });

  // Model pricing endpoint
  server.app.get("/api/costs/models", async (req, reply) => {
    try {
      if (!db) {
        return [];
      }

      const models = db.prepare(`
        SELECT * FROM model_pricing
        ORDER BY provider, model
      `).all();

      return models;
    } catch (error) {
      console.error("Failed to get model pricing:", error);
      reply.status(500).send({ error: "Failed to get model pricing" });
    }
  });

  // Update model pricing
  server.app.post("/api/costs/models", async (req, reply) => {
    try {
      // Only allow full access users to update pricing
      const accessLevel = (req as any).accessLevel || "restricted";
      if (accessLevel !== "full") {
        reply.status(403).send("Full access required to update pricing");
        return;
      }

      if (!db) {
        reply.status(500).send({ error: "Database not available" });
        return;
      }

      const { provider, model, input_price_per_1k, output_price_per_1k, cached_input_price_per_1k, cached_output_price_per_1k } = req.body as any;

      db.prepare(`
        INSERT OR REPLACE INTO model_pricing
        (provider, model, input_price_per_1k, output_price_per_1k, cached_input_price_per_1k, cached_output_price_per_1k)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(provider, model, input_price_per_1k, output_price_per_1k, cached_input_price_per_1k, cached_output_price_per_1k);

      return { success: true, message: "Pricing updated successfully" };
    } catch (error) {
      console.error("Failed to update model pricing:", error);
      reply.status(500).send({ error: "Failed to update model pricing" });
    }
  });

  return server;
};
