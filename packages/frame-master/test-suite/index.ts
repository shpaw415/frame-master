/**
 * Frame-Master plugin test suite — public API for plugin authors.
 *
 * @packageDocumentation
 *
 * @example
 * ```ts
 * import { createPluginTestEnv, withTempDir } from "frame-master/testing";
 * import myPlugin from "../src";
 *
 * const env = await createPluginTestEnv({ plugins: [myPlugin()] });
 * const res = await env.fetch("/");
 * await env.dispose();
 * ```
 */

export { createPluginTestEnv } from "./src/create-env";
export { loadRuntimePluginFromPlugins } from "./src/runtime";
export {
	createTempDir,
	removeTempDir,
	withTempDir,
	writeFixture,
} from "./src/fixtures";
export {
	runCreateContextHooks,
	runServerReadyHooks,
	runServerStartHooks,
} from "./src/lifecycle";
export type {
	CreatePluginTestEnvOptions,
	HandleRequestResult,
	PluginTestEnv,
	PluginTestEnvBuildOptions,
} from "./src/types";
