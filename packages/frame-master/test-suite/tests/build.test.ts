import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { createPluginTestEnv } from "../src/create-env";
import { withTempDir, writeFixture } from "../src/fixtures";
import type { PluginTestEnv } from "../src/types";

describe("plugin test suite — build", () => {
	let env: PluginTestEnv | undefined;

	afterEach(async () => {
		await env?.dispose();
		env = undefined;
	});

	test("runs beforeBuild and afterBuild hooks and produces outputs", async () => {
		await withTempDir(async (dir) => {
			const entry = await writeFixture(
				dir,
				"entry.ts",
				`export const message = "from-plugin-build";\n`,
			);
			const outdir = join(dir, "out");
			const order: string[] = [];

			const plugin: FrameMasterPlugin = {
				name: "build-hook-plugin",
				version: "1.0.0",
				build: {
					enableLoging: false,
					buildConfig: {
						outdir,
						target: "bun",
						entrypoints: [entry],
					},
					beforeBuild: async () => {
						order.push("before");
					},
					afterBuild: async (_cfg, result) => {
						order.push("after");
						expect(result.success).toBe(true);
					},
				},
			};

			env = await createPluginTestEnv({
				plugins: [plugin],
				startServer: false,
				cwd: dir,
			});

			const result = await env.build();
			expect(result.success).toBe(true);
			expect(result.outputs.length).toBeGreaterThan(0);
			expect(order).toEqual(["before", "after"]);
		});
	});

	test("merges static and dynamic buildConfig from multiple plugins", async () => {
		await withTempDir(async (dir) => {
			const entry = await writeFixture(
				dir,
				"entry.ts",
				`export const n = 1;\n`,
			);
			const outdir = join(dir, "out");
			const called: string[] = [];

			const plugins: FrameMasterPlugin[] = [
				{
					name: "static-cfg",
					version: "1.0.0",
					build: {
						buildConfig: {
							outdir,
							target: "bun",
							plugins: [
								{
									name: "static-marker",
									setup() {
										called.push("static");
									},
								},
							],
						},
					},
				},
				{
					name: "dynamic-cfg",
					version: "1.0.0",
					build: {
						buildConfig: () => ({
							entrypoints: [entry],
							plugins: [
								{
									name: "dynamic-marker",
									setup() {
										called.push("dynamic");
									},
								},
							],
						}),
					},
				},
			];

			env = await createPluginTestEnv({
				plugins,
				startServer: false,
				cwd: dir,
			});

			const result = await env.build();
			expect(result.success).toBe(true);
			expect(called).toContain("static");
			expect(called).toContain("dynamic");
		});
	});

	test("env.build accepts extra entrypoints", async () => {
		await withTempDir(async (dir) => {
			const entry = await writeFixture(
				dir,
				"extra.ts",
				`export const extra = true;\n`,
			);
			const outdir = join(dir, "out");

			env = await createPluginTestEnv({
				plugins: [
					{
						name: "entry-plugin",
						version: "1.0.0",
						build: {
							buildConfig: {
								outdir,
								target: "bun",
							},
						},
					},
				],
				startServer: false,
				cwd: dir,
			});

			const result = await env.build({ entrypoints: [entry] });
			expect(result.success).toBe(true);
			expect(result.outputs.length).toBeGreaterThan(0);
		});
	});
});
