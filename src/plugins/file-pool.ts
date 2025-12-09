/**
 * File Pool - Chained onLoad handlers for Bun plugins
 *
 * When multiple Frame-Master plugins register onLoad handlers that could match the same file,
 * this module creates a pipeline where each handler's output becomes the next handler's input.
 *
 * File matching is done at runtime by testing each handler's filter regex against the actual
 * file path. Handlers with different namespaces are NOT chained together.
 *
 * @example
 * Plugin A (priority 0): filter /\.tsx$/ - matches all .tsx files
 * Plugin B (priority 1): filter /index\.tsx$/ - matches index.tsx files
 * For index.tsx: Both handlers are chained (A's output → B's input)
 * For Button.tsx: Only Plugin A's handler runs
 */

import type { BunPlugin, PluginBuilder, OnLoadResult } from "bun";

export type OnLoadHandler = Parameters<PluginBuilder["onLoad"]>[1];
export type OnLoadArgs = Parameters<OnLoadHandler>[0];
export type OnLoadOptions = Parameters<PluginBuilder["onLoad"]>[0];

/**
 * Pooled data from previous handler in the chain.
 */
export interface PooledData {
  /** Contents returned by the previous handler */
  contents?: string;
  /** Loader returned by the previous handler */
  loader?: string;
}

/**
 * Extended args passed to chained handlers with previous handler's result.
 *
 * @example
 * // In your onLoad handler - args.pooled is automatically available:
 * build.onLoad({ filter: /\.tsx$/ }, async (args) => {
 *   if (args.pooled) {
 *     // This handler is in a chain - use previous result
 *     console.log("Previous loader:", args.pooled.loader);
 *     console.log("Previous contents:", args.pooled.contents);
 *   }
 *   // ...
 * });
 */
export interface PooledOnLoadArgs extends OnLoadArgs {
  /**
   * Contains the previous handler's result when chained.
   * Undefined if this is the first handler in the chain.
   */
  pooled?: PooledData;
}

/**
 * Extended OnLoadResult that supports preventing further chaining.
 *
 * Use this type for your onLoad handler return type when you want to use `preventChaining`.
 * Since Bun's OnLoadResult is a union type (not an interface), it cannot be augmented.
 *
 * @example
 * import type { PooledOnLoadResult } from "frame-master/plugin/types";
 *
 * build.onLoad({ filter: /\.tsx$/ }, async (args): Promise<PooledOnLoadResult> => {
 *   const contents = await Bun.file(args.path).text();
 *   return {
 *     contents: transform(contents),
 *     loader: "tsx",
 *     preventChaining: true, // Stop the chain here - no more handlers will run
 *   };
 * });
 */
export type PooledOnLoadResult = {
  /**
   * If true, stops the chain and returns this result immediately.
   * No subsequent handlers will be executed.
   * @default false
   */
  preventChaining?: boolean;
} & OnLoadResult;

// ============================================================================
// Type Augmentation for Bun's PluginBuilder
// ============================================================================
// This extends Bun's onLoad callback args to include `pooled` property
// automatically when used within Frame-Master plugins.
//
// NOTE: OnLoadResult cannot be augmented because it's a type alias (union),
// not an interface. Use PooledOnLoadResult type for preventChaining support.

declare module "bun" {
  interface OnLoadArgs {
    /**
     * Contains the previous handler's result when chained in Frame-Master's file pool.
     * Undefined if this is the first handler in the chain or not using Frame-Master.
     *
     * @example
     * build.onLoad({ filter: /\.tsx$/ }, async (args) => {
     *   if (args.pooled) {
     *     // Use previous handler's output
     *     const contents = args.pooled.contents;
     *     const loader = args.pooled.loader;
     *   }
     * });
     */
    pooled?: PooledData;
  }
}

interface PooledHandler {
  pluginName: string;
  priority: number;
  handler: OnLoadHandler;
  options: OnLoadOptions;
}

/**
 * Group handlers by namespace for efficient lookup.
 * Handlers with the same namespace can potentially chain together.
 */
interface NamespaceGroup {
  namespace: string | undefined;
  handlers: PooledHandler[];
}

