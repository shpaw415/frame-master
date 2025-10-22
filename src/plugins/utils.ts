"server only";

import cluster, { type Cluster } from "node:cluster";
import type { FrameMasterPlugin, PluginOptions } from "./types";

// Base directives that are always available
export type BaseDirectives =
  | "use-client"
  | "use-server"
  | "use-static"
  | "server-only";

/**
 * Plugin makers can extend this interface to add custom directives with type safety.
 *
 * @example
 * ```typescript
 * // In your plugin file:
 * declare module "frame-master/plugin/utils" {
 *   interface CustomDirectives {
 *     "use-custom": true;
 *     "my-directive": true;
 *   }
 * }
 *
 * // Then use it:
 * directiveToolSingleton.addDirective(
 *   "use-custom",
 *   /^['"]use[-\s]custom['"];?\s*$/m
 * );
 *
 * // Now TypeScript knows about your custom directive:
 * await directiveToolSingleton.pathIs("use-custom", filePath); // ✓ Type-safe
 * ```
 */
export interface CustomDirectives {}

// Combined type that includes both base and custom directives
export type Directives = BaseDirectives | keyof CustomDirectives;

type DirectiveEntry = { path: string; route?: string };

export class DirectiveTool {
  private entries: Map<string, Array<DirectiveEntry>> = new Map<
    string,
    Array<DirectiveEntry>
  >();
  private directiveToRegex: Map<string, RegExp> = new Map();
  private filePaths: string[] = [];
  private knownDirectives: Set<string> = new Set([
    "use-client",
    "use-server",
    "use-static",
    "server-only",
  ]);

  constructor() {
    // Improved regex patterns to match directives at the beginning of the file
    // Supports both hyphen and space formats (e.g., "use-client" or "use client")
    // Allows for optional whitespace, comments, and flexible quote styles
    this.directiveToRegex.set(
      "use-client",
      /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]client['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m
    );
    this.directiveToRegex.set(
      "use-server",
      /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]server['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m
    );
    this.directiveToRegex.set(
      "use-static",
      /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]static['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m
    );
    this.directiveToRegex.set(
      "server-only",
      /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]server[-\s]only['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m
    );
  }

  /**
   * Add a custom directive to the tool
   * @param directive The directive name (will be added to known directives)
   * @param regex The regex pattern to match the directive in files
   * @returns This instance for chaining
   */
  addDirective<T extends string>(directive: T, regex: RegExp) {
    this.directiveToRegex.set(directive, regex);
    this.knownDirectives.add(directive);
    return this;
  }

  clearPaths() {
    this.filePaths = [];
  }

  static async getInstance(init?: Array<DirectiveEntry>) {
    const instance = new DirectiveTool();
    if (init) {
      await Promise.all(
        init.map((entry) => instance.addEntry(entry.path, entry.route))
      );
    }
    return instance;
  }

  /**
   * Check if a file path is associated with a specific directive.
   * @param directive The directive to check against.
   * @param filePath The file path to check.
   * @param route Optional route information.
   * @returns True if the file path is associated with the directive, false otherwise.
   */
  public async pathIs(
    directive: Directives,
    filePath: string,
    route?: string
  ): Promise<boolean> {
    if (!this.filePaths.includes(filePath))
      return (await this.addEntry(filePath, route)) == directive;
    return (
      this.entries.get(directive)?.some((entry) => entry.path === filePath) ??
      false
    );
  }

  public getFromDirective(directive: Directives): Array<DirectiveEntry> {
    return this.entries.get(directive as string) || [];
  }
  /**
   * Get the directive associated with a specific route.
   * @param route The route to check.
   * @returns The directive associated with the route, or null if none found.
   */
  public getDirectiveFromRoute(route: string): string | null {
    for (const [directive, entries] of this.entries) {
      if (entries.some((entry) => entry.route === route)) {
        return directive;
      }
    }
    return null;
  }
  /**
   * Get the directive associated with a specific file path.
   * @param filePath The file path to check.
   * @returns The directive associated with the file path, or null if none found.
   */
  public getDirectiveFromFilePath(filePath: string): string | null {
    for (const [directive, entries] of this.entries) {
      if (entries.some((entry) => entry.path === filePath)) {
        return directive;
      }
    }
    return null;
  }

  /**
   * Add a new entry for a file path and its associated route.
   * @param filePath The file path to add.
   * @param route The route associated with the file path.
   * @returns The directive associated with the file path, default: use-server
   */
  public async addEntry(filePath: string, route?: string) {
    if (this.filePaths.includes(filePath))
      return this.getDirectiveFromFilePath(filePath) as string;
    const directive = await this.detectDirective(filePath);
    if (!this.entries.has(directive)) {
      this.entries.set(directive, []);
    }
    this.entries.get(directive)?.push({ path: filePath, route });
    this.filePaths.push(filePath);
    return directive;
  }

