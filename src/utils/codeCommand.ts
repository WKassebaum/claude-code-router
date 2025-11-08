import { spawn, type StdioOptions } from "child_process";
import { readConfigFile } from ".";
import { closeService } from "./close";
import {
  decrementReferenceCount,
  incrementReferenceCount,
} from "./processCheck";
import { v4 as uuidv4 } from "uuid";


export async function executeCodeCommand(args: string[] = []) {
  // Set environment variables
  const config = await readConfigFile();
  const port = config.PORT || 3456;

  // Handle forced model if specified
  const forceModel = process.env.FORCE_DEFAULT_MODEL;
  let sessionId: string | undefined;

  if (forceModel) {
    // Generate unique session ID for this invocation
    sessionId = uuidv4();

    // Register forced model with server
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/session/force-model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          model: forceModel === '' ? undefined : forceModel
        })
      });

      if (!response.ok) {
        console.error(`Failed to register forced model: ${response.statusText}`);
      } else {
        const result = await response.json();
        console.log(result.message);
      }
    } catch (error: any) {
      console.error(`Failed to register forced model: ${error.message}`);
    }
  }

  // Determine if we're using Anthropic subscription or API key
  const activeModel = config.Router?.default || '';
  const [providerName] = activeModel.split(',');
  const provider = config.Providers?.find((p: any) => p.name === providerName);

  const env: Record<string, string> = {
    ...process.env,
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    NO_PROXY: `127.0.0.1`,
    DISABLE_TELEMETRY: 'true',
    DISABLE_COST_WARNINGS: 'true',
    API_TIMEOUT_MS: String(config.API_TIMEOUT_MS ?? 600000), // Default to 10 minutes if not set
    // Reset CLAUDE_CODE_USE_BEDROCK when running with ccr code
    CLAUDE_CODE_USE_BEDROCK: undefined,
  };

  // If we have a sessionId for forced model, pass it via metadata
  if (sessionId) {
    env.ANTHROPIC_METADATA_USER_ID = `ccr_session_${sessionId}`;
  }

  // Handle Anthropic authentication based on provider configuration
  if (provider?.auth_type === 'passthrough') {
    // Passthrough mode: Use Claude Code's own authentication (from /login)
    // Don't set any auth env vars - let Claude use its configured auth
    console.log('Using passthrough authentication - Claude Code will use its own /login credentials');
    // Don't modify ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY
    // Claude's auth will pass through to CCR and then to Anthropic
  } else if (provider?.auth_type === 'subscription') {
    // For subscription, use AUTH_TOKEN
    env.ANTHROPIC_AUTH_TOKEN = provider.auth_token || config?.APIKEY || "test";
    env.ANTHROPIC_API_KEY = ''; // Clear API key
  } else if (provider?.auth_type === 'api_key') {
    // For API access, use API_KEY
    env.ANTHROPIC_API_KEY = provider.api_key || '';
    delete env.ANTHROPIC_AUTH_TOKEN;
  } else {
    // Default routing behavior (backward compatibility)
    env.ANTHROPIC_AUTH_TOKEN = config?.APIKEY || "test";
    env.ANTHROPIC_API_KEY = '';
  }

  let settingsFlag: Record<string, any> = {
    env
  };

  if (config?.StatusLine?.enabled) {
    settingsFlag.statusLine = {
      type: "command",
      command: "ccr statusline",
      padding: 0,
    }
  }
  args.push('--settings', `${JSON.stringify(settingsFlag)}`);

  // Non-interactive mode for automation environments
  if (config.NON_INTERACTIVE_MODE) {
    env.CI = "true";
    env.FORCE_COLOR = "0";
    env.NODE_NO_READLINE = "1";
    env.TERM = "dumb";
  }

  // Set ANTHROPIC_SMALL_FAST_MODEL if it exists in config
  if (config?.ANTHROPIC_SMALL_FAST_MODEL) {
    env.ANTHROPIC_SMALL_FAST_MODEL = config.ANTHROPIC_SMALL_FAST_MODEL;
  }

  // Increment reference count when command starts
  incrementReferenceCount();

  // Execute claude command
  const claudePath = config?.CLAUDE_PATH || process.env.CLAUDE_PATH || "claude";

  const stdioConfig: StdioOptions = config.NON_INTERACTIVE_MODE
    ? ["pipe", "inherit", "inherit"] // Pipe stdin for non-interactive
    : "inherit"; // Default inherited behavior

  const claudeProcess = spawn(
    claudePath,
    args,
    {
      env: env,
      stdio: stdioConfig,
    }
  );

  // Release parent's control of stdin so only child (Claude) handles it
  if (!config.NON_INTERACTIVE_MODE) {
    // Unpipe stdin from parent process
    process.stdin.pause();
    process.stdin.unref();
  } else {
    // Close stdin for non-interactive mode
    claudeProcess.stdin?.end();
  }

  claudeProcess.on("error", (error) => {
    console.error("Failed to start claude command:", error.message);
    console.log(
      "Make sure Claude Code is installed: npm install -g @anthropic-ai/claude-code"
    );
    decrementReferenceCount();
    process.exit(1);
  });

  claudeProcess.on("close", (code) => {
    decrementReferenceCount();
    closeService();
    process.exit(code || 0);
  });
}
