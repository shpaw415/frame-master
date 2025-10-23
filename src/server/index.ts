import config from "./config";
import { masterRequest } from "./request-manager";
import masterRoutes from "./frame-master-routes";
import { logRequest } from "./log";
import { pluginLoader } from "@/plugins";
import cluster from "node:cluster";
import { createWatcher, type FileSystemWatcher } from "./watch";

declare global {
  var __FILESYSTEM_WATCHER__: FileSystemWatcher[];
  var __DRY_RUN__: boolean;
}
globalThis.__FILESYSTEM_WATCHER__ ??= [];
globalThis.__DRY_RUN__ ??= true;

const serverConfigPlugins = pluginLoader.getPluginByName("serverConfig");
const websockeretPlugins = pluginLoader.getPluginByName("websocket");

function deepMergeServerConfig(target: any, source: any): any {
  const result = { ...target };

  for (const [key, sourceValue] of Object.entries(source)) {
    const targetValue = result[key];

    if (sourceValue === undefined) continue;

    if (targetValue === undefined) {
      result[key] = sourceValue;
      continue;
    }

    // Check for conflicts on non-object values
    if (
      !config.pluginsOptions?.disableHttpServerOptionsConflictWarning &&
      typeof targetValue !== "object" &&
      typeof sourceValue !== "object" &&
      targetValue !== sourceValue
    ) {
      throw new Error(
        `Conflict in serverConfig plugins: key "${key}" has conflicting values (${targetValue} vs ${sourceValue})`
      );
    }

    // Deep merge objects
    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      result[key] = deepMergeServerConfig(targetValue, sourceValue);
    } else if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      // Concatenate arrays
      result[key] = [...targetValue, ...sourceValue];
    } else {
      // Source overrides target
      result[key] = sourceValue;
    }
  }

  return result;
}

function isPlainObject(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof RegExp) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

const pluginServerConfig = deepMergeServerConfig(
  serverConfigPlugins
    .map((p) => p.pluginParent)
    .reduce((curr, prev) => deepMergeServerConfig(curr, prev), {}),
  config.HTTPServer
) as typeof config.HTTPServer;

const pluginsRoutes = Object.assign(
  {},
  ...serverConfigPlugins
    .map((p) => p.pluginParent.routes)
    .filter((r) => r != undefined)
) as Bun.Serve.Routes<undefined, string>;

export default async () => {
  await runOnStartMainPlugins();
  await runFileSystemWatcherPlugin();

  globalThis.__DRY_RUN__ = false;

  return Bun.serve({
    development: {
      chromeDevToolsAutomaticWorkspaceFolders: true,
    },
    ...(pluginServerConfig as {}),
    fetch: (request, server) => {
      // Log the incoming request
      logRequest(request);

      const reqManager = new masterRequest({ request, server });
      return reqManager.handleRequest();
    },
    routes: { ...masterRoutes, ...pluginsRoutes, ...pluginServerConfig.routes },
    websocket: {
      ...[
        ...serverConfigPlugins.map((p) => p.pluginParent.websocket),
        ...[pluginServerConfig.websocket],
      ].reduce((curr, prev) => {
        return deepMergeServerConfig(curr, prev || {});
      }, {}),
      message: (ws, message) => {
        websockeretPlugins.forEach((plugin) => {
          plugin.pluginParent.onMessage?.(ws, message);
        });
      },
      open: (ws) => {
        websockeretPlugins.forEach((plugin) => {
          plugin.pluginParent.onOpen?.(ws);
        });
      },
      close: (ws) => {
        websockeretPlugins.forEach((plugin) => {
          plugin.pluginParent.onClose?.(ws);
        });
      },
    },
  });
};

async function runOnStartMainPlugins() {
  if (!cluster.isPrimary) return;

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

  const DirToWatch = pluginLoader
    .getPluginByName("fileSystemWatchDir")
    .map((p) => p.pluginParent)
    .reduce((curr, prev) => [...curr, ...prev], []);

  const OnFileSystemChangeCallbacks = pluginLoader
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