/**
 * FilePool manages chained onLoad handlers for Bun plugins.
 *
 * Unlike simple filter-based grouping, this implementation:
 * 1. Collects ALL handlers regardless of their filter
 * 2. Groups them by namespace (handlers with different namespaces don't chain)
 * 3. At runtime, tests each handler's filter against the actual file path
 * 4. Chains only the handlers whose filters match the file
 *
 * This correctly handles cases like:
 * - /\.tsx$/ and /index\.tsx$/ both matching "index.tsx"
 * - /src\/.*\.ts$/ and /\.ts$/ both matching "src/utils.ts"
 */
export class FilePool {
  private handlers: PooledHandler[] = [];
  private namespaceGroups: Map<string, NamespaceGroup> = new Map();

  /**
   * Register an onLoad handler to the pool.
   *
   * @param pluginName - Name of the plugin registering the handler
   * @param priority - Plugin priority (lower = runs first)
   * @param options - Bun onLoad options (filter, namespace, etc.)
   * @param handler - The onLoad handler function
   */
  register(
    pluginName: string,
    priority: number,
    options: OnLoadOptions,
    handler: OnLoadHandler
  ): void {
    this.handlers.push({
      pluginName,
      priority,
      handler,
      options,
    });
  }

  /**
   * Build namespace groups from registered handlers.
   * Handlers are grouped by namespace and sorted by priority within each group.
   */
  private buildNamespaceGroups(): void {
    this.namespaceGroups.clear();

    for (const handler of this.handlers) {
      const namespace = handler.options.namespace ?? "";

      if (!this.namespaceGroups.has(namespace)) {
        this.namespaceGroups.set(namespace, {
          namespace: handler.options.namespace,
          handlers: [],
        });
      }

      this.namespaceGroups.get(namespace)!.handlers.push(handler);
    }

    // Sort handlers within each namespace by priority
    for (const group of this.namespaceGroups.values()) {
      group.handlers.sort((a, b) => a.priority - b.priority);
    }
  }

  /**
   * Get all handlers that match a specific file path within a namespace.
   * Tests each handler's filter regex against the file path.
   */
  private getMatchingHandlers(
    filePath: string,
    namespace: string | undefined
  ): PooledHandler[] {
    const nsKey = namespace ?? "";
    const group = this.namespaceGroups.get(nsKey);

    if (!group) return [];

    return group.handlers.filter((h) => h.options.filter.test(filePath));
  }

  /**
   * Create a combined filter regex that matches any file that ANY handler might match.
   * This is used as the unified plugin's filter.
   */
  private createCombinedFilter(handlers: PooledHandler[]): RegExp {
    if (handlers.length === 0) {
      return /(?!)/; // Never matches
    }

    if (handlers.length === 1) {
      return handlers[0]!.options.filter;
    }

    // Combine all filters with OR logic
    // Extract the source from each regex and combine them
    const sources = handlers.map((h) => `(?:${h.options.filter.source})`);
    return new RegExp(sources.join("|"));
  }

  /**
   * Create a unified Bun plugin that chains all registered handlers.
   *
   * The plugin uses a combined filter that matches any file that any handler
   * might care about. At runtime, it tests each handler's individual filter
   * against the actual file path and only chains matching handlers.
   *
   * @param name - Name for the unified plugin
   * @returns A BunPlugin with chained onLoad handlers
   */
  createUnifiedPlugin(name: string): BunPlugin {
    this.buildNamespaceGroups();

    return {
      name,
      setup: (build) => {
        // Create one onLoad per namespace group
        for (const [, group] of this.namespaceGroups) {
          const combinedFilter = this.createCombinedFilter(group.handlers);

          build.onLoad(
            {
              filter: combinedFilter,
              namespace: group.namespace,
            },
            async (args) => {
              // At runtime, find handlers that actually match this specific file
              const matchingHandlers = this.getMatchingHandlers(
                args.path,
                group.namespace
              );

              if (matchingHandlers.length === 0) {
                // No handlers match - shouldn't happen due to combined filter, but be safe
                return undefined;
              }

              return this.executeChain(matchingHandlers, args);
            }
          );
        }
      },
    };
  }

