import { afterEach, describe, expect, test } from "bun:test";
import { BuildUnifier, getBuildPipelines } from "frame-master/plugin";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { resetBuildPipelines } from "../../src/build/pipelines";
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

describe("plugin test suite - preload build pipelines", () => {
	afterEach(() => {
		resetBuildPipelines();
	});

	test("drops a BuildUnifier registration so the test path can register it again", async () => {
		const plugin = {
			name: "preload-auto-plugin",
			version: "1.0.0",
			runtimePlugins: [
				{
					name: "preload-auto-runtime",
					setup() {},
				},
			],
		} satisfies FrameMasterPlugin;
		const load = () => BuildUnifier({ plugins: [plugin] });

		await loadRuntimePluginFromPlugins(load());

		expect(getBuildPipelines()).toEqual([]);
		expect(() => load()).not.toThrow();
		expect(getBuildPipelines().map((pipeline) => pipeline.label)).toEqual([
			"Build pipeline 1",
		]);
	});

	test("drops an explicit pipeline id so the test path can reuse it", async () => {
		const plugin = {
			name: "cloudflare-update-manager",
			version: "1.0.0",
		} satisfies FrameMasterPlugin;
		const load = () =>
			BuildUnifier({ id: "test", label: "test", plugins: [plugin] });

		await loadRuntimePluginFromPlugins(load());

		expect(getBuildPipelines()).toEqual([]);
		expect(() => load()).not.toThrow();
		expect(getBuildPipelines().map((pipeline) => pipeline.id)).toEqual([
			"test",
		]);
	});

	test("does not drop pipelines that the preload plugins do not own", async () => {
		BuildUnifier({
			id: "keep",
			plugins: [{ name: "kept-plugin", version: "1.0.0" }],
		});
		const owned = BuildUnifier({
			id: "drop",
			plugins: [{ name: "dropped-plugin", version: "1.0.0" }],
		});

		await loadRuntimePluginFromPlugins(owned);

		expect(getBuildPipelines().map((pipeline) => pipeline.id)).toEqual([
			"keep",
		]);
	});
});
