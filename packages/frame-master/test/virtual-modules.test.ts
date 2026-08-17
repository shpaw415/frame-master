import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { FrameMasterConfig } from "frame-master/server/type";
import { createBuilder } from "../src/build";
import { PluginLoader } from "../src/plugins/plugin-loader";
import type { VirtualModuleContentsFactory } from "../src/plugins/types";
import { resolveVirtualModuleContents } from "../src/plugins/virtual-modules";

const TEST_DIR = join(import.meta.dir, ".test-virtual-modules-tmp");

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
	new PluginLoader({ HTTPServer: { port: 0 }, plugins: [] });
});

function configWithVirtualModule(
	contents: string | Uint8Array | VirtualModuleContentsFactory,
): FrameMasterConfig {
	return {
		HTTPServer: { port: 0 },
		plugins: [
			{
				name: "virtual-provider",
				version: "1.0.0",
				virtualModules: {
					"@test/virtual": {
						contents,
						loader: "ts",
						injectRuntime: true,
					},
				},
			},
		],
	};
}

describe("plugin virtual modules", () => {
	test("resolves provider source for another plugin and seeds chained transforms", async () => {
		const entry = join(TEST_DIR, "entry.ts");
		await Bun.write(
			entry,
			`import { value } from "@test/virtual"; console.log(value);`,
		);
		const received: Array<{
			contents: string | Uint8Array | undefined;
			loader: Bun.Loader | undefined;
		}> = [];
		const config = configWithVirtualModule(`export const value = "provided";`);
		config.pluginsOptions = { virtualModuleFileProxy: true };
		config.plugins.push({
			name: "virtual-consumer-transform",
			version: "1.0.0",
			build: {
				buildConfig: {
					outdir: join(TEST_DIR, "out"),
					plugins: [
						{
							name: "virtual-transform",
							setup(build) {
								build.onLoad({ filter: /.*/ }, async (args) => {
									if (args.path !== "@test/virtual") return undefined;
									const source = await Bun.file(args.path).text();
									received.push({
										contents: source,
										loader: args.__chainedLoader,
									});
									return {
										contents: `${source}\nexport const transformed = true;`,
										loader: "ts",
									};
								});
							},
						},
					],
				},
			},
		});

		const builder = await createBuilder(config, new PluginLoader(config));
		const result = await builder.build(entry);

		expect(result.success).toBeTrue();
		expect(received).toEqual([
			{ contents: `export const value = "provided";`, loader: "ts" },
		]);
	});

	test("keeps Bun.file native by default for registered module specifiers", async () => {
		new PluginLoader(configWithVirtualModule(`export const value = true;`));

		expect(await Bun.file("@test/virtual").exists()).toBeFalse();
	});

	test("reads registered sources through the opt-in Bun.file proxy", async () => {
		const config = configWithVirtualModule(JSON.stringify({ enabled: true }));
		config.pluginsOptions = { virtualModuleFileProxy: true };
		const registry = new PluginLoader(config).getVirtualModuleRegistry();
		const file = Bun.file("@test/virtual");

		expect(await file.text()).toBe(`{"enabled":true}`);
		expect(await file.json()).toEqual({ enabled: true });
		expect(await file.bytes()).toEqual(
			new TextEncoder().encode(`{"enabled":true}`),
		);
		expect(new Uint8Array(await file.arrayBuffer())).toEqual(
			new TextEncoder().encode(`{"enabled":true}`),
		);
		expect(await new Response(file.stream()).text()).toBe(`{"enabled":true}`);
		expect(file.size).toBe(
			new TextEncoder().encode(`{"enabled":true}`).byteLength,
		);
		expect(file.type).toBe("application/javascript");
		expect(await file.exists()).toBeTrue();
		expect(registry.getModule("@test/virtual")).toBeDefined();
	});

	test("preserves binary contents and native disk-file reads", async () => {
		const config = configWithVirtualModule(`export {};`);
		const provider = config.plugins[0];
		if (!provider?.virtualModules)
			throw new Error("Missing virtual module provider");
		provider.virtualModules["@test/binary"] = {
			contents: new Uint8Array([0, 1, 255]),
			loader: "file",
			injectRuntime: false,
		};
		config.pluginsOptions = { virtualModuleFileProxy: true };
		new PluginLoader(config);
		const diskFile = join(TEST_DIR, "native.txt");
		await Bun.write(diskFile, "native source");

		expect(await Bun.file("@test/binary").bytes()).toEqual(
			new Uint8Array([0, 1, 255]),
		);
		expect(await Bun.file(diskFile).text()).toBe("native source");
	});

	test("updates proxy reads on plugin-loader reload without wrapping Bun.file again", async () => {
		const first = configWithVirtualModule(`export const value = "first";`);
		first.pluginsOptions = { virtualModuleFileProxy: true };
		new PluginLoader(first);
		const proxy = Bun.file;

		expect(await Bun.file("@test/virtual").text()).toBe(
			`export const value = "first";`,
		);

		const second = configWithVirtualModule(`export const value = "second";`);
		second.pluginsOptions = { virtualModuleFileProxy: true };
		new PluginLoader(second);

		expect(Bun.file).toBe(proxy);
		expect(await Bun.file("@test/virtual").text()).toBe(
			`export const value = "second";`,
		);
	});

	test("registers only injectRuntime modules in the runtime plugin", () => {
		const config = configWithVirtualModule(`export const runtime = true;`);
		const provider = config.plugins[0];
		if (!provider?.virtualModules)
			throw new Error("Missing virtual module provider");
		provider.virtualModules["@test/build-only"] = {
			contents: `export const buildOnly = true;`,
			loader: "ts",
			injectRuntime: false,
		};

		const registry = new PluginLoader(config).getVirtualModuleRegistry();
		expect(registry.hasRuntimeModules()).toBeTrue();
		expect(registry.getModule("@test/build-only")?.injectRuntime).toBeFalse();
		expect(registry.createPlugin()?.name).toBe("frame-master-virtual-modules");
		expect(registry.createPlugin(true)?.name).toBe(
			"frame-master-runtime-virtual-modules",
		);
	});

	test("runtime provider excludes build-only declarations", async () => {
		const config = configWithVirtualModule(`export const runtime = true;`);
		const provider = config.plugins[0];
		if (!provider?.virtualModules)
			throw new Error("Missing virtual module provider");
		provider.virtualModules["@test/build-only"] = {
			contents: `export const buildOnly = true;`,
			loader: "ts",
			injectRuntime: false,
		};

		const runtimePlugin = new PluginLoader(config)
			.getVirtualModuleRegistry()
			.createPlugin(true);
		if (!runtimePlugin)
			throw new Error("Missing runtime virtual module plugin");
		const entry = join(TEST_DIR, "runtime-entry.ts");
		await Bun.write(
			entry,
			`import { runtime } from "@test/virtual"; console.log(runtime);`,
		);

		const result = await Bun.build({
			entrypoints: [entry],
			outdir: join(TEST_DIR, "runtime-out"),
			plugins: [runtimePlugin],
		});

		expect(result.success).toBeTrue();

		const buildOnlyEntry = join(TEST_DIR, "build-only-runtime-entry.ts");
		await Bun.write(
			buildOnlyEntry,
			`import { buildOnly } from "@test/build-only"; console.log(buildOnly);`,
		);
		await expect(
			Bun.build({
				entrypoints: [buildOnlyEntry],
				outdir: join(TEST_DIR, "build-only-runtime-out"),
				plugins: [runtimePlugin],
			}),
		).rejects.toThrow("Bundle failed");
	});

	test("reports both plugins when a specifier is declared twice", () => {
		const config = configWithVirtualModule(`export {};`);
		config.plugins.push({
			name: "duplicate-provider",
			version: "1.0.0",
			virtualModules: {
				"@test/virtual": {
					contents: `export {};`,
					loader: "ts",
					injectRuntime: false,
				},
			},
		});

		expect(() => new PluginLoader(config)).toThrow(
			'Virtual module "@test/virtual" is declared by both plugins "virtual-provider" and "duplicate-provider".',
		);
	});

	test("creates fresh registry contents for a reloaded config", () => {
		const first = new PluginLoader(
			configWithVirtualModule(`export const value = "first";`),
		);
		const second = new PluginLoader(
			configWithVirtualModule(`export const value = "second";`),
		);

		expect(
			first.getVirtualModuleRegistry().getModule("@test/virtual")?.contents,
		).toBe(`export const value = "first";`);
		expect(
			second.getVirtualModuleRegistry().getModule("@test/virtual")?.contents,
		).toBe(`export const value = "second";`);
	});

	test("invokes a sync contents factory when a build loads the module", async () => {
		const entry = join(TEST_DIR, "factory-entry.ts");
		await Bun.write(
			entry,
			`import { value } from "@test/virtual"; console.log(value);`,
		);
		const received: string[] = [];
		const config = configWithVirtualModule(
			() => `export const value = "from-factory";`,
		);
		config.plugins.push({
			name: "virtual-factory-transform",
			version: "1.0.0",
			build: {
				buildConfig: {
					outdir: join(TEST_DIR, "factory-out"),
					plugins: [
						{
							name: "virtual-factory-capture",
							setup(build) {
								build.onLoad({ filter: /.*/ }, (args) => {
									if (args.path !== "@test/virtual") return undefined;
									received.push(String(args.__chainedContents ?? ""));
									return undefined;
								});
							},
						},
					],
				},
			},
		});

		const builder = await createBuilder(config, new PluginLoader(config));
		const result = await builder.build(entry);

		expect(result.success).toBeTrue();
		expect(received).toEqual([`export const value = "from-factory";`]);
	});

	test("invokes a contents factory on each builder.build()", async () => {
		const entry = join(TEST_DIR, "factory-count-entry.ts");
		await Bun.write(
			entry,
			`import { value } from "@test/virtual"; console.log(value);`,
		);
		let calls = 0;
		const config = configWithVirtualModule(() => {
			calls += 1;
			return `export const value = ${calls};`;
		});
		config.plugins.push({
			name: "virtual-factory-count-build",
			version: "1.0.0",
			build: {
				buildConfig: {
					outdir: join(TEST_DIR, "factory-count-out"),
				},
			},
		});

		const builder = await createBuilder(config, new PluginLoader(config));
		expect((await builder.build(entry)).success).toBeTrue();
		expect((await builder.build(entry)).success).toBeTrue();
		expect(calls).toBe(2);
	});

	test("invokes an async contents factory during build", async () => {
		const entry = join(TEST_DIR, "async-factory-entry.ts");
		await Bun.write(
			entry,
			`import { value } from "@test/virtual"; console.log(value);`,
		);
		const config = configWithVirtualModule(async () => {
			await Promise.resolve();
			return `export const value = "async-factory";`;
		});
		config.plugins.push({
			name: "virtual-async-factory-build",
			version: "1.0.0",
			build: {
				buildConfig: {
					outdir: join(TEST_DIR, "async-factory-out"),
				},
			},
		});

		const builder = await createBuilder(config, new PluginLoader(config));
		const result = await builder.build(entry);
		expect(result.success).toBeTrue();
	});

	test("invokes a contents factory from the runtime virtual-module plugin", async () => {
		let calls = 0;
		const config = configWithVirtualModule(() => {
			calls += 1;
			return `export const runtime = ${calls};`;
		});
		const runtimePlugin = new PluginLoader(config)
			.getVirtualModuleRegistry()
			.createPlugin(true);
		if (!runtimePlugin)
			throw new Error("Missing runtime virtual module plugin");
		const entry = join(TEST_DIR, "runtime-factory-entry.ts");
		await Bun.write(
			entry,
			`import { runtime } from "@test/virtual"; console.log(runtime);`,
		);

		const result = await Bun.build({
			entrypoints: [entry],
			outdir: join(TEST_DIR, "runtime-factory-out"),
			plugins: [runtimePlugin],
		});

		expect(result.success).toBeTrue();
		expect(calls).toBe(1);
	});

	test("names specifier and plugin when a contents factory throws", async () => {
		const config = configWithVirtualModule(() => {
			throw new Error("boom");
		});
		const module = new PluginLoader(config)
			.getVirtualModuleRegistry()
			.getModule("@test/virtual");
		if (!module) throw new Error("Missing virtual module");

		try {
			await resolveVirtualModuleContents(module, "@test/virtual");
			throw new Error("expected factory to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe(
				'Virtual module "@test/virtual" contents factory from plugin "virtual-provider" failed',
			);
			expect((error as Error).cause).toBeInstanceOf(Error);
			expect(((error as Error).cause as Error).message).toBe("boom");
		}
	});

	test("rejects a contents factory that does not return string or Uint8Array", async () => {
		const config = configWithVirtualModule(
			(() => 42) as unknown as VirtualModuleContentsFactory,
		);
		const module = new PluginLoader(config)
			.getVirtualModuleRegistry()
			.getModule("@test/virtual");
		if (!module) throw new Error("Missing virtual module");

		await expect(
			resolveVirtualModuleContents(module, "@test/virtual"),
		).rejects.toThrow(
			'Virtual module "@test/virtual" contents factory from plugin "virtual-provider" must return a string or Uint8Array.',
		);
	});

	test("reads factory contents through the opt-in Bun.file proxy", async () => {
		const config = configWithVirtualModule(
			() => `export const value = "proxy";`,
		);
		config.pluginsOptions = { virtualModuleFileProxy: true };
		new PluginLoader(config);

		expect(await Bun.file("@test/virtual").text()).toBe(
			`export const value = "proxy";`,
		);
		expect(Bun.file("@test/virtual").size).toBe(
			new TextEncoder().encode(`export const value = "proxy";`).byteLength,
		);
	});

	test("async factory Bun.file text works and sync size throws", async () => {
		const config = configWithVirtualModule(async () => {
			await Promise.resolve();
			return `export const value = "async-proxy";`;
		});
		config.pluginsOptions = { virtualModuleFileProxy: true };
		new PluginLoader(config);

		expect(await Bun.file("@test/virtual").text()).toBe(
			`export const value = "async-proxy";`,
		);
		expect(() => Bun.file("@test/virtual").size).toThrow(
			'Virtual module "@test/virtual" contents factory from plugin "virtual-provider" is async; use .text() / .bytes() instead of sync accessors.',
		);
	});
});

