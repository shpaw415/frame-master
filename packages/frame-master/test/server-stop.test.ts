import { afterEach, expect, test } from "bun:test";
import { createBuilder } from "frame-master/build";
import { PluginLoader } from "frame-master/plugin";
import type {
	FrameMasterPlugin,
	ServerStopProps,
} from "frame-master/plugin/types";
import type { FrameMasterConfig } from "frame-master/server/type";
import { isServerRunning } from "frame-master/utils";
import serve, { reloadServer } from "../src/server";
import { stopCurrentGeneration, stopServer } from "../src/server/init";

process.env.FRAME_MASTER_NO_SHUTDOWN_HANDLERS = "1";

let server: Bun.Server<unknown> | undefined;

afterEach(async () => {
	try {
		server?.stop(true);
	} catch {
		// ignore
	}
	server = undefined;
	if (globalThis.__SERVER_INSTANCE__) {
		try {
			await globalThis.__SERVER_INSTANCE__.stop(true);
		} catch {
			// ignore
		}
		globalThis.__SERVER_INSTANCE__ = undefined;
	}
});

function makeConfig(plugins: FrameMasterPlugin[]): FrameMasterConfig {
	return {
		HTTPServer: { port: 0 },
		plugins,
	};
}

test("serverStop runs in reverse priority and logs hook failures", async () => {
	const order: string[] = [];
	const loggedErrors: unknown[][] = [];
	const originalConsoleError = console.error;

	const config = makeConfig([
		{
			name: "stop-first-start",
			version: "1.0.0",
			priority: 1,
			serverStop: async () => {
				order.push("priority-1");
			},
		},
		{
			name: "stop-last-start",
			version: "1.0.0",
			priority: 2,
			serverStop: async () => {
				order.push("priority-2");
				throw new Error("serverStop failure");
			},
		},
	]);
	const pluginLoader = new PluginLoader(config);
	const builder = await createBuilder(config, pluginLoader);

	server = await serve({ config, pluginLoader, builder });

	console.error = (...args: unknown[]) => {
		loggedErrors.push(args);
	};
	try {
		await stopServer({ reason: "explicit" });
	} finally {
		console.error = originalConsoleError;
	}

	expect(order).toEqual(["priority-2", "priority-1"]);
	expect(loggedErrors).toHaveLength(1);
	expect(loggedErrors[0]?.[0]).toBe(
		"Error in plugin stop-last-start serverStop():",
	);
	expect(loggedErrors[0]?.[1]).toBeInstanceOf(Error);
	expect((loggedErrors[0]?.[1] as Error).message).toBe("serverStop failure");
	expect(isServerRunning()).toBe(false);
});

test("serverStop on reload receives the old loader, server, and reason", async () => {
	let received: ServerStopProps | undefined;

	const config = makeConfig([
		{
			name: "stop-reload",
			version: "1.0.0",
			priority: 1,
			serverStop: async (props) => {
				received = props;
			},
		},
	]);
	const pluginLoader = new PluginLoader(config);
	const builder = await createBuilder(config, pluginLoader);

	server = await serve({ config, pluginLoader, builder });
	const initialServer = server;

	await stopCurrentGeneration({ reason: "reload", force: false });

	expect(received?.reason).toBe("reload");
	expect(received?.pluginLoader).toBe(pluginLoader);
	expect(received?.config).toBe(config);
	expect(received?.builder).toBe(builder);
	expect(received?.server).toBe(initialServer);
	expect(globalThis.__SERVER_INSTANCE__).toBeUndefined();
});

test("reloadServer after generation stop does not run serverStop again", async () => {
	let stopCount = 0;

	const config = makeConfig([
		{
			name: "stop-once",
			version: "1.0.0",
			priority: 1,
			serverStop: () => {
				stopCount += 1;
			},
		},
	]);
	const pluginLoader = new PluginLoader(config);
	const builder = await createBuilder(config, pluginLoader);

	server = await serve({ config, pluginLoader, builder });
	await stopCurrentGeneration({ reason: "reload" });
	expect(stopCount).toBe(1);

	server = await reloadServer();
	expect(stopCount).toBe(1);
	expect(server).toBeDefined();
});

test("stopServer({ reason: 'signal' }) force-stops and reports signal", async () => {
	let reason: ServerStopProps["reason"] | undefined;

	const config = makeConfig([
		{
			name: "stop-signal",
			version: "1.0.0",
			serverStop: (props) => {
				reason = props.reason;
			},
		},
	]);
	const pluginLoader = new PluginLoader(config);
	const builder = await createBuilder(config, pluginLoader);

	server = await serve({ config, pluginLoader, builder });
	await stopServer({ reason: "signal", force: true });

	expect(reason).toBe("signal");
	expect(isServerRunning()).toBe(false);
});
