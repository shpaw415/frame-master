import { afterEach, expect, test } from "bun:test";
import { createBuilder } from "frame-master/build";
import {
	getGlobalPluginContext,
	mergeGlobalPluginContext,
	PluginLoader,
	setGlobalPluginContext,
} from "frame-master/plugin";
import type { FrameMasterConfig } from "frame-master/server/type";
import serve from "../src/server";

declare module "frame-master/plugin/types" {
	interface GlobalPluginContextMap {
		"context-owner": {
			count: number;
			source: string;
			reloaded?: boolean;
		};
		"context-reader": {
			seenCount: number;
		};
	}
}

let server: Bun.Server<unknown> | undefined;

afterEach(() => {
	server?.stop(true);
	server = undefined;
	globalThis.__GLOBAL_CONTEXT__ = {};
});

test("createContext reruns for explicit serve loaders after prior initialization", async () => {
	const bootstrapConfig: FrameMasterConfig = {
		HTTPServer: {
			port: 0,
		},
		plugins: [
			{
				name: "bootstrap-plugin",
				version: "1.0.0",
				priority: 1,
				serverReady: () => undefined,
			},
		],
	};

	const bootstrapPluginLoader = new PluginLoader(bootstrapConfig);
	const bootstrapBuilder = await createBuilder(
		bootstrapConfig,
		bootstrapPluginLoader,
	);

	server = await serve({
		config: bootstrapConfig,
		pluginLoader: bootstrapPluginLoader,
		builder: bootstrapBuilder,
	});
	server.stop(true);
	server = undefined;
	globalThis.__GLOBAL_CONTEXT__ = {};

	const config: FrameMasterConfig = {
		HTTPServer: {
			port: 0,
		},
		plugins: [
			{
				name: "context-owner",
				version: "1.0.0",
				priority: 1,
				createContext: async () => ({
					count: 1,
					source: "createContext",
				}),
			},
		],
	};

	const readyPluginLoader = new PluginLoader(config);
	const builder = await createBuilder(config, readyPluginLoader);

	server = await serve({
		config,
		pluginLoader: readyPluginLoader,
		builder,
	});

	expect(getGlobalPluginContext("context-owner")).toEqual({
		count: 1,
		source: "createContext",
	});
});

test("plugins can share typed global context through helper APIs", async () => {
	const config: FrameMasterConfig = {
		HTTPServer: {
			port: 0,
		},
		plugins: [
			{
				name: "context-owner",
				version: "1.0.0",
				priority: 1,
				createContext: async () => ({
					count: 1,
					source: "createContext",
				}),
			},
			{
				name: "context-reader",
				version: "1.0.0",
				priority: 2,
				serverReady: () => {
					const ownerContext = getGlobalPluginContext("context-owner");

					expect(ownerContext?.count).toBe(1);
					expect(ownerContext?.source).toBe("createContext");

					setGlobalPluginContext("context-reader", {
						seenCount: ownerContext?.count ?? 0,
					});
					mergeGlobalPluginContext("context-owner", {
						count: (ownerContext?.count ?? 0) + 1,
						source: ownerContext?.source ?? "unknown",
					});
				},
			},
		],
	};

	const readyPluginLoader = new PluginLoader(config);
	const builder = await createBuilder(config, readyPluginLoader);

	server = await serve({
		config,
		pluginLoader: readyPluginLoader,
		builder,
	});

	expect(getGlobalPluginContext("context-owner")).toEqual({
		count: 2,
		source: "createContext",
	});
	expect(getGlobalPluginContext("context-reader")).toEqual({
		seenCount: 1,
	});
});
