import type { OnLoadArgs } from "bun";
import type { ClientIPCManager, DirectiveTool } from "./utils";
import { MasterRequest } from "../server/request-manager";
/**
 * IPCManager for the main thred
 * used for sending messages between main, cluster and builder threads
 */
type IPCMain = ClientIPCManager<"main">;
/**
 * IPCManager for the cluster thread
 * used for sending messages between main, cluster and builder threads
 */
type IPCCluster = ClientIPCManager<"cluster">;


export type ServerStart = Partial<{
  /**
   * **executed on the main thread**
   */
  main: (
    //ipc: IPCMain
  ) => Promise<any> | any;
  /**
   * executed on dev mode on the main thread
   * 
   * **ONLY DEV MODE**
   * 
   * @param ipc IPC manager for the main thread
   * @returns
   */
  dev_main: (
    //ipc: IPCMain
  ) => Promise<any> | any;
  /**
 * **executed on clusters in multi-threaded mode on the clusters thread**
 * 
 * This will not share the same context as the main thread.
 * 
 * **ONLY IN MULTI-THREADED AND PRODUCTION MODE**
 * 
 * @param ipc IPC manager for the cluster thread
 * @returns
 */
  cluster: (
    //ipc: IPCCluster
  ) => Promise<any> | any;
}>;

type HTML_Rewrite_plugin_function<T = unknown> = {
  initContext?: (req: MasterRequest) => T;
  rewrite?: (
    reWriter: HTMLRewriter,
    manager: MasterRequest,
    context: T,
  ) => void | Promise<void>;
  after?: (context: T, manager: MasterRequest, HTML: string) => void | Promise<void>;
};


type Requirement = Partial<{
  /**
   * bunextPlugins is an object where the key is the plugin name and the value is the version
   * 
   * this is used to check if the plugin is installed and the correct version
   * 
   * if the plugin is not installed or the version is incorrect, an error will be thrown
   * 
   * @example { "bunext-plugin-name": "^1.0.0" }
   */
  frameMasterPlugins: Record<string, string>;
  frameMasterVersion: string;
  bunVersion: string;
}>;

export type Request_Plugin = (
  request: MasterRequest,
  //ipc: ClientIPCManager<"cluster" | "main">
) => Promise<void> | void;

export type AfterRequest_Plugin = (
  request: MasterRequest,
  //ipc: ClientIPCManager<"cluster" | "main">
) => Promise<void | Response> | void | Response;

type PartialOverRideResponse = Partial<{
  /**
   * Parsed contents before Bunext processes it for internal features. 
   */
  contents: string;
  /**
   * Loader type for Bun's build process.
   * Refer to Bun's documentation for available loader types.
   */
  loader: Bun.Loader;
}> | undefined;

type Build_Plugins = Partial<{
  plugin: Bun.BunPlugin;
  buildOptions: Partial<Bun.BuildConfig> | (() => Promise<Partial<Bun.BuildConfig>> | Partial<Bun.BuildConfig>);
  /**
   * Add your own custom onLoad handlers for ts and tsx files in the **src/pages** or any subdirectory in process.cwd() directory.
   * 
   * use the fileContent parameter to get the content of the file and modify it to be returned after.
   * 
   * **You must modify the fileContent variable and return it as contents in the response object.**
   * 
   * **Otherwise it will break Plugin chaining**
   * 
   * @example
   *  tsx: (args, fileContent) => {
   *    // modify the fileContent as needed
   *    const modifiedContent = fileContent.replace("oldValue", "newValue");
   *    // OR
   *    const modifiedContent = new Bun.Transpiler({ loader: args.loader, }).transformSync(fileContent);
   *    return { contents: modifiedContent, loader: "js" };
   *  }
   */
  partialPluginOverRide: Partial<{
    /**
     * modify tsx files in the src/pages directory before Bunext processes it for internal features.
     * 
     * **You must modify the fileContent variable and return it as contents in the response object.**
     * 
     * **Otherwise it will break Plugin chaining**
     * 
     * @example
     * tsx: (args, fileContent) => {
   *    // modify the fileContent as needed
   *    const modifiedContent = fileContent.replace("oldValue", "newValue");
   *    // OR
   *    const modifiedContent = new Bun.Transpiler({ loader: args.loader, }).transformSync(fileContent);
   *    return { contents: modifiedContent, loader: "js" };
   *  }
     * @param args 
     * @param fileContent 
     * @param fileDirectives file directives tool instance for testing file directives
     * @returns 
     */
    tsx: (args: OnLoadArgs, fileContent: string, fileDirectives: DirectiveTool) => Promise<PartialOverRideResponse> | PartialOverRideResponse;
    /**
     * modify ts files in the src/pages directory before Bunext processes it for internal features.
     * 
     * **You must modify the fileContent variable and return it as contents in the response object.**
     * 
     * **Otherwise it will break Plugin chaining**
     * 
     * @example
     * tsx: (args, fileContent) => {
   *    // modify the fileContent as needed
   *    const modifiedContent = fileContent.replace("oldValue", "newValue");
   *    // OR
   *    const modifiedContent = new Bun.Transpiler({ loader: args.loader, }).transformSync(fileContent);
   *    return { contents: modifiedContent, loader: "js" };
   *  }
     * @param args 
     * @param fileContent 
     * @param fileDirectives file directives tool instance for testing file directives
     * @returns 
     */
    ts: (args: OnLoadArgs, fileContent: string, fileDirectives: DirectiveTool) => Promise<PartialOverRideResponse> | PartialOverRideResponse;
    /**
     * Other js like files (js, jsx, ts, tsx) somewhere else in project except src/pages directory
     * 
     * **You must modify the fileContent variable and return it as contents in the response object.**
     * 
     * **Otherwise it will break Plugin chaining**
     * 
     * @example
     * others: (args, fileContent, fileDirectives) => {
     *    // modify the fileContent as needed
     *    const modifiedContent = fileContent.replace("oldValue", "newValue");
     *    return { contents: modifiedContent };
     * }
     */
    others: (args: OnLoadArgs, fileContent: string, fileDirectives: DirectiveTool) => Promise<PartialOverRideResponse> | PartialOverRideResponse;
  }>;
  /**
 * Triggered on the **Main Thread** before the build step.
 */
  before_build: (
    //ipc: IPCMain
  ) => Promise<any> | any;
  /**
   * Triggered on the **Main Thread** after the build step and passes every output BuildArtifact for processing.
   */
  after_build: (
    BuildArtifact: Bun.BuildOutput,
    //ipc: IPCMain
  ) => Promise<any> | any;
}>;

