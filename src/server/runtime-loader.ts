import { pluginLoader } from "../plugins/plugin-loader";
import { plugin, type BunPlugin } from "bun";
import { InitAll } from "./init";

/**
 * Load runtime plugins using Bun's plugin system.
 */
export async function load() {
  await InitAll();
  if (!pluginLoader) throw new Error("Plugin loader not initialized");
  await Promise.all(
    pluginLoader
      .getPluginByName("runtimePlugins")
      .map(async ({ pluginParent, name }) => {
        await Promise.all(
          pluginParent.map((plugin) => {
            try {
              return Bun.plugin(plugin);
            } catch (e) {
              throw new Error(
                `Failed to load Runtime-Plugin from plugin: "${name}"`,
                { cause: e }
              );
            }
          })
        );
      })
  );
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
