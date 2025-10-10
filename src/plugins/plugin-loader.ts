"server only";

import type { FrameMasterPlugin } from "./types";
import config from "../server/config";

class PluginLoader {
  protected Plugins: Array<FrameMasterPlugin & { filePath: string }> = [];
  private plugin_cache: Map<keyof FrameMasterPlugin, Array<{ name: string, pluginParent: FrameMasterPlugin[keyof FrameMasterPlugin] }>> = new Map();
  private sub_plugin_cache: Map<string, Array<any>> = new Map();

  constructor() {

    this.Plugins.push(
      ...config.plugins.map((p) => ({ ...p, filePath: "client-plugin" })) ?? []
    );

    this.Plugins = this.Plugins.sort((a, b) => {

      return ((a?.priority ?? 1000) - (b?.priority ?? 1000));
    });


    // Clear caches when plugins are reinitialized
    this.clearCaches();
  }

  clearCaches() {
    this.plugin_cache.clear();
    this.sub_plugin_cache.clear();
  }

  getPlugins() {
    return this.Plugins;
  }

  getPluginByName<T extends keyof FrameMasterPlugin>(name: T): Array<{ name: string, pluginParent: NonNullable<FrameMasterPlugin[T]> }> {
    const cached = this.plugin_cache.get(name);
    if (cached) return cached as Array<{ name: string, pluginParent: NonNullable<FrameMasterPlugin[T]> }>;

    const pluginArray = this.Plugins.map((plugin) => ({ name: plugin.name, pluginParent: plugin[name] as NonNullable<FrameMasterPlugin[T]> })).filter((value) => value.pluginParent !== undefined);
    this.plugin_cache.set(name, pluginArray);
    return pluginArray;
  }

  private getSubPluginsByName<
    T extends keyof FrameMasterPlugin,
    K extends keyof NonNullable<FrameMasterPlugin[T]>
  >(
    name: K,
    from: Array<{ name: string, pluginParent: NonNullable<FrameMasterPlugin[T]> }>,
    parentKey: T
  ): Array<{ name: string, subPlugin: NonNullable<NonNullable<FrameMasterPlugin[T]>[K]> }> {
    // Create a cache key that combines the parent key, sub key, and a hash of the from array
    const cacheKey = `${String(parentKey)}.${String(name)}.${from.length}`;

    const cached = this.sub_plugin_cache.get(cacheKey);
    if (cached) return cached as Array<{ name: string, subPlugin: NonNullable<NonNullable<FrameMasterPlugin[T]>[K]> }>;


    const subPluginArray = from
      .map((sub) => ({ name: sub.name, subPlugin: (sub.pluginParent as any)[name] }))
      .filter((value) => value.subPlugin !== undefined);


    this.sub_plugin_cache.set(cacheKey, subPluginArray);
    return subPluginArray;
  }

  /**
   * Convenience method that gets plugins by name and then gets sub-plugins.
   * This method is fully cached and type-safe.
   */
  getSubPluginsByParentName<
    T extends keyof FrameMasterPlugin,
    K extends keyof NonNullable<FrameMasterPlugin[T]>
  >(
    parentName: T,
    subName: K
  ): Array<{ name: string, subPlugin: NonNullable<NonNullable<FrameMasterPlugin[T]>[K]> }> {
    const parentPlugins = this.getPluginByName(parentName);
    return this.getSubPluginsByName(subName, parentPlugins, parentName);
  }
}


const pluginLoader = new PluginLoader();


export { pluginLoader };
