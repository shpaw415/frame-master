import type Builder from "frame-master/build";
import { verboseLog } from "frame-master/utils";
import { getBuilder } from "../build";
import type { PluginLoader } from "../plugins";
import { pluginLoader } from "../plugins";
import { getConfig } from "./config";
import masterRoutes from "./frame-master-routes";
import { InitAll, runServerReadyHooks } from "./init";
import { logRequest } from "./log";
import { masterRequest } from "./request-manager";
import type { FrameMasterConfig } from "./type";
import type { FileSystemWatcher } from "./watch";

declare global {
	var __FILESYSTEM_WATCHER__: FileSystemWatcher[];
	var __DRY_RUN__: boolean;
	var __SERVER_INSTANCE__: Bun.Server<unknown>;
}
globalThis.__FILESYSTEM_WATCHER__ ??= [];
globalThis.__DRY_RUN__ ??= true;

function deepMergeServerConfig(
	target: any,
	source: any,
	disableWarning: boolean,
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
				`Conflict in serverConfig plugins: key "${key}" has conflicting values (${targetValue} vs ${sourceValue})`,
			);
		}

		// Deep merge objects
		if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
			result[key] = deepMergeServerConfig(
				targetValue,
				sourceValue,
				disableWarning,
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

function isPlainObject(value: unknown): boolean {
	return (
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		!(value instanceof Date) &&
		!(value instanceof RegExp) &&
		Object.prototype.toString.call(value) === "[object Object]"
	);
}

/**
 * Creates and starts the Bun server with merged plugin configurations.
 *
 * This function can be called multiple times to reload the server with new configurations.
 * It will stop the existing server before creating a new one.
 *
 * @internal Used by server initialization and hot-reload
 */
export function createServer(params?: {
	config?: FrameMasterConfig;
	pluginLoader?: PluginLoader;
	builder?: Builder;
}): Bun.Server<unknown> {
	const effectiveConfig = params?.config ?? getConfig();
	const _pluginLoader = params?.pluginLoader ?? pluginLoader;
	const builder = params?.builder ?? getBuilder();

	if (!effectiveConfig) {
		throw new Error("Configuration not loaded");
	} else if (!_pluginLoader) {
		throw new Error("Plugin loader not initialized");
	} else if (!builder) {
		throw new Error("Builder not initialized");
	}

	const serverConfigPlugins = _pluginLoader.getPluginByName("serverConfig");
	const websocketPlugins = _pluginLoader.getPluginByName("websocket");
	const disableWarning = Boolean(
		effectiveConfig.pluginsOptions?.disableHttpServerOptionsConflictWarning,
	);
	const pluginServerConfig = deepMergeServerConfig(
		serverConfigPlugins
			.map((p) => p.pluginParent)
			.reduce(
				(curr, prev) => deepMergeServerConfig(curr, prev, disableWarning),
				{},
			),
		effectiveConfig.HTTPServer,
		disableWarning,
	) as Exclude<FrameMasterConfig, null>["HTTPServer"];

	const pluginsRoutes = Object.assign(
		{},
		...serverConfigPlugins
			.map((p) => p.pluginParent.routes)
			.filter((r) => r !== undefined),
	) as Bun.Serve.Routes<undefined, string>;

	return Bun.serve({
		development: {
			chromeDevToolsAutomaticWorkspaceFolders: true,
		},
		...(pluginServerConfig as Record<string, unknown>),
		fetch: (request, server) => {
			const reqManager = new masterRequest({
				request,
				server,
				config: effectiveConfig,
				pluginLoader: _pluginLoader,
				builder,
			});
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
					plugin.pluginParent.onMessage?.(
						ws as Bun.ServerWebSocket<undefined>,
						message,
					);
				});
			},
			open: (ws) => {
				websocketPlugins.forEach((plugin) => {
					plugin.pluginParent.onOpen?.(ws as Bun.ServerWebSocket<undefined>);
				});
			},
			close: (ws) => {
				websocketPlugins.forEach((plugin) => {
					plugin.pluginParent.onClose?.(ws as Bun.ServerWebSocket<undefined>);
				});
			},
		},
	});
}

/**
 * Reloads the server with updated configuration.
 *
 * Stops the existing server and creates a new one with the current
 * plugin configurations and routes.
 *
 * @returns The new server instance
 */
export async function reloadServer(): Promise<Bun.Server<unknown>> {
	// Stop existing server if running
	if (globalThis.__SERVER_INSTANCE__) {
		await globalThis.__SERVER_INSTANCE__.stop();
		console.log("[Server] Stopped existing server for reload");
	}

	const config = getConfig();
	const resolvedPluginLoader = pluginLoader;
	const resolvedBuilder = getBuilder();

	if (!config) {
		throw new Error("Configuration not loaded before reloadServer");
	}
	if (!resolvedPluginLoader) {
		throw new Error("Plugin loader not initialized before reloadServer");
	}
	if (!resolvedBuilder) {
		throw new Error("Builder not initialized before reloadServer");
	}

	// Create new server with updated config
	globalThis.__SERVER_INSTANCE__ = createServer({
		config,
		pluginLoader: resolvedPluginLoader,
		builder: resolvedBuilder,
	});

	await runServerReadyHooks({
		config,
		pluginLoader: resolvedPluginLoader,
		builder: resolvedBuilder,
		server: globalThis.__SERVER_INSTANCE__,
	});

	console.log("[Server] Server reloaded with new configuration");

	return globalThis.__SERVER_INSTANCE__;
}

export default async (params?: {
	config?: FrameMasterConfig;
	pluginLoader?: PluginLoader;
	builder?: Builder;
}) => {
	const runtimeLoaders = await InitAll({ loaders: params });
	verboseLog("[Server] Initialization complete");
	const config = params?.config ?? runtimeLoaders?.fmConfig ?? getConfig();
	const resolvedPluginLoader =
		params?.pluginLoader ?? runtimeLoaders?.pluginLoader ?? pluginLoader;
	const resolvedBuilder =
		params?.builder ?? runtimeLoaders?.builder ?? getBuilder();
	if (!config) {
		console.error("Configuration not loaded after InitAll");
		process.exit(1);
	} else if (!resolvedPluginLoader) {
		console.error("Plugin loader not initialized after InitAll");
		process.exit(1);
	} else if (!resolvedBuilder) {
		console.error("Builder not initialized after InitAll");
		process.exit(1);
	}

	globalThis.__DRY_RUN__ = false;
	globalThis.__SERVER_INSTANCE__ = createServer({
		config,
		pluginLoader: resolvedPluginLoader,
		builder: resolvedBuilder,
	});

	await runServerReadyHooks({
		config,
		pluginLoader: resolvedPluginLoader,
		builder: resolvedBuilder,
		server: globalThis.__SERVER_INSTANCE__,
	});

	return globalThis.__SERVER_INSTANCE__;
};
