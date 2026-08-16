import type { FrameMasterConfig } from "../server/type";
import type { PluginLoader } from "../plugins/plugin-loader";
import type { BuildOptionsPlugin } from "../plugins/types";
import type { Builder } from "./index";

export type BuildPipeline = {
	id: string;
	label: string;
	pluginNames: string[];
	setBuildConfig(pluginName: string, config: BuildOptionsPlugin): void;
	getBuilder(pluginName?: string): Promise<Builder>;
	initialize(): Promise<void>;
};

class CoreBuildPipeline implements BuildPipeline {
	readonly pluginNames: string[];
	private configs: BuildOptionsPlugin[];
	private builder: Builder | null = null;
	private readonly builderPromise: Promise<Builder>;
	private resolveBuilder!: (builder: Builder) => void;

	constructor(
		readonly id: string,
		readonly label: string,
		plugins: FrameMasterConfig["plugins"],
		private config: FrameMasterConfig,
		private pluginLoader: PluginLoader,
	) {
		this.pluginNames = plugins.map((plugin) => plugin.name);
		this.configs = plugins.flatMap((plugin) => (plugin.build ? [plugin.build] : []));
		this.builderPromise = new Promise((resolve) => {
			this.resolveBuilder = resolve;
		});
	}

	setBuildConfig(pluginName: string, config: BuildOptionsPlugin): void {
		if (!this.pluginNames.includes(pluginName)) {
			throw new Error(`Plugin "${pluginName}" is not in build pipeline "${this.id}".`);
		}
		this.configs.push(config);
	}

	getBuilder(pluginName?: string): Promise<Builder> {
		if (pluginName && !this.pluginNames.includes(pluginName)) {
			return Promise.reject(new Error(`Plugin "${pluginName}" is not in build pipeline "${this.id}".`));
		}
		return this.builder ? Promise.resolve(this.builder) : this.builderPromise;
	}

	async initialize(): Promise<void> {
		if (this.builder) return;
		const { Builder } = await import("./index");
		this.builder = await Builder.createBuilder({
			buildConfigs: this.configs,
			enableLogging: this.configs.some((entry) => entry.enableLoging),
			baseEntrypoints: this.config.pluginsOptions?.entrypoints,
			disableOnLoadChaining: this.config.pluginsOptions?.disableOnLoadChaining,
			virtualModulePlugin: this.pluginLoader.getVirtualModuleRegistry().createPlugin(),
		});
		this.resolveBuilder(this.builder);
	}
}

let pipelines = new Map<string, CoreBuildPipeline>();

export async function configureBuildPipelines(config: FrameMasterConfig, pluginLoader: PluginLoader): Promise<void> {
	pipelines = new Map();
	for (const pipeline of config.debugUIOptions?.pipelines ?? []) {
		if (pipelines.has(pipeline.id)) throw new Error(`Duplicate debug build pipeline: ${pipeline.id}`);
		pipelines.set(pipeline.id, new CoreBuildPipeline(pipeline.id, pipeline.label ?? pipeline.id, pipeline.plugins, config, pluginLoader));
	}
	const { getGlobalPluginContext, setGlobalPluginContext } = await import("../plugins/utils");
	const legacy = getGlobalPluginContext("build-unifier") ?? {};
	if (!config.debugUIOptions?.pipelines.length) return;
	setGlobalPluginContext("build-unifier", {
		...legacy,
		setBuildConfig(pluginName, buildConfig) {
			const pipeline = [...pipelines.values()].find((entry) => entry.pluginNames.includes(pluginName));
			if (!pipeline) throw new Error(`No debug build pipeline found for plugin: ${pluginName}`);
			pipeline.setBuildConfig(pluginName, buildConfig);
		},
		getBuilder(pluginName) {
			const pipeline = [...pipelines.values()].find((entry) => entry.pluginNames.includes(pluginName));
			if (!pipeline) return Promise.reject(new Error(`No debug build pipeline found for plugin: ${pluginName}`));
			return pipeline.getBuilder(pluginName);
		},
	});
}

export function getBuildPipeline(id: string): BuildPipeline {
	const pipeline = pipelines.get(id);
	if (!pipeline) throw new Error(`Unknown debug build pipeline: ${id}`);
	return pipeline;
}

export function getBuildPipelines(): BuildPipeline[] {
	return [...pipelines.values()];
}

export async function initializeBuildPipelines(): Promise<void> {
	await Promise.all(getBuildPipelines().map((pipeline) => pipeline.initialize()));
}
