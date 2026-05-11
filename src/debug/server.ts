import { existsSync, mkdirSync } from "node:fs";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	normalize,
	relative,
	resolve,
} from "node:path";
import chalk from "chalk";
import type { Builder } from "frame-master/build";
import type {
	BuildTraceBuild,
	BuildTraceStoreEvent,
} from "frame-master/build/debug-trace";
import { pluginLoader } from "../../src/plugins";
import { createWatcher, type FileSystemWatcher } from "../../src/server/watch";
import type { DebugBuildMessage, DebugRegistryEntry } from "./types";

type DebugBuildOptions = {
	port: number;
	watch: boolean;
	saveTrace?: string | boolean;
};

function mkdirIfNeeded(path: string) {
	if (!existsSync(path)) {
		mkdirSync(path, { recursive: true });
	}
}

export class DebugBuildServer {
	private wsClients = new Set<Bun.ServerWebSocket<unknown>>();
	private server: Bun.Server<undefined> | null = null;
	private watcher: FileSystemWatcher | null = null;
	private unsubscribeTrace: (() => void) | null = null;
	private rebuildQueued = false;
	private stopped = false;

	constructor(
		private builder: Builder,
		private options: DebugBuildOptions,
	) {}

	async start(HTMLEntrypoint: string) {
		const buildFiles = await this.prepareFrontendAssets([HTMLEntrypoint]);

		const htmlBuildAsset = buildFiles.find(
			(asset) => asset.pathname === normalize("/index.html"),
		);
		if (!htmlBuildAsset) {
			console.error("Debug UI build is missing /index.html");
			process.exit(1);
		}

		const htmlAsset = Bun.file(htmlBuildAsset.assetPath);

		const routes = Object.assign(
			{},
			...buildFiles.map((asset) => ({
				[normalize(asset.pathname).replaceAll("\\", "/")]: Bun.file(
					asset.assetPath,
				),
			})),
		);

		this.server = Bun.serve({
			port: this.options.port,
			development: false,
			routes: {
				"/": htmlAsset,
				...routes,
				"/ws": async (req, server) => {
					if (server.upgrade(req)) {
						return new Response("Success", { status: 101 });
					}
					return new Response("Upgrade failed", { status: 500 });
				},
				"/api/session": () => Response.json(this.builder.getDebugSession()),
				"/api/builds": () => Response.json(this.builder.listDebugBuilds()),
				"/api/export": () =>
					new Response(this.builder.exportDebugTrace(), {
						headers: { "Content-Type": "application/json; charset=utf-8" },
					}),
				"/api/registry": () => Response.json(this.projectRegistry()),
			},
			fetch: this.handleRequest.bind(this),
			websocket: {
				open: (ws) => {
					this.wsClients.add(ws);
					this.send(ws, {
						type: "session-init",
						data: this.builder.getDebugSession(),
					});
					this.send(ws, {
						type: "build-list-updated",
						data: this.builder.listDebugBuilds(),
					});
					this.send(ws, {
						type: "registry-updated",
						data: this.projectRegistry(),
					});
				},
				message: async (ws, message) => {
					await this.handleSocketMessage(ws, message.toString());
				},
				close: (ws) => {
					this.wsClients.delete(ws);
				},
			},
		});

		this.unsubscribeTrace = this.builder.onDebugEvent((event) => {
			this.handleTraceEvent(event);
		});

		if (this.options.watch) {
			this.watcher = await createWatcher({
				path: process.cwd(),
				ignore: [".git", "node_modules", ".frame-master"],
				callback: async (eventType, filePath, absolutePath) => {
					this.broadcast({
						type: "watcher-change",
						data: { eventType, filePath, absolutePath },
					});
					await this.scheduleBuild();
				},
			});
		}

		await this.runBuild();
		this.logStartup();
	}

	async startWithDefaultUI() {
		const defaultUIPath = join(__dirname, "./ui/src/index.html");
		return await this.start(defaultUIPath);
	}

	async stop() {
		this.stopped = true;
		this.unsubscribeTrace?.();
		this.unsubscribeTrace = null;
		this.watcher?.stop();
		this.watcher = null;
		this.server?.stop();
		this.server = null;
	}

