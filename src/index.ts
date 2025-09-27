import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { homedir } from "os";
import path, { join } from "path";
import { initConfig, initDir, cleanupLogFiles } from "./utils";
import { createServer } from "./server";
import { router } from "./utils/router";
import { apiKeyAuth } from "./middleware/auth";
import {
  cleanupPidFile,
  isServiceRunning,
  savePid,
} from "./utils/processCheck";
import { CONFIG_FILE } from "./constants";
import { createStream } from 'rotating-file-stream';
import { HOME_DIR } from "./constants";
import { sessionUsageCache, normalizeUsage } from "./utils/cache";
import {SSEParserTransform} from "./utils/SSEParser.transform";
import {SSESerializerTransform} from "./utils/SSESerializer.transform";
import {rewriteStream} from "./utils/rewriteStream";
import JSON5 from "json5";
import { IAgent } from "./agents/type";
import agentsManager from "./agents";
import { EventEmitter } from "node:events";
import { usageTracker } from "./utils/database";
import { v4 as uuidv4 } from 'uuid';

const event = new EventEmitter()

async function initializeClaudeConfig() {
  const homeDir = homedir();
  const configPath = join(homeDir, ".claude.json");
  if (!existsSync(configPath)) {
    const userID = Array.from(
      { length: 64 },
      () => Math.random().toString(16)[2]
    ).join("");
    const configContent = {
      numStartups: 184,
      autoUpdaterStatus: "enabled",
      userID,
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "1.0.17",
      projects: {},
    };
    await writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}

interface RunOptions {
  port?: number;
}

async function run(options: RunOptions = {}) {
  // Check if service is already running
  const isRunning = await isServiceRunning()
  if (isRunning) {
    console.log("✅ Service is already running in the background.");
    return;
  }

  await initializeClaudeConfig();
  await initDir();
  // Clean up old log files, keeping only the 10 most recent ones
  await cleanupLogFiles();
  const config = await initConfig();


  let HOST = config.HOST || "127.0.0.1";

  if (config.HOST && !config.APIKEY) {
    HOST = "127.0.0.1";
    console.warn("⚠️ API key is not set. HOST is forced to 127.0.0.1.");
  }

  const port = config.PORT || 3456;

  // Save the PID of the background process
  savePid(process.pid);

  // Handle SIGINT (Ctrl+C) to clean up PID file
  process.on("SIGINT", () => {
    console.log("Received SIGINT, cleaning up...");
    cleanupPidFile();
    process.exit(0);
  });

  // Handle SIGTERM to clean up PID file
  process.on("SIGTERM", () => {
    cleanupPidFile();
    process.exit(0);
  });

  // Use port from environment variable if set (for background process)
  const servicePort = process.env.SERVICE_PORT
    ? parseInt(process.env.SERVICE_PORT)
    : port;

  // Configure logger based on config settings
  const pad = num => (num > 9 ? "" : "0") + num;
  const generator = (time, index) => {
    if (!time) {
      time = new Date()
    }

    var month = time.getFullYear() + "" + pad(time.getMonth() + 1);
    var day = pad(time.getDate());
    var hour = pad(time.getHours());
    var minute = pad(time.getMinutes());

    return `./logs/ccr-${month}${day}${hour}${minute}${pad(time.getSeconds())}${index ? `_${index}` : ''}.log`;
  };
  const loggerConfig =
    config.LOG !== false
      ? {
          level: config.LOG_LEVEL || "debug",
          stream: createStream(generator, {
            path: HOME_DIR,
            maxFiles: 3,
            interval: "1d",
            compress: false,
            maxSize: "50M"
          }),
        }
      : false;

  const server = createServer({
    jsonPath: CONFIG_FILE,
    initialConfig: {
      // ...config,
      providers: config.Providers || config.providers,
      HOST: HOST,
      PORT: servicePort,
      LOG_FILE: join(
        homedir(),
        ".claude-code-router",
        "claude-code-router.log"
      ),
    },
    logger: loggerConfig,
  });

  // Add global error handlers to prevent the service from crashing
  process.on("uncaughtException", (err: any) => {
    if (server && server.log) {
      server.log.error("Uncaught exception:", err?.message || String(err) || 'Unknown error');
      server.log.error("Stack trace:", err?.stack || 'No stack trace available');
    } else {
      console.error("Uncaught exception:", err?.message || String(err) || 'Unknown error');
      console.error("Stack trace:", err?.stack || 'No stack trace available');
      console.error("Full error object:", err);
    }
    // Exit gracefully to allow restart
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    if (server && server.log) {
      server.log.error("Unhandled rejection at:", promise, "reason:", reason);
    } else {
      console.error("Unhandled rejection at:", promise, "reason:", reason);
    }
  });
  // Add async preHandler hook for authentication
  server.addHook("preHandler", async (req, reply) => {
    // Track request start time for usage tracking
    (req as any).requestStart = Date.now();
    (req as any).requestId = uuidv4();

    return new Promise((resolve, reject) => {
      const done = (err?: Error) => {
        if (err) reject(err);
        else resolve();
      };
      // Call the async auth function
      apiKeyAuth(config)(req, reply, done).catch(reject);
    });
  });
  server.addHook("preHandler", async (req: any, reply: any) => {
    if (req.url.startsWith("/v1/messages")) {
      const useAgents = []
 
      for (const agent of agentsManager.getAllAgents()) {
        if (agent.shouldHandle(req, config)) {
          // 设置agent标识
          useAgents.push(agent.name)
 
          // change request body
          agent.reqHandler(req, config);
 
          // append agent tools
          if (agent.tools.size) {
            if (!req.body?.tools?.length) {
              req.body.tools = []
            }
            req.body.tools.unshift(...Array.from(agent.tools.values()).map(item => {
              return {
                name: item.name,
                description: item.description,
                input_schema: item.input_schema
              }
            }))
          }
        }
      }
 
      if (useAgents.length) {
        req.agents = useAgents;
      }
      await router(req, reply, {
        config,
        event
      });
    }
  });

  // Add retry logic for 429 errors from xAI
  let retryCount = 0;
  const maxRetries = 3;
  server.addHook("onError", async (request: any, reply: any, error: any) => {
    if (request.url.startsWith("/v1/messages") && error.statusCode === 429 && error.message.includes('xai')) {
      if (retryCount < maxRetries) {
        retryCount++;
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.log(`429 from xAI, retry ${retryCount}/${maxRetries} after ${delay}ms`);
        await new Promise<void>((resolve) => setTimeout(() => resolve(), delay));
        // Fallback to Gemini if retries exhausted
        if (retryCount === maxRetries) {
          const fallbackModel = "gemini,gemini-2.5-flash";
          request.body.model = fallbackModel;
          console.log(`Fallback to ${fallbackModel} after xAI exhaustion`);
        }
        // Retry the request
        try {
          const response = await server.app.inject({
            method: request.method as string,
            url: request.url,
            body: request.body,
            headers: request.headers
          });
          return response;
        } catch (retryError: any) {
          throw retryError;
        }
      }
    }
    throw error;
  });
  server.addHook("onError", async (request, reply, error) => {
    event.emit('onError', request, reply, error);
  })
  server.addHook("onSend", (req, reply, payload, done) => {
    if (req.sessionId && req.url.startsWith("/v1/messages")) {
      if (payload instanceof ReadableStream) {
        if (req.agents) {
          const abortController = new AbortController();
          const eventStream = payload.pipeThrough(new SSEParserTransform())
          let currentAgent: undefined | IAgent;
          let currentToolIndex = -1
          let currentToolName = ''
          let currentToolArgs = ''
          let currentToolId = ''
          const toolMessages: any[] = []
          const assistantMessages: any[] = []
          // 存储Anthropic格式的消息体，区分文本和工具类型
          return done(null, rewriteStream(eventStream, async (data, controller) => {
            try {
              // 检测工具调用开始
              if (data.event === 'content_block_start' && data?.data?.content_block?.name) {
                const agent = req.agents.find((name: string) => agentsManager.getAgent(name)?.tools.get(data.data.content_block.name))
                if (agent) {
                  currentAgent = agentsManager.getAgent(agent)
                  currentToolIndex = data.data.index
                  currentToolName = data.data.content_block.name
                  currentToolId = data.data.content_block.id
                  return undefined;
                }
              }

              // 收集工具参数
              if (currentToolIndex > -1 && data.data.index === currentToolIndex && data.data?.delta?.type === 'input_json_delta') {
                currentToolArgs += data.data?.delta?.partial_json;
                return undefined;
              }

              // 工具调用完成，处理agent调用
              if (currentToolIndex > -1 && data.data.index === currentToolIndex && data.data.type === 'content_block_stop') {
                try {
                  const args = JSON5.parse(currentToolArgs);
                  assistantMessages.push({
                    type: "tool_use",
                    id: currentToolId,
                    name: currentToolName,
                    input: args
                  })
                  const toolResult = await currentAgent?.tools.get(currentToolName)?.handler(args, {
                    req,
                    config
                  });
                  toolMessages.push({
                    "tool_use_id": currentToolId,
                    "type": "tool_result",
                    "content": toolResult
                  })
                  currentAgent = undefined
                  currentToolIndex = -1
                  currentToolName = ''
                  currentToolArgs = ''
                  currentToolId = ''
                } catch (e) {
                  console.log(e);
                }
                return undefined;
              }

              if (data.event === 'message_delta' && toolMessages.length) {
                req.body.messages.push({
                  role: 'assistant',
                  content: assistantMessages
                })
                req.body.messages.push({
                  role: 'user',
                  content: toolMessages
                })
                const response = await fetch(`http://127.0.0.1:${config.PORT}/v1/messages`, {
                  method: "POST",
                  headers: {
                    'x-api-key': config.APIKEY,
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify(req.body),
                })
                if (!response.ok) {
                  return undefined;
                }
                const stream = response.body!.pipeThrough(new SSEParserTransform())
                const reader = stream.getReader()
                while (true) {
                  try {
                    const {value, done} = await reader.read();
                    if (done) {
                      break;
                    }
                    if (['message_start', 'message_stop'].includes(value.event)) {
                      continue
                    }

                    // 检查流是否仍然可写
                    if (!controller.desiredSize) {
                      break;
                    }

                    controller.enqueue(value)
                  }catch (readError: any) {
                    if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                      abortController.abort(); // 中止所有相关操作
                      break;
                    }
                    throw readError;
                  }

                }
                return undefined
              }
              return data
            }catch (error: any) {
              console.error('Unexpected error in stream processing:', error);

              // 处理流提前关闭的错误
              if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                abortController.abort();
                return undefined;
              }

              // 其他错误仍然抛出
              throw error;
            }
          }).pipeThrough(new SSESerializerTransform()))
        }

        const [originalStream, clonedStream] = payload.tee();
        const read = async (stream: ReadableStream) => {
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              // Process the value if needed
              const dataStr = new TextDecoder().decode(value);
              if (!dataStr.startsWith("event: message_delta")) {
                continue;
              }
              const str = dataStr.slice(27);
              try {
                const message = JSON.parse(str);
                sessionUsageCache.put(req.sessionId, normalizeUsage(message.usage));
              } catch {}
            }
          } catch (readError: any) {
            if (readError.name === 'AbortError' || readError.code === 'ERR_STREAM_PREMATURE_CLOSE') {
              console.error('Background read stream closed prematurely');
            } else {
              console.error('Error in background stream reading:', readError);
            }
          } finally {
            reader.releaseLock();
          }
        }
        read(clonedStream);
        return done(null, originalStream)
      }
      // Check if payload exists before accessing its properties
      if (payload && payload.usage) {
        sessionUsageCache.put(req.sessionId, normalizeUsage(payload.usage));
      }
      if (payload && typeof payload === 'object') {
        if (payload.error) {
          return done(payload.error, null)
        } else {
          return done(payload, null)
        }
      }
    }
    if (payload && typeof payload === 'object' && payload.error) {
      return done(payload.error, null)
    }
    done(null, payload)
  });
  server.addHook("onSend", async (req, reply, payload) => {
    // Track usage if we have the data
    const requestStart = (req as any).requestStart || Date.now();
    const responseTime = Date.now() - requestStart;

    // Extract provider and model from request
    if (req.body?.model) {
      let provider: string | undefined;
      let model: string | undefined;
      
      // Check if model contains a comma (provider,model format)
      if (req.body.model.includes(',')) {
        [provider, model] = req.body.model.split(',');
      } else {
        // No comma, so the whole string is the model
        model = req.body.model;
        
        // Infer provider from model prefix
        if (model) {
          if (model.startsWith('grok-')) {
            provider = 'xai';
          } else if (model.startsWith('claude-')) {
            provider = 'anthropic';
          } else if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3-')) {
            provider = 'openai';
          } else if (model.startsWith('gemini-')) {
            provider = 'gemini';
          } else if (model.startsWith('deepseek-')) {
            provider = 'deepseek';
          }
        }
      }
      
      const sessionId = (req as any).sessionId || 'unknown';

      // Get usage from cache
      const usage = sessionUsageCache.get(sessionId);

      if (usage) {
        // Log for debugging
        console.log('Recording usage with provider:', provider, 'model:', model);
        
        // Record usage to database
        usageTracker.recordUsage({
          sessionId,
          requestId: (req as any).requestId || uuidv4(),
          provider: provider || '',
          model: model || '',
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          responseTime,
          status: 'success'
        });
      }
    }

    event.emit('onSend', req, reply, payload);
    return payload;
  })


  server.start();
}

export { run };
// run();
