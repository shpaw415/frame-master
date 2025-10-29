import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import type { BuildOptionsPlugin } from "../plugins/types";
import { pluginLoader } from "frame-master/plugins";

type RequiredBuilOptions = Required<BuildOptionsPlugin>;

export type BuilderProps = {
  pluginBuildConfig: Array<RequiredBuilOptions["buildConfig"]>;
  beforeBuilds?: Array<RequiredBuilOptions["beforeBuild"]>;
  afterBuilds?: Array<RequiredBuilOptions["afterBuild"]>;
  enableLogging?: boolean;
};

export class Builder {
  buildConfigFactory: BuilderProps["pluginBuildConfig"];
  onBeforeBuildHooks: Exclude<BuilderProps["beforeBuilds"], undefined> = [];
  onAfterBuildHooks: Exclude<BuilderProps["afterBuilds"], undefined> = [];
  currentBuildConfig: Bun.BuildConfig | null = null;

  readonly isLogEnabled: boolean;
  outputs: Bun.BuildArtifact[] | null = null;

  constructor(props: BuilderProps) {
    this.isLogEnabled = props.enableLogging ?? true;
    this.buildConfigFactory = props.pluginBuildConfig;
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
    this.clearBuildDir();
    const buildConfig = await this.getBuildConfig();
    buildConfig.entrypoints = [...buildConfig.entrypoints, ...entrypoints];
    if (!buildConfig.outdir) buildConfig.outdir = ".frame-master/build";

    this.log("🔨 Building with merged configuration:", {
      entrypoints: buildConfig.entrypoints?.length || 0,
      plugins: buildConfig.plugins?.length || 0,
      outdir: buildConfig.outdir,
      config: buildConfig,
    });

    await Promise.all(
      this.onBeforeBuildHooks.map((hook) => hook(buildConfig, this))
    );

    return Bun.build(buildConfig).then((res) => {
      if (res.success) {
        this.outputs = res.outputs;
      } else {
        this.error("Build failed with error:", res);
      }
      this.onAfterBuildHooks.map((hook) => hook(buildConfig, res, this));
      return res;
    });
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
    return new RegExp(
      `^${join(...path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*\\.(${ext.join(
        "|"
      )})$`
    );
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

  private getBuildConfig(): Promise<Bun.BuildConfig> {
    return Promise.all(this.buildConfigFactory.map((factory) => factory(this)))
      .then((configs) =>
        configs.reduce(
          (prev, next) => this.mergeConfigSafely(prev as Bun.BuildConfig, next),
          {
            entrypoints: [],
            outdir: "",
            splitting: true,
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
        this.currentBuildConfig = mergedConfig as Bun.BuildConfig;
        return mergedConfig;
      }) as Promise<Bun.BuildConfig>;
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
        // Plugins should be concatenated to preserve order and allow multiple instances
        (target as any)[key] = [...targetValue, ...sourceValue];
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

  /**
   * @internal
   * Clears and recreates the build output directory.
   * Called automatically by the build method.
   */
  private clearBuildDir() {
    const buildDir = this.currentBuildConfig?.outdir;
    if (!buildDir)
      return this.log("No build directory specified, skipping clear.");
    try {
      rmSync(buildDir, { recursive: true, force: true });
    } catch (e) {
      this.error(e);
    }
    try {
      mkdirSync(buildDir, { recursive: true });
    } catch (e) {
      this.error(e);
    }
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

  /**
   * @internal
   * Logs errors when logging is enabled.
   */
  private error(...data: any[]) {
    if (!this.isLogEnabled) return;
    console.error("[Frame-Master-plugin-react-ssr Builder]:", ...data);
  }
}

const plugin = pluginLoader.getPluginByName("build");
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
export const builder = await Builder.createBuilder({
  pluginBuildConfig: configFactories,
  beforeBuilds: beforeBuildHooks,
  afterBuilds: afterBuildHooks,
  enableLogging: logIsEnabled,
});

export default Builder;
