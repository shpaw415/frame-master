import { getConfig } from "./config";
import { masterRequest } from "./request-manager";
import masterRoutes from "./frame-master-routes";
import { logRequest } from "./log";
import { pluginLoader } from "../plugins";
import { type FileSystemWatcher } from "./watch";
import { InitAll } from "./init";

declare global {
  var __FILESYSTEM_WATCHER__: FileSystemWatcher[];
  var __DRY_RUN__: boolean;
}
globalThis.__FILESYSTEM_WATCHER__ ??= [];
globalThis.__DRY_RUN__ ??= true;

function deepMergeServerConfig(
  target: any,
  source: any,
  disableWarning: boolean
): any {
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
      !disableWarning &&
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
      result[key] = deepMergeServerConfig(
        targetValue,
        sourceValue,
        disableWarning
      );
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

export default async () => {
  await InitAll();
  const config = getConfig();

  if (!config) {
    console.error("Configuration not loaded after InitAll");
    process.exit(1);
  } else if (!pluginLoader) {
    console.error("Plugin loader not initialized after InitAll");
    process.exit(1);
  }

  const serverConfigPlugins = pluginLoader.getPluginByName("serverConfig");
  const websocketPlugins = pluginLoader.getPluginByName("websocket");
  const disableWarning = Boolean(
    config.pluginsOptions?.disableHttpServerOptionsConflictWarning
  );
  const pluginServerConfig = deepMergeServerConfig(
    serverConfigPlugins
      .map((p) => p.pluginParent)
      .reduce(
        (curr, prev) => deepMergeServerConfig(curr, prev, disableWarning),
        {}
      ),
    config.HTTPServer,
    disableWarning
  ) as Exclude<typeof config, null>["HTTPServer"];

  const pluginsRoutes = Object.assign(
    {},
    ...serverConfigPlugins
      .map((p) => p.pluginParent.routes)
      .filter((r) => r != undefined)
  ) as Bun.Serve.Routes<undefined, string>;

  globalThis.__DRY_RUN__ = false;

  return Bun.serve({
    development: {
      chromeDevToolsAutomaticWorkspaceFolders: true,
    },
    ...(pluginServerConfig as {}),
    fetch: (request, server) => {
      // Log the incoming request

      const reqManager = new masterRequest({ request, server });
      const result = reqManager.handleRequest();
      if (!reqManager.isLogPrevented) logRequest(request);
      return result;
    },
    routes: { ...masterRoutes, ...pluginsRoutes, ...pluginServerConfig.routes },
    websocket: {
      ...[
        ...serverConfigPlugins.map((p) => p.pluginParent.websocket),
        ...[pluginServerConfig.websocket],
      ].reduce((curr, prev) => {
        return deepMergeServerConfig(curr, prev || {}, disableWarning);
      }, {}),
      message: (ws, message) => {
        websocketPlugins.forEach((plugin) => {
          plugin.pluginParent.onMessage?.(ws, message);
        });
      },
      open: (ws) => {
        websocketPlugins.forEach((plugin) => {
          plugin.pluginParent.onOpen?.(ws);
        });
      },
      close: (ws) => {
        websocketPlugins.forEach((plugin) => {
          plugin.pluginParent.onClose?.(ws);
        });
      },
    },
  });
};
