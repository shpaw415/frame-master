import { pluginLoader } from "../plugins/plugin-loader";

/**
 * Load runtime plugins using Bun's plugin system.
 */
export function load() {
    for (const { name, pluginParent } of pluginLoader.getPluginByName("runtimePlugins")) {
        pluginParent.forEach((plugin) => {
            Bun.plugin(plugin);
        });
    }
}