  private async detectDirective(filePath: string): Promise<string> {
    const fileContent = await Bun.file(filePath).text();
    // Trim leading whitespace to check if directive is at the very beginning
    const trimmedContent = fileContent.trimStart();

    for (const [directive, regex] of this.directiveToRegex) {
      if (regex.test(trimmedContent)) {
        return directive;
      }
    }
    return "use-server";
  }
}

export const directiveToolSingleton = new DirectiveTool();

export function createPlugin<Options extends PluginOptions>(
  plugin: FrameMasterPlugin<Options>
): FrameMasterPlugin<Options> {
  return plugin;
}

type IPCProcesses = {
  builder: Bun.Subprocess<"ignore", "inherit", "inherit"> | null;
  clusters: Array<Cluster["worker"]> | null;
};

type IPCProcessType = "cluster" | "main";
type IPCManagerOptions = {
  type: IPCProcessType;
};

type IPCMessageFormat<T extends unknown> = {
  from: IPCProcessType;
  to: IPCProcessType;
  id: string;
  data: T;
  requestID: string;
  type: "request" | "response";
};

export type ClientIPCManager<T extends IPCProcessType> = Omit<
  IPCManager<T>,
  | "processes"
  | "initMain"
  | "initSubProcesses"
  | "__DISPATCH__"
  | "__VERIFY_MESSAGE_FORMAT__"
  | "call"
  | "setBuilderProcess"
  | "setClusterProcesses"
  | "getInstanceForCurrentProcess"
>;

declare global {
  var IPCManagerMain: IPCManager<"main">;
  var IPCManagerCluster: IPCManager<"cluster">;
}

/** IPC Manager class will be implemented in a next version */
class IPCManager<ProcessType extends IPCProcessType = IPCProcessType> {
  public type: ProcessType = "main" as ProcessType;
  private onMessageCallbacks: Map<
    string,
    (message: any, from: IPCProcessType) => Promise<unknown> | unknown
  > = new Map();

  private processes: IPCProcesses = {
    builder: null,
    clusters: null,
  };
  private isClusterInited: boolean = false;
  private queuedMessages: Array<IPCMessageFormat<unknown>> = [];

  private responseAwaiters: Map<string, (data: unknown) => void> = new Map();

  constructor({ type }: IPCManagerOptions) {
    this.type = type as ProcessType;
    if (type !== "main") this.initSubProcesses();
    else this.initMain();

    if (type === "cluster") this.isClusterInited = true;
  }

  private initMain() {
    cluster.on("message", async (worker, _message) => {
      this.__DISPATCH__(_message);
    });
  }

  private initSubProcesses() {
    process.on("message", (message) => {
      const messageObj = message as IPCMessageFormat<unknown>;
      this.__DISPATCH__(messageObj);
    });
    this.onMessage("cluster-ready", () => {
      this.isClusterInited = true;
    });
  }

  public setClusterProcesses(clusters: Array<Cluster["worker"]>) {
    if (this.type !== "main")
      throw new Error(
        "setClusterProcesses can only be called from the main process"
      );
    this.processes.clusters = clusters;
    this.isClusterInited = true;
    this.queuedMessages
      .filter((msg) => msg.to === "cluster")
      .forEach((msg) => this.__DISPATCH__(msg));
    this.queuedMessages = this.queuedMessages.filter(
      (msg) => msg.to !== "cluster"
    );
  }

  public static getInstanceForCurrentProcess<
    T extends IPCProcessType
  >(): IPCManager<T> {
    if (cluster.isWorker) {
      return IPCManager.getInstanceForCluster() as IPCManager<T>;
    } else {
      return IPCManager.getInstanceForMain() as IPCManager<T>;
    }
  }

