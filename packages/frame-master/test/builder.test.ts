import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BunPlugin } from "bun";
import type { FrameMasterConfig } from "frame-master/server/type";
import { createBuilder } from "../src/build";
import {
	BuildUnifier,
	configureBuildPipelines,
	getBuildPipeline,
	getBuildPipelines,
	getBuildUnifierContext,
	initializeBuildPipelines,
	resetBuildPipelines,
} from "../src/build/pipelines";
import {
	type BuildTraceSession,
	BuildTraceSessionStore,
} from "../src/build/debug-trace";
import { PluginLoader } from "../src/plugins";
import { getGlobalPluginContext } from "../src/plugins/utils";

const TEMP_DIR = ".test-temp";
const TEXT_ENTRYPOINT = join(TEMP_DIR, "entry.txt");

function createTrackedTextPlugin(
	name: string,
	executionOrder: string[],
): BunPlugin {
	return {
		name,
		setup(build) {
			build.onLoad({ filter: /\.txt$/ }, async (args) => {
				executionOrder.push(`${name}:onLoad`);
				const content =
					args.__chainedContents ?? (await Bun.file(args.path).text());
				return {
					contents: `${content} [${name}]`,
					loader: "text",
				};
			});

			build.finally("text", ({ contents }) => {
				executionOrder.push(`${name}:finally`);
				return { contents: `${contents} [${name}:final]` };
			});
		},
	};
}

function createFinallyOnlyTextPlugin(
	name: string,
	executionOrder: string[],
): BunPlugin {
	return {
		name,
		setup(build) {
			build.finally("text", ({ contents }) => {
				executionOrder.push(`${name}:finally`);
				return { contents: `${contents} [${name}:final]` };
			});
		},
	};
}

