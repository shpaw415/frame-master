import type { BunPlugin, PluginBuilder, OnLoadCallback } from "bun";
import { isVerbose, verboseLog } from "../utils";
import chalk from "chalk";

type OnLoadArgs = Parameters<OnLoadCallback>[0];
type OnLoadResult = Awaited<ReturnType<OnLoadCallback>>;
type OnLoadConstraints = Parameters<PluginBuilder["onLoad"]>[0];

interface RegisteredOnLoad {
  filter: RegExp;
  namespace?: string;
  callback: OnLoadCallback;
  pluginName: string;
}

interface NonOnLoadPlugin {
  name: string;
  setup: (build: PluginBuilder) => void;
}

/**
 * PluginProxy intercepts BunPlugin onLoad handlers and chains them together.
 *
 * When multiple plugins register onLoad handlers for the same file,
 * their outputs are chained: the output of one becomes the input of the next.
 *
 * This allows multiple plugins to transform the same file sequentially,
 * each building upon the previous transformation.
 *
 * Other handlers (onResolve, onStart) are passed through unchanged.
 *
 * @example
 * ```typescript
 * // Plugin A transforms .tsx files by adding an import
 * const pluginA: BunPlugin = {
 *   name: "add-import",
 *   setup(build) {
 *     build.onLoad({ filter: /\.tsx$/ }, async (args) => {
 *       const content = await Bun.file(args.path).text();
 *       return { contents: `import "my-lib";\n${content}`, loader: "tsx" };
 *     });
 *   }
 * };
 *
 * // Plugin B transforms .tsx files by wrapping in a function
 * const pluginB: BunPlugin = {
 *   name: "wrapper",
 *   setup(build) {
 *     build.onLoad({ filter: /\.tsx$/ }, async (args) => {
 *       const content = await Bun.file(args.path).text();
 *       return { contents: `export default () => { ${content} }`, loader: "tsx" };
 *     });
 *   }
 * };
 *
 * // Chain them together - both will transform the same file
 * const chained = chainPlugins([pluginA, pluginB]);
 * ```
 */
export class PluginProxy {
  private onLoadHandlers: RegisteredOnLoad[] = [];
  private nonOnLoadSetups: NonOnLoadPlugin[] = [];
  private suffix: string;
  private formatedSuffix: string;

  constructor(opt: { suffix?: string } = {}) {
    this.suffix = opt.suffix ?? "";
    this.formatedSuffix = this.suffix ? `:${this.suffix}` : "";
  }

  /**
   * Add a BunPlugin to the proxy. Its onLoad handlers will be collected
   * for chaining, while other handlers are preserved.
   */
  addPlugin(plugin: BunPlugin): void {
    verboseLog(
      chalk.cyan(`[PluginChaining${this.formatedSuffix}]`),
      chalk.white("Adding plugin:"),
      chalk.green(plugin.name)
    );

    const { onLoadCallbacks, otherSetup } = this.extractPluginSetup(
      plugin.name,
      plugin
    );

    if (onLoadCallbacks.length > 0) {
      verboseLog(
        chalk.cyan(`[PluginChaining${this.formatedSuffix}]`),
        chalk.gray("  └─"),
        chalk.white(
          `Found ${chalk.yellow(onLoadCallbacks.length)} onLoad handler(s):`
        ),
        chalk.magenta(onLoadCallbacks.map((h) => h.filter.source).join(", "))
      );
    }

    this.onLoadHandlers.push(...onLoadCallbacks);

    if (otherSetup) {
      verboseLog(
        chalk.cyan(`[PluginChaining${this.formatedSuffix}]`),
        chalk.gray("  └─"),
        chalk.white("Found other handlers"),
        chalk.gray("(onResolve, onStart, etc.)")
      );
      this.nonOnLoadSetups.push({
        name: plugin.name,
        setup: otherSetup,
      });
    }
  }

  /**
   * Add multiple BunPlugins to the proxy.
   */
  addPlugins(plugins: BunPlugin[]): void {
    for (const plugin of plugins) {
      this.addPlugin(plugin);
    }
  }

