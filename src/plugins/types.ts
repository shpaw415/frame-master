import type { ClientIPCManager } from "./utils";
import { masterRequest } from "../server/request-manager";

export type WatchEventType = "change" | "rename";

export type FileChangeCallback = (
  eventType: WatchEventType,
  filePath: string,
  absolutePath: string
) => void | Promise<void>;

/**
 * IPCManager for the main thread
 * used for sending messages between main, cluster and builder threads
 * ** for future release **
 */
export type IPCMain = ClientIPCManager<"main">;
/**
 * IPCManager for the cluster thread
 * used for sending messages between main, cluster and builder threads
 * ** for future release **
 */
export type IPCCluster = ClientIPCManager<"cluster">;

export type ServerStart = Partial<{
  /**
   * **executed on the main thread**
   */
  main: () => Promise<unknown> | unknown;
  /**
   * executed on dev mode on the main thread
   *
   * **ONLY DEV MODE**
   */
  dev_main: () => Promise<unknown> | unknown;
  /**
   * **executed on clusters in multi-threaded mode on the clusters thread**
   *
   * This will not share the same context as the main thread.
   *
   * **ONLY IN MULTI-THREADED AND PRODUCTION MODE**
   */
  // cluster: () => Promise<unknown> | unknown;
}>;

type HTML_Rewrite_plugin_function<T = unknown> = {
  initContext?: (req: masterRequest) => T;
  rewrite?: (
    reWriter: HTMLRewriter,
    master: masterRequest,
    context: T
  ) => void | Promise<void>;
  after?: (
    HTML: string,
    master: masterRequest,
    context: T
  ) => void | Promise<void>;
};

type Requirement = Partial<{
  /**
   * frameMasterPlugins is an object where the key is the plugin name and the value is the version
   *
   * this is used to check if the plugin is installed and the correct version
   *
   * if the plugin is not installed or the version is incorrect, an error will be thrown
   *
   * @example { "frame-master-plugin-name": "^1.0.0" }
   */
  frameMasterPlugins: Record<string, string>;
  /**
   * version requirement for frame-master itself
   */
  frameMasterVersion: string;
  /**
   * version requirement for the bun runtime
   */
  bunVersion: string;
}>;

export type Request_Plugin = (
  master: masterRequest
  //ipc: ClientIPCManager<"cluster" | "main">
) => Promise<void> | void;

export type AfterRequest_Plugin = (
  master: masterRequest
  //ipc: ClientIPCManager<"cluster" | "main">
) => Promise<void | Response> | void | Response;

export type PreBuildContextDefaultValues = { route: string };

export type PluginOptions = {
  HTMLRewrite?: unknown;
};

export type FrameMasterPlugin<
  options extends PluginOptions = Required<PluginOptions>
