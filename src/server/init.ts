import {
  InitPluginLoader,
  pluginLoader,
  PluginLoader,
  reloadPluginLoader,
} from "../plugins";
import { InitConfig, reloadConfig, getConfig } from "./config";
import Builder, { InitBuilder, reloadBuilder } from "../build";
import cluster from "node:cluster";
import { createWatcher } from "./watch";
import { startConfigWatcher } from "./config-watcher";
import type { FrameMasterConfig } from "./type";

let inited = false;

type InitProps = Partial<{
  loders: Partial<{
    config: FrameMasterConfig;
    builder: Builder;
    pluginLoader: PluginLoader;
  }>;
}>;

/**
 * Loads and initializes all core components of the server.
 *
 * This function sets up the configuration, plugin loader, and runs
 * any main plugins that need to be initialized at server start.
 *
 * It is typically called once during server startup to ensure all
 * necessary systems are in place before handling requests. And orderly called
 *
 */
export async function InitAll(bypass?: InitProps) {
  if (inited) return;
  await InitConfig(bypass?.loders?.config);
  InitPluginLoader(bypass?.loders?.pluginLoader);
  await InitBuilder(bypass?.loders as unknown as { builder: Builder });
  await runCreateContextHooks(bypass?.loders);
  await runOnStartMainPlugins(bypass?.loders);
  await runFileSystemWatcherPlugin(undefined, bypass?.loders);
  await startConfigWatcher();
  inited = true;
}

export async function InitBuild() {
  if (inited) return;
  await InitConfig();
  InitPluginLoader();
  await InitBuilder();
  await runCreateContextHooks();
  inited = true;
}

export async function InitCLIPlugins() {
  if (inited) return;
  await InitConfig();
  InitPluginLoader();
  await InitBuilder();
  await runCreateContextHooks();
  inited = true;
}

/**
 * Cleans up and reinitializes all core components.
 *
 * This function performs a full reload cycle:
 * 1. Stops all file system watchers
 * 2. Reloads configuration from disk
 * 3. Reinitializes plugin loader with new plugins
 * 4. Reinitializes builder with new build configs
 * 5. Reruns serverStart hooks (main/dev_main)
 * 6. Recreates file system watchers with new plugin directories
 *
 * Used by hot-reload to fully reinitialize without process restart.
 *
 * @example
 * ```typescript
 * import { reinitAll } from "frame-master/server/init";
import { builder } from '../build/index';
import { pluginLoader } from '../plugins/plugin-loader';
 *
 * // After config changes
 * await reinitAll();
 * ```
 */
export async function reinitAll(): Promise<void> {
  // 1. Reload config from disk
  await reloadConfig();

  // 2. Reinitialize plugin loader
  reloadPluginLoader();

  // 3. Reinitialize builder
  await reloadBuilder();

  // 4. Re-run createContext hooks
  await runCreateContextHooks();

  // 5. Re-run serverStart hooks
  await runOnStartMainPlugins();

  // 6. Recreate file system watchers (cleanup + create, force bypass __DRY_RUN__ check)
  await runFileSystemWatcherPlugin(true);
}

/**
 * Cleanup all active file system watchers.
 */
function cleanupFileSystemWatchers(): void {
  if (globalThis.__FILESYSTEM_WATCHER__) {
    for (const watcher of globalThis.__FILESYSTEM_WATCHER__) {
      watcher.stop();
    }
    globalThis.__FILESYSTEM_WATCHER__ = [];
  }
}

/**
 * Run createContext hooks for all plugins that define them.
 * Called after plugin loader and builder are initialized.
 */
async function runCreateContextHooks(params?: {
  config?: FrameMasterConfig;
  pluginLoader?: PluginLoader;
}): Promise<void> {
  const _pluginLoader = params?.pluginLoader ?? pluginLoader;
  const _config = params?.config ?? getConfig();
  if (!_pluginLoader) throw new Error("Plugin loader not initialized");
  if (!_config) throw new Error("Config not initialized");

  const createContextPlugins = _pluginLoader.getPluginByName("createContext");

  const errors: Array<{ name: string; error: any }> = [];

  await Promise.all(
    createContextPlugins.map(async (plugin) => {
      try {
        await plugin.pluginParent(_config);
      } catch (error) {
        console.error(`Error in plugin ${plugin.name} createContext():`, error);
        errors.push({ name: plugin.name, error });
      }
    })
  );

  if (errors.length > 0) {
    throw new AggregateError(
      errors.map((e) => e.error),
      `Errors occurred in createContext hooks: ${errors
        .map((e) => `${e.name}: ${e.error.message || e.error}`)
        .join("; ")}`
    );
  }
}

async function runOnStartMainPlugins(params?: {
  config?: FrameMasterConfig;
  pluginLoader?: PluginLoader;
}) {
  const _pluginLoader = params?.pluginLoader ?? pluginLoader;
  const _config = params?.config ?? getConfig();
  if (!_pluginLoader) throw new Error("Plugin loader not initialized");
  if (!_config) throw new Error("Config not initialized");
  if (!cluster.isPrimary) return;
  if (!_pluginLoader) throw new Error("Plugin loader not initialized");
  await Promise.all(
    _pluginLoader.getPluginByName("serverStart").map(async (plugin) => {
      try {
        await plugin.pluginParent.main?.();
      } catch (error) {
        console.error(`Error in plugin ${plugin.name} main():`, error);
      }
      if (process.env.NODE_ENV != "production") {
        try {
          await plugin.pluginParent.dev_main?.();
        } catch (error) {
          console.error(`Error in plugin ${plugin.name} dev_main():`, error);
        }
      }
    })
  );
}

async function runFileSystemWatcherPlugin(
  forceRun = false,
  params?: {
    config?: FrameMasterConfig;
    pluginLoader?: PluginLoader;
  }
) {
  const _pluginLoader = params?.pluginLoader ?? pluginLoader;
  const _config = params?.config ?? getConfig();
  if (!_pluginLoader) throw new Error("Plugin loader not initialized");
  if (!_config) throw new Error("Config not initialized");
  // Skip if not in dev mode, unless forced (for hot-reload)
  if (
    (!globalThis.__DRY_RUN__ && !forceRun) ||
    process.env.NODE_ENV == "production"
  )
    return;
  if (!_pluginLoader) throw new Error("Plugin loader not initialized");

  // Stop existing watchers before creating new ones
  cleanupFileSystemWatchers();

  const DirToWatch = [
    ...new Set(
      _pluginLoader
        .getPluginByName("fileSystemWatchDir")
        .map((p) => p.pluginParent)
        .reduce((curr, prev) => [...curr, ...prev], [])
    ),
  ];

  const OnFileSystemChangeCallbacks = _pluginLoader
    .getPluginByName("onFileSystemChange")
    .map((p) => p.pluginParent);

  globalThis.__FILESYSTEM_WATCHER__ = await Promise.all(
    DirToWatch.map((DirToWatch) =>
      createWatcher({
        path: DirToWatch,
        callback(event, file, absolutePath) {
          OnFileSystemChangeCallbacks.forEach((callback) =>
            callback(event, file, absolutePath)
          );
        },
      })
    )
  );
}
