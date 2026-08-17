import { webToken } from "@shpaw415/webtoken";
import { type Builder, createBuilder } from "frame-master/build";
import { setMockConfig } from "frame-master/config";
import { PluginLoader } from "frame-master/plugin";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { createServer } from "frame-master/server";
import { runServerStopHooks } from "frame-master/server/init";
import { masterRequest } from "frame-master/server/request";
import type { FrameMasterConfig } from "frame-master/server/types";
import {
	runCreateContextHooks,
	runServerReadyHooks,
	runServerStartHooks,
} from "./lifecycle";
import type {
	CreatePluginTestEnvOptions,
	HandleRequestResult,
	PluginTestEnv,
	PluginTestEnvBuildOptions,
} from "./types";

function ensureWebTokenSecret(): void {
	if (!process.env.WEB_TOKEN_SECRET) {
		process.env.WEB_TOKEN_SECRET = webToken.generateSecureSecret();
	}
}

function mergeConfig(options: CreatePluginTestEnvOptions): FrameMasterConfig {
	const plugins: FrameMasterPlugin[] =
		options.config?.plugins ?? options.plugins;

	const httpDefaults: FrameMasterConfig["HTTPServer"] = {
		port: 0,
		hostname: "127.0.0.1",
		...(options.config?.HTTPServer ?? {}),
	};

	const { HTTPServer: _ignored, plugins: _p, ...rest } = options.config ?? {};

	return {
		...rest,
		HTTPServer: httpDefaults,
		plugins,
	};
}

function resolveUrl(baseUrl: string, path: string): string {
	if (path.startsWith("http://") || path.startsWith("https://")) {
		return path;
	}
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return new URL(normalized, baseUrl).toString();
}

/**
 * Create an isolated environment for testing Frame-Master plugins.
 *
 * Covers the HTTP server, request pipeline, and unified build pipeline without
 * requiring a project `frame-master.config.ts` on disk.
 *
 * @example
 * ```ts
 * import { createPluginTestEnv } from "frame-master/testing";
 * import myPlugin from "../src";
 *
 * const env = await createPluginTestEnv({
 *   plugins: [myPlugin()],
 * });
 *
 * const res = await env.fetch("/hello");
 * expect(res.status).toBe(200);
 *
 * await env.dispose();
 * ```
 *
 * **Isolation note:** Frame-Master uses process-level singletons (config mock,
 * global plugin context). Prefer one env per test (or dispose between tests)
 * and avoid parallel suites that share process state.
 */
export async function createPluginTestEnv(
	options: CreatePluginTestEnvOptions,
): Promise<PluginTestEnv> {
	ensureWebTokenSecret();

	const cwd = options.cwd ?? process.cwd();
	const config = mergeConfig(options);

	// Make getConfig() work for code paths that read the singleton.
	setMockConfig(config);

	const pluginLoader = new PluginLoader(config);
	const builder = await createBuilder(config, pluginLoader);

	if (options.runCreateContext !== false) {
		await runCreateContextHooks({ config, pluginLoader });
	}
	if (options.runServerStart !== false) {
		await runServerStartHooks({ pluginLoader });
	}

	let server: Bun.Server<unknown> | null = null;
	let dummyServer: Bun.Server<unknown> | null = null;
	let disposed = false;
	const runServerStop = options.runServerStop !== false;

	const getDummyServer = (): Bun.Server<unknown> => {
		if (!dummyServer) {
			dummyServer = Bun.serve({
				port: 0,
				hostname: "127.0.0.1",
				fetch: () => new Response("plugin-test-env dummy"),
			});
		}
		return dummyServer;
	};

	const ensureServer = async (): Promise<Bun.Server<unknown>> => {
		if (server) return server;
		server = createServer({
			config,
			pluginLoader,
			builder,
		});
		await runServerReadyHooks({
			server,
			config,
			pluginLoader,
			builder,
		});
		return server;
	};

	if (options.startServer !== false) {
		await ensureServer();
	}

	const getBaseUrl = (): string | null => {
		if (!server) return null;
		const hostname = server.hostname || "127.0.0.1";
		return `http://${hostname}:${server.port}`;
	};

	const env: PluginTestEnv = {
		config,
		pluginLoader,
		builder,
		get server() {
			return server;
		},
		get baseUrl() {
			return getBaseUrl();
		},
		cwd,

		async start() {
			if (disposed) {
				throw new Error("PluginTestEnv has been disposed");
			}
			await ensureServer();
		},

		async fetch(path: string, init?: RequestInit): Promise<Response> {
			if (disposed) {
				throw new Error("PluginTestEnv has been disposed");
			}
			await ensureServer();
			const base = getBaseUrl();
			if (!base) {
				throw new Error("Server failed to start");
			}
			return fetch(resolveUrl(base, path), init);
		},

		async handleRequest(request: Request): Promise<HandleRequestResult> {
			if (disposed) {
				throw new Error("PluginTestEnv has been disposed");
			}
			const master = new masterRequest({
				request,
				server: (server ?? getDummyServer()) as Bun.Server<undefined>,
				config,
				pluginLoader,
				builder: builder as Builder,
			});
			const response = await master.handleRequest();
			return { response, master };
		},

		async build(
			buildOptions?: PluginTestEnvBuildOptions,
		): Promise<Bun.BuildOutput> {
			if (disposed) {
				throw new Error("PluginTestEnv has been disposed");
			}

			// Optional one-shot config injection for convenience in tests.
			if (buildOptions?.buildConfig) {
				const extra = buildOptions.buildConfig;
				builder.configs.push({
					buildConfig: () => extra,
				});
			}

			const entrypoints = buildOptions?.entrypoints;
			if (entrypoints && entrypoints.length > 0) {
				return builder.build(...entrypoints);
			}
			return builder.build();
		},

		async dispose() {
			if (disposed) return;
			disposed = true;
			if (runServerStop) {
				await runServerStopHooks({
					reason: "dispose",
					server,
					config,
					pluginLoader,
					builder,
				});
			}
			try {
				server?.stop(true);
			} catch {
				// ignore
			}
			server = null;
			try {
				dummyServer?.stop(true);
			} catch {
				// ignore
			}
			dummyServer = null;
		},
	};

	return env;
}
