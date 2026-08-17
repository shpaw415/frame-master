import type { Builder } from "frame-master/build";
import type { PluginLoader } from "frame-master/plugin";
import { mergeGlobalPluginContext } from "frame-master/plugin/utils";
import type { FrameMasterConfig } from "frame-master/server/types";

/**
 * Run all plugins' `createContext` hooks and merge into global plugin context.
 */
export async function runCreateContextHooks(params: {
	config: FrameMasterConfig;
	pluginLoader: PluginLoader;
}): Promise<void> {
	const createContextPlugins =
		params.pluginLoader.getPluginByName("createContext");

	const errors: Array<{ name: string; error: Error }> = [];

	await Promise.all(
		createContextPlugins.map(async (plugin) => {
			try {
				const ctx = await plugin.pluginParent(params.config);
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

/**
 * Run `serverStart.main` and (when not production) `serverStart.dev_main`.
 */
export async function runServerStartHooks(params: {
	pluginLoader: PluginLoader;
}): Promise<void> {
	await Promise.all(
		params.pluginLoader.getPluginByName("serverStart").map(async (plugin) => {
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

/**
 * Run `serverReady` hooks (errors are logged, not rethrown — matches production).
 */
export { runServerStopHooks } from "frame-master/server/init";

export async function runServerReadyHooks(params: {
	server: Bun.Server<unknown>;
	config: FrameMasterConfig;
	pluginLoader: PluginLoader;
	builder: Builder;
}): Promise<void> {
	await Promise.all(
		params.pluginLoader.getPluginByName("serverReady").map(async (plugin) => {
			try {
				await plugin.pluginParent({
					builder: params.builder,
					pluginLoader: params.pluginLoader,
					config: params.config,
					server: params.server,
				});
			} catch (error) {
				console.error(`Error in plugin ${plugin.name} serverReady():`, error);
			}
		}),
	);
}
