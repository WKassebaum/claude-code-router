#!/usr/bin/env node
import { run } from "./index";
import { showStatus } from "./utils/status";
import { executeCodeCommand } from "./utils/codeCommand";
import { parseStatusLineData, type StatusLineInput } from "./utils/statusline";
import {
  cleanupPidFile,
  isServiceRunning,
  getServiceInfo,
} from "./utils/processCheck";
import { version } from "../package.json";
import { spawn, exec } from "child_process";
import { PID_FILE, REFERENCE_COUNT_FILE } from "./constants";
import fs, { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { fetchModelPricing } from "./utils/database";

const command = process.argv[2];

if (command === 'update-pricing') {
  (async () => {
    console.log('Updating model pricing...');
    await fetchModelPricing('openai', 'gpt-4o');
    await fetchModelPricing('anthropic', 'claude-3.5-sonnet');
    console.log('Pricing updated successfully!');
    process.exit(0);
  })();
}

const args = process.argv.slice(3);
const isDaemon = args.includes('--daemon');

const LOG_DIR = join(homedir(), '.claude-code-router', 'logs');
const LOG_FILE = join(LOG_DIR, 'ccr.log');

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const HELP_TEXT = `
Usage: ccr [command]

Commands:
  start         Start server 
  stop          Stop server
  restart       Restart server
  status        Show server status
  statusline    Integrated statusline
  code          Execute claude command
  ui            Open the web UI in browser
  update-pricing Update model pricing
  -v, version   Show version information
  -h, help      Show help information

Example:
  ccr start
  ccr code "Write a Hello World"
  ccr ui
`;

async function waitForService(
  timeout = 10000,
  initialDelay = 1000
): Promise<boolean> {
  // Wait for an initial period to let the service initialize
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const isRunning = await isServiceRunning()
    if (isRunning) {
      // Wait for an additional short period to ensure service is fully ready
      await new Promise((resolve) => setTimeout(resolve, 500));
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function main() {
  const isRunning = await isServiceRunning()
  switch (command) {
    case "start":
      if (isDaemon) {
        const child = spawn("node", [join(process.cwd(), 'dist', 'cli.js'), "start"], {
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
        child.stdout?.pipe(logStream);
        child.stderr?.pipe(logStream);

        child.on('error', (err) => {
          console.error('Failed to start daemon:', err);
          process.exit(1);
        });

        child.unref();
        console.log(`CCR started in daemon mode. Logs: ${LOG_FILE}`);
        process.exit(0);
      } else {
        run();
      }
      break;
    case "stop":
      try {
        const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
        process.kill(pid);
        cleanupPidFile();
        if (existsSync(REFERENCE_COUNT_FILE)) {
          try {
            fs.unlinkSync(REFERENCE_COUNT_FILE);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        console.log(
          "claude code router service has been successfully stopped."
        );
      } catch (e) {
        console.log(
          "Failed to stop the service. It may have already been stopped."
        );
        cleanupPidFile();
      }
      break;
    case "restart":
      try {
        const pid = parseInt(readFileSync(PID_FILE, "utf-8"));
        process.kill(pid);
        cleanupPidFile();
        console.log(
          "claude code router service has been successfully stopped."
        );
      } catch (e) {
        console.log(
          "Failed to stop the service. It may have already been stopped."
        );
        cleanupPidFile();
      }
      // Wait a moment for the service to fully stop
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      console.log("Starting service...");
      const cliPath = join(__dirname, "cli.js");
      const startProcess = spawn("node", [cliPath, "start"], {
        detached: true,
        stdio: "ignore",
      });

      startProcess.on("error", (error) => {
        console.error("Failed to start service:", error.message);
        process.exit(1);
      });

      startProcess.unref();

      if (await waitForService()) {
        console.log("Service restarted successfully.");
      } else {
        console.error(
          "Service startup timeout, please manually run `ccr start` to start the service"
        );
        process.exit(1);
      }
      break;
    case "status":
      await showStatus();
      break;
    case "statusline":
      // 从stdin读取JSON输入
      let inputData = "";
      process.stdin.setEncoding("utf-8");
      process.stdin.on("readable", () => {
        let chunk;
        while ((chunk = process.stdin.read()) !== null) {
          inputData += chunk;
        }
      });

      process.stdin.on("end", async () => {
        try {
          const input: StatusLineInput = JSON.parse(inputData);
          const statusLine = await parseStatusLineData(input);
          console.log(statusLine);
        } catch (error) {
          console.error("Error parsing status line data:", error);
          process.exit(1);
        }
      });
      break;
    case "code":
      if (!isRunning) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        startProcess.unref();

        if (await waitForService()) {
          // Join all code arguments into a single string to preserve spaces within quotes
          const codeArgs = process.argv.slice(3);
          executeCodeCommand(codeArgs);
        } else {
          console.error(
            "Service startup timeout, please manually run `ccr start` to start the service"
          );
          process.exit(1);
        }
      } else {
        // Join all code arguments into a single string to preserve spaces within quotes
        const codeArgs = process.argv.slice(3);
        executeCodeCommand(codeArgs);
      }
      break;
    case "ui":
      // Check if service is running
      if (!isRunning) {
        console.log("Service not running, starting service...");
        const cliPath = join(__dirname, "cli.js");
        const startProcess = spawn("node", [cliPath, "start"], {
          detached: true,
          stdio: "ignore",
        });

        startProcess.on("error", (error) => {
          console.error("Failed to start service:", error.message);
          process.exit(1);
        });

        startProcess.unref();

        if (!(await waitForService())) {
          // If service startup fails, try to start with default config
          console.log(
            "Service startup timeout, trying to start with default configuration..."
          );
          const {
            initDir,
            writeConfigFile,
            backupConfigFile,
          } = require("./utils");

          try {
            // Initialize directories
            await initDir();

            // Backup existing config file if it exists
            const backupPath = await backupConfigFile();
            if (backupPath) {
              console.log(
                `Backed up existing configuration file to ${backupPath}`
              );
            }

            // Create a minimal default config file
            await writeConfigFile({
              PORT: 3456,
              Providers: [],
              Router: {},
            });
            console.log(
              "Created minimal default configuration file at ~/.claude-code-router/config.json"
            );
            console.log(
              "Please edit this file with your actual configuration."
            );

            // Try starting the service again
            const restartProcess = spawn("node", [cliPath, "start"], {
              detached: true,
              stdio: "ignore",
            });

            restartProcess.on("error", (error) => {
              console.error(
                "Failed to start service with default config:",
                error.message
              );
              process.exit(1);
            });

            restartProcess.unref();

            if (!(await waitForService(15000))) {
              // Wait a bit longer for the first start
              console.error(
                "Service startup still failing. Please manually run `ccr start` to start the service and check the logs."
              );
              process.exit(1);
            }
          } catch (error: any) {
            console.error(
              "Failed to create default configuration:",
              error.message
            );
            process.exit(1);
          }
        }
      }

      // Get service info and open UI
      const serviceInfo = await getServiceInfo();

      // Add temporary API key as URL parameter if successfully generated
      const uiUrl = `${serviceInfo.endpoint}/ui/`;

      console.log(`Opening UI at ${uiUrl}`);

      // Open URL in browser based on platform
      const platform = process.platform;
      let openCommand = "";

      if (platform === "win32") {
        // Windows
        openCommand = `start ${uiUrl}`;
      } else if (platform === "darwin") {
        // macOS
        openCommand = `open ${uiUrl}`;
      } else if (platform === "linux") {
        // Linux
        openCommand = `xdg-open ${uiUrl}`;
      } else {
        console.error("Unsupported platform for opening browser");
        process.exit(1);
      }

      exec(openCommand, (error) => {
        if (error) {
          console.error("Failed to open browser:", error.message);
          process.exit(1);
        }
      });
      break;
    case "-v":
    case "version":
      console.log(`claude-code-router version: ${version}`);
      break;
    case "-h":
    case "help":
      console.log(HELP_TEXT);
      break;
    default:
      console.log(HELP_TEXT);
      process.exit(1);
  }
}

main().catch(console.error);
