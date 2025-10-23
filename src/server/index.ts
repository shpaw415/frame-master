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

const { routes, ...rest } = config.HTTPServer;

const serverConfigPlugins = pluginLoader.getPluginByName("serverConfig");

const pluginServerConfig = serverConfigPlugins
  .map((p) => p.pluginParent)
  .reduce((curr, prev) => {
    if (config.pluginsOptions?.disableHttpServerOptionsConflictWarning) {
      return { ...curr, ...prev };
    }
    const existstingKeys = Object.keys(prev);
    const currentKeys = Object.keys(curr);
    for (const key of currentKeys) {
      if (
        existstingKeys.includes(key) &&
        typeof (curr as any)[key] != "object" &&
        typeof (prev as any)[key] != "object"
      ) {
        throw new Error(
          `Conflict in serverConfig plugins: key "${key}" exists in multiple plugins and will be overWritten.`
        );
      }
    }
    return { ...curr, ...prev };
  }, {});

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
    ...(rest as {}),
    fetch: (request, server) => {
      // Log the incoming request
      logRequest(request);

      const reqManager = new masterRequest({ request, server });
      return reqManager.handleRequest();
    },
    routes: { ...masterRoutes, ...routes, ...pluginsRoutes },
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