> = Required<{
  /** unique name of the plugin */
  name: string;
  /** version must be set for requirement */
  version: string;
}> &
  Partial<{
    /**
     * Router related plugin section
     */
    router: Partial<{
      /**
       * Parse and rewrite HTML content before sending to the client.
       *
       * Allows for dynamic modifications of HTML structure, attributes, and content.
       *
       * **Works only if response body is `string | ReadableStream`**
       *
       * @example
       * ```typescript
       * {
       *   initContext: (req: masterRequest) => {
       *     return { userAgent: req.request.headers.get("user-agent") || "" };
       *   },
       *   rewrite: (reWriter: HTMLRewriter, master: masterRequest, context) => {
       *     reWriter.on("title", {
       *       element: (el) => {
       *         el.setInnerContent(`Title for ${context.userAgent}`);
       *       }
       *     });
       *   },
       *   after: (HTML: string, master: masterRequest, context) => {
       *     console.log("Final HTML length:", HTML.length);
       *   }
       * }
       * ```
       */
      html_rewrite: HTML_Rewrite_plugin_function<options["HTMLRewrite"]>;
      /**
       * Triggered before the request is processed.
       *
       * Allows context initialization or other pre-processing tasks.
       *
       * **Do not use this for modifying or setting the response.**
       *
       * @param manager - The masterRequest instance
       *
       * @example
       * ```typescript
       * (manager: masterRequest) => {
       *   manager.setContext({ customValue: "value" });
       *   manager.setGlobalValues({ __CUSTOM_GLOBAL__: "value" });
       * }
       * ```
       *
       * Get cookie and set in context example:
       * @example
       * ```typescript
       * (master: masterRequest) => {
       *    // Get a cookie named "session"
       *    // second parameter true to decrypt if encrypted
       *   const sessionCookie = master.getCookie<Record<string, unknown>>("session", true);
       *   master.setContext<{ sessionData: Record<string, unknown> | null }>({
       *     sessionData: sessionCookie || null,
       *   });
       * }
       * ```
       *
       * Set global value example:
       * @example
       * ```typescript
       *  declare global {
       *    var __GLOBAL_VALUE__: string;
       *  }
       *
       * (master: masterRequest) => {
       *  // Set global value accessible client side
       *   master.setGlobalValues({ __GLOBAL_VALUE__: "value" });
       * }
       * ```
       */
      before_request: (
        master: masterRequest
        //ipc: ClientIPCManager<"main" | "cluster">
      ) => void | Promise<void>;
      /**
       * Intercept the request and set the response.
       *
       * Request plugin is triggered orderly based on plugin priority.
       *
       * if `master.sendNow()` is used the response is created immediately and no other request plugins are executed.
       *
       * then after_request plugins are executed orderly based on plugin priority.
       *
       * **At this point the response does not exists only the initializer can be setted**
       *
       * Access the masterRequest
       * @example (req: masterRequest): Promise<masterRequest> | masterRequest | void | Promise<void> => {
       * // global injected value and rewrite plugin will be applied
       * req.setResponse("Custom response", { headers: { "X-Custom-Header": "value" } });
       *
       * }
       */
      request: Request_Plugin;
      /**
       * Triggered after the request is processed.
       * Allows for modifying the response before it is sent to the client.
       *
       * @param master - The masterRequest instance
       *
       * @example
       * Modify response headers:
       * ```typescript
       * (master: masterRequest) => {
       *   master.response.headers.set("X-Custom-Header", "value");
       * }
       * ```
       *
       * SetCookie from context data:
       * ```typescript
       * (master: masterRequest) => {
       *   const context = master.getContext<{ sessionData: string }>();
       *   if (context.sessionData) {
       *     master.setCookie("session", context.sessionData, { httpOnly: true, encrypted: true });
       *   }
       * }
       * ```
       */
      after_request: AfterRequest_Plugin;
    }>;
    /**
     * Triggered once when the server starts
     *
     * Initialize resources, connections, or perform startup tasks.
     *
     * You should create IPC listeners here if needed.
     */
    serverStart: ServerStart;

    /**
     * 0 has higher priority than 1
     */
    priority: number;

    /**
     * Plugin requirements that must be met for the plugin to be loaded.
     *
     * If the requirements are not met, an error will be thrown and the plugin will not be loaded.
     *
     * This is useful for ensuring that the plugin has all the necessary dependencies and environment to function correctly.
     *
     * @example
     * {
     *  frameMasterPlugins: {
     *    "frame-master-some-plugin": "^1.0.0"
     *  },
     *  frameMasterVersion: "^1.0.0",
     *  bunVersion: ">=1.0.0 <2.0.0"
     * }
     */
    requirement: Requirement;
    /**
     * Specify additional Bun plugins to be used at runtime to be included in the bunfig.toml.
     */
    runtimePlugins: Array<Bun.BunPlugin>;
    /**
     * Specify directives that can be used in files to control plugin behavior.
     *
     * Directives are special comments that can be added to the top of your files to enable or disable certain plugin features.
     *
     * @example
     * {
     *  name: "my-plugin",
     *  directives: [
     *    {
     *      name: "use-client",
     *      regex: /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]client['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m
     *    },
     *    {
     *      name: "use-some-directive",
     *      regex: /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]some-directive['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m
     *    }
     *  ]
     * }
     *
     */
    directives: Array<{ name: string; regex: RegExp }>;
    /**
     * ServerConfig
     */
    serverConfig: Partial<
      Omit<Bun.Serve.Options<undefined, string>, "fetch" | "port" | "tls">
    >;
    /**
     * Watch directories for file system changes and trigger onFileSystemChange plugin on DEV mode.
     */
    fileSystemWatchDir?: Array<string>;
    /**
     * Triggered when a change is made in directory found in fileSystemWatchDir.
     *
     * **Run on the main thread**
     *
     * **ONLY DEV MODE**
     *
     * @param eventType - Type of file system event ("change" | "rename")
     * @param filePath - Relative path to the changed file
     * @param absolutePath - Absolute path to the changed file
     */
    onFileSystemChange?: FileChangeCallback;
    /**
     * WebSocket event handlers for real-time communication.
     *
     * When defining WebSocket routes in serverConfig.routes, you can set custom data to identify the WebSocket connection.
     *
     * websocket onOpen, onMessage, and onClose handlers will receive the WebSocket instance of any other plugin as well.
     *
     * You can use the `ws.data` property to check if the WebSocket connection belongs to your plugin.
     *
     * @example
     * ```typescript
     * serverConfig: {
     *  routes: {
     *     "/ws/my-plugin": (req, server) => server.upgrade(req, { data: { "my-plugin-ws": true } }),
     * },
     * websocket: {
     *   onOpen: (ws) => {
     *     console.log("WebSocket connected");
     *   },
     *   onMessage: (ws, message) => {
     *    if(ws.data["my-plugin-ws"]){
     *      ws.send("Echo: " + message);
     *    }
     *   },
     *   onClose: (ws) => {
     *     console.log("WebSocket disconnected");
     *   }
     * }
     * ```
     */
    websocket: Partial<{
      /** Called when a WebSocket connection is established */
      onOpen: (ws: Bun.ServerWebSocket<undefined>) => Promise<void> | void;
      /** Called when a message is received from the WebSocket client */
      onMessage: (
        ws: Bun.ServerWebSocket<undefined>,
        message: string | ArrayBufferView
      ) => Promise<void> | void;
      /** Called when the WebSocket connection is closed */
      onClose: (ws: Bun.ServerWebSocket<undefined>) => Promise<void> | void;
    }>;
  }>;
