import { InitPluginLoader, pluginLoader } from "../plugins/plugin-loader";
import { argv, plugin, type BunPlugin } from "bun";
import { getConfig, InitConfig } from "./config";
import { chainPlugins } from "../plugins/plugin-chaining";

/**
 * Load runtime plugins using Bun's plugin system.
 *
 * This function collects all runtime plugins from Frame-Master plugins and
 * chains their onLoad handlers together (unless disabled via config).
 * When chaining is enabled and multiple plugins have onLoad handlers that
 * match the same file pattern, they will be executed in sequence,
 * with each handler receiving the accumulated transformed content from previous handlers.
 */
export async function load() {
  setVerboseMode();
  await InitConfig();
  InitPluginLoader();
  if (!pluginLoader) throw new Error("Plugin loader not initialized");

  const config = getConfig();

  const disableChaining =
    config?.pluginsOptions?.disableOnLoadChaining ?? false;

  // Collect all runtime plugins from all Frame-Master plugins
  const allRuntimePlugins: BunPlugin[] = [];

  for (const { pluginParent, name } of pluginLoader.getPluginByName(
    "runtimePlugins"
  )) {
    for (const runtimePlugin of pluginParent) {
      allRuntimePlugins.push(runtimePlugin);
    }
  }

  if (allRuntimePlugins.length > 0) {
    if (disableChaining) {
      // Load plugins individually without chaining
      for (const runtimePlugin of allRuntimePlugins) {
        try {
          await Bun.plugin(runtimePlugin);
        } catch (e) {
          throw new Error(
            `Failed to load runtime plugin: ${runtimePlugin.name}`,
            { cause: e }
          );
        }
      }
    } else {
      // Chain all plugins together for onLoad handler chaining
      const chainedPlugin = chainPlugins(allRuntimePlugins, {
        suffix: "runtime",
      });
      try {
        await Bun.plugin(chainedPlugin);
      } catch (e) {
        throw new Error(`Failed to load chained runtime plugins`, { cause: e });
      }
    }
  }
}

function setVerboseMode() {
  if (argv.includes("--verbose")) {
    process.env.FRAME_MASTER_VERBOSE = "true";
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
        const file = await Bun.file(props.path).text();
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
