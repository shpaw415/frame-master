import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import chalk from "chalk";
import type { FrameMasterConfig } from "frame-master/server/type";
import { type PluginLoader, pluginLoader } from "../plugins";
import { chainPlugins } from "../plugins/plugin-chaining";
import type { BuildOptionsPlugin } from "../plugins/types";
import { getConfig } from "../server/config";
import { onVerbose, pluginRegex } from "../utils";
import {
	type BuildTraceBuild,
	type BuildTraceBuildSummary,
	type BuildTraceSession,
	type BuildTraceSessionOptions,
	BuildTraceSessionStore,
	type BuildTraceSnapshot,
	type BuildTraceStoreEvent,
} from "./debug-trace";

export type BuilderProps = {
	buildConfigs: Array<FrameMasterConfig["plugins"][number]["build"]>;
	enableLogging?: boolean;
	/**
	 * Disable onLoad handler chaining for build plugins.
	 * When true, plugins array will be concatenated instead of chained.
	 * @default false
	 */
	disableOnLoadChaining?: boolean;
	/**
	 * Base entrypoints to include in every build.
	 * These are merged with plugin-provided and per-build entrypoints.
	 */
	baseEntrypoints?: string[];
};

const DEFAULT_BUILD_DIR = ".frame-master/build";

export class Builder {
	//private buildConfigFactory: BuilderProps["pluginBuildConfig"];
	//private staticBuildConfig: Partial<Bun.BuildConfig>;
	//private onBeforeBuildHooks: Exclude<BuilderProps["beforeBuilds"], undefined> =
	//	[];
	//private onAfterBuildHooks: Exclude<BuilderProps["afterBuilds"], undefined> =
	//	[];
	private currentBuildConfig: Bun.BuildConfig | null = null;
	private disableOnLoadChaining: boolean = false;
	private baseEntrypoints: string[];

	readonly isLogEnabled: boolean;
	public outputs: Bun.BuildArtifact[] | null = null;
	private _isBuilding = false;
	private buildHistory: Array<{
		timestamp: number;
		duration: number;
		entrypoints: string[];
		outputCount: number;
		success: boolean;
	}> = [];
	private buildPromise: Promise<Bun.BuildOutput> | null = null;
	private buildResolver: ((value: Bun.BuildOutput) => void) | null = null;
	private debugSession: BuildTraceSessionStore | null = null;

	public configs: Array<FrameMasterConfig["plugins"][number]["build"]>;
	public outDir: string = DEFAULT_BUILD_DIR;

	private constructor(props: BuilderProps) {
		this.configs = props.buildConfigs;

		this.isLogEnabled = props.enableLogging ?? true;
		this.disableOnLoadChaining = props.disableOnLoadChaining ?? false;
		this.baseEntrypoints = props.baseEntrypoints ?? [];
	}

	private async init() {
		const outDir = (
			await Promise.all(
				this.configs.map(async (c) => {
					const bc = c?.buildConfig;
					if (!bc) return Promise.resolve(undefined);
					if (typeof bc === "function") {
						return (await bc(this)).outdir;
					}
					return bc.outdir;
				}),
			)
		).filter((c) => c !== undefined);

		if (outDir.length > 1) {
			console.warn("Multiple output directories detected:", outDir);
		}

		this.outDir = outDir.at(0) ?? DEFAULT_BUILD_DIR;

		if (!existsSync(join(cwd(), this.outDir))) {
			mkdirSync(join(cwd(), this.outDir), { recursive: true });
		}

		return this;
	}

	/**
	 * Creates a Builder instance for Frame-Master plugin development.
	 *
	 * **Public API** - Use this to create a builder in your Frame-Master plugin's build hook.
	 *
	 * @param props - Builder configuration
	 * @param props.pluginBuildConfig - Array of config factory functions that return Bun.BuildConfig
	 * @param props.onBeforeBuild - Optional hooks executed before build starts
	 * @param props.onAfterBuild - Optional hooks executed after build completes
	 * @param props.enableLogging - Whether to enable build logging (default: true)
	 *
	 * @returns Builder instance ready to execute builds
	 *
	 * @example
	 * // In your Frame-Master plugin
	 * export default function myPlugin(): FrameMasterPlugin {
	 *   return {
	 *     name: "my-plugin",
	 *     build: async () => {
	 *       const builder = Builder.createBuilder({
	 *         pluginBuildConfig: [
	 *           async () => ({
	 *             target: "browser",
	 *             external: ["react"],
	 *           })
	 *         ]
	 *       });
	 *
	 *       await builder.build("/src/client.ts");
	 *     }
	 *   };
	 * }
	 */
	static createBuilder(props: BuilderProps): Promise<Builder> {
		const builder = new Builder(props);
		return builder.init();
	}

