import type { FrameMasterConfig } from "./type";
import { join } from "path";
import Paths from "../paths";

const DEFAULT_CONFIG = {
  HTTPServer: {
    port: 3000,
  },
  plugins: [],
} satisfies FrameMasterConfig;

async function loadConfig(): Promise<FrameMasterConfig> {
  try {
    const config = (
      (await import(join(process.cwd(), Paths.configFile))) as {
        default?: FrameMasterConfig;
      }
    )?.default;

    if (config) return DEFAULT_CONFIG;

    console.error(`Config file is empty. Fallback to minimal config.`);
    return DEFAULT_CONFIG;
  } catch (error) {
    console.error(`Config file not found Fallback to minimal config.`);
    return DEFAULT_CONFIG;
  }
}

const config = { DEFAULT_CONFIG, ...(await loadConfig()) };

export default config;
