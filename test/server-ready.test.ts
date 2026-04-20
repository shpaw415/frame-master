import { afterEach, expect, test } from "bun:test";
import serve, { reloadServer } from "../src/server";
import type { FrameMasterConfig } from "frame-master/server/type";
import { PluginLoader } from "frame-master/plugins";
import { createBuilder } from "frame-master/build";

let server: Bun.Server<unknown> | undefined;

afterEach(() => {
	server?.stop(true);
	server = undefined;
});

test("serverReady runs after startup, awaits async work, and logs hook failures", async () => {
	let hookCallCount = 0;
	let hookCompleted = false;
	let receivedProps:
		| {
				config: FrameMasterConfig;
				pluginLoader: PluginLoader;
				builder: Awaited<ReturnType<typeof createBuilder>>;
				server: Bun.Server<unknown>;
		  }
		| undefined;
	const loggedErrors: unknown[][] = [];
	const originalConsoleError = console.error;

	const config: FrameMasterConfig = {
		HTTPServer: {
			port: 0,
		},
		plugins: [
			{
				name: "server-ready-success",
				version: "1.0.0",
				priority: 1,
				serverReady: async (props) => {
					hookCallCount += 1;
					receivedProps = {
						config: props.config,
						pluginLoader: props.pluginLoader,
						builder: props.builder,
						server: props.server,
					};
					await new Promise((resolve) => setTimeout(resolve, 10));
					hookCompleted = true;
				},
			},
			{
				name: "server-ready-error",
				version: "1.0.0",
				priority: 2,
				serverReady: async () => {
					throw new Error("serverReady failure");
				},
			},
		],
	};

	const readyPluginLoader = new PluginLoader(config);
	const builder = await createBuilder(config, readyPluginLoader);

	console.error = (...args: unknown[]) => {
		loggedErrors.push(args);
	};

	try {
		server = await serve({
			config,
			pluginLoader: readyPluginLoader,
			builder,
		});
	} finally {
		console.error = originalConsoleError;
	}

	expect(server).toBeDefined();
	expect(hookCallCount).toBe(1);
	expect(hookCompleted).toBe(true);
	expect(receivedProps?.config).toBe(config);
	expect(receivedProps?.pluginLoader).toBe(readyPluginLoader);
	expect(receivedProps?.builder).toBe(builder);
	expect(receivedProps?.server).toBe(server);
	expect(loggedErrors).toHaveLength(1);
	expect(loggedErrors[0]?.[0]).toBe(
		"Error in plugin server-ready-error serverReady():",
	);
	expect(loggedErrors[0]?.[1]).toBeInstanceOf(Error);
	expect((loggedErrors[0]?.[1] as Error).message).toBe("serverReady failure");
});

test("serverReady reruns after server reload", async () => {
	let hookCallCount = 0;
	const seenServers: Bun.Server<unknown>[] = [];

	const config: FrameMasterConfig = {
		HTTPServer: {
			port: 0,
		},
		plugins: [
			{
				name: "server-ready-reload",
				version: "1.0.0",
				priority: 1,
				serverReady: async ({ server: readyServer }) => {
					hookCallCount += 1;
					seenServers.push(readyServer);
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
	const initialServer = server;

	server = await reloadServer();

	expect(hookCallCount).toBe(2);
	expect(seenServers).toHaveLength(2);
	expect(seenServers[0]).toBe(initialServer);
	expect(seenServers[1]).toBe(server);
	expect(seenServers[1]).not.toBe(seenServers[0]);
});