	/**
	 * Executes the build process with merged plugin configurations.
	 *
	 * **Public API** - Call this method to run the build in your Frame-Master plugin's build hook.
	 *
	 * This method orchestrates the entire build pipeline for Frame-Master plugins:
	 * 1. Clears the build directory
	 * 2. Gathers and merges all plugin build configurations
	 * 3. Adds provided entrypoints to the configuration
	 * 4. Executes before-build hooks
	 * 5. Runs Bun.build with the merged configuration
	 * 6. Executes after-build hooks
	 * 7. Returns the build result
	 *
	 * @param entrypoints - Array of absolute file paths to use as build entrypoints.
	 *                      These are added to any entrypoints defined in plugin configs.
	 *
	 * @returns Promise resolving to Bun.BuildOutput containing build results and artifacts
	 *
	 * @example
	 * // Basic usage in a Frame-Master plugin
	 * const builder = Builder.createBuilder({
	 *   pluginBuildConfig: [
	 *     async (builder) => ({
	 *       target: "browser",
	 *       external: ["react", "react-dom"],
	 *     })
	 *   ]
	 * });
	 *
	 * const result = await builder.build(
	 *   "/path/to/src/index.tsx",
	 *   "/path/to/src/client.ts"
	 * );
	 *
	 * if (result.success) {
	 *   console.log("Build successful!", result.outputs);
	 * }
	 *
	 * @example
	 * // With before/after hooks
	 * const builder = Builder.createBuilder({
	 *   pluginBuildConfig: [myPluginConfig],
	 *   onBeforeBuild: [
	 *     async (config) => {
	 *       console.log("Starting build with", config.entrypoints.length, "entries");
	 *     }
	 *   ],
	 *   onAfterBuild: [
	 *     async (config, result) => {
	 *       if (result.success) {
	 *         // Copy assets, generate manifests, etc.
	 *         await copyStaticAssets(result.outputs);
	 *       }
	 *     }
	 *   ]
	 * });
	 *
	 * await builder.build("/src/app.tsx");
	 *
	 * @example
	 * // Access build outputs for further processing
	 * const builder = Builder.createBuilder({ pluginBuildConfig: [config] });
	 * const result = await builder.build("/src/index.ts");
	 *
	 * if (result.success) {
	 *   // Access built artifacts
	 *   builder.outputs?.forEach(artifact => {
	 *     console.log("Built:", artifact.path);
	 *     console.log("Size:", artifact.size, "bytes");
	 *   });
	 * }
	 */
	async build(...entrypoints: string[]): Promise<Bun.BuildOutput> {
		if (this._isBuilding) {
			throw new Error(
				"Build already in progress. Concurrent builds are not supported. Use awaitBuildFinish() to wait for the current build.",
			);
		}
		this._isBuilding = true;

		this.buildPromise = new Promise<Bun.BuildOutput>((resolve) => {
			this.buildResolver = resolve;
		});
		const startTime = performance.now();

		const buildConfig = await this.createConfigs();
		buildConfig.entrypoints = [
			...(buildConfig.entrypoints || []),
			...(entrypoints || []),
		];
		this.debugSession?.startBuild(buildConfig.entrypoints ?? []);

		this.log("🔨 Building with merged configuration:", {
			entrypoints: buildConfig.entrypoints?.length || 0,
			plugins: buildConfig.plugins?.length || 0,
			outdir: buildConfig.outdir,
			config: buildConfig,
		});

		await Promise.all(
			this.getHooksByType("beforeBuild").map((hook) => hook(buildConfig, this)),
		);
		let res: Bun.BuildOutput = {
			logs: [],
			outputs: [],
			success: true,
		};

		try {
			res = await Bun.build(buildConfig);
		} catch (e) {
			console.error(e);
			res.success = false;
			this.debugSession?.completeBuild({
				success: false,
				outputCount: 0,
				errors: [e instanceof Error ? e.message : String(e)],
			});
		}

		const duration = performance.now() - startTime;

		this.outputs = res.outputs;
		await this.cleanUpOutputDir();

		// Track build history
		this.buildHistory.push({
			timestamp: Date.now(),
			duration,
			entrypoints: buildConfig.entrypoints,
			outputCount: res.outputs.length,
			success: res.success,
		});
		if (res.success) {
			this.debugSession?.completeBuild({
				success: true,
				outputCount: res.outputs.length,
			});
			await Promise.all(
				this.getHooksByType("afterBuild").map((hook) =>
					hook(buildConfig, res, this),
				),
			);
		} else {
			this.debugSession?.completeBuild({
				success: false,
				outputCount: res.outputs.length,
				errors: res.logs?.map((log) => log.message),
			});
			console.log(chalk.red("✗ Build failed. Skipping after-build hooks."));
			this.log(res);
		}

		this._isBuilding = false;
		if (this.buildResolver) {
			this.buildResolver(res);
			this.buildResolver = null;
		}
		this.buildPromise = null;
		return res;
	}
	/** Remove leftOver files from previous build */
	public async cleanUpOutputDir(): Promise<void> {
		const cwd = process.cwd();
		const outDir = this.outDir;
		if (!outDir || !this.outputs) return Promise.resolve();
		const filesInResult = this.outputs.map((output) => output.path);
		const fileToRemove = Array.from(
			new Bun.Glob("**/*").scanSync({
				cwd: join(cwd, outDir),
				onlyFiles: true,
				absolute: true,
			}),
		).filter((filePath) => !filesInResult.includes(filePath));

		await Promise.all(
			fileToRemove.map((output) => {
				try {
					return Bun.file(output).delete();
				} catch (_e) {
					onVerbose(() =>
						console.warn(
							chalk.yellow(`⚠️  Failed to delete file: \`${output}\``),
						),
					);
				}
				return Promise.resolve();
			}),
		);
	}

