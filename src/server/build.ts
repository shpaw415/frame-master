import { join } from "path";
import config from "./config";
import { pluginLoader } from "@/plugins/plugin-loader";

export const buildDir = join(
  process.cwd(),
  ".frame-master",
  "build"
) as `${string}/.frame-master/build`;

const DEFAULT_BUILD_OPTIONS: Bun.BuildConfig = {
  outdir: buildDir,
  minify: process.env.NODE_ENV == "production",
  splitting: true,
  entrypoints: [],
  plugins: [],
  define: {},
  external: [],
  loader: {},
  publicPath: "./",
  env: "PUBLIC_*",
};

class Builder {
  build() {
    const buildConfig = this.getPluginsOptions();

    console.log("🔨 Building with merged configuration:", {
      entrypoints: buildConfig.entrypoints?.length || 0,
      plugins: buildConfig.plugins?.length || 0,
      outdir: buildConfig.outdir,
    });

    return Bun.build(buildConfig);
  }

  getPluginsOptions(): Bun.BuildConfig {
    const plugins = pluginLoader.getPluginByName("build");
    const config = { ...DEFAULT_BUILD_OPTIONS };
    const options = plugins
      .map((p) => p.pluginParent.buildOptions)
      .filter((o) => o !== undefined);

    for (const option of options as Bun.BuildConfig[]) {
      this.mergeConfigSafely(config, option);
    }

    return config;
  }

  private mergeConfigSafely(target: Bun.BuildConfig, source: Bun.BuildConfig) {
    for (const [key, sourceValue] of Object.entries(source)) {
      const targetValue = target[key as keyof Bun.BuildConfig];

      // Skip if source value is undefined
      if (sourceValue === undefined) continue;

      // If target doesn't have this key, just assign it
      if (targetValue === undefined) {
        (target as any)[key] = sourceValue;
        continue;
      }

      // Handle different merge strategies based on type
      if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
        // Merge arrays by concatenating unique values
        const merged = [...targetValue];
        for (const item of sourceValue) {
          if (!merged.includes(item)) {
            merged.push(item);
          }
        }
        (target as any)[key] = merged;
      } else if (
        this.isPlainObject(targetValue) &&
        this.isPlainObject(sourceValue)
      ) {
        // Merge objects recursively
        (target as any)[key] = {
          ...(targetValue as Record<string, any>),
          ...(sourceValue as Record<string, any>),
        };
      } else if (targetValue !== sourceValue) {
        // Conflict detected - values can't be merged
        console.warn(
          `⚠️  Build config conflict for key "${key}": ` +
            `Cannot merge ${typeof targetValue} with ${typeof sourceValue}. ` +
            `Using plugin value: ${JSON.stringify(sourceValue)}`
        );
        (target as any)[key] = sourceValue;
      }
      // If values are the same, no action needed
    }
  }

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
}