describe("buildConfig virtualModules overlay", () => {
	test("builds an overlay specifier as an entrypoint through the managed provider", async () => {
		const { createPluginTestEnv } = await import("../test-suite/src/create-env");
		const { withTempDir } = await import("../test-suite/src/fixtures");

		await withTempDir(async (dir) => {
			const received: Array<{
				contents: string | Uint8Array | undefined;
				loader: Bun.Loader | undefined;
				namespace: string | undefined;
			}> = [];
			const env = await createPluginTestEnv({
				cwd: dir,
				startServer: false,
				runServerStart: false,
				runCreateContext: false,
				runServerStop: false,
				plugins: [
					{
						name: "overlay-provider",
						version: "1.0.0",
						build: {
							buildConfig: {
								outdir: join(dir, "overlay-out"),
								entrypoints: ["@overlay/entry"],
								virtualModules: {
									"@overlay/entry": {
										contents: `export const value = "overlay-entry";`,
										loader: "ts",
									},
								},
								plugins: [
									{
										name: "overlay-seed-capture",
										setup(build) {
											build.onLoad({ filter: /.*/ }, (args) => {
												if (args.path !== "@overlay/entry") return undefined;
												received.push({
													contents: args.__chainedContents,
													loader: args.__chainedLoader,
													namespace: args.namespace,
												});
												return undefined;
											});
										},
									},
								],
							},
						},
					},
				],
			});

			try {
				const result = await env.build();
				expect(result.success).toBeTrue();
				expect(received).toEqual([
					{
						contents: `export const value = "overlay-entry";`,
						loader: "ts",
						namespace: "frame-master-virtual-module",
					},
				]);
				const merged = await env.builder.createConfigs();
				expect(merged.files).toEqual({ "@overlay/entry": "" });
				expect(
					(merged as { virtualModules?: unknown }).virtualModules,
				).toBeUndefined();
			} finally {
				await env.dispose();
			}
		});
	});

	test("promotes legacy buildConfig.files into the overlay without a disk file", async () => {
		const specifier = join(TEST_DIR, "missing-on-disk.ts");
		const config: FrameMasterConfig = {
			HTTPServer: { port: 0 },
			plugins: [
				{
					name: "files-shim-plugin",
					version: "1.0.0",
					build: {
						buildConfig: {
							outdir: join(TEST_DIR, "files-shim-out"),
							entrypoints: [specifier],
							files: {
								[specifier]: `export const value = "from-files";`,
							},
						},
					},
				},
			],
		};

		const builder = await createBuilder(config, new PluginLoader(config));
		const result = await builder.build();
		expect(result.success).toBeTrue();
		expect(await Bun.file(specifier).exists()).toBeFalse();
	});

	test("second build picks up added overlay specifiers and drops removed ones", async () => {
		let generated: Record<string, string> = {
			"@overlay/keep": `export const keep = 1;`,
		};
		const config: FrameMasterConfig = {
			HTTPServer: { port: 0 },
			plugins: [
				{
					name: "overlay-rebuild",
					version: "1.0.0",
					build: {
						buildConfig: () => ({
							outdir: join(TEST_DIR, "overlay-rebuild-out"),
							entrypoints: Object.keys(generated),
							virtualModules: Object.fromEntries(
								Object.entries(generated).map(([specifier, contents]) => [
									specifier,
									{ contents, loader: "ts" as const },
								]),
							),
						}),
					},
				},
			],
		};

		const builder = await createBuilder(config, new PluginLoader(config));
		expect((await builder.build()).success).toBeTrue();

		generated = {
			"@overlay/keep": `export const keep = 2;`,
			"@overlay/added": `export const added = true;`,
		};
		expect((await builder.build()).success).toBeTrue();

		generated = {
			"@overlay/added": `export const added = true;`,
		};
		expect((await builder.build()).success).toBeTrue();
	});

	test("duplicate overlay vs plugin virtualModules names both owners", async () => {
		const config = configWithVirtualModule(`export const value = "plugin";`);
		config.plugins.push({
			name: "overlay-duplicate",
			version: "1.0.0",
			build: {
				buildConfig: {
					outdir: join(TEST_DIR, "dup-out"),
					virtualModules: {
						"@test/virtual": {
							contents: `export const value = "overlay";`,
							loader: "ts",
						},
					},
				},
			},
		});

		const builder = await createBuilder(config, new PluginLoader(config));
		await expect(builder.createConfigs()).rejects.toThrow(
			'Virtual module "@test/virtual" is declared by both plugins "virtual-provider" and "overlay-duplicate".',
		);
	});

	test("duplicate overlay owners name both plugins", async () => {
		const config: FrameMasterConfig = {
			HTTPServer: { port: 0 },
			plugins: [
				{
					name: "overlay-a",
					version: "1.0.0",
					build: {
						buildConfig: {
							virtualModules: {
								"@overlay/shared": {
									contents: `export const a = true;`,
									loader: "ts",
								},
							},
						},
					},
				},
				{
					name: "overlay-b",
					version: "1.0.0",
					build: {
						buildConfig: {
							virtualModules: {
								"@overlay/shared": {
									contents: `export const b = true;`,
									loader: "ts",
								},
							},
						},
					},
				},
			],
		};

		const builder = await createBuilder(config, new PluginLoader(config));
		await expect(builder.createConfigs()).rejects.toThrow(
			'Virtual module "@overlay/shared" is declared by both plugins "overlay-a" and "overlay-b".',
		);
	});

	test("default overlay and files shim stay out of createPlugin(true)", async () => {
		const config: FrameMasterConfig = {
			HTTPServer: { port: 0 },
			plugins: [
				{
					name: "overlay-runtime-filter",
					version: "1.0.0",
					virtualModules: {
						"@test/runtime": {
							contents: `export const runtime = true;`,
							loader: "ts",
							injectRuntime: true,
						},
					},
					build: {
						buildConfig: {
							virtualModules: {
								"@overlay/build-only": {
									contents: `export const overlay = true;`,
									loader: "ts",
								},
								"@overlay/opt-in": {
									contents: `export const optIn = true;`,
									loader: "ts",
									injectRuntime: true,
								},
							},
							files: {
								"@overlay/from-files": `export const fromFiles = true;`,
							},
						},
					},
				},
			],
		};

		const registry = new PluginLoader(config).getVirtualModuleRegistry();
		const overlay = new Map([
			[
				"@overlay/build-only",
				{
					contents: `export const overlay = true;`,
					loader: "ts" as const,
					injectRuntime: false,
					pluginName: "overlay-runtime-filter",
				},
			],
			[
				"@overlay/opt-in",
				{
					contents: `export const optIn = true;`,
					loader: "ts" as const,
					injectRuntime: true,
					pluginName: "overlay-runtime-filter",
				},
			],
			[
				"@overlay/from-files",
				{
					contents: `export const fromFiles = true;`,
					loader: "js" as const,
					injectRuntime: false,
					pluginName: "overlay-runtime-filter",
				},
			],
		]);

		expect(registry.lookupModule("@overlay/build-only", true, overlay)).toBeUndefined();
		expect(registry.lookupModule("@overlay/from-files", true, overlay)).toBeUndefined();
		expect(registry.lookupModule("@overlay/opt-in", true, overlay)?.injectRuntime).toBeTrue();
		expect(registry.lookupModule("@test/runtime", true, overlay)?.injectRuntime).toBeTrue();
	});

	test("debug snapshot uses overlay factory source and labels the file virtual", async () => {
		const config: FrameMasterConfig = {
			HTTPServer: { port: 0 },
			plugins: [
				{
					name: "overlay-debug",
					version: "1.0.0",
					build: {
						buildConfig: {
							outdir: join(TEST_DIR, "overlay-debug-out"),
							entrypoints: ["@overlay/debug"],
							virtualModules: {
								"@overlay/debug": {
									contents: () => `export const value = "debug-factory";`,
									loader: "ts",
								},
							},
							plugins: [
								{
									name: "overlay-debug-transform",
									setup(build) {
										build.onLoad(
											{ filter: /^@overlay\/debug$/ },
											(args) => ({
												contents: `${args.__chainedContents}\nexport const transformed = true;`,
												loader: "ts",
											}),
										);
									},
								},
							],
						},
					},
				},
			],
		};

		const builder = await createBuilder(config, new PluginLoader(config));
		builder.startDebugSession({ watch: false, includeTextSnapshots: true });
		const result = await builder.build();
		const build = builder.getDebugSession()?.builds[0];
		const virtualFile = build?.files.find((file) => file.path === "@overlay/debug");

		expect(result.success).toBeTrue();
		expect(virtualFile?.namespace).toBe("frame-master-virtual-module");
		expect(build?.snapshots[virtualFile?.initialSnapshotId as string]?.text).toBe(
			`export const value = "debug-factory";`,
		);
		expect(build?.snapshots[virtualFile?.finalSnapshotId as string]?.text).toContain(
			"export const transformed = true;",
		);
	});
});
