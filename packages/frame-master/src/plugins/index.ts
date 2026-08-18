export {
	type BuildPipeline,
	type BuildPipelineOptions,
	type BuildPipelinePluginMap,
	BuildUnifier,
	type BuildUnifierContext,
	type BuildUnifierOptions,
	buildPipeline,
	getBuildPipeline,
	getBuildPipelines,
	getBuildUnifierContext,
} from "../build/pipelines";
export * from "./plugin-chaining";
export * from "./plugin-loader";
export * from "./types";
export * from "./utils";
export * from "./virtual-modules";

// Type augmentation for Bun's OnLoadArgs - makes __chainedContents globally available
import "./bun-plugin-chaining.d.ts";
