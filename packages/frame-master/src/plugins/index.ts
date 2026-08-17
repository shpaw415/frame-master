export * from "./plugin-chaining";
export * from "./plugin-loader";
export * from "./types";
export * from "./utils";
export * from "./virtual-modules";
export {
	BuildUnifier,
	buildPipeline,
	getBuildPipeline,
	getBuildPipelines,
	type BuildPipeline,
	type BuildPipelineOptions,
	type BuildPipelinePluginMap,
	type BuildUnifierOptions,
} from "../build/pipelines";

// Type augmentation for Bun's OnLoadArgs - makes __chainedContents globally available
import "./bun-plugin-chaining.d.ts";
