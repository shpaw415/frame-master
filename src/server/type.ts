import type { FrameMasterPlugin } from "../plugins/types";


export type FrameMasterConfig = {
    HTTPServer: Omit<Bun.ServeFunctionOptions<unknown, {}> & {
        static?: {} | undefined;
    }, "fetch" | "websocket">;
    DevServer: Omit<Bun.ServeOptions, "fetch">;
    plugins: FrameMasterPlugin<any>[];
};

export type Params = Record<string, string | string[]>;

declare global {
    var __PROCESS_ENV__: Record<string, string>;
}