	/**
	 * Check if a build is currently in progress.
	 *
	 * **Public API** - Use this to check build status before starting a new build.
	 *
	 * Returns `true` if a build is currently running, `false` otherwise.
	 * Useful for preventing concurrent builds or showing loading states.
	 *
	 * @returns Boolean indicating whether a build is currently executing
	 *
	 * @example
	 * import { builder } from "frame-master/build";
	 *
	 * if (builder.isBuilding()) {
	 *   console.log("Build in progress, please wait...");
	 * } else {
	 *   await builder.build("/src/client.ts");
	 * }
	 *
	 * @example
	 * // In a watch mode handler
	 * function onFileChange() {
	 *   if (builder.isBuilding()) {
	 *     console.log("Skipping rebuild - build already in progress");
	 *     return;
	 *   }
	 *   builder.build("/src/index.ts");
	 * }
	 */
	public isBuilding() {
		return this._isBuilding;
	}

	/**
	 * Get a promise that resolves when the current build finishes.
	 *
	 * **Public API** - Use this to await the completion of an ongoing build.
	 *
	 * Returns a promise that resolves with the build output if a build is in progress,
	 * or `null` if no build is currently running. The promise will resolve even if the
	 * build fails, allowing you to check the `success` property of the result.
	 *
	 * **Note:** This method is safe to call from multiple places - all callers will
	 * receive the same promise instance and will be notified when the build completes.
	 *
	 * @returns Promise resolving to Bun.BuildOutput if building, null otherwise
	 *
	 * @example
	 * import { builder } from "frame-master/build";
	 *
	 * // Wait for ongoing build to complete
	 * const buildPromise = builder.awaitBuildFinish();
	 * if (buildPromise) {
	 *   const result = await buildPromise;
	 *   console.log("Build completed:", result.success);
	 * } else {
	 *   console.log("No build in progress");
	 * }
	 *
	 * @example
	 * // Coordinate with other tasks
	 * async function deployAfterBuild() {
	 *   const ongoing = builder.awaitBuildFinish();
	 *   if (ongoing) {
	 *     console.log("Waiting for build to finish...");
	 *     const result = await ongoing;
	 *     if (!result.success) {
	 *       console.error("Build failed, skipping deployment");
	 *       return;
	 *     }
	 *   }
	 *   await deployToServer();
	 * }
	 *
	 * @example
	 * // Safe concurrent usage
	 * async function handleFileChange() {
	 *   // Check if build is already running
	 *   if (builder.isBuilding()) {
	 *     console.log("Build in progress, waiting...");
	 *     await builder.awaitBuildFinish();
	 *     // Start new build after current one finishes
	 *     await builder.build("/src/index.ts");
	 *   } else {
	 *     await builder.build("/src/index.ts");
	 *   }
	 * }
	 */
	public awaitBuildFinish(): null | Promise<Bun.BuildOutput> {
		return this.buildPromise;
	}