	private async handleRequest(req: Request, _server: Bun.Server<undefined>) {
		const url = new URL(req.url);

		const buildMatch = url.pathname.match(/^\/api\/builds\/([^/]+)$/);
		if (buildMatch?.[1]) {
			return Response.json(this.builder.getDebugBuild(buildMatch[1]));
		}

		const snapshotMatch = url.pathname.match(
			/^\/api\/builds\/([^/]+)\/snapshots\/([^/]+)$/,
		);
		if (snapshotMatch?.[1] && snapshotMatch[2]) {
			return Response.json(
				this.builder.getDebugSnapshot(snapshotMatch[1], snapshotMatch[2]),
			);
		}

		return new Response("Not found", { status: 404 });
	}

	private async handleSocketMessage(
		ws: Bun.ServerWebSocket<unknown>,
		message: string,
	) {
		try {
			const payload = JSON.parse(message) as {
				type?: string;
				buildId?: string;
				snapshotId?: string;
			};

			switch (payload.type) {
				case "request-build-list":
					this.send(ws, {
						type: "build-list-updated",
						data: this.builder.listDebugBuilds(),
					});
					break;
				case "request-registry":
					this.send(ws, {
						type: "registry-updated",
						data: this.projectRegistry(),
					});
					break;
				case "select-build":
					this.send(ws, {
						type: "build-details",
						data: payload.buildId
							? this.builder.getDebugBuild(payload.buildId)
							: null,
					});
					break;
				case "request-step-snapshot":
					this.send(ws, {
						type: "step-snapshot",
						data: {
							buildId: payload.buildId ?? "",
							snapshotId: payload.snapshotId ?? "",
							snapshot:
								payload.buildId && payload.snapshotId
									? this.builder.getDebugSnapshot(
											payload.buildId,
											payload.snapshotId,
										)
									: null,
						},
					});
					break;
				case "request-export":
					this.send(ws, {
						type: "trace-export",
						data: this.builder.exportDebugTrace(),
					});
					break;
				case "trigger-rebuild":
					await this.scheduleBuild();
					break;
			}
		} catch (error) {
			this.send(ws, {
				type: "server-error",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	private handleTraceEvent(event: BuildTraceStoreEvent) {
		switch (event.type) {
			case "build-started":
				this.broadcast({ type: "build-start", data: event.build });
				break;
			case "build-completed":
				this.broadcast({
					type:
						event.build.status === "error" ? "build-error" : "build-complete",
					data: event.build,
				});
				this.broadcast({
					type: "registry-updated",
					data: this.projectRegistry(),
				});
				break;
			case "build-list-updated":
				this.broadcast({ type: "build-list-updated", data: event.buildList });
				break;
			case "step-updated":
				this.broadcast({
					type: "step-appended",
					data: {
						buildId: event.buildId,
						file: this.projectFile(event.file),
						step: this.projectStep(event.step),
					},
				});
				break;
		}
	}

	private async scheduleBuild() {
		if (this.builder.isBuilding()) {
			this.rebuildQueued = true;
			return;
		}

		await this.runBuild();

		if (this.rebuildQueued && !this.stopped) {
			this.rebuildQueued = false;
			await this.scheduleBuild();
		}
	}

	private async runBuild() {
		const result = await this.builder.build();
		if (this.options.saveTrace) {
			const savePath = this.resolveTracePath();
			const finalSavePath = this.shouldWriteTraceInsideRepo(savePath)
				? join(this.getDebugTraceDirectory(), basename(savePath))
				: savePath;
			mkdirIfNeeded(dirname(finalSavePath));
			await Bun.write(finalSavePath, this.builder.exportDebugTrace());
			this.broadcast({ type: "trace-saved", data: { path: finalSavePath } });
		}
		return result;
	}

	private resolveTracePath() {
		if (typeof this.options.saveTrace === "string") {
			return resolve(this.options.saveTrace);
		}
		return join(process.cwd(), ".frame-master", "debug-traces", "trace.json");
	}

	private getDebugTraceDirectory() {
		return resolve(process.cwd(), ".frame-master", "debug-traces");
	}

	private isPathInsideDirectory(path: string, directory: string) {
		const relativePath = relative(directory, path);
		return (
			relativePath === "" ||
			(!relativePath.startsWith("..") && !isAbsolute(relativePath))
		);
	}

	private shouldWriteTraceInsideRepo(savePath: string) {
		if (!this.options.watch) {
			return false;
		}

		const repositoryRoot = resolve(process.cwd());
		return (
			this.isPathInsideDirectory(savePath, repositoryRoot) &&
			!this.isPathInsideDirectory(savePath, this.getDebugTraceDirectory())
		);
	}

	private async prepareFrontendAssets(entrypoints: string[]) {
		const assetsDir = join(process.cwd(), ".frame-master", "debug-ui");
		mkdirIfNeeded(assetsDir);

		const result = await Bun.build({
			entrypoints,
			outdir: assetsDir,
			minify: true,
			sourcemap: "none",
			splitting: false,
			target: "browser",
		});
		return result.outputs.map((out) => {
			return {
				pathname: normalize(out.path.split(assetsDir).at(1) as string),
				assetPath: out.path,
			};
		});
	}

	private logStartup() {
		console.log("Frame Master Debug Build");
		console.log(`Debug UI: http://localhost:${this.options.port}`);
		console.log(
			"\n" + chalk.bold.cyan("┌─────────────────────────────────────────┐"),
		);
		console.log(
			chalk.bold.cyan("│") +
				chalk.bold.white("  🐞 Frame Master Debug Build          ") +
				chalk.bold.cyan("  │"),
		);
		console.log(chalk.bold.cyan("├─────────────────────────────────────────┤"));
		console.log(
			chalk.bold.cyan("│") +
				"  " +
				chalk.gray("Debug UI: ") +
				chalk.bold.green(`http://localhost:${this.options.port}`.padEnd(28)) +
				chalk.bold.cyan(" │"),
		);
		console.log(
			chalk.bold.cyan("│") +
				"  " +
				chalk.gray("Trace API: ") +
				chalk.bold.white(`/api/session`.padEnd(28)) +
				chalk.bold.cyan("│"),
		);
		console.log(
			chalk.bold.cyan("│") +
				"  " +
				chalk.gray("Watch:    ") +
				chalk.bold.white(String(this.options.watch).padEnd(28)) +
				chalk.bold.cyan(" │"),
		);
		console.log(
			chalk.bold.cyan("└─────────────────────────────────────────┘") + "\n",
		);
	}

	private projectFile(file: BuildTraceBuild["files"][number]) {
		return {
			id: file.id,
			path: file.path,
			namespace: file.namespace,
			finalLoader: file.finalLoader,
			finalSize: file.finalSize,
		};
	}

	private projectStep(step: BuildTraceBuild["files"][number]["steps"][number]) {
		return {
			id: step.id,
			kind: step.kind,
			pluginName: step.pluginName,
			order: step.order,
			loaderBefore: step.loaderBefore,
			loaderAfter: step.loaderAfter,
			sizeBefore: step.sizeBefore,
			sizeAfter: step.sizeAfter,
			durationMs: step.durationMs,
			beforeSnapshotId: step.beforeSnapshotId,
			afterSnapshotId: step.afterSnapshotId,
			error: step.error,
		};
	}

	private projectRegistry(): DebugRegistryEntry[] {
		const session = this.builder.getDebugSession();
		const installedPlugins = pluginLoader?.getPlugins() ?? [];
		const installedPluginNames = new Set(
			installedPlugins.map((plugin) => plugin.name),
		);
		const installedVersions = new Map(
			installedPlugins.map((plugin) => [plugin.name, plugin.version]),
		);
		const metricMap = new Map<
			string,
			{
				interventions: number;
				onLoadMs: number;
				finallyMs: number;
				totalMs: number;
				files: Set<string>;
				builds: Set<string>;
				loaders: Set<string>;
			}
		>();

		for (const build of session?.builds ?? []) {
			for (const file of build.files) {
				for (const step of file.steps) {
					if (!step.pluginName) continue;
					const current = metricMap.get(step.pluginName) ?? {
						interventions: 0,
						onLoadMs: 0,
						finallyMs: 0,
						totalMs: 0,
						files: new Set<string>(),
						builds: new Set<string>(),
						loaders: new Set<string>(),
					};

					current.interventions += 1;
					current.totalMs += step.durationMs ?? 0;
					if (step.kind === "onLoad") {
						current.onLoadMs += step.durationMs ?? 0;
					}
					if (step.kind === "finally") {
						current.finallyMs += step.durationMs ?? 0;
					}
					current.files.add(file.path);
					current.builds.add(build.id);
					if (step.loaderAfter) current.loaders.add(step.loaderAfter);
					if (step.loaderBefore) current.loaders.add(step.loaderBefore);
					metricMap.set(step.pluginName, current);
				}
			}
		}

		const entries = installedPlugins.map((plugin) => {
			const metrics = metricMap.get(plugin.name);
			const dependencies = Object.entries(
				plugin.requirement?.frameMasterPlugins ?? {},
			).map(([name, requiredVersion]) => ({
				name,
				requiredVersion,
				installedVersion: installedVersions.get(name),
				satisfied:
					installedVersions.has(name) &&
					Bun.semver.satisfies(
						installedVersions.get(name) ?? "0.0.0",
						requiredVersion,
					),
			}));

			return {
				name: plugin.name,
				version: plugin.version,
				priority: plugin.priority ?? 1000,
				dependencies,
				metrics: {
					interventions: metrics?.interventions ?? 0,
					onLoadMs: metrics?.onLoadMs ?? 0,
					finallyMs: metrics?.finallyMs ?? 0,
					totalMs: metrics?.totalMs ?? 0,
					fileCount: metrics?.files.size ?? 0,
					buildCount: metrics?.builds.size ?? 0,
					loaders: [...(metrics?.loaders ?? new Set<string>())].sort(),
				},
			};
		});

		for (const [pluginName, metrics] of metricMap.entries()) {
			if (installedPluginNames.has(pluginName)) continue;
			entries.push({
				name: pluginName,
				version: "build-plugin",
				priority: 1000,
				dependencies: [],
				metrics: {
					interventions: metrics.interventions,
					onLoadMs: metrics.onLoadMs,
					finallyMs: metrics.finallyMs,
					totalMs: metrics.totalMs,
					fileCount: metrics.files.size,
					buildCount: metrics.builds.size,
					loaders: [...metrics.loaders].sort(),
				},
			});
		}

		return entries.sort(
			(left, right) =>
				left.priority - right.priority || left.name.localeCompare(right.name),
		);
	}

	private broadcast(message: DebugBuildMessage) {
		const data = JSON.stringify(message);
		for (const ws of this.wsClients) {
			ws.send(data);
		}
	}

	private send(ws: Bun.ServerWebSocket<unknown>, message: DebugBuildMessage) {
		ws.send(JSON.stringify(message));
	}
}

// ── Trace-only viewer (no builder required) ───────────────────────────────────

import type { BuildTraceSession } from "../../src/build/debug-trace";

type TraceViewOptions = {
	port: number;
	tracePath: string;
};

export class DebugTraceViewServer {
	private server: Bun.Server<undefined> | null = null;

	constructor(private options: TraceViewOptions) {}

	async start() {
		const absoluteTracePath = isAbsolute(this.options.tracePath)
			? resolve(this.options.tracePath)
			: resolve(process.cwd(), this.options.tracePath);

		if (!existsSync(absoluteTracePath)) {
			throw new Error(`Trace file not found: ${absoluteTracePath}`);
		}

		const session = JSON.parse(
			await Bun.file(absoluteTracePath).text(),
		) as BuildTraceSession;

		const htmlEntrypoint = join(__dirname, "./ui/src/index.html");
		const buildFiles = await this.prepareFrontendAssets([htmlEntrypoint]);

		const htmlBuildAsset = buildFiles.find(
			(asset) => asset.pathname === normalize("/index.html"),
		);
		if (!htmlBuildAsset) {
			console.error("Debug trace viewer build is missing /index.html");
			process.exit(1);
		}

		const htmlAsset = Bun.file(htmlBuildAsset.assetPath);

		const routes = Object.assign(
			{},
			...buildFiles.map((asset) => ({
				[normalize(asset.pathname).replaceAll("\\", "/")]: Bun.file(
					asset.assetPath,
				),
			})),
		);

		const buildList = session.buildList.length
			? session.buildList
			: session.builds.map((b) => ({
					id: b.id,
					sequence: b.sequence,
					status: b.status,
					startedAt: b.startedAt,
					completedAt: b.completedAt,
					durationMs: b.durationMs,
					entrypoints: b.entrypoints,
					fileCount: b.fileCount,
					stepCount: b.stepCount,
					outputCount: b.outputCount,
				}));

		this.server = Bun.serve({
			port: this.options.port,
			development: false,
			routes: {
				"/": htmlAsset,
				...routes,
				// No WebSocket — view-only, no live rebuild
				"/ws": () =>
					new Response("Not available in view mode", { status: 404 }),
				"/api/session": () => Response.json(session),
				"/api/builds": () => Response.json(buildList),
				"/api/export": () =>
					new Response(JSON.stringify(session, null, 2), {
						headers: { "Content-Type": "application/json; charset=utf-8" },
					}),
				"/api/registry": () => Response.json([]),
			},
			fetch: (req) => this.handleRequest(req, session),
		});

		this.logStartup(absoluteTracePath);
	}

	async stop() {
		this.server?.stop();
		this.server = null;
	}

	private handleRequest(req: Request, session: BuildTraceSession): Response {
		const url = new URL(req.url);

		const buildMatch = url.pathname.match(/^\/api\/builds\/([^/]+)$/);
		if (buildMatch?.[1]) {
			const build = session.builds.find((b) => b.id === buildMatch[1]) ?? null;
			return Response.json(build);
		}

		const snapshotMatch = url.pathname.match(
			/^\/api\/builds\/([^/]+)\/snapshots\/([^/]+)$/,
		);
		if (snapshotMatch?.[1] && snapshotMatch[2]) {
			const build = session.builds.find((b) => b.id === snapshotMatch[1]);
			const snapshot = build?.snapshots[snapshotMatch[2]] ?? null;
			return Response.json(snapshot);
		}

		return new Response("Not found", { status: 404 });
	}

	private async prepareFrontendAssets(entrypoints: string[]) {
		const assetsDir = join(process.cwd(), ".frame-master", "debug-ui");
		mkdirIfNeeded(assetsDir);

		const result = await Bun.build({
			entrypoints,
			outdir: assetsDir,
			minify: true,
			sourcemap: "none",
			splitting: false,
			target: "browser",
		});
		return result.outputs.map((out) => ({
			pathname: normalize(out.path.split(assetsDir).at(1) as string),
			assetPath: out.path,
		}));
	}

	private logStartup(tracePath: string) {
		console.log(
			"\n" + chalk.bold.cyan("┌─────────────────────────────────────────┐"),
		);
		console.log(
			chalk.bold.cyan("│") +
				chalk.bold.white("  🐞 Frame Master Debug Trace Viewer   ") +
				chalk.bold.cyan("│"),
		);
		console.log(chalk.bold.cyan("├─────────────────────────────────────────┤"));
		console.log(
			chalk.bold.cyan("│") +
				"  " +
				chalk.gray("UI:    ") +
				chalk.bold.green(`http://localhost:${this.options.port}`.padEnd(30)) +
				chalk.bold.cyan("│"),
		);
		console.log(
			chalk.bold.cyan("│") +
				"  " +
				chalk.gray("Trace: ") +
				chalk.bold.white(tracePath.slice(-30).padEnd(30)) +
				chalk.bold.cyan("│"),
		);
		console.log(
			chalk.bold.cyan("└─────────────────────────────────────────┘") + "\n",
		);
	}
}
