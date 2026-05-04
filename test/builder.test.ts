import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { Builder, createBuilder } from "../src/build";
import { PluginLoader } from "../src/plugins";
import type { FrameMasterConfig } from "frame-master/server/type";

const TEMP_DIR = ".test-temp";

beforeEach(() => {
	mkdirSync(TEMP_DIR, { recursive: true });
});
afterEach(() => {
	rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe("builder", () => {
	test("should merge configs", async () => {
		const fmConfig: FrameMasterConfig = {
			HTTPServer: {
				port: 3000,
			},
			pluginsOptions: {
				entrypoints: ["/index.html"],
			},
			plugins: [
				{
					name: "test-plugin",
					version: "0",
					build: {
						enableLoging: false,
						buildConfig: () => ({
							outdir: `${TEMP_DIR}/build`,
							files: {
								"/index.html": "Hello World",
							},
							plugins: [
								{
									name: "dynamic",
									setup() {
										calledPlugins.push("dynamic-build-config");
									},
								},
							],
						}),
					},
				},
				{
					name: "test-plugin-2",
					version: "0",
					build: {
						buildConfig: {
							plugins: [
								{
									name: "static-build-config",
									setup() {
										calledPlugins.push("static-build-config");
									},
								},
							],
						},
					},
				},
			],
		};

		const calledPlugins: string[] = [];

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));

		await builder.build();

		expect(calledPlugins.length).toBe(2);
	});

	test("should be able to access base entrypoints from FrameMasterConfig", async () => {
		const fmConfig: FrameMasterConfig = {
			HTTPServer: {
				port: 3000,
			},
			pluginsOptions: {
				entrypoints: ["/index.html"],
			},
			plugins: [
				{
					name: "test-plugin",
					version: "0",
					build: {
						enableLoging: false,
						buildConfig: {
							outdir: `${TEMP_DIR}/build`,
							files: {
								"/index.html": "Hello World",
							},
						},
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		const newConfig = await builder.createConfigs();
		expect(newConfig.entrypoints).toEqual(["/index.html"]);

		const res = await builder.build();

		const outEntrypoints = res.outputs.filter(
			(art) => art.kind === "entry-point",
		);

		// currently Bun is missbehaveing and generating multiple entrypoints for the same file, so we just check if at least one of them is correct
		expect(outEntrypoints.length >= 1).toBeTrue();

		expect(
			outEntrypoints.some((c) => c.path.endsWith("/index.html")),
		).toBeTruthy();
	});
});
