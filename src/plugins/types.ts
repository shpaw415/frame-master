import type {
  ClientIPCManager,
  DirectiveDefinition,
  Directives,
} from "./utils";
import { masterRequest } from "../server/request-manager";
import type { Builder } from "../build";
import type { Command } from "commander";
import type { FrameMasterConfig } from "../server/type";

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

/**
 * Build lifecycle hooks configuration for Frame-Master plugins.
 *
 * Frame-Master uses a **singleton builder** pattern where all plugins contribute
 * to a single unified build pipeline. Build configurations from all plugins are
 * intelligently merged, and any plugin can trigger a build that includes all
 * plugin configurations.
 *
 * ## Build Configuration Types
 *
 * ### Static Configuration (Object)
 * Merged once when `builder` is imported from "frame-master/build".
 * Use for configs that don't change at build time.
 *
 * ```typescript
 * buildConfig: {
 *   external: ["react", "react-dom"],
 *   target: "browser"
 * }
 * ```
 *
 * ### Dynamic Configuration (Function)
 * Executed each time `builder.build()` is called.
 * Use for configs that depend on runtime state or builder properties.
 *
 * ```typescript
 * buildConfig: async (builder) => ({
 *   external: builder.isLogEnabled ? ["debug-lib"] : [],
 *   minify: process.env.NODE_ENV === "production"
 * })
 * ```
 *
 * ## Singleton Builder Pattern
 *
 * All plugins share the same `builder` instance:
 *
 * ```typescript
 * import { builder } from "frame-master/build";
 *
 * // Plugin A contributes config
 * buildConfig: { external: ["react"] }
 *
 * // Plugin B contributes config
 * buildConfig: { plugins: [myBunPlugin()] }
 *
 * // Plugin C triggers the build (includes A + B configs)
 * serverStart: {
 *   main: async () => {
 *     await builder.build("/src/client.ts");
 *     // Build uses merged configs from A, B, and C
 *   }
 * }
 * ```
 *
 * ## Intelligent Config Merging
 *
 * Frame-Master merges configs with smart strategies:
 * - **Arrays**: Deduplicated and concatenated (e.g., `external`, `entrypoints`)
 * - **Objects**: Deep merged (e.g., `define`, `loader`)
 * - **Plugins**: Concatenated to preserve order
 * - **Primitives**: Last plugin wins with warning
 *
 * Provides control over the build process at different stages,
 * allowing plugins to customize build configuration and perform
 * operations before and after the build completes.
 */