  /**
   * Apply pooled handlers to an existing plugin builder.
   * Use this for build-time plugins where you need to integrate with existing setup.
   *
   * @param build - The Bun PluginBuilder from setup()
   */
  applyToBuilder(build: PluginBuilder): void {
    this.buildNamespaceGroups();

    for (const [, group] of this.namespaceGroups) {
      const combinedFilter = this.createCombinedFilter(group.handlers);

      build.onLoad(
        {
          filter: combinedFilter,
          namespace: group.namespace,
        },
        async (args) => {
          const matchingHandlers = this.getMatchingHandlers(
            args.path,
            group.namespace
          );

          if (matchingHandlers.length === 0) {
            return undefined;
          }

          return this.executeChain(matchingHandlers, args);
        }
      );
    }
  }

  /**
   * Execute the handler chain for a file.
   * Each handler receives the output of the previous handler via args.pooled.
   * If a handler returns `preventChaining: true`, the chain stops immediately.
   *
   * @example
   * // Handler chain flow:
   * // original file -> handler1 -> { loader: "tsx", contents: "..." }
   * //                -> handler2 receives args.pooled = { loader: "tsx", contents: "..." }
   * //                -> handler2 -> { loader: "html", contents: "...", preventChaining: true }
   * //                -> CHAIN STOPS - handler3 never runs
   */
  private async executeChain(
    handlers: PooledHandler[],
    initialArgs: OnLoadArgs
  ): Promise<OnLoadResult> {
    let currentArgs: PooledOnLoadArgs = initialArgs;
    let previousResult: PooledData | undefined;

    for (const { handler, pluginName } of handlers) {
      try {
        // Create modified args that include previous handler's result
        const pooledArgs: PooledOnLoadArgs = previousResult
          ? {
              ...currentArgs,
              pooled: {
                contents: previousResult.contents,
                loader: previousResult.loader,
              },
            }
          : currentArgs;

        const result = (await handler(pooledArgs as OnLoadArgs)) as
          | PooledOnLoadResult
          | undefined;

        if (result && "contents" in result) {
          // This handler's result becomes the input for the next handler
          previousResult = {
            contents: result.contents as string,
            loader: result.loader as string | undefined,
          };

          // Check if this handler wants to prevent further chaining
          if (result.preventChaining) {
            break; // Stop the chain immediately
          }
        }
      } catch (error) {
        throw new Error(
          `FilePool: Error in handler from plugin "${pluginName}"`,
          { cause: error }
        );
      }
    }

    if (previousResult && previousResult.contents === undefined) {
      throw new Error(
        `FilePool: Handler chain resulted in undefined contents. Each handler must return contents.`
      );
    }

    return previousResult
      ? {
          contents: previousResult.contents!,
          loader: previousResult.loader as Bun.Loader,
        }
      : { contents: "", loader: "ts" };
  }

  /**
   * Get the number of registered handlers.
   */
  get size(): number {
    return this.handlers.length;
  }

  /**
   * Get the number of unique namespace groups.
   */
  get groupCount(): number {
    this.buildNamespaceGroups();
    return this.namespaceGroups.size;
  }

  /**
   * Clear all registered handlers.
   */
  clear(): void {
    this.handlers = [];
    this.namespaceGroups.clear();
  }

  /**
   * Get debug information about registered handlers.
   */
  getDebugInfo(): {
    totalHandlers: number;
    namespaceGroups: Array<{
      namespace: string | undefined;
      combinedFilter: string;
      handlers: Array<{
        pluginName: string;
        priority: number;
        filter: string;
      }>;
    }>;
  } {
    this.buildNamespaceGroups();

    return {
      totalHandlers: this.handlers.length,
      namespaceGroups: Array.from(this.namespaceGroups.entries()).map(
        ([, group]) => ({
          namespace: group.namespace,
          combinedFilter: this.createCombinedFilter(group.handlers).source,
          handlers: group.handlers.map((h) => ({
            pluginName: h.pluginName,
            priority: h.priority,
            filter: h.options.filter.source,
          })),
        })
      ),
    };
  }

