import type { FrameMasterConfig } from "../server/type";
import type { PluginLoader } from "../plugins/plugin-loader";
import {
	getGlobalPluginContext,
	setGlobalPluginContext,
} from "../plugins/global-context";
import type {
	BuildOptionsPlugin,
	FrameMasterPlugin,
	PluginGlobalContext,
} from "../plugins/types";
import type { Builder } from "./index";

export interface BuildPipelinePluginMap {}

export type BuildPipeline<PluginName extends string = string> = {
	id: string;
	label: string;
	pluginNames: PluginName[];
	setBuildConfig(pluginName: PluginName, config: BuildOptionsPlugin): void;
	getBuilder(pluginName?: PluginName): Promise<Builder>;
	initialize(): Promise<void>;
};

export type BuildUnifierOptions = {
	plugins: FrameMasterPlugin[];
	logging?: boolean;
	id?: string;
	label?: string;
};

export type BuildPipelineOptions = BuildUnifierOptions & {
	id: string;
};

export type BuildUnifierContext = PluginGlobalContext<"build-unifier">;

type LeftoverUnifierContext = BuildUnifierContext &
	Partial<{
		_id_list: Map<string, string>;
		setBuildConfig: (pluginName: string, config: BuildOptionsPlugin) => void;
		getBuilder: (pluginName: string) => Promise<Builder>;
	}>;

let unifierIndex = 0;
let pipelines = new Map<string, CoreBuildPipeline>();
let contextBound = false;
let leftoverSetBuildConfig:
	| ((pluginName: string, config: BuildOptionsPlugin) => void)
	| undefined;
let leftoverGetBuilder:
	| ((pluginName: string) => Promise<Builder>)
	| undefined;
let leftoverIdList: Map<string, string> | undefined;

function pluginNameList(plugins: FrameMasterPlugin[]): string[] {
	return plugins.map((plugin) => plugin.name);
}

function leftoverContext(): LeftoverUnifierContext | undefined {
	return getGlobalPluginContext("build-unifier") as
		| LeftoverUnifierContext
		| undefined;
}

function currentLeftoverIdList(): Map<string, string> | undefined {
	return leftoverIdList ?? leftoverContext()?._id_list;
}

function leftoverOwns(pluginName: string): boolean {
	return currentLeftoverIdList()?.has(pluginName) === true;
}

function findCorePipeline(pluginName: string): CoreBuildPipeline | undefined {
	return [...pipelines.values()].find((entry) =>
		entry.pluginNames.includes(pluginName),
	);
}

function notWrappedError(pluginName: string): Error {
	return new Error(`Plugin "${pluginName}" is not wrapped by BuildUnifier.`);
}

function alreadyWrappedError(pluginName: string, pipelineLabel: string): Error {
	return new Error(
		`Plugin "${pluginName}" is already in build pipeline "${pipelineLabel}".`,
	);
}

function captureLeftoverApi(existing: LeftoverUnifierContext | undefined): void {
	if (leftoverIdList || !existing?._id_list) return;
	leftoverIdList = existing._id_list;
	leftoverSetBuildConfig = existing.setBuildConfig;
	leftoverGetBuilder = existing.getBuilder;
}

function leftoverPipelineFor(pluginName: string): BuildPipeline | undefined {
	const idList = currentLeftoverIdList();
	const builderId = idList?.get(pluginName);
	if (!idList || !builderId) return undefined;
	const pluginNames = [...idList.entries()]
		.filter(([, id]) => id === builderId)
		.map(([name]) => name);
	return {
		id: "build-unifier",
		label: "build-unifier",
		pluginNames,
		setBuildConfig(name, config) {
			const pipeline = findCorePipeline(name);
			if (pipeline) {
				pipeline.setBuildConfig(name, config);
				return;
			}
			if (leftoverOwns(name) && leftoverSetBuildConfig) {
				leftoverSetBuildConfig(name, config);
				return;
			}
			throw notWrappedError(name);
		},
		getBuilder(name) {
			const key = name ?? pluginName;
			const pipeline = findCorePipeline(key);
			if (pipeline) return pipeline.getBuilder(key);
			if (leftoverOwns(key) && leftoverGetBuilder) {
				return leftoverGetBuilder(key);
			}
			return Promise.reject(notWrappedError(key));
		},
		async initialize() {},
	};
}

