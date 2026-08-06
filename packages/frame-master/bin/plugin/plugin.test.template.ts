import { afterEach, describe, expect, test } from "bun:test";
import { createPluginTestEnv, type PluginTestEnv } from "frame-master/testing";
import __CleanPluginName__ from "./index";

/**
 * Integration tests for __PluginName__ using the Frame-Master plugin test suite.
 * @see https://github.com/shpaw415/frame-master/tree/main/test-suite
 */
describe("__PluginName__", () => {
	let env: PluginTestEnv | undefined;

	afterEach(async () => {
		await env?.dispose();
		env = undefined;
	});

	test("plugin loads and responds", async () => {
		env = await createPluginTestEnv({
			plugins: [__CleanPluginName__()],
		});

		// Replace with assertions for your routes / build hooks
		expect(env.pluginLoader.getPlugins().some((p) => p.name)).toBe(true);
	});
});
