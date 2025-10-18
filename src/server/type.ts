import type { FrameMasterPlugin } from "../plugins/types";

export type FrameMasterConfig = {
  /**
   * HTTP server config
   */
  HTTPServer: Omit<
    Bun.Serve.Options<undefined, string> & {
      static?: {} | undefined;
    },
    "fetch" | "websocket"
  >;
  /**
   *  WebSocket server config
   */
  DevServer: Omit<Bun.Serve.Options<undefined, string>, "fetch">;
  /**
   * Frame-Master Plugins to load
   */
  plugins: FrameMasterPlugin<any>[];
};

export type Params = Record<string, string | string[]>;

declare global {
  var __PROCESS_ENV__: Record<string, string>;
}
