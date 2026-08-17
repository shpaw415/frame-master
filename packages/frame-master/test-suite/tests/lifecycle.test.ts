import { afterEach, describe, expect, test } from "bun:test";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { getGlobalPluginContext } from "frame-master/plugin/utils";
import { createPluginTestEnv } from "../src/create-env";
import type { PluginTestEnv } from "../src/types";

describe("plugin test suite — lifecycle", () => {
	let env: PluginTestEnv | undefined;

	afterEach(async () => {
		await env?.dispose();
		env = undefined;
	});

	test("createContext is available via getGlobalPluginContext", async () => {
		const plugin: FrameMasterPlugin = {
			name: "ctx-plugin",
			version: "1.0.0",
			createContext: () => ({
				token: "secret-token",
				startedAt: 42,
			}),
		};

		env = await createPluginTestEnv({
			plugins: [plugin],
			startServer: false,
		});

		const ctx = getGlobalPluginContext("ctx-plugin") as
			| { token: string; startedAt: number }
			| undefined;
		expect(ctx?.token).toBe("secret-token");
		expect(ctx?.startedAt).toBe(42);
	});

	test("serverStart.main and dev_main run on env create", async () => {
		const calls: string[] = [];
		const prev = process.env.NODE_ENV;
		process.env.NODE_ENV = "development";

		try {
			const plugin: FrameMasterPlugin = {
				name: "start-plugin",
				version: "1.0.0",
				serverStart: {
					main: () => {
						calls.push("main");
					},
					dev_main: () => {
						calls.push("dev_main");
					},
				},
			};

			env = await createPluginTestEnv({
				plugins: [plugin],
				startServer: false,
			});

			expect(calls).toContain("main");
			expect(calls).toContain("dev_main");
		} finally {
			if (prev === undefined) {
				delete process.env.NODE_ENV;
			} else {
				process.env.NODE_ENV = prev;
			}
		}
	});

	test("runCreateContext: false skips createContext", async () => {
		const uniqueName = `skip-ctx-${crypto.randomUUID()}`;
		let createCalled = false;
		const plugin: FrameMasterPlugin = {
			name: uniqueName,
			version: "1.0.0",
			createContext: () => {
				createCalled = true;
				return { value: 1 };
			},
		};

		env = await createPluginTestEnv({
			plugins: [plugin],
			startServer: false,
			runCreateContext: false,
		});

		expect(createCalled).toBe(false);
		expect(getGlobalPluginContext(uniqueName)).toBeUndefined();
	});

	test("dispose runs serverStop with reason dispose and the live server", async () => {
		let receivedReason: string | undefined;
		let receivedServer: Bun.Server<unknown> | null | undefined;

		const plugin: FrameMasterPlugin = {
			name: "stop-dispose",
			version: "1.0.0",
			serverStop: ({ reason, server: stopping }) => {
				receivedReason = reason;
				receivedServer = stopping;
			},
		};

		env = await createPluginTestEnv({ plugins: [plugin] });
		const live = env.server;
		await env.dispose();

		expect(receivedReason).toBe("dispose");
		expect(receivedServer).toBe(live);
		expect(receivedServer).not.toBeNull();
	});

	test("dispose with startServer: false still runs serverStop with null server", async () => {
		let receivedServer: Bun.Server<unknown> | null | undefined;

		const plugin: FrameMasterPlugin = {
			name: "stop-no-listen",
			version: "1.0.0",
			serverStop: ({ server: stopping }) => {
				receivedServer = stopping;
			},
		};

		env = await createPluginTestEnv({
			plugins: [plugin],
			startServer: false,
		});
		await env.dispose();

		expect(receivedServer).toBeNull();
	});

	test("runServerStop: false skips serverStop on dispose", async () => {
		let called = false;
		const plugin: FrameMasterPlugin = {
			name: "skip-stop",
			version: "1.0.0",
			serverStop: () => {
				called = true;
			},
		};

		env = await createPluginTestEnv({
			plugins: [plugin],
			startServer: false,
			runServerStop: false,
		});
		await env.dispose();

		expect(called).toBe(false);
	});
});
