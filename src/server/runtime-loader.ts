import { pluginLoader } from "../plugins/plugin-loader";
import { plugin, type BunPlugin } from "bun";
import { InitAll } from "./init";

/**
 * Load runtime plugins using Bun's plugin system.
 */
export async function load() {
  await InitAll();
  for (const { name, pluginParent } of pluginLoader!.getPluginByName(
    "runtimePlugins"
  )) {
    pluginParent.forEach((plugin) => {
      Bun.plugin(plugin);
    });
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