	/**
	 * Creates a RegExp for filtering files in Bun.build plugins based on path and extensions.
	 *
	 * **Public API** - Use this helper to create file filters for Bun plugins in your build config.
	 *
	 * Useful for creating filter patterns in Bun plugins to match specific files by directory
	 * and file extension. The generated regex escapes special characters in paths and creates
	 * an extension matcher with OR logic.
	 *
	 * @param options - Configuration for the regex pattern
	 * @param options.path - Array of path segments to match (e.g., ["src", "components"])
	 * @param options.ext - Array of file extensions without dots (e.g., ["ts", "tsx", "js"])
	 *
	 * @returns RegExp that matches files in the specified path with any of the given extensions
	 *
	 * @example
	 * // Match TypeScript files in src/components
	 * const filter = Builder.pluginRegexMake({
	 *   path: ["src", "components"],
	 *   ext: ["ts", "tsx"]
	 * });
	 * // Matches: src/components/Button.tsx, src/components/utils/helper.ts
	 * // Doesn't match: src/pages/index.tsx, src/components/style.css
	 *
	 * @example
	 * // Use in a Bun.build plugin
	 * const plugin: BunPlugin = {
	 *   name: "my-plugin",
	 *   setup(build) {
	 *     const filter = Builder.pluginRegexMake({
	 *       path: ["src", "server"],
	 *       ext: ["ts", "js"]
	 *     });
	 *
	 *     build.onLoad({ filter }, async (args) => {
	 *       // Handle server-side files
	 *       return { contents: "...", loader: "ts" };
	 *     });
	 *   }
	 * };
	 *
	 * @example
	 * // Match all CSS/SCSS in styles directory
	 * const styleFilter = Builder.pluginRegexMake({
	 *   path: ["src", "styles"],
	 *   ext: ["css", "scss", "sass"]
	 * });
	 */
	static pluginRegexMake({ path, ext }: { path: string[]; ext: string[] }) {
		return pluginRegex({ path, ext });
	}

	/**
	 * Generates stub exports for server-only modules to prevent client-side usage.
	 *
	 * **Public API** - Use this helper in Bun plugins to replace server-only code in client builds.
	 *
	 * Creates a module that exports functions throwing descriptive errors when called,
	 * preventing accidental server-only code execution on the client.
	 *
	 * @param loader - The Bun loader type to use (e.g., "ts", "tsx", "js")
	 * @param module - Object with keys representing the exports to stub (use empty object for dynamic)
	 *
	 * @returns Object with `contents` (stub code) and `loader` for Bun plugin onLoad return
	 *
	 * @example
	 * // In a Bun plugin to block server-only files
	 * build.onLoad({ filter: /\.server\.(ts|tsx)$/ }, async (args) => {
	 *   const mod = await import(args.path);
	 *   return Builder.returnEmptyFile("tsx", mod);
	 * });
	 * // Client bundle will contain error-throwing stubs instead of server code
	 *
	 * @example
	 * // Stub specific exports
	 * Builder.returnEmptyFile("ts", {
	 *   default: null,
	 *   serverFunction: null,
	 *   SECRET_KEY: null
	 * });
	 * // Generates:
	 * // export default function _default() { throw new Error(...) }
	 * // export const serverFunction = () => { throw new Error(...) }
	 * // export const SECRET_KEY = () => { throw new Error(...) }
	 */
	static returnEmptyFile(loader: Bun.Loader, module: Record<string, unknown>) {
		const toErrorString = (e: string) =>
			`throw new Error("[ ${e} ] This is server-only component and cannot be used in client-side.")`;
		return {
			contents: Object.keys(module)
				.map((e) => {
					return e === "default"
						? `export default function _default() { ${toErrorString(
								"default",
							)} };`
						: `export const ${e} = () => { ${toErrorString(e)} }`;
				})
				.join("\n"),
			loader,
		};
	}

	/**
	 * Get the current merged build configuration.
	 *
	 * **Public API** - Access the final merged configuration from all plugins.
	 *
	 * Useful for debugging, logging, or making decisions based on the current build setup.
	 * Note: Dynamic configs are only included after calling `getBuildConfig()` internally.
	 *
	 * @returns The current build configuration or null if not yet initialized
	 *
	 * @example
	 * import { builder } from "frame-master/build";
	 *
	 * const config = builder.getConfig();
	 * if (config) {
	 *   console.log("Building for target:", config.target);
	 *   console.log("External packages:", config.external);
	 * }
	 */
	getConfig(): Bun.BuildConfig | null {
		return this.currentBuildConfig;
	}
	/**
	 * Generates a fresh build configuration by merging all plugin configs, including dynamic ones.
	 *
	 * This is called internally by the build process to ensure the latest plugin configurations are used.
	 *
	 * **Public API** - Use this to get the most up-to-date merged configuration, including dynamic configs.
	 *
	 * @Note: This method is more expensive than `getConfig()` as it re-evaluates dynamic config factories, so it should be used when you need to ensure you have the latest configuration after plugins have had a chance to modify it.
	 */
	async createConfigs(): Promise<Bun.BuildConfig> {
		const configs = this.configs
			.map((c) => c?.buildConfig)
			.filter((c) => c !== undefined);
		const staticConfigs = configs
			.filter((c) => typeof c !== "function")
			.reduce((prev, next) => {
				return this.mergeConfigSafely(prev, next as Bun.BuildConfig);
			}, {} as Bun.BuildConfig) as Bun.BuildConfig;

		this.currentBuildConfig = staticConfigs;

		const mergedConfigs = (await Promise.all(
			configs
				.filter((c) => typeof c === "function")
				.map((c) => {
					const res = c(this);
					if (res instanceof Promise) {
						return res;
					} else return Promise.resolve(res);
				}),
		).then((dynamic) =>
			dynamic.reduce(
				(prev, next) => this.mergeConfigSafely(prev, next),
				staticConfigs,
			),
		)) as Bun.BuildConfig;

		this.currentBuildConfig = this.mergeConfigSafely(mergedConfigs, {
			entrypoints: this.baseEntrypoints,
		}) as Bun.BuildConfig;
		this.currentBuildConfig = this.normalizeBuildPlugins(
			this.currentBuildConfig,
		);

		if (this.currentBuildConfig.outdir === undefined) {
			this.currentBuildConfig.outdir = this.outDir;
		}

		return this.currentBuildConfig;
	}

