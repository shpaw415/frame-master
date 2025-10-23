import { pluginLoader } from "../plugins/plugin-loader";
import { plugin, type BunPlugin } from "bun";

/**
 * Load runtime plugins using Bun's plugin system.
 */
export function load() {
  for (const { name, pluginParent } of pluginLoader.getPluginByName(
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
          contents:
            `
            import { jsxDEV as jsxDEV_7x81h0kn } from "react/jsx-dev-runtime";
          ` +
            file +
            "\n global.jsxDEV_7x81h0kn = jsxDEV_7x81h0kn;",
        };
      }
    );
  },
};
if (process.env.NODE_ENV == "production") plugin(reactFix);