  /**
   * Creates the final proxied BunPlugin that chains all onLoad handlers.
   */
  createChainedPlugin(): BunPlugin {
    const self = this;
    const stats = this.getStats();

    const Name = `[PluginChaining${this.formatedSuffix}]`;

    verboseLog(chalk.cyan(Name), chalk.white("Creating chained plugin:"));
    verboseLog(
      chalk.cyan(Name),
      chalk.gray("  └─"),
      chalk.white("Total onLoad handlers:"),
      chalk.yellow(stats.totalOnLoadHandlers)
    );
    verboseLog(
      chalk.cyan(Name),
      chalk.gray("  └─"),
      chalk.white("Unique patterns:"),
      chalk.yellow(stats.uniquePatterns)
    );
    verboseLog(
      chalk.cyan(Name),
      chalk.gray("  └─"),
      chalk.white("Namespaces:"),
      chalk.yellow(stats.uniqueNamespaces)
    );
    verboseLog(
      chalk.cyan(Name),
      chalk.gray("  └─"),
      chalk.white("Plugins:"),
      stats.pluginNames.map((n) => chalk.green(n)).join(chalk.gray(", "))
    );

    return {
      name: "frame-master-chained-loader",
      setup(build) {
        // First, run all non-onLoad setups (onResolve, onStart, etc.)
        for (const plugin of self.nonOnLoadSetups) {
          plugin.setup(build);
        }

        // Separate handlers into global (no namespace) and namespace-specific
        const { globalHandlers, handlersByNamespace } =
          self.groupHandlersWithGlobalSupport();

        for (const [
          namespace,
          namespaceHandlers,
        ] of handlersByNamespace.entries()) {
          // Combine namespace-specific handlers with global handlers
          // Global handlers (no namespace specified) should match all namespaces
          const handlers = [...namespaceHandlers, ...globalHandlers];

          // Create a combined filter that matches if ANY handler's filter matches
          const combinedFilter = self.createCombinedFilter(handlers);

          build.onLoad(
            {
              filter: combinedFilter,
              namespace: namespace === "file" ? undefined : namespace,
            },
            async (args) => {
              // Find all handlers whose filter matches this specific file
              const matchingHandlers = handlers.filter((h) =>
                h.filter.test(args.path)
              );

              if (matchingHandlers.length === 0) {
                return undefined;
              }

              return self.executeChainedOnLoad(args, matchingHandlers);
            }
          );
        }

        // If there are global handlers but no namespace-specific handlers,
        // we still need to register them for the default "file" namespace
        if (globalHandlers.length > 0 && handlersByNamespace.size === 0) {
          const combinedFilter = self.createCombinedFilter(globalHandlers);
          build.onLoad({ filter: combinedFilter }, async (args) => {
            const matchingHandlers = globalHandlers.filter((h) =>
              h.filter.test(args.path)
            );
            if (matchingHandlers.length === 0) {
              return undefined;
            }
            return self.executeChainedOnLoad(args, matchingHandlers);
          });
        }
      },
    };
  }

  /**
   * Groups handlers by namespace, separating global handlers (no namespace).
   * Global handlers will be included in all namespace groups at runtime.
   */
  private groupHandlersWithGlobalSupport(): {
    globalHandlers: RegisteredOnLoad[];
    handlersByNamespace: Map<string, RegisteredOnLoad[]>;
  } {
    const globalHandlers: RegisteredOnLoad[] = [];
    const handlersByNamespace = new Map<string, RegisteredOnLoad[]>();

    for (const handler of this.onLoadHandlers) {
      if (!handler.namespace) {
        // No namespace = global handler, matches all namespaces
        globalHandlers.push(handler);
      } else {
        // Namespace-specific handler
        const existing = handlersByNamespace.get(handler.namespace) || [];
        existing.push(handler);
        handlersByNamespace.set(handler.namespace, existing);
      }
    }

    // Ensure "file" namespace exists if we have global handlers
    // This is the default namespace for regular file loads
    if (globalHandlers.length > 0 && !handlersByNamespace.has("file")) {
      handlersByNamespace.set("file", []);
    }

    return { globalHandlers, handlersByNamespace };
  }

