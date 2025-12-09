import { InitPluginLoader, pluginLoader, getPluginLoader } from "../plugins";
import { InitConfig, configPath } from "./config";
import { InitBuilder } from "../build";
import cluster from "node:cluster";
import { createWatcher, FileSystemWatcher } from "./watch";
import { reloadPlugins, onVerbose } from "../utils";

let inited = false;
let configWatcher: FileSystemWatcher | null = null;

/**
 * Get the config file watcher instance.
 * @returns The config watcher or null if not initialized
 * @internal - Used for testing purposes
 */
export function getConfigWatcher(): FileSystemWatcher | null {
  return configWatcher;
}

/**
 * Reset the init state. Used for testing purposes.
 * @internal
 */
export function resetInitState(): void {
  inited = false;
  if (configWatcher) {
    configWatcher.stop();
    configWatcher = null;
  }
}

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
export async function InitAll() {
  if (inited) return;
  await InitConfig();
  InitPluginLoader();
  await InitBuilder();
  await runOnStartMainPlugins();
  await runFileSystemWatcherPlugin();
  await watchConfigFile();
  inited = true;
}

export async function InitCLIPlugins() {
  await InitConfig();
  InitPluginLoader();
  await InitBuilder();
}

async function runOnStartMainPlugins() {
  if (!cluster.isPrimary) return;
  if (!pluginLoader) throw new Error("Plugin loader not initialized");
  await Promise.all(
    pluginLoader.getPluginByName("serverStart").map(async (plugin) => {
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

async function runFileSystemWatcherPlugin() {
  if (!globalThis.__DRY_RUN__ || process.env.NODE_ENV == "production") return;
  if (!pluginLoader) throw new Error("Plugin loader not initialized");
  const DirToWatch = [
    ...new Set(
      pluginLoader
        .getPluginByName("fileSystemWatchDir")
        .map((p) => p.pluginParent)
        .reduce((curr, prev) => [...curr, ...prev], [])
    ),
  ];

  globalThis.__FILESYSTEM_WATCHER__ = await Promise.all(
    DirToWatch.map((DirToWatch) =>
      createWatcher({
        path: DirToWatch,
        callback(event, file, absolutePath) {
          // Dynamically get callbacks from current plugin loader
          // This ensures hot-reloaded plugins' callbacks are used
          const loader = getPluginLoader();
          if (!loader) return;

          const callbacks = loader
            .getPluginByName("onFileSystemChange")
            .map((p) => p.pluginParent);

          callbacks.forEach((callback) => callback(event, file, absolutePath));
        },
      })
    )
  );
}

/**
 * Watch the frame-master.config.ts file for changes in dev mode.
 * Automatically triggers a hot reload when the config file is modified.
 */
async function watchConfigFile() {
  // Only watch in dev mode, not in production or during dry run without server
  if (process.env.NODE_ENV === "production") return;
  if (!globalThis.__DRY_RUN__) return;
  if (!cluster.isPrimary) return;

  const configFilePath = configPath();
  if (!configFilePath) return;

  onVerbose(`[Frame-Master] Watching config file: ${configFilePath}`);

  configWatcher = await createWatcher({
    path: configFilePath,
    async callback(event, file, absolutePath) {
      if (event === "change") {
        console.log(
          "\x1b[36m[Frame-Master]\x1b[0m Config file changed, reloading plugins..."
        );
        await reloadPlugins();
      }
    },
    debounceDelay: 150,
  });
}