	private normalizeBuildPlugins<T extends Partial<Bun.BuildConfig>>(
		config: T,
	): T {
		if (
			this.disableOnLoadChaining ||
			config.plugins === undefined ||
			config.plugins.length === 0
		) {
			return config;
		}

		if (
			config.plugins.length === 1 &&
			config.plugins[0]?.name === "frame-master-chained-loader"
		) {
			return config;
		}

		return {
			...config,
			plugins: [
				chainPlugins(config.plugins, {
					suffix: "build",
					trace: this.debugSession,
				}),
			],
		};
	}

	startDebugSession(options: Partial<BuildTraceSessionOptions> = {}) {
		this.debugSession = new BuildTraceSessionStore({
			watch: options.watch ?? false,
			includeTextSnapshots: options.includeTextSnapshots ?? false,
			maxBuilds: options.maxBuilds ?? 25,
			saveTracePath: options.saveTracePath,
		});
		return this.debugSession.getSession();
	}

	stopDebugSession(): void {
		this.debugSession = null;
	}

	getDebugSession(): BuildTraceSession | null {
		return this.debugSession?.getSession() ?? null;
	}

	getDebugBuild(buildId: string): BuildTraceBuild | null {
		return this.debugSession?.getBuild(buildId) ?? null;
	}

	getDebugSnapshot(
		buildId: string,
		snapshotId: string,
	): BuildTraceSnapshot | null {
		return this.debugSession?.getSnapshot(buildId, snapshotId) ?? null;
	}

	listDebugBuilds(): BuildTraceBuildSummary[] {
		return this.debugSession?.listBuilds() ?? [];
	}

	onDebugEvent(listener: (event: BuildTraceStoreEvent) => void): () => void {
		if (!this.debugSession) {
			throw new Error(
				"Debug session not started. Call startDebugSession() first.",
			);
		}
		return this.debugSession.subscribe(listener);
	}

	exportDebugTrace(): string {
		if (!this.debugSession) {
			throw new Error(
				"Debug session not started. Call startDebugSession() first.",
			);
		}
		return this.debugSession.exportJSON();
	}

	/**
	 * Analyze build outputs and provide insights.
	 *
	 * **Public API** - Get detailed analysis of the last build's outputs.
	 *
	 * Returns information about file sizes, artifact types, and identifies
	 * the largest files that might benefit from optimization.
	 *
	 * @returns Build analysis object with size metrics and artifact details
	 * @throws Error if no build has been executed yet
	 *
	 * @example
	 * import { builder } from "frame-master/build";
	 *
	 * await builder.build("/src/client.ts");
	 *
	 * const analysis = builder.analyzeBuild();
	 * console.log("Total build size:", analysis.totalSize, "bytes");
	 * console.log("Largest files:", analysis.largestFiles);
	 *
	 * // Check if bundle is too large
	 * if (analysis.totalSize > 1_000_000) {
	 *   console.warn("Bundle exceeds 1MB, consider code splitting");
	 * }
	 */
	analyzeBuild(): {
		totalSize: number;
		averageSize: number;
		artifacts: Array<{
			path: string;
			size: number;
			kind: string;
		}>;
		largestFiles: Array<{ path: string; size: number }>;
		byKind: Record<string, { count: number; totalSize: number }>;
	} {
		if (!this.outputs || this.outputs.length === 0) {
			throw new Error("No build outputs available. Run builder.build() first.");
		}

		const artifacts = this.outputs.map((output) => ({
			path: output.path,
			size: output.size || 0,
			kind: output.kind,
		}));

		const totalSize = artifacts.reduce((sum, a) => sum + a.size, 0);
		const averageSize = totalSize / artifacts.length;

		const largestFiles = [...artifacts]
			.sort((a, b) => b.size - a.size)
			.slice(0, 10)
			.map((a) => ({ path: a.path, size: a.size }));

		const byKind: Record<string, { count: number; totalSize: number }> = {};
		for (const artifact of artifacts) {
			if (!byKind[artifact.kind]) {
				byKind[artifact.kind] = { count: 0, totalSize: 0 };
			}
			const kindStats = byKind[artifact.kind];
			if (kindStats) {
				kindStats.count++;
				kindStats.totalSize += artifact.size;
			}
		}

		return {
			totalSize,
			averageSize,
			artifacts,
			largestFiles,
			byKind,
		};
	}