export type PreBuildContextDefaultValues = { route: string };

type onFileSystemChangePlugin = (
  filePath: string | undefined,
  /**
   * Prevent the build from running
   * 
   * This is useful if you want to prevent the build from running when a file is changed
   */
  preventBuild: () => void,
  //ipc: IPCMain
) => void | Promise<void>;

export type PluginOptions = {
  HTMLRewrite?: unknown;
}

export type FrameMasterPlugin<options extends PluginOptions = Required<PluginOptions>> = Required<{
  name: string;
}> & Partial<{

  /**
   * Add Bun.build plugins and build config
   *
   * **Run on the build worker thread**
   */
  build: Build_Plugins;

  /**
   * Router related plugin section
   */
  router: Partial<{
    /**
     * Parse and rewrite HTML content before sending to the client.
     */
    html_rewrite: HTML_Rewrite_plugin_function<options["HTMLRewrite"]>;
    /**
     * Intercept and modify requests before they are processed by the router.
     * Access the BunextRequest via manager.bunextReq
     * @example (manager: RequestManager): Promise<RequestManager> | RequestManager | void | Promise<void> => {
     * // when set via __BYPASS_RESPONSE__ the HTMLRewrite plugins, globalValuesInjection and other request plugin will be skipped
     * // more performant but less flexible
     *  manager.bunextReq.__BYPASS_RESPONSE__ = new Response("Custom response");
     *
     * // global injected value and rewrite plugin will be applied
     * manager.bunextReq.setResponse("Custom response", { headers: { "X-Custom-Header": "value" } });
     *
     * }
     */
    request: Request_Plugin;
    /**
     * Triggered before the request is processed.
     * 
     * Allows context initialization or other pre-processing tasks.
     * 
     * **Do not use this for modifying or setting the response.**
     * @param manager RequestManager
     * @example (manager: RequestManager) => {
     *  manager.bunextReq.setContext({ customValue: "value" });
     *  manager.bunextReq.InjectGlobalValues({ __CUSTOM_GLOBAL__: "value" });
     * }
     */
    before_request: (
      manager: MasterRequest,
      //ipc: ClientIPCManager<"main" | "cluster">
    ) => void | Promise<void>;
    /**
     * Triggered after the request is processed.
     * Allows for modifying the response before it is sent to the client or overriding the current response.
     *
     * if a response is returned this will overwrite the original response
     *
     * @example (manager: RequestManager, ipc: ClientIPCManager<"main" | "cluster">) => {
     *  // Modify response headers and return a new response
     *  const newHeaders = new Headers(response.headers);
     *  newHeaders.set("X-Custom-Header", "value");
     *  return new Response(manager.bunextReq.response.body, { 
     *    status: response.status, 
     *    headers: newHeaders 
     *  });
     * }
     * 
     * @example (manager: RequestManager, ipc: ClientIPCManager<"main" | "cluster">) => {
     * // Add custom headers to the existing response
     *  manager.bunextReq.response.headers.set("X-Custom-Header", "value");
     * }
     */
    after_request: AfterRequest_Plugin
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
   * Paths from node_modules to force exclusion from the build
   * @example ["my_module/serverOnly/index.ts"]
   */
  removeFromBuild: Array<string>;
  /**
   * Triggered when a change is made in ./src and ./static, (add, delete, update) a file.
   *
   * **Run on the main thread**
   *
   * **ONLY DEV MODE**
   */
  onFileSystemChange: onFileSystemChangePlugin;

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
   *  bunextPlugins: {
   *    "bunext-some-plugin": "^1.0.0"
   *  },
   *  bunextVersion: "^1.0.0",
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
  directives: Array<{ name: string, regex: RegExp }>;

}>;
