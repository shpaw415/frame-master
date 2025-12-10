import { join } from "path";
import Paths from "../paths";
import { getConfig } from "./config";
import { pluginLoader } from "../plugins";
import { HotFileWatcher } from "./hot-file-watcher";
import { reloadServer } from "./index";
import { reinitAll } from "./init";
import type { FrameMasterConfig } from "./type";

export type ConfigReloadCallback = (
  newConfig: FrameMasterConfig
) => void | Promise<void>;

/**
 * ConfigWatcher handles hot-reloading of the frame-master.config.ts file.
 *
 * When the config file changes, it:
 * 1. Reloads the configuration from disk
 * 2. Reinitializes the plugin loader with the new config
 * 3. Reinitializes the builder with new plugin build configs
 * 4. Reloads the HTTP server with new routes and settings
 * 5. Calls any registered callbacks with the new config
 *
 * @example
 * ```typescript
 * const watcher = new ConfigWatcher();
 * watcher.onReload((newConfig) => {
 *   console.log("Config reloaded:", newConfig.HTTPServer.port);
 * });
 * await watcher.start();
 * ```
 */
class ConfigWatcher {
  private fileWatcher: HotFileWatcher | null = null;
  private callbacks: Set<ConfigReloadCallback> = new Set();
  private configPath: string;

  constructor() {
    this.configPath = join(process.cwd(), Paths.configFile);
  }

  /**
   * Register a callback to be called when the config is reloaded.
   *
   * @param callback - Function to call with the new config
   * @returns Unsubscribe function
   */
  onReload(callback: ConfigReloadCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Start watching the config file for changes.
   */
  async start(): Promise<void> {
    if (this.fileWatcher?.isActive()) {
      console.log("[ConfigWatcher] Already watching config file");
      return;
    }

    this.fileWatcher = new HotFileWatcher({
      filePath: this.configPath,
      onReload: () => this.reload(),
      debounceDelay: 100,
      name: "ConfigWatcher",
      verbose: false,
    });

    await this.fileWatcher.start();
  }

  /**
   * Reload the configuration and reinitialize dependent systems.
   */
  async reload(): Promise<void> {
    console.log("[ConfigWatcher] Reloading configuration...");

    try {
      // 1. Reinitialize everything (config, plugins, builder, hooks, watchers)
      await reinitAll();

      // 2. Run onConfigReload plugin hooks
      await this.runReloadHooks();

      // 3. Reload the HTTP server with new routes and config
      reloadServer();

      // 4. Notify all registered callbacks
      const newConfig = getConfig();
      if (newConfig) {
        for (const callback of this.callbacks) {
          try {
            await callback(newConfig);
          } catch (error) {
            console.error("[ConfigWatcher] Error in reload callback:", error);
          }
        }
      }

      console.log("[ConfigWatcher] Configuration reloaded successfully");
    } catch (error) {
      console.error("[ConfigWatcher] Failed to reload configuration:", error);
    }
  }

  /**
   * Run any plugin hooks that should execute on config reload.
   */
  private async runReloadHooks(): Promise<void> {
    if (!pluginLoader) return;

    // Get plugins that have onConfigReload hook
    const reloadPlugins = pluginLoader.getPluginByName("onConfigReload");

    await Promise.all(
      reloadPlugins.map(async (plugin) => {
        try {
          await plugin.pluginParent?.();
        } catch (error) {
          console.error(
            `[ConfigWatcher] Error in plugin ${plugin.name} onConfigReload:`,
            error
          );
        }
      })
    );
  }

  /**
   * Stop watching the config file.
   */
  stop(): void {
    this.fileWatcher?.stop();
    this.fileWatcher = null;
    console.log("[ConfigWatcher] Stopped watching config file");
  }

  /**
   * Check if currently watching the config file.
   */
  isActive(): boolean {
    return this.fileWatcher?.isActive() ?? false;
  }
}

/**
 * Singleton instance of ConfigWatcher.
 */
export const configWatcher = new ConfigWatcher();

/**
 * Start watching the frame-master.config.ts file for hot-reload.
 *
 * Only activates in development mode (NODE_ENV !== "production").
 *
 * @example
 * ```typescript
 * import { startConfigWatcher } from "frame-master/server/config-watcher";
 *
 * await startConfigWatcher();
 * ```
 */
export async function startConfigWatcher(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  await configWatcher.start();
}

/**
 * Stop watching the config file.
 */
export function stopConfigWatcher(): void {
  configWatcher.stop();
}

/**
 * Register a callback for config reload events.
 *
 * @param callback - Function to call when config is reloaded
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * import { onConfigReload } from "frame-master/server/config-watcher";
 *
 * const unsubscribe = onConfigReload((newConfig) => {
 *   console.log("New port:", newConfig.HTTPServer.port);
 * });
 *
 * // Later, to stop listening:
 * unsubscribe();
 * ```
 */
export function onConfigReload(callback: ConfigReloadCallback): () => void {
  return configWatcher.onReload(callback);
}

/**
 * Manually trigger a config reload.
 *
 * @example
 * ```typescript
 * import { triggerConfigReload } from "frame-master/server/config-watcher";
 *
 * await triggerConfigReload();
 * ```
 */
export async function triggerConfigReload(): Promise<void> {
  await configWatcher.reload();
}
