import { getConfig } from "./config";
import { masterRequest } from "./request-manager";
import masterRoutes from "./frame-master-routes";
import { logRequest } from "./log";
import { pluginLoader, getPluginLoader } from "../plugins";
import { type FileSystemWatcher } from "./watch";
import { InitAll } from "./init";

declare global {
  var __FILESYSTEM_WATCHER__: FileSystemWatcher[];
  var __DRY_RUN__: boolean;
  var __SERVER_INSTANCE__: ReturnType<typeof Bun.serve> | null;
}
globalThis.__FILESYSTEM_WATCHER__ ??= [];
globalThis.__DRY_RUN__ ??= true;
globalThis.__SERVER_INSTANCE__ ??= null;

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

  const server = Bun.serve({
    development: {
      chromeDevToolsAutomaticWorkspaceFolders: true,
    },
    ...(pluginServerConfig as {}),
    fetch: (request, server) => {
      // Log the incoming request

      const reqManager = new masterRequest({ request, server });
      const result = reqManager.handleRequest();
      result.then(() => !reqManager.isLogPrevented && logRequest(request));
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

  globalThis.__SERVER_INSTANCE__ = server;
  return server;
};

/**
 * Get the current server instance.
 *
 * @returns The Bun server instance or null if not started
 */
export function getServerInstance(): ReturnType<typeof Bun.serve> | null {
  return globalThis.__SERVER_INSTANCE__;
}

/**
 * Build the server configuration from plugins and config.
 * Used internally for server reload.
 */
export function buildServerConfig() {
  const config = getConfig();
  const loader = getPluginLoader();

  if (!config || !loader) {
    return null;
  }

  const serverConfigPlugins = loader.getPluginByName("serverConfig");
  const websocketPlugins = loader.getPluginByName("websocket");
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

  return {
    development: {
      chromeDevToolsAutomaticWorkspaceFolders: true,
    },
    ...(pluginServerConfig as {}),
    fetch: (request: Request, server: ReturnType<typeof Bun.serve>) => {
      const reqManager = new masterRequest({ request, server });
      const result = reqManager.handleRequest();
      result.then(() => !reqManager.isLogPrevented && logRequest(request));
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
      message: (
        ws: Bun.ServerWebSocket<undefined>,
        message: string | ArrayBufferView
      ) => {
        websocketPlugins.forEach((plugin) => {
          plugin.pluginParent.onMessage?.(ws, message);
        });
      },
      open: (ws: Bun.ServerWebSocket<undefined>) => {
        websocketPlugins.forEach((plugin) => {
          plugin.pluginParent.onOpen?.(ws);
        });
      },
      close: (ws: Bun.ServerWebSocket<undefined>) => {
        websocketPlugins.forEach((plugin) => {
          plugin.pluginParent.onClose?.(ws);
        });
      },
    },
  };
}