function ensureUnifierContext(): void {
	const existing = leftoverContext();
	captureLeftoverApi(existing);
	if (contextBound && existing?.setBuildConfig && existing?.getBuilder) return;
	const leftover = existing ?? {};
	setGlobalPluginContext("build-unifier", {
		...leftover,
		setBuildConfig(pluginName, buildConfig) {
			const pipeline = findCorePipeline(pluginName);
			if (pipeline) {
				pipeline.setBuildConfig(pluginName, buildConfig);
				return;
			}
			if (leftoverOwns(pluginName) && leftoverSetBuildConfig) {
				leftoverSetBuildConfig(pluginName, buildConfig);
				return;
			}
			throw notWrappedError(pluginName);
		},
		getBuilder(pluginName) {
			const pipeline = findCorePipeline(pluginName);
			if (pipeline) return pipeline.getBuilder(pluginName);
			if (leftoverOwns(pluginName) && leftoverGetBuilder) {
				return leftoverGetBuilder(pluginName);
			}
			return Promise.reject(notWrappedError(pluginName));
		},
	});
	contextBound = true;
}

function assertPluginNamesAvailable(
	pluginNames: string[],
	pipelineLabel: string,
): void {
	const seen = new Set<string>();
	for (const pluginName of pluginNames) {
		if (seen.has(pluginName)) {
			throw alreadyWrappedError(pluginName, pipelineLabel);
		}
		seen.add(pluginName);
		const owner = findCorePipeline(pluginName);
		if (owner) {
			throw alreadyWrappedError(pluginName, owner.label);
		}
		if (leftoverOwns(pluginName)) {
			throw alreadyWrappedError(pluginName, "build-unifier");
		}
	}
}

function assertNoLeftoverCoreOverlap(): void {
	const idList = currentLeftoverIdList();
	if (!idList) return;
	for (const pipeline of pipelines.values()) {
		for (const pluginName of pipeline.pluginNames) {
			if (idList.has(pluginName)) {
				throw alreadyWrappedError(pluginName, "build-unifier");
			}
		}
	}
}

function registerPipeline(
	id: string,
	label: string,
	pluginNames: string[],
	logging?: boolean,
): CoreBuildPipeline {
	captureLeftoverApi(leftoverContext());
	if (pipelines.has(id)) {
		throw new Error(`Duplicate build pipeline: ${id}`);
	}
	assertPluginNamesAvailable(pluginNames, label);
	const pipeline = new CoreBuildPipeline(id, label, pluginNames, logging);
	pipelines.set(id, pipeline);
	ensureUnifierContext();
	return pipeline;
}

/**
 * Group plugins into an isolated builder bucket, the same contract as
 * `frame-master-plugin-build-unifier`. Each bucket is listed in
 * `frame-master debug build` next to the default global builder.
 */
export function BuildUnifier(options: BuildUnifierOptions): FrameMasterPlugin[] {
	if (options.plugins.length === 0) {
		throw new Error("A build pipeline must contain at least one plugin.");
	}
	const pluginNames = pluginNameList(options.plugins);
	const id = options.id ?? `unifier-${unifierIndex}`;
	const label = options.label ?? `Build pipeline ${unifierIndex + 1}`;
	unifierIndex += 1;
	registerPipeline(id, label, pluginNames, options.logging);
	const highestPriority = Math.max(
		...options.plugins.map((plugin) => plugin.priority ?? 0),
	);
	const pipeline = pipelines.get(id);
	if (!pipeline) {
		throw new Error(`Failed to register build pipeline: ${id}`);
	}
	return [
		...options.plugins,
		{
			name: `frame-master-build-unifier:${id}`,
			version: "1.0.0",
			priority: highestPriority + 1,
			debugUIOptions: {
				pipeline: { id, label, plugins: pluginNames },
			},
			serverStart: {
				async main() {
					await pipeline.initialize();
				},
			},
			build: {
				async beforeBuild(_buildConfig, parentBuilder) {
					if (process.env.BUILD_MODE !== "true") return;
					await pipeline.initialize();
					const builder = await pipeline.getBuilder();
					if (!builder.isBuilding()) {
						const result = await builder.build();
						if (!result.success) {
							if (parentBuilder.getDebugSession()) {
								console.error(`Build pipeline "${label}" failed`);
								return;
							}
							throw new Error(`Build pipeline "${label}" failed`, {
								cause: result.logs,
							});
						}
					}
				},
			},
		},
	];
}

/**
 * @deprecated Use `BuildUnifier()` from `frame-master/plugin`.
 */
export function buildPipeline(options: BuildPipelineOptions): FrameMasterPlugin[] {
	return BuildUnifier(options);
}

