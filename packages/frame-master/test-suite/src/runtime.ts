import { chainPlugins } from "frame-master/plugin";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { releaseBuildPipelines } from "../../src/build/pipelines";

function pipelineReleaseNames(plugins: FrameMasterPlugin[]): string[] {
	const names: string[] = [];
	for (const plugin of plugins) {
		names.push(plugin.name);
		const pipeline = plugin.debugUIOptions?.pipeline;
		if (!pipeline) continue;
		names.push(
			...pipeline.plugins,
			`frame-master-build-unifier:${pipeline.id}`,
		);
	}
	return names;
}

/**
 * Register runtime Bun plugins declared by the supplied Frame-Master plugins.
 * Call this before importing a module that depends on a runtime plugin.
 *
 * Constructing those plugins may register a `BuildUnifier` pipeline. That
 * registration is dropped so the later test path can register the same pipeline.
 */
export async function loadRuntimePluginFromPlugins(
	plugins: FrameMasterPlugin[],
): Promise<void> {
	const runtimePlugins = plugins.flatMap(
		(plugin) => plugin.runtimePlugins ?? [],
	);
	releaseBuildPipelines(pipelineReleaseNames(plugins));

	if (runtimePlugins.length === 0) return;

	await Bun.plugin(
		chainPlugins(runtimePlugins, { suffix: "test-suite-runtime" }),
	);
}