beforeEach(() => {
	mkdirSync(TEMP_DIR, { recursive: true });
	writeFileSync(TEXT_ENTRYPOINT, "builder input");
});
afterEach(() => {
	resetBuildPipelines();
	rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe("builder", () => {
	test("keeps unifier bucket fragments isolated and exposes legacy context", async () => {
		const defaultCalls: string[] = [];
		const pipelineCalls: string[] = [];
		const pipelinePlugin = {
			name: "pipeline-plugin",
			version: "1.0.0",
		};
		const config: FrameMasterConfig = {
			HTTPServer: { port: 0 },
			plugins: [
				{
					name: "default-plugin",
					version: "1.0.0",
					build: {
						buildConfig: {
							outdir: `${TEMP_DIR}/default`,
							entrypoints: [TEXT_ENTRYPOINT],
							plugins: [{ name: "default-plugin", setup: () => { defaultCalls.push("default"); } }],
						},
					},
				},
				...BuildUnifier({ id: "pipeline", label: "Pipeline", plugins: [pipelinePlugin] }),
			],
		};
		const loader = new PluginLoader(config);
		await configureBuildPipelines(config, loader);
		const unifier = getBuildUnifierContext();
		if (!unifier?.setBuildConfig) {
			throw new Error("build-unifier context was not initialized");
		}
		unifier.setBuildConfig("pipeline-plugin", {
			beforeBuild: () => { pipelineCalls.push("before"); },
			buildConfig: {
				outdir: `${TEMP_DIR}/pipeline`,
				entrypoints: [TEXT_ENTRYPOINT],
				plugins: [{ name: "pipeline-plugin", setup: () => { pipelineCalls.push("pipeline"); } }],
			},
		});
		await initializeBuildPipelines();
		const coreBuilder = await createBuilder(config, loader);
		await coreBuilder.build();
		await (await getBuildPipeline("pipeline").getBuilder("pipeline-plugin")).build();

		expect(defaultCalls).toEqual(["default"]);
		expect(pipelineCalls).toEqual(["pipeline", "before"]);
		expect(getBuildPipelines().map((pipeline) => pipeline.id)).toEqual([
			"pipeline",
		]);
		expect(getBuildUnifierContext()).toBe(getGlobalPluginContext("build-unifier"));
		expect(getBuildUnifierContext("pipeline")).toBe(getBuildPipeline("pipeline"));
		globalThis.__GLOBAL_CONTEXT__ = {};
		expect(getBuildUnifierContext()?.setBuildConfig).toBeTypeOf("function");
	});

	test("runs each unifier bucket from the default builder in BUILD_MODE", async () => {
		const previousBuildMode = process.env.BUILD_MODE;
		process.env.BUILD_MODE = "true";
		const pipelineCalls: string[] = [];
		const config: FrameMasterConfig = {
			HTTPServer: { port: 0 },
			plugins: [
				{
					name: "default-plugin",
					version: "1.0.0",
					build: {
						buildConfig: {
							outdir: `${TEMP_DIR}/default-cli`,
							entrypoints: [TEXT_ENTRYPOINT],
						},
					},
				},
				...BuildUnifier({
					id: "cli-pipeline",
					plugins: [{ name: "cli-pipeline-plugin", version: "1.0.0" }],
				}),
			],
		};
		const loader = new PluginLoader(config);
		await configureBuildPipelines(config, loader);
		getBuildUnifierContext()?.setBuildConfig?.(
			"cli-pipeline-plugin",
			{
				beforeBuild: () => {
					pipelineCalls.push("before");
				},
				buildConfig: {
					outdir: `${TEMP_DIR}/cli-pipeline`,
					entrypoints: [TEXT_ENTRYPOINT],
					plugins: [
						{
							name: "cli-pipeline-plugin",
							setup: () => {
								pipelineCalls.push("pipeline");
							},
						},
					],
				},
			},
		);
		await initializeBuildPipelines();
		try {
			const coreBuilder = await createBuilder(config, loader);
			await coreBuilder.build();
			expect(pipelineCalls).toEqual(["pipeline", "before"]);
		} finally {
			if (previousBuildMode === undefined) {
				delete process.env.BUILD_MODE;
			} else {
				process.env.BUILD_MODE = previousBuildMode;
			}
		}
	});

	test("includes declared virtual modules in unifier bucket builds", async () => {
		const entrypoint = join(TEMP_DIR, "unifier-virtual-entry.ts");
		writeFileSync(
			entrypoint,
			`import { value } from "@test/unifier-virtual"; console.log(value);`,
		);
		const bucketPlugin = {
			name: "unifier-virtual-consumer",
			version: "1.0.0",
		};
		const config: FrameMasterConfig = {
			HTTPServer: { port: 0 },
			plugins: [
				{
					name: "unifier-virtual-provider",
					version: "1.0.0",
					virtualModules: {
						"@test/unifier-virtual": {
							contents: `export const value = "bucket-virtual";`,
							loader: "ts",
							injectRuntime: false,
						},
					},
				},
				...BuildUnifier({
					id: "virtual-bucket",
					label: "Virtual bucket",
					plugins: [bucketPlugin],
				}),
			],
		};
		const loader = new PluginLoader(config);
		await configureBuildPipelines(config, loader);
		getBuildUnifierContext()?.setBuildConfig?.(
			"unifier-virtual-consumer",
			{
				buildConfig: {
					outdir: `${TEMP_DIR}/unifier-virtual`,
					entrypoints: [entrypoint],
					plugins: [
						{
							name: "unifier-virtual-transform",
							setup(build) {
								build.onLoad({ filter: /^@test\/unifier-virtual$/ }, (args) => ({
									contents: `${args.__chainedContents}\nexport const transformed = true;`,
									loader: "ts",
								}));
							},
						},
					],
				},
			},
		);
		await initializeBuildPipelines();
		const bucketBuilder = await getBuildPipeline("virtual-bucket").getBuilder(
			"unifier-virtual-consumer",
		);
		bucketBuilder.startDebugSession({ watch: false, includeTextSnapshots: true });
		const result = await bucketBuilder.build();
		const build = bucketBuilder.getDebugSession()?.builds[0];
		const virtualFile = build?.files.find(
			(file) => file.path === "@test/unifier-virtual",
		);

		expect(result.success).toBeTrue();
		expect(virtualFile?.namespace).toBe("frame-master-virtual-module");
		expect(virtualFile?.steps.map((step) => [step.kind, step.pluginName])).toEqual([
			["source", undefined],
			["onLoad", "frame-master-virtual-modules"],
			["onLoad", "unifier-virtual-transform"],
			["final-output", undefined],
		]);
		expect(
			build?.snapshots[virtualFile?.initialSnapshotId as string]?.text,
		).toBe(`export const value = "bucket-virtual";`);
		expect(
			build?.snapshots[virtualFile?.finalSnapshotId as string]?.text,
		).toContain("export const transformed = true;");
	});

	test("pipeline overlay is invisible to another pipeline while global virtualModules stay shared", async () => {
		const seenA: string[] = [];
		const seenB: string[] = [];
		const pluginA = { name: "pipeline-a-plugin", version: "1.0.0" };
		const pluginB = { name: "pipeline-b-plugin", version: "1.0.0" };
		const config: FrameMasterConfig = {
			HTTPServer: { port: 0 },
			plugins: [
				{
					name: "shared-virtual-provider",
					version: "1.0.0",
					virtualModules: {
						"@test/shared-virtual": {
							contents: `export const shared = true;`,
							loader: "ts",
							injectRuntime: false,
						},
					},
				},
				...BuildUnifier({
					id: "pipeline-a",
					label: "Pipeline A",
					plugins: [pluginA],
				}),
				...BuildUnifier({
					id: "pipeline-b",
					label: "Pipeline B",
					plugins: [pluginB],
				}),
			],
		};
		const loader = new PluginLoader(config);
		await configureBuildPipelines(config, loader);
		getBuildUnifierContext()?.setBuildConfig?.("pipeline-a-plugin", {
			buildConfig: {
				outdir: `${TEMP_DIR}/pipeline-a`,
				entrypoints: ["@overlay/a", "@test/shared-virtual"],
				virtualModules: {
					"@overlay/a": {
						contents: `export const a = true;`,
						loader: "ts",
					},
				},
				plugins: [
					{
						name: "capture-a",
						setup(build) {
							build.onLoad({ filter: /.*/ }, (args) => {
								if (
									args.path === "@overlay/a" ||
									args.path === "@overlay/b" ||
									args.path === "@test/shared-virtual"
								) {
									seenA.push(args.path);
								}
								return undefined;
							});
						},
					},
				],
			},
		});
		getBuildUnifierContext()?.setBuildConfig?.("pipeline-b-plugin", {
			buildConfig: {
				outdir: `${TEMP_DIR}/pipeline-b`,
				entrypoints: ["@overlay/b", "@test/shared-virtual"],
				virtualModules: {
					"@overlay/b": {
						contents: `export const b = true;`,
						loader: "ts",
					},
				},
				plugins: [
					{
						name: "capture-b",
						setup(build) {
							build.onLoad({ filter: /.*/ }, (args) => {
								if (
									args.path === "@overlay/a" ||
									args.path === "@overlay/b" ||
									args.path === "@test/shared-virtual"
								) {
									seenB.push(args.path);
								}
								return undefined;
							});
						},
					},
				],
			},
		});
		await initializeBuildPipelines();
		const builderA = await getBuildPipeline("pipeline-a").getBuilder(
			"pipeline-a-plugin",
		);
		const builderB = await getBuildPipeline("pipeline-b").getBuilder(
			"pipeline-b-plugin",
		);

		expect((await builderA.build()).success).toBeTrue();
		expect((await builderB.build()).success).toBeTrue();
		expect(seenA).toContain("@overlay/a");
		expect(seenA).toContain("@test/shared-virtual");
		expect(seenA).not.toContain("@overlay/b");
		expect(seenB).toContain("@overlay/b");
		expect(seenB).toContain("@test/shared-virtual");
		expect(seenB).not.toContain("@overlay/a");
	});

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

	test("should chain static build plugins with finally handlers", async () => {
		const executionOrder: string[] = [];
		const fmConfig: FrameMasterConfig = {
			HTTPServer: {
				port: 3000,
			},
			pluginsOptions: {
				entrypoints: [TEXT_ENTRYPOINT],
			},
			plugins: [
				{
					name: "static-plugin",
					version: "0",
					build: {
						buildConfig: {
							outdir: `${TEMP_DIR}/build-static-finally`,
							plugins: [
								createTrackedTextPlugin("static-build-plugin", executionOrder),
							],
						},
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		const result = await builder.build();

		expect(result.success).toBeTrue();
		expect(executionOrder).toEqual([
			"static-build-plugin:onLoad",
			"static-build-plugin:finally",
		]);
	});

	test("should chain dynamic build plugins with finally handlers", async () => {
		const executionOrder: string[] = [];
		const fmConfig: FrameMasterConfig = {
			HTTPServer: {
				port: 3000,
			},
			pluginsOptions: {
				entrypoints: [TEXT_ENTRYPOINT],
			},
			plugins: [
				{
					name: "dynamic-plugin",
					version: "0",
					build: {
						buildConfig: () => ({
							outdir: `${TEMP_DIR}/build-dynamic-finally`,
							plugins: [
								createTrackedTextPlugin("dynamic-build-plugin", executionOrder),
							],
						}),
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		const result = await builder.build();

		expect(result.success).toBeTrue();
		expect(executionOrder).toEqual([
			"dynamic-build-plugin:onLoad",
			"dynamic-build-plugin:finally",
		]);
	});

	test("should preserve plugin order when static and dynamic build plugins chain", async () => {
		const executionOrder: string[] = [];
		const fmConfig: FrameMasterConfig = {
			HTTPServer: {
				port: 3000,
			},
			pluginsOptions: {
				entrypoints: [TEXT_ENTRYPOINT],
			},
			plugins: [
				{
					name: "static-plugin",
					version: "0",
					build: {
						buildConfig: {
							outdir: `${TEMP_DIR}/build-mixed-finally`,
							plugins: [
								createTrackedTextPlugin("static-build-plugin", executionOrder),
							],
						},
					},
				},
				{
					name: "dynamic-plugin",
					version: "0",
					build: {
						buildConfig: () => ({
							plugins: [
								createTrackedTextPlugin("dynamic-build-plugin", executionOrder),
							],
						}),
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		const result = await builder.build();

		expect(result.success).toBeTrue();
		expect(executionOrder).toEqual([
			"static-build-plugin:onLoad",
			"dynamic-build-plugin:onLoad",
			"static-build-plugin:finally",
			"dynamic-build-plugin:finally",
		]);
	});

	test("should record debug trace steps for chained text transforms", async () => {
		const executionOrder: string[] = [];
		const fmConfig: FrameMasterConfig = {
			HTTPServer: {
				port: 3000,
			},
			pluginsOptions: {
				entrypoints: [TEXT_ENTRYPOINT],
			},
			plugins: [
				{
					name: "trace-plugin-a",
					version: "0",
					build: {
						buildConfig: {
							outdir: `${TEMP_DIR}/build-debug-trace`,
							plugins: [createTrackedTextPlugin("trace-a", executionOrder)],
						},
					},
				},
				{
					name: "trace-plugin-b",
					version: "0",
					build: {
						buildConfig: {
							plugins: [createTrackedTextPlugin("trace-b", executionOrder)],
						},
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		builder.startDebugSession({ watch: true, includeTextSnapshots: true });

		const result = await builder.build();

		expect(result.success).toBeTrue();

		const session = builder.getDebugSession() as BuildTraceSession;
		const build = session.builds[0];
		const file = build?.files[0];

		expect(session.buildList).toHaveLength(1);
		expect(build?.status).toBe("success");
		expect(file?.steps.map((step) => [step.kind, step.pluginName])).toEqual([
			["source", undefined],
			["onLoad", "trace-a"],
			["onLoad", "trace-b"],
			["finally", "trace-a"],
			["finally", "trace-b"],
			["final-output", undefined],
		]);
		expect(file?.finalSnapshotId).toBeDefined();
		expect(build?.snapshots[file?.finalSnapshotId as string]?.text).toContain(
			"[trace-b:final]",
		);
	});

	test("should trace declared virtual module source and chained transforms", async () => {
		const entrypoint = join(TEMP_DIR, "virtual-entry.ts");
		writeFileSync(
			entrypoint,
			`import { value } from "@test/debug-virtual"; console.log(value);`,
		);
		const fmConfig: FrameMasterConfig = {
			HTTPServer: { port: 3000 },
			pluginsOptions: { entrypoints: [entrypoint] },
			plugins: [
				{
					name: "debug-virtual-provider",
					version: "0",
					virtualModules: {
						"@test/debug-virtual": {
							contents: `export const value = "declared";`,
							loader: "ts",
							injectRuntime: false,
						},
					},
				},
				{
					name: "debug-virtual-transformer",
					version: "0",
					build: {
						buildConfig: {
							outdir: `${TEMP_DIR}/build-debug-virtual`,
							plugins: [
								{
									name: "debug-virtual-transform",
									setup(build) {
										build.onLoad({ filter: /^@test\/debug-virtual$/ }, (args) => ({
											contents: `${args.__chainedContents}\nexport const transformed = true;`,
											loader: "ts",
										}));
									},
								},
							],
						},
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		builder.startDebugSession({ watch: false, includeTextSnapshots: true });

		const result = await builder.build();
		const build = builder.getDebugSession()?.builds[0];
		const virtualFile = build?.files.find(
			(file) => file.path === "@test/debug-virtual",
		);

		expect(result.success).toBeTrue();
		expect(virtualFile?.namespace).toBe("frame-master-virtual-module");
		expect(virtualFile?.steps.map((step) => [step.kind, step.pluginName])).toEqual([
			["source", undefined],
			["onLoad", "frame-master-virtual-modules"],
			["onLoad", "debug-virtual-transform"],
			["final-output", undefined],
		]);
		expect(
			build?.snapshots[virtualFile?.initialSnapshotId as string]?.text,
		).toBe(`export const value = "declared";`);
		expect(
			build?.snapshots[virtualFile?.finalSnapshotId as string]?.text,
		).toContain("export const transformed = true;");
	});

	test("should trace resolved virtual module factory source", async () => {
		const entrypoint = join(TEMP_DIR, "virtual-factory-entry.ts");
		writeFileSync(
			entrypoint,
			`import { value } from "@test/debug-virtual-factory"; console.log(value);`,
		);
		const fmConfig: FrameMasterConfig = {
			HTTPServer: { port: 3000 },
			pluginsOptions: { entrypoints: [entrypoint] },
			plugins: [
				{
					name: "debug-virtual-factory-provider",
					version: "0",
					virtualModules: {
						"@test/debug-virtual-factory": {
							contents: () => `export const value = "from-factory";`,
							loader: "ts",
							injectRuntime: false,
						},
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		builder.startDebugSession({ watch: false, includeTextSnapshots: true });

		const result = await builder.build();
		const build = builder.getDebugSession()?.builds[0];
		const virtualFile = build?.files.find(
			(file) => file.path === "@test/debug-virtual-factory",
		);

		expect(result.success).toBeTrue();
		expect(virtualFile?.namespace).toBe("frame-master-virtual-module");
		expect(
			build?.snapshots[virtualFile?.initialSnapshotId as string]?.text,
		).toBe(`export const value = "from-factory";`);
	});

	test("should disable text snapshots by default in debug sessions", async () => {
		const executionOrder: string[] = [];
		const fmConfig: FrameMasterConfig = {
			HTTPServer: {
				port: 3000,
			},
			pluginsOptions: {
				entrypoints: [TEXT_ENTRYPOINT],
			},
			plugins: [
				{
					name: "trace-plugin-default-text-off",
					version: "0",
					build: {
						buildConfig: {
							outdir: `${TEMP_DIR}/build-debug-trace-default`,
							plugins: [
								createTrackedTextPlugin(
									"trace-default-text-off",
									executionOrder,
								),
							],
						},
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		builder.startDebugSession({ watch: true });

		const result = await builder.build();

		expect(result.success).toBeTrue();

		const session = builder.getDebugSession() as BuildTraceSession;
		const build = session.builds[0];
		const file = build?.files[0];

		expect(session.options.includeTextSnapshots).toBe(false);
		expect(file?.finalSnapshotId).toBeDefined();
		expect(
			build?.snapshots[file?.finalSnapshotId as string]?.text,
		).toBeUndefined();
	});

	test("should deduplicate identical snapshots within a debug build", () => {
		const store = new BuildTraceSessionStore({
			watch: false,
			includeTextSnapshots: true,
		});

		store.startBuild([TEXT_ENTRYPOINT]);
		store.record({
			kind: "source-read",
			path: TEXT_ENTRYPOINT,
			contents: "stable contents",
			loader: "text",
		});
		store.record({
			kind: "transform-start",
			pluginName: "dedupe-plugin",
			order: 1,
			path: TEXT_ENTRYPOINT,
			contents: "stable contents",
			loader: "text",
		});
		store.record({
			kind: "transform-complete",
			pluginName: "dedupe-plugin",
			order: 1,
			path: TEXT_ENTRYPOINT,
			contents: "stable contents",
			loader: "text",
			durationMs: 1,
		});
		store.record({
			kind: "final-output",
			path: TEXT_ENTRYPOINT,
			contents: "stable contents",
			loader: "text",
		});

		const build = store.completeBuild({ success: true, outputCount: 1 });
		const file = build?.files[0];
		const snapshotIds = new Set(
			[
				file?.initialSnapshotId,
				file?.finalSnapshotId,
				...(file?.steps.flatMap((step) => [
					step.beforeSnapshotId,
					step.afterSnapshotId,
				]) ?? []),
			].filter((snapshotId): snapshotId is string => Boolean(snapshotId)),
		);

		expect(build).not.toBeNull();
		expect(Object.keys(build?.snapshots ?? {})).toHaveLength(1);
		expect(snapshotIds.size).toBe(1);
		expect(build?.snapshots[file?.finalSnapshotId as string]?.text).toBe(
			"stable contents",
		);
	});

	test("should keep a navigable debug build list across multiple builds", async () => {
		const executionOrder: string[] = [];
		const fmConfig: FrameMasterConfig = {
			HTTPServer: {
				port: 3000,
			},
			pluginsOptions: {
				entrypoints: [TEXT_ENTRYPOINT],
			},
			plugins: [
				{
					name: "trace-plugin",
					version: "0",
					build: {
						buildConfig: {
							outdir: `${TEMP_DIR}/build-debug-watch`,
							plugins: [createTrackedTextPlugin("trace-watch", executionOrder)],
						},
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		builder.startDebugSession({ watch: true });

		const first = await builder.build();
		writeFileSync(TEXT_ENTRYPOINT, "builder input changed");
		const second = await builder.build();

		expect(first.success).toBeTrue();
		expect(second.success).toBeTrue();

		const buildList = builder.listDebugBuilds();
		const session = builder.getDebugSession() as BuildTraceSession;

		expect(buildList).toHaveLength(2);
		expect(buildList[0]?.sequence).toBe(2);
		expect(buildList[1]?.sequence).toBe(1);
		expect(buildList[0]?.fileCount).toBeGreaterThan(0);
		expect(session.builds).toHaveLength(2);
		expect(
			session.builds[1]?.files[0]?.steps.at(-1)?.afterSnapshotId,
		).toBeDefined();
	});

	test("should chain finally hooks across multiple static build plugins", async () => {
		const executionOrder: string[] = [];
		const fmConfig: FrameMasterConfig = {
			HTTPServer: {
				port: 3000,
			},
			pluginsOptions: {
				entrypoints: [TEXT_ENTRYPOINT],
			},
			plugins: [
				{
					name: "static-plugin-a",
					version: "0",
					build: {
						buildConfig: {
							outdir: `${TEMP_DIR}/build-static-finally-chain`,
							plugins: [
								createTrackedTextPlugin(
									"static-build-plugin-a",
									executionOrder,
								),
							],
						},
					},
				},
				{
					name: "static-plugin-b",
					version: "0",
					build: {
						buildConfig: {
							plugins: [
								createTrackedTextPlugin(
									"static-build-plugin-b",
									executionOrder,
								),
							],
						},
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		const result = await builder.build();

		expect(result.success).toBeTrue();
		expect(executionOrder).toEqual([
			"static-build-plugin-a:onLoad",
			"static-build-plugin-b:onLoad",
			"static-build-plugin-a:finally",
			"static-build-plugin-b:finally",
		]);
	});

	test("should chain finally-only build plugins after transformed output", async () => {
		const executionOrder: string[] = [];
		const fmConfig: FrameMasterConfig = {
			HTTPServer: {
				port: 3000,
			},
			pluginsOptions: {
				entrypoints: [TEXT_ENTRYPOINT],
			},
			plugins: [
				{
					name: "producer-plugin",
					version: "0",
					build: {
						buildConfig: {
							outdir: `${TEMP_DIR}/build-finally-only-chain`,
							plugins: [
								createTrackedTextPlugin(
									"producer-build-plugin",
									executionOrder,
								),
							],
						},
					},
				},
				{
					name: "finally-only-plugin",
					version: "0",
					build: {
						buildConfig: {
							plugins: [
								createFinallyOnlyTextPlugin(
									"final-pass-build-plugin",
									executionOrder,
								),
							],
						},
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		const result = await builder.build();

		expect(result.success).toBeTrue();
		expect(executionOrder).toEqual([
			"producer-build-plugin:onLoad",
			"producer-build-plugin:finally",
			"final-pass-build-plugin:finally",
		]);
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
			outEntrypoints.some((c) => c.path.endsWith(join("/index.html"))),
		).toBeTruthy();
	});
	test("should set outdir to .frame-master/build if not set by the user", async () => {
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
							files: {
								"/index.html": "Hello World",
							},
						}),
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		const newConfig = await builder.createConfigs();
		expect(newConfig.outdir).toBe(".frame-master/build");
	});
	test("should use the outdir set by the user", async () => {
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
							outdir: `${TEMP_DIR}/custom-build`,
							files: {
								"/index.html": "Hello World",
							},
						}),
					},
				},
			],
		};

		const builder = await createBuilder(fmConfig, new PluginLoader(fmConfig));
		const newConfig = await builder.createConfigs();
		expect(newConfig.outdir).toBe(`${TEMP_DIR}/custom-build`);
	});
});
