import { exec } from "child_process";
import { readConfigFile, writeConfigFile } from ".";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

export async function runLogin() {
  console.log("\n🔐 Claude Code Router - Anthropic Subscription Login\n");
  console.log("This will help you configure CCR to use your Anthropic subscription (Claude Pro/Team/Max).\n");

  // Ask if user wants to open browser
  const openBrowser = await askQuestion("Open claude.ai in your browser? (y/n): ");

  if (openBrowser.toLowerCase() === 'y' || openBrowser.toLowerCase() === 'yes') {
    const platform = process.platform;
    let openCommand = "";

    if (platform === "win32") {
      openCommand = "start https://claude.ai";
    } else if (platform === "darwin") {
      openCommand = "open https://claude.ai";
    } else if (platform === "linux") {
      openCommand = "xdg-open https://claude.ai";
    }

    if (openCommand) {
      exec(openCommand, (error) => {
        if (error) {
          console.error("Failed to open browser:", error.message);
        }
      });
    }
  }

  console.log("\n📋 Instructions to extract your session token:\n");
  console.log("1. Make sure you're logged into claude.ai");
  console.log("2. Open Browser DevTools (F12 or Right-click → Inspect)");
  console.log("3. Go to the 'Network' tab");
  console.log("4. Send a message to Claude (any message)");
  console.log("5. Look for a request to 'api.anthropic.com'");
  console.log("6. Click on that request");
  console.log("7. In 'Request Headers', find 'Authorization'");
  console.log("8. Copy the token after 'Bearer ' (starts with 'sk-ant-sid')");
  console.log("\nAlternatively, you can find it in:");
  console.log("- Application/Storage → Cookies → sessionKey");
  console.log("- Or in the Console: document.cookie\n");

  const token = await askQuestion("Paste your session token here: ");

  if (!token || !token.trim()) {
    console.log("\n❌ No token provided. Login cancelled.");
    rl.close();
    return;
  }

  const cleanToken = token.trim();

  // Validate token format
  if (!cleanToken.startsWith('sk-ant-sid')) {
    console.log("\n⚠️  Warning: Token doesn't start with 'sk-ant-sid'. This might not be a valid session token.");
    const proceed = await askQuestion("Continue anyway? (y/n): ");
    if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
      console.log("\n❌ Login cancelled.");
      rl.close();
      return;
    }
  }

  try {
    // Read existing config
    const config = await readConfigFile();

    // Check if anthropic-subscription provider already exists
    const existingProviderIndex = config.Providers?.findIndex(
      (p: any) => p.name === 'anthropic-subscription'
    );

    const subscriptionProvider = {
      name: "anthropic-subscription",
      api_base_url: "https://api.anthropic.com/v1/messages",
      auth_type: "subscription",
      auth_token: cleanToken,
      models: [
        "claude-opus-4",
        "claude-sonnet-4.5",
        "claude-sonnet-4",
        "claude-3.5-sonnet",
        "claude-3.5-haiku"
      ],
      transformer: { use: ["anthropic"] }
    };

    if (existingProviderIndex >= 0) {
      // Update existing provider
      config.Providers[existingProviderIndex] = subscriptionProvider;
      console.log("\n✅ Updated existing 'anthropic-subscription' provider");
    } else {
      // Add new provider
      if (!config.Providers) {
        config.Providers = [];
      }
      config.Providers.push(subscriptionProvider);
      console.log("\n✅ Added new 'anthropic-subscription' provider");
    }

    // Ask if user wants to set it as default
    const setDefault = await askQuestion("\nSet as default router? (y/n): ");
    if (setDefault.toLowerCase() === 'y' || setDefault.toLowerCase() === 'yes') {
      const modelChoice = await askQuestion("\nWhich model to use by default?\n1. claude-sonnet-4.5\n2. claude-opus-4\n3. claude-3.5-sonnet\nChoice (1-3): ");

      let defaultModel = "claude-sonnet-4.5";
      if (modelChoice === '2') {
        defaultModel = "claude-opus-4";
      } else if (modelChoice === '3') {
        defaultModel = "claude-3.5-sonnet";
      }

      if (!config.Router) {
        config.Router = {};
      }
      config.Router.default = `anthropic-subscription,${defaultModel}`;
      console.log(`\n✅ Set default router to: anthropic-subscription,${defaultModel}`);
    }

    // Save config
    await writeConfigFile(config);

    console.log("\n✨ Configuration saved successfully!");
    console.log("\n📝 Next steps:");
    console.log("1. Restart CCR: ccr restart");
    console.log("2. Start using your subscription: ccr code\n");
    console.log("💡 Your subscription token has been stored in ~/.claude-code-router/config.json");
    console.log("   Keep this file secure and don't share it!\n");

  } catch (error: any) {
    console.error("\n❌ Failed to save configuration:", error.message);
  }

  rl.close();
}
