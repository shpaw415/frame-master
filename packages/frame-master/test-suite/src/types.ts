import type { Builder } from "frame-master/build";
import type { PluginLoader } from "frame-master/plugin";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import type { masterRequest } from "frame-master/server/request";
import type { FrameMasterConfig } from "frame-master/server/types";

/**
 * Options for {@link createPluginTestEnv}.
 */
export type CreatePluginTestEnvOptions = {
	/**
	 * Plugins under test (and any dependencies).
	 */
	plugins: FrameMasterPlugin[];
	/**
	 * Partial config merged over the test defaults.
	 * `HTTPServer.port` defaults to `0` (ephemeral).
	 */
	config?: Partial<Omit<FrameMasterConfig, "plugins" | "HTTPServer">> & {
		HTTPServer?: Partial<FrameMasterConfig["HTTPServer"]>;
		plugins?: FrameMasterPlugin[];
	};
	/**
	 * Working directory for relative paths / fixtures.
	 * Defaults to `process.cwd()`.
	 */
	cwd?: string;
	/**
	 * Start the HTTP server during env creation.
	 * @default true
	 */
	startServer?: boolean;
	/**
	 * Run `createContext` hooks after loader/builder init.
	 * @default true
	 */
	runCreateContext?: boolean;
	/**
	 * Run `serverStart` main (+ dev_main when not production) hooks.
	 * @default true
	 */
	runServerStart?: boolean;
	/**
	 * Run `serverStop` during {@link PluginTestEnv.dispose}.
	 * @default true
	 */
	runServerStop?: boolean;
};

export type HandleRequestResult = {
	response: Response;
	master: masterRequest;
};

export type PluginTestEnvBuildOptions = {
	/**
	 * Entrypoints for this build (absolute or relative to cwd).
	 */
	entrypoints?: string[];
	/**
	 * Extra partial Bun build config merged for this call only
	 * (via a temporary dynamic buildConfig on the builder).
	 * Prefer plugin `build.buildConfig` for real plugin tests.
	 */
	buildConfig?: Partial<Bun.BuildConfig>;
};

/**
 * Isolated environment for testing Frame-Master plugins.
 */
export type PluginTestEnv = {
	readonly config: FrameMasterConfig;
	readonly pluginLoader: PluginLoader;
	readonly builder: Builder;
	/** Live server when started; null if `startServer: false` or after dispose. */
	readonly server: Bun.Server<unknown> | null;
	/** Base URL of the live server (e.g. `http://127.0.0.1:54321`). */
	readonly baseUrl: string | null;
	readonly cwd: string;

	/**
	 * HTTP fetch against the env server.
	 * Starts the server on first use if it was not started yet.
	 */
	fetch: (path: string, init?: RequestInit) => Promise<Response>;

	/**
	 * Run the request pipeline without a network hop.
	 */
	handleRequest: (request: Request) => Promise<HandleRequestResult>;

	/**
	 * Run the unified build pipeline for this env's plugins.
	 */
	build: (options?: PluginTestEnvBuildOptions) => Promise<Bun.BuildOutput>;

	/**
	 * Ensure the HTTP server is running (idempotent).
	 */
	start: () => Promise<void>;

	/**
	 * Stop server and release resources.
	 */
	dispose: () => Promise<void>;
};
