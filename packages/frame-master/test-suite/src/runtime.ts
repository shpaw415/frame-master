import { chainPlugins } from "frame-master/plugin";
import type { FrameMasterPlugin } from "frame-master/plugin/types";

/**
 * Register runtime Bun plugins declared by the supplied Frame-Master plugins.
 * Call this before importing a module that depends on a runtime plugin.
 */
export async function loadRuntimePluginFromPlugins(
	plugins: FrameMasterPlugin[],
): Promise<void> {
	const runtimePlugins = plugins.flatMap(
		(plugin) => plugin.runtimePlugins ?? [],
	);

	if (runtimePlugins.length === 0) return;

	await Bun.plugin(
		chainPlugins(runtimePlugins, { suffix: "test-suite-runtime" }),
	);
}
