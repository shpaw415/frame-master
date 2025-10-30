import type { FrameMasterConfig } from "./type";
import { join } from "path";
import Paths from "../paths";
import chalk from "chalk";

const DEFAULT_CONFIG = {
  HTTPServer: {
    port: 3000,
  },
  plugins: [],
} satisfies FrameMasterConfig;

async function loadConfig(): Promise<FrameMasterConfig> {
  const filePath = join(process.cwd(), Paths.configFile);

  try {
    const config = (
      (await import(filePath)) as {
        default?: FrameMasterConfig;
      }
    )?.default;

    if (config) return config;

    console.error(`Config file is empty. Fallback to minimal config.`);
    return DEFAULT_CONFIG;
  } catch (error) {
    const _e: Error = error as Error;
    if (
      _e.message.trim().startsWith("Cannot access") &&
      _e.message.trim().endsWith("before initialization.")
    ) {
      console.error("\n" + "=".repeat(80));
      console.error(
        chalk.red.bold("❌ CIRCULAR DEPENDENCY DETECTED IN CONFIG")
      );
      console.error("=".repeat(80));
      console.error(
        chalk.yellow(
          "\n⚠️  Your configuration file has a circular dependency.\n"
        )
      );
      console.error(chalk.white("Common causes:"));
      console.error(
        chalk.gray(
          [
            "  • Trying to access config values at the module level (top-level)",
          ].join("\n")
        )
      );
      console.error(chalk.white("Solution:"));
      console.error(
        chalk.green(
          "  ✓ Access config values inside plugin hooks (serverStart, router, etc.)"
        )
      );
      console.error(
        chalk.green(
          "  ✓ set config as module scopped variable via import inside serverStart hook"
        )
      );
      console.error(
        chalk.green("  ✓ Move config-dependent code into lifecycle hooks\n")
      );
      console.error(
        chalk.cyan(
          "📖 Documentation: https://frame-master.com/docs/configuration#limitations"
        )
      );
      console.error("=".repeat(80) + "\n");
      throw new Error(
        "Frame-Master: Circular dependency in configuration file. Cannot continue.",
        {
          cause: error,
        }
      );
    }
    console.error(`Config file not found Fallback to minimal config.`);
    return DEFAULT_CONFIG;
  }
}

const config = { DEFAULT_CONFIG, ...(await loadConfig()) };

export default config;
