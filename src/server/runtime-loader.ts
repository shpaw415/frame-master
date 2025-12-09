import { InitPluginLoader, pluginLoader } from "../plugins/plugin-loader";
import { plugin, type BunPlugin } from "bun";
import { InitConfig } from "./config";
import {
  FilePool,
  wrapPluginForPool,
  getPooledContents,
} from "../plugins/file-pool";

/** Runtime file pool for chaining onLoad handlers across plugins */
let runtimeFilePool: FilePool | null = null;

/**
 * Get the runtime file pool instance.
 * Creates a new pool if one doesn't exist.
 */
export function getRuntimeFilePool(): FilePool {
  if (!runtimeFilePool) {
    runtimeFilePool = new FilePool();
  }
  return runtimeFilePool;
}

/**
 * Load runtime plugins using Bun's plugin system with file pooling support.
 *
 * When multiple plugins register onLoad handlers for the same file filter,
 * they are chained together so each handler can transform the output of the previous.
 */
export async function load() {
  await InitConfig();
  InitPluginLoader();
  if (!pluginLoader) throw new Error("Plugin loader not initialized");

  const pool = getRuntimeFilePool();
  pool.clear(); // Clear any previous registrations

  // Collect all runtime plugins with their priorities
  const runtimePluginEntries = pluginLoader.getPluginByName("runtimePlugins");

  // Get plugin priorities for ordering
  const pluginPriorities = new Map<string, number>();
  for (const p of pluginLoader.getPlugins()) {
    pluginPriorities.set(p.name, p.priority ?? 1000);
  }

  // Register all plugin handlers to the pool
  for (const { pluginParent, name } of runtimePluginEntries) {
    const priority = pluginPriorities.get(name) ?? 1000;

    for (const bunPlugin of pluginParent) {
      try {
        wrapPluginForPool(pool, name, priority, bunPlugin);
      } catch (e) {
        throw new Error(
          `Failed to register Runtime-Plugin from plugin: "${name}" to file pool`,
          { cause: e }
        );
      }
    }
  }

  // If we have pooled handlers, register the unified plugin
  if (pool.size > 0) {
    try {
      const unifiedPlugin = pool.createUnifiedPlugin(
        "frame-master-runtime-pool"
      );
      await Bun.plugin(unifiedPlugin);
    } catch (e) {
      throw new Error("Failed to load unified runtime file pool plugin", {
        cause: e,
      });
    }
  }
}

const reactFix: BunPlugin = {
  name: "React-import-tmp-fix",
  setup(runtime) {
    runtime.onLoad(
      {
        filter: /\.tsx$/,
      },
      async (props) => {
        // Use pooled contents if available (from previous handler in chain)
        const { contents: file } = await getPooledContents(props as any);
        return {
          contents: [
            `import { jsxDEV as jsxDEV_7x81h0kn } from "react/jsx-dev-runtime";`,
            file,
            `global.jsxDEV_7x81h0kn = jsxDEV_7x81h0kn;`,
            `global.jsxs_eh6c78nj = jsxDEV_7x81h0kn;`,
          ].join("\n"),
        };
      }
    );
  },
};
if (process.env.NODE_ENV == "production") plugin(reactFix);