  public static getInstanceForMain() {
    globalThis.IPCManagerMain ??= new IPCManager<"main">({ type: "main" });
    return globalThis.IPCManagerMain;
  }
  /**
   * Get the singleton instance of IPCManager for cluster processes.
   * @returns The singleton instance of IPCManager for cluster processes.
   *
   * **process.on("message", ...) is already handled in initSubProcesses**
   */
  public static getInstanceForCluster() {
    globalThis.IPCManagerCluster ??= new IPCManager<"cluster">({
      type: "cluster",
    });
    return globalThis.IPCManagerCluster;
  }
  private createResponseAwaiter(requestID: string) {
    return new Promise<unknown>((resolve) => {
      this.responseAwaiters.set(requestID, resolve);
    });
  }
  /**
   * send a message to another process and await a response.
   * @param to Process type to send the message to
   * @param id Message ID
   * @param data Message data
   * @returns Promise that resolves with the response data
   */
  public async send<
    RequestData extends unknown = unknown,
    ResponseData extends unknown = unknown
  >(to: IPCProcessType, id: string, data: RequestData): Promise<ResponseData> {
    const requestID = Bun.randomUUIDv7();

    if (this.type == "main" && !this.isClusterInited && to == "cluster") {
      this.queuedMessages.push({
        from: this.type,
        to,
        id,
        data,
        requestID,
        type: "request",
      });
      return this.createResponseAwaiter(requestID) as Promise<ResponseData>;
    }
    const message: IPCMessageFormat<RequestData> = {
      from: this.type,
      to: to as IPCProcessType,
      id,
      data,
      requestID,
      type: "request",
    };
    const responsePromise = this.createResponseAwaiter(
      requestID
    ) as Promise<ResponseData>;
    this.__DISPATCH__(message);
    return responsePromise;
  }
  /**
   * Register a callback to be called when a message with the specified ID is received.
   * @param id The ID of the message to listen for.
   * @param callback The callback to be called when the message is received. Then return value will be sent back to the sender as a response.
   */
  public onMessage<
    RequestData extends unknown = unknown,
    ResponseData extends unknown = unknown
  >(
    id: string,
    callback: (
      message: RequestData,
      from: IPCProcessType
    ) => Promise<ResponseData> | ResponseData
  ) {
    this.onMessageCallbacks.set(id, callback);
  }
  /**
   * Dispatch a message to the appropriate process.
   * @param message Message received from another process
   *
   * **Note: This method is intended for internal use only and should not be called directly.**
   */
  public __DISPATCH__(message: IPCMessageFormat<unknown>) {
    if (!this.__VERIFY_MESSAGE_FORMAT__(message)) {
      console.warn(`IPCManager: Invalid message format:\n`, message);
      return;
    }
    if (this.type === message.to) {
      if (message.type === "request") {
        this.call(message.id, message);
      } else if (message.type === "response") {
        this.responseAwaiters.get(message.requestID)?.(message.data);
        this.responseAwaiters.delete(message.requestID);
      }
    } else if (this.type !== "main") {
      process.send?.(message);
    } else if (message.to == "cluster") {
      if (this.processes.clusters === null) {
        console.warn(
          "IPCManager: Cluster processes are not initialized. Message ignored."
        );
        return;
      }
      this.processes.clusters.forEach((cluster) => {
        cluster?.send(message);
      });
    } else {
      console.warn(
        `IPCManager: Message intended for ${message.to} received by ${this.type}. Message ignored. Message:`,
        message
      );
    }
  }
  /**
   * Verify the format of an IPC message.
   * @param message Message to verify
   * @returns This instance if the message format is valid, otherwise undefined.
   */
  private __VERIFY_MESSAGE_FORMAT__(message: unknown): boolean {
    if (
      message &&
      typeof message === "object" &&
      "from" in message &&
      "to" in message &&
      "id" in message &&
      "data" in message
    ) {
      return true;
    } else {
      return false;
    }
  }
  private async call(id: string, message: IPCMessageFormat<unknown>) {
    const res = await this.onMessageCallbacks.get(id)?.(
      message.data,
      message.from
    );
    this.respond(message.requestID, message.from, res);
  }
  private respond<T extends unknown>(
    requestID: string,
    to: IPCProcessType,
    data: T
  ) {
    const message: IPCMessageFormat<T> = {
      from: this.type,
      to,
      requestID,
      data: typeof data == "undefined" ? (null as T) : data,
      type: "response",
      id: "",
    };
    this.__DISPATCH__(message);
  }
}

export type ErrorObject = {
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorObject | unknown;
};

export function serializeError(
  error: Error,
  visited = new WeakSet()
): ErrorObject {
  // Handle null/undefined or non-object inputs
  if (!error || typeof error !== "object") {
    return {
      name: "UnknownError",
      message: String(error ?? "Unknown error occurred"),
      stack: undefined,
      cause: undefined,
    };
  }

  // Handle non-Error objects that might have error-like properties
  const errorObj = error as any;

  // Protect against circular references
  if (visited.has(errorObj)) {
    return {
      name: "CircularReferenceError",
      message: "Circular reference detected in error chain",
      stack: undefined,
      cause: undefined,
    };
  }

  visited.add(errorObj);

  let cause: ErrorObject["cause"] | undefined = undefined;

  // Handle error cause with better safety
  if (errorObj.cause !== undefined) {
    if (
      errorObj.cause instanceof Error ||
      (errorObj.cause && typeof errorObj.cause === "object")
    ) {
      try {
        cause = serializeError(errorObj.cause, visited);
      } catch (causeError) {
        // If serializing the cause fails, create a fallback
        cause = {
          name: "SerializationError",
          message: "Failed to serialize error cause",
          stack: undefined,
          cause: undefined,
        };
      }
    } else {
      // For primitive cause values, safely convert to string
      try {
        cause = JSON.parse(JSON.stringify(errorObj.cause));
      } catch {
        cause = String(errorObj.cause);
      }
    }
  }

  return {
    name: errorObj.name || errorObj.constructor?.name || "Error",
    message: String(
      errorObj.message || errorObj.toString?.() || "No error message"
    ),
    stack: typeof errorObj.stack === "string" ? errorObj.stack : undefined,
    cause,
  };
}