class CoreBuildPipeline implements BuildPipeline {
	private configs: BuildOptionsPlugin[] = [];
	private builder: Builder | null = null;
	private readonly builderPromise: Promise<Builder>;
	private resolveBuilder!: (builder: Builder) => void;
	private rejectBuilder!: (reason?: unknown) => void;
	private config: FrameMasterConfig | null = null;
	private pluginLoader: PluginLoader | null = null;

	constructor(
		readonly id: string,
		readonly label: string,
		readonly pluginNames: string[],
		private logging?: boolean,
	) {
		this.builderPromise = new Promise((resolve, reject) => {
			this.resolveBuilder = resolve;
			this.rejectBuilder = reject;
		});
	}

	attach(config: FrameMasterConfig, pluginLoader: PluginLoader): void {
		this.config = config;
		this.pluginLoader = pluginLoader;
	}

	setBuildConfig(pluginName: string, config: BuildOptionsPlugin): void {
		if (!this.pluginNames.includes(pluginName)) {
			throw new Error(
				`Plugin "${pluginName}" is not in build pipeline "${this.label}".`,
			);
		}
		this.configs.push(config);
	}

	getBuilder(pluginName?: string): Promise<Builder> {
		if (pluginName && !this.pluginNames.includes(pluginName)) {
			return Promise.reject(
				new Error(
					`Plugin "${pluginName}" is not in build pipeline "${this.label}".`,
				),
			);
		}
		return this.builder ? Promise.resolve(this.builder) : this.builderPromise;
	}

	async initialize(): Promise<void> {
		if (this.builder) return;
		const config =
			this.config ?? (await import("../server/config")).getConfig();
		const pluginLoader =
			this.pluginLoader ??
			(await import("../plugins/plugin-loader")).pluginLoader;
		if (!config || !pluginLoader) {
			throw new Error(
				`Cannot initialize build pipeline "${this.label}": Frame-Master config or plugin loader is not ready.`,
			);
		}
		this.config = config;
		this.pluginLoader = pluginLoader;
		try {
			const { Builder } = await import("./index");
			const virtualModuleRegistry = pluginLoader.getVirtualModuleRegistry();
			this.builder = await Builder.createBuilder({
				buildConfigs: this.configs,
				enableLogging:
					this.logging ?? this.configs.some((entry) => entry.enableLoging),
				baseEntrypoints: config.pluginsOptions?.entrypoints,
				disableOnLoadChaining: config.pluginsOptions?.disableOnLoadChaining,
				virtualModulePlugin: virtualModuleRegistry.createPlugin(),
				virtualModuleRegistry,
			});
			this.resolveBuilder(this.builder);
		} catch (error) {
			this.rejectBuilder(error);
			throw error;
		}
	}
}

export function resetBuildPipelines(): void {
	pipelines = new Map();
	unifierIndex = 0;
	contextBound = false;
	leftoverSetBuildConfig = undefined;
	leftoverGetBuilder = undefined;
	leftoverIdList = undefined;
}

export async function configureBuildPipelines(
	config: FrameMasterConfig,
	pluginLoader: PluginLoader,
): Promise<void> {
	for (const pipeline of pipelines.values()) {
		pipeline.attach(config, pluginLoader);
	}
	for (const entry of pluginLoader.getPluginByName("debugUIOptions")) {
		const meta = entry.pluginParent.pipeline;
		if (!meta || pipelines.has(meta.id)) continue;
		registerPipeline(meta.id, meta.label ?? meta.id, meta.plugins).attach(
			config,
			pluginLoader,
		);
	}
	ensureUnifierContext();
	assertNoLeftoverCoreOverlap();
}

export function getBuildPipeline<K extends keyof BuildPipelinePluginMap>(
	pluginName: K,
): BuildPipeline;
export function getBuildPipeline(pluginName: string): BuildPipeline;
export function getBuildPipeline(pluginName: string): BuildPipeline {
	ensureUnifierContext();
	const pipeline = findCorePipeline(pluginName);
	if (pipeline) return pipeline;
	const leftover = leftoverPipelineFor(pluginName);
	if (leftover) return leftover;
	throw notWrappedError(pluginName);
}

export function getBuildUnifierContext(): BuildUnifierContext | undefined {
	ensureUnifierContext();
	return getGlobalPluginContext("build-unifier");
}

export function getBuildPipelines(): BuildPipeline[] {
	return [...pipelines.values()];
}

export async function initializeBuildPipelines(): Promise<void> {
	await Promise.all(getBuildPipelines().map((pipeline) => pipeline.initialize()));
}
