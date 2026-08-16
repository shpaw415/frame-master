import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BunPlugin } from "bun";
import type { FrameMasterConfig } from "frame-master/server/type";
import { createBuilder } from "../src/build";
import {
	configureBuildPipelines,
	getBuildPipeline,
	initializeBuildPipelines,
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
	rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe("builder", () => {
	test("keeps debug UI pipeline fragments isolated and exposes legacy context", async () => {
		const defaultCalls: string[] = [];
		const pipelineCalls: string[] = [];
		const pipelinePlugin = {
			name: "pipeline-plugin",
			version: "1.0.0",
			build: {
				buildConfig: {
					outdir: `${TEMP_DIR}/pipeline`,
					entrypoints: [TEXT_ENTRYPOINT],
					plugins: [{ name: "pipeline-plugin", setup: () => { pipelineCalls.push("pipeline"); } }],
				},
			},
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
				pipelinePlugin,
			],
			debugUIOptions: {
				pipelines: [{ id: "pipeline", label: "Pipeline", plugins: [pipelinePlugin] }],
			},
		};
		const loader = new PluginLoader(config);
		await configureBuildPipelines(config, loader);
		getGlobalPluginContext("build-unifier")?.setBuildConfig?.("pipeline-plugin", {
			beforeBuild: () => { pipelineCalls.push("before"); },
		});
		await initializeBuildPipelines();
		const coreBuilder = await createBuilder(config, loader);
		await coreBuilder.build();
		await (await getBuildPipeline("pipeline").getBuilder("pipeline-plugin")).build();

		expect(defaultCalls).toEqual(["default"]);
		expect(pipelineCalls).toEqual(["pipeline", "before"]);
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
