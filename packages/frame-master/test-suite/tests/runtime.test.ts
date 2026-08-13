import { describe, expect, test } from "bun:test";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { loadRuntimePluginFromPlugins } from "../src/runtime";

describe("plugin test suite - runtime plugins", () => {
	test("does nothing when plugins declare no runtime plugins", async () => {
		await expect(
			loadRuntimePluginFromPlugins([
				{ name: "no-runtime-plugin", version: "1.0.0" },
			]),
		).resolves.toBeUndefined();
	});

	test("registers runtime plugins declared across supplied plugins", async () => {
		const setupCalls: string[] = [];
		const plugins: FrameMasterPlugin[] = [
			{
				name: "runtime-resolver",
				version: "1.0.0",
				runtimePlugins: [
					{
						name: "runtime-resolver-plugin",
						setup() {
							setupCalls.push("resolver");
						},
					},
				],
			},
			{
				name: "runtime-loader",
				version: "1.0.0",
				runtimePlugins: [
					{
						name: "runtime-loader-plugin",
						setup() {
							setupCalls.push("loader");
						},
					},
				],
			},
		];

		await loadRuntimePluginFromPlugins(plugins);

		expect(setupCalls).toEqual(["resolver", "loader"]);
	});
});
