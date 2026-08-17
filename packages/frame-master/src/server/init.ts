import cluster from "node:cluster";
import type Builder from "../build";
import { getBuilder, InitBuilder, reloadBuilder } from "../build";
import {
	configureBuildPipelines,
	initializeBuildPipelines,
	resetBuildPipelines,
} from "../build/pipelines";
import type {
	PluginLoader,
	ServerStopProps,
	ServerStopReason,
} from "../plugins";
import { InitPluginLoader, pluginLoader, reloadPluginLoader } from "../plugins";
import { mergeGlobalPluginContext } from "../plugins/utils";
import { getConfig, InitConfig, reloadConfig } from "./config";
import { startConfigWatcher, stopConfigWatcher } from "./config-watcher";
import type { FrameMasterConfig } from "./type";
import { createWatcher } from "./watch";

let inited = false;

type InitProps = Partial<{
	loaders: Partial<{
		config: FrameMasterConfig;
		builder: Builder;
		pluginLoader: PluginLoader;
	}>;
}>;

async function syncRuntimeLoaders(loaders?: InitProps["loaders"]) {
	const fmConfig = await InitConfig(loaders?.config);
	const activePluginLoader = InitPluginLoader(loaders?.pluginLoader);
	const activeBuilder = await InitBuilder(
		loaders as unknown as { builder: Builder },
	);
	await configureBuildPipelines(fmConfig, activePluginLoader);

	return {
		fmConfig,
		pluginLoader: activePluginLoader,
		builder: activeBuilder,
	};
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
export async function InitAll(bypass?: InitProps) {
	const runtimeLoaders = await syncRuntimeLoaders(bypass?.loaders);
	if (inited) {
		if (bypass?.loaders) {
			await runCreateContextHooks(bypass.loaders);
		}
		return runtimeLoaders;
	}
	await runCreateContextHooks(bypass?.loaders);
	await initializeBuildPipelines();
	await runOnStartMainPlugins(bypass?.loaders);
	await runFileSystemWatcherPlugin(undefined, bypass?.loaders);
	await startConfigWatcher();
	inited = true;
	return runtimeLoaders;
}

export async function InitBuild() {
	if (inited) return;
	await InitConfig();
	InitPluginLoader();
	await InitBuilder();
	const config = getConfig();
	const loader = pluginLoader;
	if (!config || !loader)
		throw new Error("Frame Master configuration not initialized.");
	await configureBuildPipelines(config, loader);
	await runCreateContextHooks();
	await initializeBuildPipelines();
	inited = true;
}

export async function InitCLIPlugins() {
	if (inited) return;
	await InitConfig();
	InitPluginLoader();
	await InitBuilder();
	const config = getConfig();
	const loader = pluginLoader;
	if (!config || !loader)
		throw new Error("Frame Master configuration not initialized.");
	await configureBuildPipelines(config, loader);
	await runCreateContextHooks();
	await initializeBuildPipelines();
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
	resetBuildPipelines();

	// 1. Reload config from disk
	await reloadConfig();

	// 2. Reinitialize plugin loader
	reloadPluginLoader();

	// 3. Reinitialize builder
	await reloadBuilder();

	const config = getConfig();
	const loader = pluginLoader;
	if (config && loader) {
		await configureBuildPipelines(config, loader);
	}

	// 4. Re-run createContext hooks
	await runCreateContextHooks();
	await initializeBuildPipelines();

	// 5. Re-run serverStart hooks
	await runOnStartMainPlugins();

	// 6. Recreate file system watchers (cleanup + create, force bypass __DRY_RUN__ check)
	await runFileSystemWatcherPlugin(true);
}

/**
 * Run `serverStop` hooks in reverse priority (highest number first).
 * Errors are logged and do not reject.
 */
export async function runServerStopHooks(params: {
	reason: ServerStopReason;
	server: Bun.Server<unknown> | null;
	config?: FrameMasterConfig;
	pluginLoader?: PluginLoader;
	builder?: Builder;
}): Promise<void> {
	const _pluginLoader = params.pluginLoader ?? pluginLoader;
	const _config = params.config ?? getConfig();
	const _builder = params.builder ?? getBuilder();

	if (!_pluginLoader || !_config || !_builder) return;

	const hooks = _pluginLoader.getPluginByName("serverStop").slice().reverse();
	for (const plugin of hooks) {
		try {
			const props: ServerStopProps = {
				builder: _builder,
				pluginLoader: _pluginLoader,
				config: _config,
				server: params.server,
				reason: params.reason,
			};
			await plugin.pluginParent(props);
		} catch (error) {
			console.error(`Error in plugin ${plugin.name} serverStop():`, error);
		}
	}
}

/**
 * Stop the current HTTP generation: run `serverStop`, then stop Bun.serve.
 *
 * Does not replace the plugin loader. Config reload should call this before
 * `reinitAll()`. Process shutdown should pass `stopWatchers: true`.
 */
export async function stopCurrentGeneration(options: {
	reason: ServerStopReason;
	force?: boolean;
	stopWatchers?: boolean;
}): Promise<void> {
	const server = globalThis.__SERVER_INSTANCE__ ?? null;
	await runServerStopHooks({
		reason: options.reason,
		server,
	});
	if (server) {
		try {
			await server.stop(options.force ?? false);
		} catch {
			// already stopped
		}
		if (globalThis.__SERVER_INSTANCE__ === server) {
			globalThis.__SERVER_INSTANCE__ = undefined;
		}
	}
	if (options.stopWatchers) {
		cleanupFileSystemWatchers();
	}
}

/**
 * Stop the current server generation.
 *
 * `signal` and `explicit` also stop the config watcher and plugin FS watchers.
 * `reload` only stops hooks + HTTP so `reinitAll()` can recreate watchers.
 */
export async function stopServer(options?: {
	reason?: ServerStopReason;
	force?: boolean;
}): Promise<void> {
	const reason = options?.reason ?? "explicit";
	const force = options?.force ?? (reason === "signal" || reason === "dispose");
	await stopCurrentGeneration({
		reason,
		force,
		stopWatchers: reason === "signal" || reason === "explicit",
	});
	if (reason === "signal" || reason === "explicit") {
		stopConfigWatcher();
	}
}

/**
 * Cleanup all active file system watchers.
 */
export function cleanupFileSystemWatchers(): void {
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

	const errors: Array<{ name: string; error: Error }> = [];

	await Promise.all(
		createContextPlugins.map(async (plugin) => {
			try {
				const ctx = await plugin.pluginParent(_config);
				if (typeof ctx !== "undefined") {
					mergeGlobalPluginContext(plugin.name, ctx);
				}
			} catch (error) {
				console.error(`Error in plugin ${plugin.name} createContext():`, error);
				errors.push({ name: plugin.name, error: error as Error });
			}
		}),
	);

	if (errors.length > 0) {
		throw new AggregateError(
			errors.map((e) => e.error),
			`Errors occurred in createContext hooks: ${errors
				.map((e) => `${e.name}: ${e.error.message || e.error}`)
				.join("; ")}`,
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
	await Promise.all(
		_pluginLoader.getPluginByName("serverStart").map(async (plugin) => {
			try {
				await plugin.pluginParent.main?.();
			} catch (error) {
				console.error(`Error in plugin ${plugin.name} main():`, error);
			}
			if (process.env.NODE_ENV !== "production") {
				try {
					await plugin.pluginParent.dev_main?.();
				} catch (error) {
					console.error(`Error in plugin ${plugin.name} dev_main():`, error);
				}
			}
		}),
	);
}

export async function runServerReadyHooks(params: {
	server: Bun.Server<unknown>;
	config?: FrameMasterConfig;
	pluginLoader?: PluginLoader;
	builder?: Builder;
}): Promise<void> {
	const _pluginLoader = params.pluginLoader ?? pluginLoader;
	const _config = params.config ?? getConfig();
	const _builder = params.builder ?? getBuilder();

	if (!_pluginLoader) throw new Error("Plugin loader not initialized");
	if (!_config) throw new Error("Config not initialized");
	if (!_builder) throw new Error("Builder not initialized");

	await Promise.all(
		_pluginLoader.getPluginByName("serverReady").map(async (plugin) => {
			try {
				await plugin.pluginParent({
					builder: _builder,
					pluginLoader: _pluginLoader,
					config: _config,
					server: params.server,
				});
			} catch (error) {
				console.error(`Error in plugin ${plugin.name} serverReady():`, error);
			}
		}),
	);
}

async function runFileSystemWatcherPlugin(
	forceRun = false,
	params?: {
		config?: FrameMasterConfig;
		pluginLoader?: PluginLoader;
	},
) {
	const _pluginLoader = params?.pluginLoader ?? pluginLoader;
	const _config = params?.config ?? getConfig();
	if (!_pluginLoader) throw new Error("Plugin loader not initialized");
	if (!_config) throw new Error("Config not initialized");
	// Skip if not in dev mode, unless forced (for hot-reload)
	if (
		(!globalThis.__DRY_RUN__ && !forceRun) ||
		process.env.NODE_ENV === "production"
	)
		return;

	// Stop existing watchers before creating new ones
	cleanupFileSystemWatchers();

	const DirToWatch = [
		...new Set(
			_pluginLoader
				.getPluginByName("fileSystemWatchDir")
				.map((p) => p.pluginParent)
				.reduce((curr, prev) => [...curr, ...prev], []),
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
					OnFileSystemChangeCallbacks.forEach((callback) => {
						callback(event, file, absolutePath);
					});
				},
			}),
		),
	);
}
