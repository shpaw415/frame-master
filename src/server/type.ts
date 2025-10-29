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
  }>;
};

declare global {
  var __PROCESS_ENV__: Record<string, string>;
}