  /**
   * Groups handlers by namespace only.
   * Actual file matching is done at runtime to support different filters matching same files.
   * @deprecated Use groupHandlersWithGlobalSupport instead
   */
  private groupHandlersByNamespace(): Map<string, RegisteredOnLoad[]> {
    const groups = new Map<string, RegisteredOnLoad[]>();

    for (const handler of this.onLoadHandlers) {
      const key = handler.namespace || "file";
      const existing = groups.get(key) || [];
      existing.push(handler);
      groups.set(key, existing);
    }

    return groups;
  }

  /**
   * Creates a combined regex that matches if ANY of the handler filters match.
   * This ensures we intercept all files that could be handled by any plugin.
   */
  private createCombinedFilter(handlers: RegisteredOnLoad[]): RegExp {
    if (handlers.length === 1) {
      return handlers[0]!.filter;
    }

    // Combine all filter patterns with alternation
    const patterns = handlers.map((h) => `(?:${h.filter.source})`);
    const combined = new RegExp(patterns.join("|"));
    return combined;
  }

  /**
   * Extracts onLoad callbacks and other setup logic from a plugin.
   */
  private extractPluginSetup(
    pluginName: string,
    plugin: BunPlugin
  ): {
    onLoadCallbacks: RegisteredOnLoad[];
    otherSetup: ((build: PluginBuilder) => void) | null;
  } {
    const onLoadCallbacks: RegisteredOnLoad[] = [];
    const otherCalls: Array<(build: PluginBuilder) => void> = [];

    // Create a proxy builder to intercept setup calls
    // We create a deferred config getter that will be populated when the real build runs
    let realBuild: PluginBuilder | null = null;

    const proxyBuilder = {
      onLoad(constraints: OnLoadConstraints, callback: OnLoadCallback) {
        onLoadCallbacks.push({
          filter: constraints.filter,
          namespace: constraints.namespace,
          callback,
          pluginName,
        });
        return proxyBuilder;
      },
      onResolve(
        constraints: Parameters<PluginBuilder["onResolve"]>[0],
        callback: Parameters<PluginBuilder["onResolve"]>[1]
      ) {
        otherCalls.push((build) => build.onResolve(constraints, callback));
        return proxyBuilder;
      },
      onStart(callback: Parameters<PluginBuilder["onStart"]>[0]) {
        otherCalls.push((build) => build.onStart(callback));
        return proxyBuilder;
      },
      onBeforeParse(constraints: any, callback: any) {
        otherCalls.push((build) => {
          if (
            "onBeforeParse" in build &&
            typeof build.onBeforeParse === "function"
          ) {
            build.onBeforeParse(constraints, callback);
          }
        });
        return proxyBuilder;
      },
      // Build-time only
      onEnd: ((callback: () => void) => {
        otherCalls.push((build) => {
          if ("onEnd" in build && typeof build.onEnd === "function") {
            (build as any).onEnd(callback);
          }
        });
        return proxyBuilder;
      }) as any,
      // Use a getter so config is accessed from the real build when available
      get config() {
        return realBuild?.config ?? ({} as any);
      },
      module: (() => proxyBuilder) as any,
      target: "browser" as const,
      virtual: (() => proxyBuilder) as any,
    } as PluginBuilder;

    // Run the plugin's setup to collect handlers
    plugin.setup(proxyBuilder);

    return {
      onLoadCallbacks,
      otherSetup:
        otherCalls.length > 0
          ? (build) => {
              realBuild = build;
              otherCalls.forEach((fn) => fn(build));
            }
          : null,
    };
  }

  /**
   * Groups handlers by their filter pattern.
   * Handlers with matching filters will be chained.
   */
  private groupHandlersByFilter(): Map<string, RegisteredOnLoad[]> {
    const groups = new Map<string, RegisteredOnLoad[]>();

    for (const handler of this.onLoadHandlers) {
      const key = `${handler.filter.source}::${handler.namespace || "file"}`;
      const existing = groups.get(key) || [];
      existing.push(handler);
      groups.set(key, existing);
    }

    return groups;
  }