  /**
   * Test which handlers would match a given file path.
   * Useful for debugging and understanding chaining behavior.
   *
   * @param filePath - The file path to test
   * @param namespace - Optional namespace to filter by
   * @returns Array of handler names that would match
   */
  testMatchingHandlers(
    filePath: string,
    namespace?: string
  ): Array<{ pluginName: string; priority: number; filter: string }> {
    this.buildNamespaceGroups();
    const matching = this.getMatchingHandlers(filePath, namespace);
    return matching.map((h) => ({
      pluginName: h.pluginName,
      priority: h.priority,
      filter: h.options.filter.source,
    }));
  }
}

/**
 * Create a wrapped BunPlugin that participates in the file pool.
 *
 * This allows plugins to register their onLoad handlers to a shared pool,
 * enabling chained processing of files.
 *
 * @param pool - The FilePool instance to register handlers to
 * @param pluginName - Name of the plugin
 * @param priority - Plugin priority (lower = runs first)
 * @param plugin - The original BunPlugin to wrap
 * @returns A wrapped BunPlugin (returns empty plugin as handlers are pooled)
 *
 * @example
 * const pool = new FilePool();
 *
 * const myPlugin: BunPlugin = {
 *   name: "my-plugin",
 *   setup(build) {
 *     build.onLoad({ filter: /\.tsx$/ }, async (args) => {
 *       const contents = await Bun.file(args.path).text();
 *       return { contents: contents + "// Modified", loader: "tsx" };
 *     });
 *   }
 * };
 *
 * // Register to pool instead of directly using
 * wrapPluginForPool(pool, "my-plugin", 0, myPlugin);
 */
export function wrapPluginForPool(
  pool: FilePool,
  pluginName: string,
  priority: number,
  plugin: BunPlugin
): void {
  // Create a fake builder that captures onLoad registrations
  const captureBuilder = {
    onLoad(options: OnLoadOptions, handler: OnLoadHandler) {
      pool.register(pluginName, priority, options, handler);
    },
    onResolve() {
      // onResolve is not pooled, but we could extend this in the future
    },
    onEnd() {},
    onBeforeParse() {},
    config: {} as any,
    module() {
      return this;
    },
    onStart() {},
    target: "bun",
  } as unknown as PluginBuilder;

  // Run the plugin's setup to capture handlers
  plugin.setup(captureBuilder);
}

/**
 * Helper to get contents from a chained handler, checking for pooled contents first.
 *
 * Use this in your onLoad handlers to get either the previous handler's
 * output or read from disk if this is the first handler in the chain.
 *
 * @param args - The onLoad args (may contain pooled property from previous handler)
 * @returns The file contents (from previous handler or disk) and loader
 *
 * @example
 * build.onLoad({ filter: /\.tsx$/ }, async (args: PooledOnLoadArgs) => {
 *   // getPooledContents handles both cases:
 *   // - If chained: returns previous handler's result
 *   // - If first: reads file from disk
 *   const { contents, loader } = await getPooledContents(args);
 *
 *   // Process contents...
 *   return { contents: modifiedContents, loader: loader ?? "tsx" };
 * });
 */
export async function getPooledContents(
  args: PooledOnLoadArgs
): Promise<PooledData> {
  if (args.pooled) {
    return {
      contents: args.pooled.contents,
      loader: args.pooled.loader,
    };
  }

  // First handler in chain - read from disk
  const contents = await Bun.file(args.path).text();
  return { contents };
}

/**
 * Create a runtime file pool for Bun.plugin() registration.
 *
 * This creates a pool specifically for runtime plugins that are loaded
 * via bunfig.toml preload.
 *
 * @returns FilePool configured for runtime use
 */
export function createRuntimeFilePool(): FilePool {
  return new FilePool();
}

/**
 * Create a build file pool for Bun.build() plugins.
 *
 * This creates a pool specifically for build-time plugins.
 *
 * @returns FilePool configured for build use
 */
export function createBuildFilePool(): FilePool {
  return new FilePool();
}
