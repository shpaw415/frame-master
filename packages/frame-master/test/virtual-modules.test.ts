import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { FrameMasterConfig } from "frame-master/server/type";
import { createBuilder } from "../src/build";
import { PluginLoader } from "../src/plugins/plugin-loader";
import type { VirtualModuleContentsFactory } from "../src/plugins/types";
import {
	createVirtualModuleResolveFilter,
	resolveVirtualModuleContents,
} from "../src/plugins/virtual-modules";

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

	test("resolve filter matches only registered specifiers", () => {
		const filter = createVirtualModuleResolveFilter([
			"@registry/mod",
			"dynamic-ssr:entrypoints",
			"foo.bar+baz",
		]);

		expect(filter.test("@registry/mod")).toBeTrue();
		expect(filter.test("dynamic-ssr:entrypoints")).toBeTrue();
		expect(filter.test("foo.bar+baz")).toBeTrue();
		expect(filter.test("@registry/mod/extra")).toBeFalse();
		expect(filter.test("virtual:hook")).toBeFalse();
		expect(filter.test("src/page.cfdynamicssr")).toBeFalse();
		expect(filter.test("foo.barXbaz")).toBeFalse();
	});

	test("keeps hook-based and files virtual modules when a registry module exists", async () => {
		const entry = join(TEST_DIR, "coexist-entry.ts");
		await Bun.write(
			entry,
			[
				`import { value as registry } from "@registry/mod";`,
				`import { value as hook } from "virtual:hook";`,
				`import { value as files } from "@files/mod.ts";`,
				`console.log(registry, hook, files);`,
			].join("\n"),
		);
		const resolved: string[] = [];
		const loaded: string[] = [];
		const config: FrameMasterConfig = {
			HTTPServer: { port: 0 },
			plugins: [
				{
					name: "registry-provider",
					version: "1.0.0",
					virtualModules: {
						"@registry/mod": {
							contents: `export const value = "registry";`,
							loader: "ts",
							injectRuntime: false,
						},
					},
				},
				{
					name: "hook-and-files-provider",
					version: "1.0.0",
					build: {
						buildConfig: {
							outdir: join(TEST_DIR, "coexist-out"),
							files: {
								"@files/mod.ts": `export const value = "files";`,
							},
							plugins: [
								{
									name: "hook-virtual",
									setup(build) {
										build.onResolve({ filter: /^virtual:hook$/ }, (args) => {
											resolved.push(args.path);
											return {
												path: args.path,
												namespace: "hook-virtual",
											};
										});
										build.onLoad(
											{
												filter: /^virtual:hook$/,
												namespace: "hook-virtual",
											},
											() => {
												loaded.push("virtual:hook");
												return {
													contents: `export const value = "hook";`,
													loader: "ts",
												};
											},
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
		builder.startDebugSession({
			watch: false,
			includeTextSnapshots: true,
		});
		const result = await builder.build(entry);
		const build = builder.getDebugSession()?.builds[0];
		const registryFile = build?.files.find(
			(file) => file.path === "@registry/mod",
		);
		const hookFile = build?.files.find((file) => file.path === "virtual:hook");

		expect(result.success).toBeTrue();
		expect(resolved).toEqual(["virtual:hook"]);
		expect(loaded).toEqual(["virtual:hook"]);
		expect(registryFile?.namespace).toBe("frame-master-virtual-module");
		expect(hookFile?.namespace).toBe("hook-virtual");
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