  /**
   * Executes chained onLoad handlers for a single file.
   * Each handler receives the original args, but we track the accumulated content.
   */
  private async executeChainedOnLoad(
    originalArgs: OnLoadArgs,
    handlers: RegisteredOnLoad[]
  ): Promise<OnLoadResult> {
    // Don't pre-read from disk - let plugins use getChainableContent() helper
    // which reads from disk only when needed
    let accumulatedContents: string | Uint8Array | undefined;
    let accumulatedLoader: Bun.Loader | undefined;
    let lastResult: OnLoadResult = undefined;

    if (handlers.length > 1) {
      verboseLog(
        chalk.cyan(`[PluginChaining${this.formatedSuffix}]`),
        chalk.white(`Chaining ${chalk.yellow(handlers.length)} handlers for:`),
        chalk.blue(originalArgs.path)
      );
      verboseLog(
        chalk.cyan(`[PluginChaining${this.formatedSuffix}]`),
        chalk.gray("  └─"),
        chalk.white("Handler order:"),
        handlers.map((h) => chalk.green(h.pluginName)).join(chalk.gray(" → "))
      );
    }

    for (let i = 0; i < handlers.length; i++) {
      const handler = handlers[i];
      if (!handler) continue;

      // Create a custom args object that provides access to the current content and loader
      // Preserve binary data as Uint8Array, don't convert to string
      const chainedArgs: OnLoadArgs & {
        __chainedContents?: string | Uint8Array;
        __chainedLoader?: Bun.Loader;
      } = {
        ...originalArgs,
        __chainedContents: accumulatedContents,
        __chainedLoader: accumulatedLoader,
      };

      try {
        const startTime = performance.now();
        const result = await handler.callback(chainedArgs);
        const duration = performance.now() - startTime;

        if (result && typeof result === "object") {
          // Update accumulated content with this handler's output
          if ("contents" in result && result.contents !== undefined) {
            const prevLength =
              typeof accumulatedContents === "string"
                ? accumulatedContents.length
                : accumulatedContents?.length ?? 0;
            accumulatedContents = result.contents as string | Uint8Array;
            const newLength =
              typeof accumulatedContents === "string"
                ? accumulatedContents.length
                : accumulatedContents?.length ?? 0;

            if (handlers.length > 1) {
              verboseLog(
                chalk.cyan(`[PluginChaining${this.formatedSuffix}]`),
                chalk.gray("  └─"),
                chalk.gray(`[${i + 1}/${handlers.length}]`),
                chalk.green(handler.pluginName) + chalk.white(":"),
                chalk.magenta(prevLength),
                chalk.gray("→"),
                chalk.magenta(newLength),
                chalk.white("bytes"),
                chalk.gray(`(${duration.toFixed(2)}ms)`)
              );
            }
          }
          if (
            "loader" in result &&
            result.loader &&
            result.loader !== "object"
          ) {
            accumulatedLoader = result.loader as Bun.Loader;
          }
          lastResult = result;
        }
      } catch (error) {
        console.error(
          `[PluginProxy] Error in onLoad handler from plugin "${handler.pluginName}" for file ${originalArgs.path}:`,
          error
        );
        throw error;
      }
    }

    // Return the final accumulated result
    if (lastResult && typeof lastResult === "object") {
      return {
        ...lastResult,
        contents:
          accumulatedContents ??
          ("contents" in lastResult ? lastResult.contents : undefined),
        loader:
          accumulatedLoader ??
          ("loader" in lastResult
            ? (lastResult.loader as Bun.Loader)
            : undefined),
      } as OnLoadResult;
    }

    return lastResult;
  }

  /**
   * Reset the proxy, clearing all registered handlers.
   */
  reset(): void {
    this.onLoadHandlers = [];
    this.nonOnLoadSetups = [];
  }

  /**
   * Get statistics about registered handlers.
   */
  getStats(): {
    totalOnLoadHandlers: number;
    uniquePatterns: number;
    uniqueNamespaces: number;
    pluginNames: string[];
  } {
    const namespaceGroups = this.groupHandlersByNamespace();
    const uniquePatterns = new Set(
      this.onLoadHandlers.map((h) => h.filter.source)
    ).size;

    const pluginNames = [
      ...new Set(this.onLoadHandlers.map((h) => h.pluginName)),
    ];

    return {
      totalOnLoadHandlers: this.onLoadHandlers.length,
      uniquePatterns,
      uniqueNamespaces: namespaceGroups.size,
      pluginNames,
    };
  }
}

/**
 * Creates a new PluginProxy instance.
 */
export function createPluginProxy(): PluginProxy {
  return new PluginProxy();
}

