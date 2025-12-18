import { mkdirSync, rmSync } from "fs";
import type { BuildOptionsPlugin } from "../plugins/types";
import { PluginLoader, pluginLoader } from "../plugins";
import { onVerbose, pluginRegex, verboseLog, isVerbose } from "../utils";
import chalk from "chalk";
import { join } from "path";
import { chainPlugins } from "../plugins/plugin-chaining";
import { getConfig } from "../server/config";
import type { FrameMasterConfig } from "frame-master/server/type";

type RequiredBuilOptions = Required<BuildOptionsPlugin>;

export type BuilderProps = {
  pluginBuildConfig: Array<RequiredBuilOptions["buildConfig"]>;
  beforeBuilds?: Array<RequiredBuilOptions["beforeBuild"]>;
  afterBuilds?: Array<RequiredBuilOptions["afterBuild"]>;
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
  private buildConfigFactory: BuilderProps["pluginBuildConfig"];
  private staticBuildConfig: Partial<Bun.BuildConfig>;
  private onBeforeBuildHooks: Exclude<BuilderProps["beforeBuilds"], undefined> =
    [];
  private onAfterBuildHooks: Exclude<BuilderProps["afterBuilds"], undefined> =
    [];
  private currentBuildConfig: Bun.BuildConfig | null = null;
  private buildHistory: Array<{
    timestamp: number;
    duration: number;
    entrypoints: string[];
    outputCount: number;
    success: boolean;
  }> = [];
  private disableOnLoadChaining: boolean;
  private baseEntrypoints: string[];

  readonly isLogEnabled: boolean;
  public outputs: Bun.BuildArtifact[] | null = null;
  private _isBuilding = false;
  private buildPromise: Promise<Bun.BuildOutput> | null = null;
  private buildResolver: ((value: Bun.BuildOutput) => void) | null = null;

  constructor(props: BuilderProps) {
    this.isLogEnabled = props.enableLogging ?? true;
    this.disableOnLoadChaining = props.disableOnLoadChaining ?? false;
    this.baseEntrypoints = props.baseEntrypoints ?? [];

    this.staticBuildConfig = props.pluginBuildConfig
      .filter((c) => typeof c != "function")
      .reduce(
        (prev, next) => this.mergeConfigSafely(prev as Bun.BuildConfig, next),
        {} as Partial<Bun.BuildConfig>
      );
    this.buildConfigFactory = props.pluginBuildConfig.filter(
      (c) => typeof c == "function"
    );

    this.onBeforeBuildHooks = props.beforeBuilds || [];
    this.onAfterBuildHooks = props.afterBuilds || [];
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
        "Build already in progress. Concurrent builds are not supported. Use awaitBuildFinish() to wait for the current build."
      );
    }
    this._isBuilding = true;
    const self = this;
    this.buildPromise = new Promise<Bun.BuildOutput>((resolve) => {
      self.buildResolver = resolve;
    });
    const startTime = performance.now();
    this.clearBuildDir();

    const buildConfig = await this.getBuildConfig();
    buildConfig.entrypoints = [
      ...this.baseEntrypoints,
      ...buildConfig.entrypoints,
      ...entrypoints,
    ];

    this.log("🔨 Building with merged configuration:", {
      entrypoints: buildConfig.entrypoints?.length || 0,
      plugins: buildConfig.plugins?.length || 0,
      outdir: buildConfig.outdir,
      config: buildConfig,
    });

    await Promise.all(
      this.onBeforeBuildHooks.map((hook) => hook(buildConfig, this))
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
      await Promise.all(
        this.onAfterBuildHooks.map((hook) => hook(buildConfig, res, this))
      );
    } else
      console.log(chalk.red("✗ Build failed. Skipping after-build hooks."));

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
    const outDir = this.getConfig()?.outdir;
    if (!outDir || !this.outputs) return Promise.resolve();
    const filesInResult = this.outputs.map((output) => output.path);
    const fileToRemove = Array.from(
      new Bun.Glob("**/*").scanSync({
        cwd: join(cwd, outDir),
        onlyFiles: true,
        absolute: true,
      })
    ).filter((filePath) => !filesInResult.includes(filePath));

    await Promise.all(
      fileToRemove.map((output) => {
        try {
          Bun.file(output).delete();
        } catch (e) {
          onVerbose(() =>
            console.warn(
              chalk.yellow(`⚠️  Failed to delete file: \`${output}\``)
            )
          );
        }
      })
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
  static async createBuilder(props: BuilderProps): Promise<Builder> {
    const builder = new Builder(props);
    return builder;
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
          return e == "default"
            ? `export default function _default() { ${toErrorString(
                "default"
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
        2
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
        stats.totalSize
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

  private getBuildConfig(): Promise<Bun.BuildConfig> {
    return Promise.all(
      this.buildConfigFactory.map((factory) => (factory as Function)(this))
    )
      .then((configs) =>
        configs.reduce(
          (prev, next) => this.mergeConfigSafely(prev as Bun.BuildConfig, next),
          {
            entrypoints: [],
            outdir: DEFAULT_BUILD_DIR,
            splitting: true,
            throw: false,
            minify: process.env.NODE_ENV === "production",
            sourcemap: process.env.NODE_ENV !== "production",
            target: "browser",
            external: [],
            define: {},
            loader: {},
            plugins: [],
            publicPath: "./",
          } satisfies Bun.BuildConfig
        )
      )
      .then((mergedConfig) => {
        mergedConfig = this.mergeConfigSafely(
          mergedConfig as Bun.BuildConfig,
          this.staticBuildConfig
        );
        this.currentBuildConfig = mergedConfig as Bun.BuildConfig;
        return mergedConfig as Promise<Bun.BuildConfig>;
      })
      .then(
        (res) =>
          ({
            ...res,
            outdir: res.outdir || DEFAULT_BUILD_DIR,
          } as Bun.BuildConfig)
      );
  }

  /**
   * @internal
   * Safely merges multiple Bun.BuildConfig objects with intelligent handling of arrays and objects.
   * Used internally by the build pipeline. Plugin developers should not call this directly.
   */
  private mergeConfigSafely(
    target: Bun.BuildConfig,
    source: Partial<Bun.BuildConfig>
  ) {
    for (const [key, sourceValue] of Object.entries(source)) {
      const targetValue = target[key as keyof Bun.BuildConfig];

      // Skip if source value is undefined
      if (sourceValue === undefined) continue;

      // If target doesn't have this key, just assign it
      if (targetValue === undefined) {
        (target as any)[key] = sourceValue;
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
        (target as any)[key] = Array.from(entrySet);
      } else if (
        key === "plugins" &&
        Array.isArray(targetValue) &&
        Array.isArray(sourceValue)
      ) {
        // Plugins are chained using PluginProxy for onLoad handler chaining
        // unless chaining is disabled via config
        const allPlugins = [...targetValue, ...sourceValue];
        if (this.disableOnLoadChaining) {
          (target as any)[key] = allPlugins;
        } else {
          (target as any)[key] = [
            chainPlugins(allPlugins, { suffix: "build" }),
          ];
        }
      } else if (
        key === "external" &&
        Array.isArray(targetValue) &&
        Array.isArray(sourceValue)
      ) {
        // External modules should be deduplicated
        const externalSet = new Set([...targetValue, ...sourceValue]);
        (target as any)[key] = Array.from(externalSet);
      } else if (
        key === "define" &&
        this.isPlainObject(targetValue) &&
        this.isPlainObject(sourceValue)
      ) {
        // Define should merge keys, with source overriding target
        (target as any)[key] = {
          ...(targetValue as Record<string, any>),
          ...(sourceValue as Record<string, any>),
        };
      } else if (
        key === "loader" &&
        this.isPlainObject(targetValue) &&
        this.isPlainObject(sourceValue)
      ) {
        // Loader should merge keys, with source overriding target
        (target as any)[key] = {
          ...(targetValue as Record<string, any>),
          ...(sourceValue as Record<string, any>),
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
        (target as any)[key] = merged;
      } else if (
        this.isPlainObject(targetValue) &&
        this.isPlainObject(sourceValue)
      ) {
        // Deep merge objects
        (target as any)[key] = this.deepMerge(
          targetValue as Record<string, any>,
          sourceValue as Record<string, any>
        );
      } else if (typeof targetValue === typeof sourceValue) {
        // Same type, source overrides target (boolean, string, number)
        this.log(
          `ℹ️  Build config "${key}" overridden: ${targetValue} → ${sourceValue}`
        );
        (target as any)[key] = sourceValue;
      } else {
        // Type mismatch - warn and use source value
        console.warn(
          `⚠️  Build config conflict for key "${key}": ` +
            `Cannot merge ${typeof targetValue} with ${typeof sourceValue}. ` +
            `Using plugin value: ${JSON.stringify(sourceValue)}`
        );
        (target as any)[key] = sourceValue;
      }
    }
    return target;
  }

  /**
   * @internal
   * Deep merges two plain objects recursively.
   * Used internally by mergeConfigSafely.
   */
  private deepMerge(
    target: Record<string, any>,
    source: Record<string, any>
  ): Record<string, any> {
    const result = { ...target };

    for (const [key, sourceValue] of Object.entries(source)) {
      const targetValue = result[key];

      if (sourceValue === undefined) continue;

      if (this.isPlainObject(targetValue) && this.isPlainObject(sourceValue)) {
        result[key] = this.deepMerge(targetValue, sourceValue);
      } else if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
        // For nested arrays, concatenate
        result[key] = [...targetValue, ...sourceValue];
      } else {
        result[key] = sourceValue;
      }
    }

    return result;
  }

  private getAbsBuildDir(): string | null {
    const buildDir = this.currentBuildConfig?.outdir ?? DEFAULT_BUILD_DIR;

    const res = buildDir.startsWith("/")
      ? buildDir
      : join(process.cwd(), buildDir);
    return res;
  }

  /**
   * @internal
   * Clears and recreates the build output directory.
   * Called automatically by the build method.
   */
  private clearBuildDir() {
    const absoluteBuildDir = this.getAbsBuildDir();
    if (!absoluteBuildDir) throw new Error("Build directory not configured.");

    rmSync(absoluteBuildDir, { recursive: true, force: true });
    mkdirSync(absoluteBuildDir, { recursive: true });
  }

  /**
   * @internal
   * Type guard to check if a value is a plain object (not Array, Date, RegExp, etc.).
   */
  private isPlainObject(value: any): boolean {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof RegExp) &&
      Object.prototype.toString.call(value) === "[object Object]"
    );
  }

  /**
   * @internal
   * Logs messages when logging is enabled.
   */
  private log(...data: any[]) {
    if (!this.isLogEnabled) return;
    console.log("[Frame-Master-plugin-react-ssr Builder]:", ...data);
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
 * - Logging enabled if any plugin has `enableLoging: true`
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
  _pluginLoader: PluginLoader
) {
  const plugin = _pluginLoader.getPluginByName("build");
  const configFactories = plugin
    .map((plugin) => plugin.pluginParent.buildConfig)
    .filter((p) => p != undefined);
  const beforeBuildHooks = plugin
    .map((plugin) => plugin.pluginParent.beforeBuild)
    .filter((p) => p != undefined) as Exclude<
    BuilderProps["beforeBuilds"],
    undefined
  >;
  const afterBuildHooks = plugin
    .map((plugin) => plugin.pluginParent.afterBuild)
    .filter((p) => p != undefined) as Exclude<
    BuilderProps["afterBuilds"],
    undefined
  >;
  const logIsEnabled = plugin.some((p) => p.pluginParent.enableLoging === true);

  return await Builder.createBuilder({
    pluginBuildConfig: configFactories,
    beforeBuilds: beforeBuildHooks,
    afterBuilds: afterBuildHooks,
    enableLogging: logIsEnabled,
    disableOnLoadChaining: _config?.pluginsOptions?.disableOnLoadChaining,
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
    | { builder: Builder; config?: undefined; pluginLoader?: undefined }
) {
  if (loaders?.builder) {
    builder = loaders.builder;
    return;
  } else if (builder) return;

  const config = loaders?.config ?? getConfig();

  if (!config) {
    throw new Error(
      "Frame-Master configuration not initialized. cannot create builder."
    );
  }

  const _pluginLoader = loaders?.pluginLoader ?? pluginLoader;

  if (!_pluginLoader) {
    throw new Error("Plugin loader not initialized. Cannot create builder.");
  }

  builder = await createBuilder(config, _pluginLoader);
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
  config: T
): T {
  return config;
}
