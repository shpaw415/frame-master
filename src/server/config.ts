import type { FrameMasterConfig } from "./type";
import { join } from "path";
import Paths from "../paths";

export const DEFAULT_CONFIG = {
  HTTPServer: {
    port: 3000,
  },
  plugins: [],
} satisfies FrameMasterConfig;

export class ConfigFileNotFound extends Error {
  constructor(filePath: string, errorOptions?: ErrorOptions) {
    super(`Config file not found: ${filePath}`, errorOptions);
    this.name = "ConfigFileNotFound";
  }
}

/**
 * ConfigManager handles Frame-Master configuration loading and access.
 *
 * Uses lazy initialization pattern to prevent circular dependency issues.
 * Config is `null` until `loadConfig()` is called by Frame-Master's initialization.
 *
 * @internal - Use exported functions instead of direct instantiation
 */
class ConfigManager {
  public mergedConfig: FrameMasterConfig | null = null;

  /**
   * Getter for accessing the merged configuration.
   * @returns The current configuration or null if not yet loaded
   */
  public get config() {
    return this.mergedConfig;
  }

  /**
   * Loads the Frame-Master configuration from `frame-master.config.ts`.
   *
   * If config is already loaded, returns cached version.
   * Falls back to minimal default config if file is missing or empty.
   *
   * @returns Promise resolving to the loaded configuration
   * @internal - Called by Frame-Master during initialization
   */
  async initConfig(
    withSuffix?: string,
    config?: FrameMasterConfig
  ): Promise<FrameMasterConfig> {
    if (config) {
      this.mergedConfig = config;
      return this.mergedConfig;
    }
    if (this.mergedConfig != null) return this.mergedConfig;
    const realFilePath = join(process.cwd(), Paths.configFile);
    const filePath = realFilePath + (withSuffix ?? "");
    if (!(await Bun.file(realFilePath).exists()))
      throw new ConfigFileNotFound(realFilePath);
    try {
      const configModule = await import(filePath);
      const config = configModule?.default as FrameMasterConfig | undefined;

      if (!config)
        throw new Error("Config file does not export the config as default.");

      this.mergedConfig = config;
      return this.mergedConfig;
    } catch (error) {
      throw new Error("Error when loading Config file frame-master.config.ts", {
        cause: error,
      });
    }
  }

  /**
   * Reloads the configuration by clearing cache and re-importing.
   *
   * Useful for hot-reloading or testing scenarios.
   *
   * @returns Promise resolving to the reloaded configuration
   */
  async reloadConfig(): Promise<FrameMasterConfig> {
    this.mergedConfig = null;
    return this.initConfig(`?t=${Bun.randomUUIDv7()}`);
  }

  /**
   * Returns the current configuration without loading.
   *
   * @returns The configuration object or null if not yet loaded
   */
  getConfig(): FrameMasterConfig | null {
    return this.mergedConfig;
  }
  setMockConfig(mockConfig: FrameMasterConfig) {
    this.mergedConfig = mockConfig;
  }
}

/**
 * Singleton instance of ConfigManager.
 *
 * @public
 */
export const configManager = new ConfigManager();

/**
 * Loads the Frame-Master configuration file.
 *
 * This function is called automatically during Frame-Master initialization.
 * If you need to access config, use `getConfig()` instead.
 *
 * @returns Promise resolving to the loaded configuration
 *
 * @example
 * ```typescript
 * // Usually called internally by Frame-Master
 * const config = await loadConfig();
 * ```
 */
export async function InitConfig(
  config?: FrameMasterConfig
): Promise<FrameMasterConfig> {
  return configManager.initConfig(undefined, config);
}

/**
 * Reloads the Frame-Master configuration.
 *
 * Clears the cached configuration and re-imports from disk.
 * Useful for development hot-reloading scenarios.
 *
 * @returns Promise resolving to the reloaded configuration
 *
 * @example
 * ```typescript
 * // Hot reload config after changes
 * const newConfig = await reloadConfig();
 * ```
 */
export async function reloadConfig(): Promise<FrameMasterConfig> {
  return configManager.reloadConfig();
}

/**
 * Gets the current Frame-Master configuration.
 *
 * Returns `null` if configuration hasn't been loaded yet.
 * This is the **only safe way** to access config - prevents circular dependencies.
 *
 * @returns The configuration object or null if not yet initialized
 *
 * @example
 * ```typescript
 * import { getConfig } from "frame-master/server/config";
 *
 * const config = getConfig();
 * if (config) {
 *   console.log("Port:", config.HTTPServer.port);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // In a Frame-Master plugin (best practice)
 * export function myPlugin(): FrameMasterPlugin {
 *   return {
 *     name: "my-plugin",
 *     serverStart: async (server, config) => {
 *       // Access config through hook parameter
 *       console.log("Port:", config.HTTPServer.port);
 *     }
 *   };
 * }
 * ```
 */
export function getConfig(): FrameMasterConfig | null {
  return configManager.getConfig();
}

/** Override Config for testing perpose or something else */
export function setMockConfig(mockConfig: FrameMasterConfig) {
  configManager.setMockConfig(mockConfig);
  return mockConfig;
}