/**
 * Utility function to chain multiple BunPlugins into a single plugin with chained onLoad handlers.
 *
 * When multiple plugins have onLoad handlers that match the same file, they will be executed
 * in order, with each handler receiving the accumulated transformed content from previous handlers.
 *
 * Plugins can access the current (potentially transformed) content via:
 * - Reading from `args.path` (original file) and then getting chained content from `args.__chainedContents`
 * - Or by reading the file normally if they're the first handler
 *
 * @param plugins - Array of BunPlugins to chain together
 * @returns A single BunPlugin with chained onLoad handlers
 *
 * @example
 * ```typescript
 * // Two plugins that both transform .tsx files
 * const pluginA: BunPlugin = {
 *   name: "plugin-a",
 *   setup(build) {
 *     build.onLoad({ filter: /\.tsx$/ }, async (args) => {
 *       // Get content (either from chain or original file)
 *       const content = (args as any).__chainedContents
 *         ?? await Bun.file(args.path).text();
 *       return {
 *         contents: `// Plugin A was here\n${content}`,
 *         loader: "tsx"
 *       };
 *     });
 *   }
 * };
 *
 * const pluginB: BunPlugin = {
 *   name: "plugin-b",
 *   setup(build) {
 *     build.onLoad({ filter: /\.tsx$/ }, async (args) => {
 *       const content = (args as any).__chainedContents
 *         ?? await Bun.file(args.path).text();
 *       return {
 *         contents: `${content}\n// Plugin B was here`,
 *         loader: "tsx"
 *       };
 *     });
 *   }
 * };
 *
 * // Chained result for a .tsx file will be:
 * // "// Plugin A was here\n<original content>\n// Plugin B was here"
 *
 * const chainedPlugin = chainPlugins([pluginA, pluginB]);
 * ```
 */
export function chainPlugins(
  plugins: BunPlugin[],
  opt?: { suffix?: string }
): BunPlugin {
  const proxy = new PluginProxy(opt);
  proxy.addPlugins(plugins);
  return proxy.createChainedPlugin();
}

/**
 * Type for onLoad args that includes chained content.
 * Use this type when your plugin may be part of a chain.
 */
export type ChainedOnLoadArgs = OnLoadArgs & {
  /**
   * Content from previous handlers in the chain.
   * Will be undefined if this is the first handler or if chaining is disabled.
   * Can be string for text content or Uint8Array for binary content.
   *
   * @example
   * ```typescript
   * build.onLoad({ filter: /\.tsx$/ }, async (args: ChainedOnLoadArgs) => {
   *   const content = args.__chainedContents ?? await Bun.file(args.path).text();
   *   return { contents: transform(content), loader: "tsx" };
   * });
   * ```
   */
  __chainedContents?: string | Uint8Array;
  /**
   * Loader set by the previous handler in the chain.
   */
  __chainedLoader?: Bun.Loader;
};

/**
 * Type-safe onLoad callback that includes chained content args.
 * Use this when defining callbacks that participate in plugin chaining.
 *
 * @example
 * ```typescript
 * const myHandler: ChainedOnLoadCallback = async (args) => {
 *   // args.__chainedContents is properly typed
 *   const content = args.__chainedContents ?? await Bun.file(args.path).text();
 *   return { contents: transform(content), loader: "tsx" };
 * };
 *
 * build.onLoad({ filter: /\.tsx$/ }, myHandler);
 * ```
 */
export type ChainedOnLoadCallback = (
  args: ChainedOnLoadArgs
) => OnLoadResult | Promise<OnLoadResult>;

/**
 * Helper to get text content in a chainable plugin.
 * Automatically uses chained content if available, otherwise reads from disk.
 * If chained content is binary (Uint8Array), it will be decoded as UTF-8.
 *
 * For virtual modules (non-file namespaces), returns empty string if no chained content.
 *
 * @example
 * ```typescript
 * build.onLoad({ filter: /\.tsx$/ }, async (args) => {
 *   const content = await getChainableContent(args);
 *   return { contents: transform(content), loader: "tsx" };
 * });
 * ```
 */