	/**
	 * Get build history including timing and success metrics.
	 *
	 * **Public API** - Access historical build data for analytics and monitoring.
	 *
	 * Useful for tracking build performance over time, detecting regressions,
	 * and understanding build patterns during development.
	 *
	 * @returns Array of build records with timestamps, durations, and results
	 *
	 * @example
	 * import { builder } from "frame-master/build";
	 *
	 * const history = builder.getBuildHistory();
	 * const avgDuration = history.reduce((sum, b) => sum + b.duration, 0) / history.length;
	 *
	 * console.log("Average build time:", avgDuration.toFixed(2), "ms");
	 * console.log("Success rate:", history.filter(b => b.success).length / history.length);
	 */
	getBuildHistory(): Array<{
		timestamp: number;
		duration: number;
		entrypoints: string[];
		outputCount: number;
		success: boolean;
	}> {
		return [...this.buildHistory];
	}

	/**
	 * Clear build history records.
	 *
	 * **Public API** - Reset the build history tracking.
	 *
	 * Useful for starting fresh analytics or freeing memory in long-running processes.
	 *
	 * @example
	 * import { builder } from "frame-master/build";
	 *
	 * // After analyzing history
	 * builder.clearBuildHistory();
	 */
	clearBuildHistory(): void {
		this.buildHistory = [];
	}

	/**
	 * Generate a formatted build report.
	 *
	 * **Public API** - Create human-readable build reports for logging or debugging.
	 *
	 * @param format - Output format: "text" for console, "json" for structured data
	 * @returns Formatted build report string
	 *
	 * @example
	 * import { builder } from "frame-master/build";
	 *
	 * await builder.build("/src/client.ts");
	 *
	 * // Console-friendly report
	 * console.log(builder.generateReport("text"));
	 *
	 * // Structured data for logging systems
	 * const jsonReport = builder.generateReport("json");
	 * await sendToMonitoring(JSON.parse(jsonReport));
	 */
	generateReport(format: "text" | "json" = "text"): string {
		if (!this.outputs || this.outputs.length === 0) {
			return format === "json"
				? JSON.stringify({ error: "No build outputs available" })
				: "No build outputs available. Run builder.build() first.";
		}

		const analysis = this.analyzeBuild();
		const history = this.getBuildHistory();
		const lastBuild = history[history.length - 1];

		if (format === "json") {
			return JSON.stringify(
				{
					summary: {
						totalFiles: analysis.artifacts.length,
						totalSize: analysis.totalSize,
						averageSize: Math.round(analysis.averageSize),
						buildDuration: lastBuild?.duration,
						success: lastBuild?.success,
					},
					artifacts: analysis.artifacts,
					largestFiles: analysis.largestFiles,
					byKind: analysis.byKind,
					history: history.slice(-5), // Last 5 builds
				},
				null,
				2,
			);
		}

		// Text format
		const formatSize = (bytes: number) => {
			if (bytes < 1024) return `${bytes}B`;
			if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
			return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
		};

		let report = "📊 Build Report\n";
		report += "═".repeat(50) + "\n\n";
		report += `Total Files: ${analysis.artifacts.length}\n`;
		report += `Total Size: ${formatSize(analysis.totalSize)}\n`;
		report += `Average Size: ${formatSize(Math.round(analysis.averageSize))}\n`;
		if (lastBuild) {
			report += `Build Duration: ${lastBuild.duration.toFixed(2)}ms\n`;
			report += `Status: ${lastBuild.success ? "✅ Success" : "❌ Failed"}\n`;
		}
		report += "\n";

		report += "📦 By Artifact Kind:\n";
		for (const [kind, stats] of Object.entries(analysis.byKind)) {
			report += `  ${kind}: ${stats.count} files (${formatSize(
				stats.totalSize,
			)})\n`;
		}
		report += "\n";

		report += "🔝 Largest Files:\n";
		for (const file of analysis.largestFiles.slice(0, 5)) {
			const relativePath = file.path.split("/").slice(-3).join("/");
			report += `  ${formatSize(file.size).padStart(10)} - ${relativePath}\n`;
		}

		return report;
	}

