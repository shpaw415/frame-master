import type { FrameMasterPlugin } from "../plugins/types";

export type FrameMasterConfig = {
  /**
   * HTTP server config
   */
  HTTPServer: Omit<
    Bun.Serve.Options<undefined, string> & {
      static?: {} | undefined;
    },
    "fetch"
  >;
  /**
   * Frame-Master Plugins to load
   */
  plugins: FrameMasterPlugin<any>[];
  pluginsOptions?: Partial<{
    disableHttpServerOptionsConflictWarning?: boolean;
    /**
     * Disable automatic onLoad handler chaining for build and runtime plugins.
     *
     * When enabled (default), multiple plugins with onLoad handlers for the same
     * file pattern will have their handlers chained together - each handler
     * receives the transformed output from the previous handler.
     *
     * Set to `true` to disable chaining and use the default Bun behavior where
     * only the first matching onLoad handler is executed.
     *
     * @default false
     */
    disableOnLoadChaining?: boolean;
  }>;
};

declare global {
  var __PROCESS_ENV__: Record<string, string>;
}