export type BuildOptionsPlugin = {
  /**
   * Build configuration to merge into the unified build pipeline.
   *
   * Can be either:
   * - **Static object**: Merged once on import (for constant configs)
   * - **Dynamic function**: Called on each `builder.build()` (for runtime configs)
   *
   * The builder parameter in dynamic configs is the singleton Builder instance
   * shared across all plugins, providing access to methods like:
   * - `builder.getConfig()` - Get current merged config
   * - `builder.analyzeBuild()` - Analyze build outputs
   * - `builder.isLogEnabled` - Check if logging is enabled
   *
   * @param builder - The singleton Builder instance shared by all plugins
   * @returns Partial Bun.BuildConfig to merge with other plugins' configs
   *
   * @example
   * ```typescript
   * // Static configuration (merged on import)
   * buildConfig: {
   *   external: ["react", "react-dom"],
   *   target: "browser",
   *   minify: true
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Dynamic configuration (called on build)
   * buildConfig: async (builder) => {
   *   const isDev = process.env.NODE_ENV !== "production";
   *
   *   return {
   *     external: ["react", "react-dom"],
   *     minify: !isDev,
   *     sourcemap: isDev ? "inline" : "external",
   *     define: {
   *       "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
   *       "__DEBUG__": isDev.toString()
   *     },
   *     plugins: [
   *       // Add Bun plugins dynamically
   *       myCustomBunPlugin({ debug: isDev })
   *     ]
   *   };
   * };
   * ```
   *
   * @example
   * ```typescript
   * // Access builder properties in dynamic config
   * buildConfig: (builder) => {
   *   if (builder.isLogEnabled) {
   *     console.log("Building with logging enabled");
   *   }
   *
   *   return {
   *     external: ["my-lib"],
   *     // Conditionally add config based on builder state
   *   };
   * };
   * ```
   *
   * @example
   * ```typescript
   * // Type-safe config with helper
   * import { defineBuildConfig } from "frame-master/build";
   *
   * buildConfig: defineBuildConfig({
   *   target: "browser", // Full autocomplete!
   *   external: ["react"],
   *   minify: process.env.NODE_ENV === "production"
   * })
   * ```
   */
  buildConfig?:
    | Partial<Bun.BuildConfig>
    | ((
        builder: Builder
      ) => Partial<Bun.BuildConfig> | Promise<Partial<Bun.BuildConfig>>);

  /**
   * Hook executed before the build process starts.
   *
   * Runs after all configs are merged but before `Bun.build()` is called.
   * All plugins' `beforeBuild` hooks execute in parallel.
   *
   * Use for: setup tasks, file generation, validation, or pre-build operations.
   *
   * @param buildConfig - The final merged Bun.BuildConfig from all plugins
   * @param builder - The singleton Builder instance with helper methods
   *
   * @example
   * ```typescript
   * beforeBuild: async (buildConfig, builder) => {
   *   console.log("Building", buildConfig.entrypoints.length, "entrypoints");
   *
   *   // Validate configuration
   *   if (!buildConfig.outdir) {
   *     throw new Error("Output directory not specified");
   *   }
   *
   *   // Generate build manifest
   *   await Bun.write(".frame-master/build-info.json", JSON.stringify({
   *     timestamp: new Date().toISOString(),
   *     entrypoints: buildConfig.entrypoints,
   *     target: buildConfig.target
   *   }));
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Clean and prepare output directory
   * beforeBuild: async (buildConfig, builder) => {
   *   const outdir = buildConfig.outdir || ".frame-master/build";
   *
   *   // Clean previous build
   *   await Bun.$`rm -rf ${outdir}/*`;
   *
   *   // Copy static assets
   *   await Bun.$`cp -r public/* ${outdir}/`;
   * }
   * ```
   */
  beforeBuild?: (
    buildConfig: Bun.BuildConfig,
    builder: Builder
  ) => void | Promise<void>;

  /**
   * Hook executed after the build process completes.
   *
   * Runs after `Bun.build()` finishes, whether successful or failed.
   * All plugins' `afterBuild` hooks execute (not in parallel).
   *
   * Use for: processing outputs, copying files, generating reports, or cleanup.
   *
   * @param buildConfig - The build configuration that was used
   * @param result - The Bun.BuildOutput with success status and artifacts
   * @param builder - The singleton Builder instance (access outputs via `builder.outputs`)
   *
   * @example
   * ```typescript
   * afterBuild: async (buildConfig, result, builder) => {
   *   if (!result.success) {
   *     console.error("Build failed!");
   *     return;
   *   }
   *
   *   console.log("✅ Build successful!");
   *
   *   // Log all generated files
   *   for (const output of result.outputs) {
   *     console.log(`  ${output.path} (${output.kind}) - ${output.size} bytes`);
   *   }
   *
   *   // Generate build report
   *   const report = builder.generateReport("text");
   *   console.log(report);
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Analyze bundle sizes and warn about large files
   * afterBuild: async (buildConfig, result, builder) => {
   *   if (!result.success) return;
   *
   *   const analysis = builder.analyzeBuild();
   *
   *   if (analysis.totalSize > 1_000_000) {
   *     console.warn("⚠️  Bundle size exceeds 1MB:", analysis.totalSize);
   *   }
   *
   *   // Check for large individual files
   *   for (const file of analysis.largestFiles.slice(0, 3)) {
   *     if (file.size > 500_000) {
   *       console.warn(`⚠️  Large file: ${file.path} (${file.size} bytes)`);
   *     }
   *   }
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Copy assets and generate metadata
   * afterBuild: async (buildConfig, result, builder) => {
   *   if (!result.success) return;
   *
   *   // Copy additional assets
   *   await Bun.$`cp -r static/* ${buildConfig.outdir}/`;
   *
   *   // Generate asset manifest for caching
   *   const manifest = result.outputs.reduce((acc, output) => {
   *     const hash = Bun.hash(output.path).toString(36);
   *     acc[output.path] = { hash, size: output.size };
   *     return acc;
   *   }, {});
   *
   *   await Bun.write(
   *     `${buildConfig.outdir}/manifest.json`,
   *     JSON.stringify(manifest, null, 2)
   *   );
   * }
   * ```
   */
  afterBuild?: (
    buildConfig: Bun.BuildConfig,
    result: Bun.BuildOutput,
    builder: Builder
  ) => void | Promise<void>;

  /**
   * Enable detailed logging during build process.
   *
   * When ANY plugin sets this to true, the singleton builder enables logging
   * for all build operations, helping with debugging and pipeline understanding.
   *
   * Logs include:
   * - Merged configuration details
   * - Entrypoint counts
   * - Plugin counts
   * - Config merge operations
   * - Build errors
   *
   * @default false
   *
   * @example
   * ```typescript
   * // Enable in development only
   * enableLoging: process.env.NODE_ENV !== "production"
   * ```
   *
   * @example
   * ```typescript
   * // Enable with environment variable
   * enableLoging: process.env.DEBUG_BUILD === "true"
   * ```
   */
  enableLoging?: boolean;
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
     * You can extend the CustomDirectives interface to add type-safe custom directives:
     *
     * @example
     * ```typescript
     * // Extend the CustomDirectives interface in your plugin
     * declare module "frame-master/plugin/utils" {
     *   interface CustomDirectives {
     *     "use-some-directive": true;
     *   }
     * }
     *
     * const plugin: FrameMasterPlugin = {
     *   name: "my-plugin",
     *   version: "1.0.0",
     *   directives: [
     *     {
     *       name: "use-client", // Built-in directive
     *       regex: /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]client['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m
     *     },
     *     {
     *       name: "use-some-directive", // Custom directive (type-safe after module augmentation)
     *       regex: /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]some-directive['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m
     *     }
     *   ]
     * };
     * ```
     *
     * You can also use the createDirective helper for type-safe directive creation:
     * @example
     * ```typescript
     * import { createDirective } from "frame-master/plugin/utils";
     *
     * const myDirective = createDirective(
     *   "use-client",
     *   /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]client['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m
     * );
     * ```
     */
    directives: Array<DirectiveDefinition<Directives | (string & {})>>;
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
     * Triggered when the frame-master.config.ts file is reloaded.
     *
     * This hook is called after the configuration has been reloaded and
     * plugins have been reinitialized. Use it to perform cleanup or
     * re-initialization tasks specific to your plugin.
     *
     * **Run on the main thread**
     *
     * **ONLY DEV MODE**
     *
     * @example
     * ```typescript
     * {
     *   name: "my-plugin",
     *   onConfigReload: async () => {
     *     console.log("Config reloaded, reinitializing plugin state...");
     *     await reinitializeMyPluginState();
     *   }
     * }
     * ```
     */
    onConfigReload?: () => void | Promise<void>;
    /**
     * Initialize plugin context after plugins and builder are initialized.
     *
     * This hook is called during server initialization, after the plugin loader
     * and builder have been set up. Use it to set up plugin-specific state,
     * initialize connections, or perform any setup that depends on the configuration.
     *
     * **Run on the main thread**
     *
     * @param config - The loaded Frame-Master configuration
     *
     * @example
     * ```typescript
     * {
     *   name: "my-plugin",
     *   version: "1.0.0",
     *   createContext: (config) => {
     *     console.log("Plugin initializing with port:", config.HTTPServer.port);
     *     myPluginState.init(config);
     *   }
     * }
     * ```
     *
     * @example
     * ```typescript
     * // Async context creation
     * {
     *   name: "database-plugin",
     *   version: "1.0.0",
     *   createContext: async (config) => {
     *     await connectToDatabase(config.HTTPServer);
     *   }
     * }
     * ```
     */
    createContext?: (config: FrameMasterConfig) => void | Promise<void>;
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
    /**
     * Build lifecycle hooks for customizing the build process.
     *
     * Allows plugins to modify build configuration, perform pre/post-build operations,
     * and integrate custom build logic into Frame-Master's build pipeline.
     *
     * @example
     * Basic build configuration:
     * ```typescript
     * {
     *   build: {
     *     buildConfig: (builder) => ({
     *       external: ["some-external-package"],
     *       minify: true,
     *       sourcemap: "external"
     *     }),
     *     enableLoging: true
     *   }
     * }
     * ```
     *
     * @example
     * Advanced build hooks:
     * ```typescript
     * {
     *   build: {
     *     buildConfig: (builder) => {
     *      // Customize build configuration with access to builder
     *      // Create dynamic config based on plugin props
     *       return {
     *         external: ["react", "react-dom"],
     *         define: {
     *           "process.env.NODE_ENV": JSON.stringify("production")
     *         }
     *       };
     *     },
     *
     *     beforeBuild: async (buildConfig, builder) => {
     *       // Perform operations before build starts
     *       console.log("Starting build process...");
     *
     *       // Generate additional files, clean directories, etc.
     *       await Bun.write("dist/manifest.json", JSON.stringify({
     *         version: "1.0.0",
     *         timestamp: Date.now()
     *       }));
     *     },
     *
     *     afterBuild: async (buildConfig, result, builder) => {
     *       // Process build output
     *       console.log("Build completed!");
     *       console.log("Output files:", result.outputs.length);
     *
     *       // Post-process generated files
     *       for (const output of result.outputs) {
     *         console.log("Generated:", output.path);
     *       }
     *
     *       // Perform additional tasks like copying assets,
     *       // generating type definitions, etc.
     *     },
     *
     *     enableLoging: true
     *   }
     * }
     * ```
     *
     * @example
     * Custom build plugins integration:
     * ```typescript
     * {
     *   build: {
     *     buildConfig: (builder) => ({
     *       plugins: [
     *         {
     *           name: "custom-transform",
     *           setup(build) {
     *             build.onLoad({ filter: /\.custom$/ }, async (args) => {
     *               const text = await Bun.file(args.path).text();
     *               return {
     *                 contents: transformCustomFile(text),
     *                 loader: "tsx"
     *               };
     *             });
     *           }
     *         }
     *       ]
     *     })
     *   }
     * }
     * ```
     */
    build: BuildOptionsPlugin;
    /**
     * Extend the Frame-Master CLI with custom commands using Commander.js.
     *
     * Plugin commands are automatically registered under the `frame-master extended-cli` namespace,
     * making them accessible as: `frame-master extended-cli <your-command>`
     *
     * The provided Command instance is scoped to your plugin's namespace, allowing you to
     * define subcommands, options, arguments, and actions without conflicting with other plugins.
     *
     * @param command - A Commander.js Command instance for defining your plugin's CLI interface
     * @returns The modified Command instance with your custom commands, options, and handlers
     *
     * @see {@link https://www.npmjs.com/package/commander Commander.js Documentation}
     *
     * @example
     * Basic command with options:
     * ```typescript
     * cli: (command) => {
     *   return command
     *     .command("deploy")
     *     .description("Deploy your application")
     *     .option("-e, --environment <env>", "Deployment environment", "production")
     *     .action(async (options) => {
     *       console.log(`Deploying to ${options.environment}...`);
     *       // Your deployment logic here
     *     });
     * }
     * ```
     *
     * @example
     * Multiple commands with arguments:
     * ```typescript
     * cli: (command) => {
     *   command
     *     .command("init <project-name>")
     *     .description("Initialize a new project")
     *     .option("-t, --template <name>", "Project template")
     *     .action(async (projectName, options) => {
     *       console.log(`Creating ${projectName} from template ${options.template}`);
     *     });
     *
     *   command
     *     .command("status")
     *     .description("Check deployment status")
     *     .action(async () => {
     *       console.log("Checking status...");
     *     });
     *
     *   return command;
     * }
     * ```
     *
     * @example
     * Advanced usage with validation:
     * ```typescript
     * cli: (command) => {
     *   return command
     *     .command("publish")
     *     .description("Publish your package")
     *     .option("-v, --version <version>", "Version number")
     *     .option("--dry-run", "Run without actually publishing")
     *     .action(async (options) => {
     *       if (options.version && !/^\d+\.\d+\.\d+$/.test(options.version)) {
     *         throw new Error("Version must be in format x.y.z");
     *       }
     *
     *       if (options.dryRun) {
     *         console.log("Dry run mode - no changes will be made");
     *       }
     *
     *       // Your publish logic here
     *     });
     * }
     * ```
     */
    cli: (command: Command) => Command;
  }>;