	/**
	 * @internal
	 * Safely merges multiple Bun.BuildConfig objects with intelligent handling of arrays and objects.
	 * Used internally by the build pipeline. Plugin developers should not call this directly.
	 */
	private mergeConfigSafely(
		target: Partial<Bun.BuildConfig>,
		source: Partial<Bun.BuildConfig>,
	) {
		for (const [key, sourceValue] of Object.entries(source) as Array<
			[keyof Bun.BuildConfig, unknown]
		>) {
			const targetValue = target[key];

			// Skip if source value is undefined
			if (sourceValue === undefined) continue;

			// If target doesn't have this key, just assign it
			if (targetValue === undefined) {
				target[key] = sourceValue as never;
				continue;
			}

			// Special handling for specific config keys
			if (
				key === "entrypoints" &&
				Array.isArray(targetValue) &&
				Array.isArray(sourceValue)
			) {
				// Merge entrypoints, removing duplicates by path
				const entrySet = new Set([...targetValue, ...sourceValue]);
				target[key] = Array.from(entrySet);
			} else if (
				key === "plugins" &&
				Array.isArray(targetValue) &&
				Array.isArray(sourceValue)
			) {
				// Build plugins are normalized after all configs are merged so
				// static and dynamic buildConfig sources behave the same.
				target[key] = [...targetValue, ...sourceValue] as never;
			} else if (
				key === "external" &&
				Array.isArray(targetValue) &&
				Array.isArray(sourceValue)
			) {
				// External modules should be deduplicated
				const externalSet = new Set([...targetValue, ...sourceValue]);
				target[key] = Array.from(externalSet);
			} else if (
				key === "define" &&
				this.isPlainObject(targetValue) &&
				this.isPlainObject(sourceValue)
			) {
				// Define should merge keys, with source overriding target
				target[key] = {
					...(targetValue as Record<string, never>),
					...(sourceValue as Record<string, never>),
				};
			} else if (
				key === "loader" &&
				this.isPlainObject(targetValue) &&
				this.isPlainObject(sourceValue)
			) {
				// Loader should merge keys, with source overriding target
				target[key] = {
					...(targetValue as Record<string, never>),
					...(sourceValue as Record<string, never>),
				};
			} else if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
				// Generic array merge - concatenate and deduplicate primitives
				const merged = [...targetValue];
				for (const item of sourceValue) {
					// Only deduplicate primitives, keep all objects
					if (typeof item === "object" || !merged.includes(item)) {
						merged.push(item);
					}
				}
				target[key] = merged as never;
			} else if (
				this.isPlainObject(targetValue) &&
				this.isPlainObject(sourceValue)
			) {
				// Deep merge objects
				target[key] = this.deepMerge(
					targetValue as Record<string, unknown>,
					sourceValue as Record<string, unknown>,
				) as never;
			} else if (typeof targetValue === typeof sourceValue) {
				// Same type, source overrides target (boolean, string, number)
				this.log(
					`ℹ️  Build config "${key}" overridden: ${targetValue} → ${sourceValue}`,
				);
				target[key] = sourceValue as never;
			} else {
				// Type mismatch - warn and use source value
				console.warn(
					`⚠️  Build config conflict for key "${key}": ` +
						`Cannot merge ${typeof targetValue} with ${typeof sourceValue}. ` +
						`Using plugin value: ${JSON.stringify(sourceValue)}`,
				);
				target[key] = sourceValue as never;
			}
		}
		return target;
	}

	/**
	 * @internal
	 * Deep merges two plain objects recursively.
	 * Used internally by mergeConfigSafely.
	 */
	private deepMerge<
		S extends Record<string, unknown>,
		T extends Record<string, unknown> = Record<string, unknown>,
	>(target: T, source: S): T & S {
		const result = { ...target };

		for (const [key, sourceValue] of Object.entries(source)) {
			const targetValue = result[key];

			if (sourceValue === undefined) continue;

			if (this.isPlainObject(targetValue) && this.isPlainObject(sourceValue)) {
				//@ts-expect-error
				result[key] = this.deepMerge(
					targetValue as Record<string, unknown>,
					sourceValue as Record<string, unknown>,
				) as T & S;
			} else if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
				// For nested arrays, concatenate
				//@ts-expect-error
				result[key] = [...targetValue, ...sourceValue];
			} else {
				//@ts-expect-error
				result[key] = sourceValue;
			}
		}

		return result as T & S;
	}

	/**
	 * @internal
	 * Type guard to check if a value is a plain object (not Array, Date, RegExp, etc.).
	 */
	private isPlainObject(value: unknown): boolean {
		return (
			value !== null &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			!(value instanceof Date) &&
			!(value instanceof RegExp) &&
			Object.prototype.toString.call(value) === "[object Object]"
		);
	}

	private getHooksByType<
		T extends Exclude<keyof BuildOptionsPlugin, "buildConfig" | "enableLoging">,
	>(type: T) {
		const res = this.configs
			.filter((c) => c !== undefined)
			.map((c) => c[type])
			.filter((h) => h !== undefined);
		return res;
	}

	/**
	 * @internal
	 * Logs messages when logging is enabled.
	 */
	private log(...data: unknown[]) {
		if (!this.isLogEnabled) return;
		console.log("[Frame-Master Builder]:", ...data);
	}
}
/**
 * Singleton Builder instance pre-configured with all Frame-Master plugin build configurations.
 *
 * **Public API** - Use this exported builder in your plugin's build hook instead of creating a new one.
 *
 * This builder is automatically configured with:
 * - All `buildConfig` functions from loaded plugins
 * - All `beforeBuild` hooks from loaded plugins
 * - All `afterBuild` hooks from loaded plugins
 * - Logging enabled if any plugin has `enableLogging: true`
 *
 * The singleton pattern ensures all plugins contribute to a single unified build process,
 * allowing proper merging of configurations and coordinated execution of hooks.
 *
 * @example
 * // In your Frame-Master plugin - use the singleton
 * import { builder } from "frame-master/build";
 *
 * export default function myPlugin(): FrameMasterPlugin {
 *   return {
 *     name: "my-plugin",
 *     buildConfig: async (builder) => ({
 *       external: ["my-dependency"]
 *     }),
 *     build: async () => {
 *       // Use the shared builder instance
 *       const result = await builder.build("/src/client.ts");
 *       return result.success;
 *     }
 *   };
 * }
 *
 * @example
 * // Access build outputs after build completes
 * import { builder } from "frame-master/build";
 *
 * await builder.build("/src/index.ts");
 *
 * builder.outputs?.forEach(artifact => {
 *   console.log("Generated:", artifact.path);
 * });
 */
