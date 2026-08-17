import { getConfig } from "../server/config";
import type { FrameMasterConfig } from "../server/type";
import type { PluginLoader } from "../plugins/plugin-loader";
import type {
	BuildOptionsPlugin,
	FrameMasterPlugin,
	PluginGlobalContext,
} from "../plugins/types";
import { getGlobalPluginContext, setGlobalPluginContext } from "../plugins/utils";
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

let unifierIndex = 0;
let pipelines = new Map<string, CoreBuildPipeline>();
let contextBound = false;

function pluginNameList(plugins: FrameMasterPlugin[]): string[] {
	return plugins.map((plugin) => plugin.name);
}

function ensureUnifierContext(): void {
	const existing = getGlobalPluginContext("build-unifier");
	if (contextBound && existing?.setBuildConfig && existing?.getBuilder) return;
	const legacy = existing ?? {};
	setGlobalPluginContext("build-unifier", {
		...legacy,
		setBuildConfig(pluginName, buildConfig) {
			const pipeline = [...pipelines.values()].find((entry) =>
				entry.pluginNames.includes(pluginName),
			);
			if (!pipeline) {
				throw new Error(`No build pipeline found for plugin: ${pluginName}`);
			}
			pipeline.setBuildConfig(pluginName, buildConfig);
		},
		getBuilder(pluginName) {
			const pipeline = [...pipelines.values()].find((entry) =>
				entry.pluginNames.includes(pluginName),
			);
			if (!pipeline) {
				return Promise.reject(
					new Error(`No build pipeline found for plugin: ${pluginName}`),
				);
			}
			return pipeline.getBuilder(pluginName);
		},
	});
	contextBound = true;
}

function registerPipeline(
	id: string,
	label: string,
	pluginNames: string[],
	logging?: boolean,
): CoreBuildPipeline {
	if (pipelines.has(id)) {
		throw new Error(`Duplicate build pipeline: ${id}`);
	}
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
	const label = options.label ?? id;
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
				async beforeBuild() {
					if (process.env.BUILD_MODE !== "true") return;
					await pipeline.initialize();
					const builder = await pipeline.getBuilder();
					if (!builder.isBuilding()) {
						const result = await builder.build();
						if (!result.success) {
							throw new Error(
								`Build pipeline "${id}" failed`,
								{ cause: result.logs },
							);
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
				`Plugin "${pluginName}" is not in build pipeline "${this.id}".`,
			);
		}
		this.configs.push(config);
	}

	getBuilder(pluginName?: string): Promise<Builder> {
		if (pluginName && !this.pluginNames.includes(pluginName)) {
			return Promise.reject(
				new Error(
					`Plugin "${pluginName}" is not in build pipeline "${this.id}".`,
				),
			);
		}
		return this.builder ? Promise.resolve(this.builder) : this.builderPromise;
	}

	async initialize(): Promise<void> {
		if (this.builder) return;
		const config = this.config ?? getConfig();
		const pluginLoader =
			this.pluginLoader ??
			(await import("../plugins/plugin-loader")).pluginLoader;
		if (!config || !pluginLoader) {
			throw new Error(
				`Cannot initialize build pipeline "${this.id}": Frame-Master config or plugin loader is not ready.`,
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
}

export function getBuildPipeline<K extends keyof BuildPipelinePluginMap>(
	id: K,
): BuildPipeline<BuildPipelinePluginMap[K] & string>;
export function getBuildPipeline(id: string): BuildPipeline;
export function getBuildPipeline(id: string): BuildPipeline {
	const pipeline = pipelines.get(id);
	if (!pipeline) throw new Error(`Unknown build pipeline: ${id}`);
	return pipeline;
}

export function getBuildUnifierContext(): BuildUnifierContext | undefined;
export function getBuildUnifierContext<K extends keyof BuildPipelinePluginMap>(
	pipelineId: K,
): BuildPipeline<BuildPipelinePluginMap[K] & string>;
export function getBuildUnifierContext(pipelineId: string): BuildPipeline;
export function getBuildUnifierContext(pipelineId?: string) {
	if (pipelineId === undefined) {
		ensureUnifierContext();
		return getGlobalPluginContext("build-unifier");
	}
	return getBuildPipeline(pipelineId);
}

export function getBuildPipelines(): BuildPipeline[] {
	return [...pipelines.values()];
}

export async function initializeBuildPipelines(): Promise<void> {
	await Promise.all(getBuildPipelines().map((pipeline) => pipeline.initialize()));
}