export async function getChainableContent(
  args: OnLoadArgs | ChainedOnLoadArgs
): Promise<string> {
  const chainedArgs = args as ChainedOnLoadArgs;
  if (chainedArgs.__chainedContents !== undefined) {
    if (typeof chainedArgs.__chainedContents === "string") {
      return chainedArgs.__chainedContents;
    }
    // Convert Uint8Array to string
    return new TextDecoder().decode(chainedArgs.__chainedContents);
  }

  // Only read from disk for "file" namespace (default)
  // Virtual modules (custom namespaces) don't exist on disk
  const isFileNamespace = !args.namespace || args.namespace === "file";
  if (!isFileNamespace) {
    return "";
  }

  try {
    return await Bun.file(args.path).text();
  } catch (error) {
    // File might not exist (virtual path in file namespace), return empty string
    return "";
  }
}

/**
 * Helper to get binary content in a chainable plugin.
 * Automatically uses chained content if available, otherwise reads from disk.
 * If chained content is text (string), it will be encoded as UTF-8.
 *
 * For virtual modules (non-file namespaces), returns empty Uint8Array if no chained content.
 *
 * @example
 * ```typescript
 * build.onLoad({ filter: /\.png$/ }, async (args) => {
 *   const content = await getChainableBinaryContent(args);
 *   return { contents: processImage(content), loader: "file" };
 * });
 * ```
 */
export async function getChainableBinaryContent(
  args: OnLoadArgs | ChainedOnLoadArgs
): Promise<Uint8Array> {
  const chainedArgs = args as ChainedOnLoadArgs;
  if (chainedArgs.__chainedContents !== undefined) {
    if (chainedArgs.__chainedContents instanceof Uint8Array) {
      return chainedArgs.__chainedContents;
    }
    // Convert string to Uint8Array
    return new TextEncoder().encode(chainedArgs.__chainedContents);
  }

  // Only read from disk for "file" namespace (default)
  // Virtual modules (custom namespaces) don't exist on disk
  const isFileNamespace = !args.namespace || args.namespace === "file";
  if (!isFileNamespace) {
    return new Uint8Array(0);
  }

  try {
    return new Uint8Array(await Bun.file(args.path).arrayBuffer());
  } catch (error) {
    // File might not exist (virtual path in file namespace), return empty array
    return new Uint8Array(0);
  }
}

/**
 * Type guard to check if args have chained text content.
 *
 * @example
 * ```typescript
 * build.onLoad({ filter: /\.tsx$/ }, async (args) => {
 *   if (hasChainedTextContent(args)) {
 *     console.log("Using chained text:", args.__chainedContents.length, "chars");
 *   }
 *   const content = await getChainableContent(args);
 *   return { contents: transform(content), loader: "tsx" };
 * });
 * ```
 */
export function hasChainedTextContent(
  args: OnLoadArgs | ChainedOnLoadArgs
): args is ChainedOnLoadArgs & { __chainedContents: string } {
  return (
    "__chainedContents" in args &&
    typeof (args as ChainedOnLoadArgs).__chainedContents === "string"
  );
}

/**
 * Type guard to check if args have chained binary content.
 *
 * @example
 * ```typescript
 * build.onLoad({ filter: /\.png$/ }, async (args) => {
 *   if (hasChainedBinaryContent(args)) {
 *     console.log("Using chained binary:", args.__chainedContents.length, "bytes");
 *   }
 *   const content = await getChainableBinaryContent(args);
 *   return { contents: content, loader: "file" };
 * });
 * ```
 */
export function hasChainedBinaryContent(
  args: OnLoadArgs | ChainedOnLoadArgs
): args is ChainedOnLoadArgs & { __chainedContents: Uint8Array } {
  return (
    "__chainedContents" in args &&
    (args as ChainedOnLoadArgs).__chainedContents instanceof Uint8Array
  );
}

/**
 * Type guard to check if args have any chained content (text or binary).
 *
 * @example
 * ```typescript
 * build.onLoad({ filter: /\.*$/ }, async (args) => {
 *   if (hasChainedContent(args)) {
 *     console.log("Has chained content");
 *   }
 * });
 * ```
 */
export function hasChainedContent(
  args: OnLoadArgs | ChainedOnLoadArgs
): args is ChainedOnLoadArgs & { __chainedContents: string | Uint8Array } {
  return (
    "__chainedContents" in args &&
    (args as ChainedOnLoadArgs).__chainedContents !== undefined
  );
}