export let builder: Builder | null = null;
export default Builder;

export async function createBuilder(
	_config: FrameMasterConfig,
	_pluginLoader: PluginLoader,
) {
	const plugin = _pluginLoader.getPluginByName("build");
	const logIsEnabled = plugin.some((p) => p.pluginParent.enableLoging === true);

	return await Builder.createBuilder({
		enableLogging: logIsEnabled,
		disableOnLoadChaining: _config?.pluginsOptions?.disableOnLoadChaining,
		buildConfigs: plugin.map((p) => p.pluginParent),
		baseEntrypoints: _config?.pluginsOptions?.entrypoints,
	});
}

export async function InitBuilder(
	loaders?:
		| {
				config: FrameMasterConfig;
				pluginLoader: PluginLoader;
				builder?: undefined;
		  }
		| { builder: Builder; config?: undefined; pluginLoader?: undefined },
) {
	if (loaders?.builder) {
		builder = loaders.builder;
		return builder;
	} else if (builder) return builder;

	const config = loaders?.config ?? getConfig();

	if (!config) {
		throw new Error(
			"Frame-Master configuration not initialized. cannot create builder.",
		);
	}

	const _pluginLoader = loaders?.pluginLoader ?? pluginLoader;

	if (!_pluginLoader) {
		throw new Error("Plugin loader not initialized. Cannot create builder.");
	}

	builder = await createBuilder(config, _pluginLoader);
	return builder;
}

export function getBuilder() {
	return builder;
}

/**
 * Reinitialize the builder with updated plugin configurations.
 *
 * Used for hot-reloading when plugins or build configs change.
 * Clears the current builder and creates a new one with fresh plugin configs.
 *
 * @returns Promise resolving when builder is reinitialized
 */
export async function reloadBuilder(): Promise<void> {
	builder = null;
	await InitBuilder();
}

/**
 * Type-safe helper for defining build configurations in Frame-Master plugins.
 *
 * **Public API** - Use this to get full TypeScript autocomplete and validation
 * when creating build configurations in your plugins.
 *
 * This is a simple identity function that provides type checking without
 * runtime overhead. It helps catch configuration errors at development time.
 *
 * @param config - Partial Bun.BuildConfig to use in your plugin
 * @returns The same config object with full type checking
 *
 * @example
 * // In your Frame-Master plugin
 * import { defineBuildConfig } from "frame-master/build";
 * import { pluginRegex } from 'frame-master/utils';
 *
 * export function myPlugin(): FrameMasterPlugin {
 *   return {
 *     name: "my-plugin",
 *     build: {
 *       buildConfig: defineBuildConfig({
 *         target: "browser", // Autocomplete works!
 *         external: ["react", "react-dom"],
 *         minify: true,
 *         // TypeScript will catch typos and invalid values
 *       }),
 *     },
 *   };
 * }
 *
 * @example
 * // Dynamic config with type safety
 * buildConfig: async (builder) => defineBuildConfig({
 *   external: builder.isLogEnabled ? ["debug-lib"] : [],
 *   minify: process.env.NODE_ENV === "production",
 * })
 *
 * @example
 * // Extend with custom properties (type-safe)
 * const config = defineBuildConfig({
 *   target: "browser",
 *   external: ["react"],
 *   // Custom metadata for your plugin (fully typed)
 *   naming: {
 *     entryNames: "[dir]/[name].[hash]",
 *   },
 * });
 */
export function defineBuildConfig<T extends Partial<Bun.BuildConfig>>(
	config: T,
): T {
	return config;
}
