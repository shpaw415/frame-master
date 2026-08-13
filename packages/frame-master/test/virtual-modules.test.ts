import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import type { FrameMasterConfig } from "frame-master/server/type";
import { createBuilder } from "../src/build";
import { PluginLoader } from "../src/plugins/plugin-loader";

const TEST_DIR = join(import.meta.dir, ".test-virtual-modules-tmp");

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

function configWithVirtualModule(contents: string): FrameMasterConfig {
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
		await Bun.write(entry, `import { value } from "@test/virtual"; console.log(value);`);
		const received: Array<{ contents: string | Uint8Array | undefined; loader: Bun.Loader | undefined }> =
			[];
		const config = configWithVirtualModule(`export const value = "provided";`);
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
								build.onLoad({ filter: /.*/ }, (args) => {
									if (args.path !== "@test/virtual") return undefined;
									received.push({
										contents: args.__chainedContents,
										loader: args.__chainedLoader,
									});
									return {
										contents: `${args.__chainedContents}\nexport const transformed = true;`,
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

	test("registers only injectRuntime modules in the runtime plugin", () => {
		const config = configWithVirtualModule(`export const runtime = true;`);
		const provider = config.plugins[0];
		if (!provider?.virtualModules) throw new Error("Missing virtual module provider");
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
		if (!provider?.virtualModules) throw new Error("Missing virtual module provider");
		provider.virtualModules["@test/build-only"] = {
			contents: `export const buildOnly = true;`,
			loader: "ts",
			injectRuntime: false,
		};

		const runtimePlugin = new PluginLoader(config)
			.getVirtualModuleRegistry()
			.createPlugin(true);
		if (!runtimePlugin) throw new Error("Missing runtime virtual module plugin");
		const entry = join(TEST_DIR, "runtime-entry.ts");
		await Bun.write(entry, `import { runtime } from "@test/virtual"; console.log(runtime);`);

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
		const first = new PluginLoader(configWithVirtualModule(`export const value = "first";`));
		const second = new PluginLoader(configWithVirtualModule(`export const value = "second";`));

		expect(first.getVirtualModuleRegistry().getModule("@test/virtual")?.contents).toBe(
			`export const value = "first";`,
		);
		expect(second.getVirtualModuleRegistry().getModule("@test/virtual")?.contents).toBe(
			`export const value = "second";`,
		);
	});
});
