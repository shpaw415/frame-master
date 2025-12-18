/**
 * Augments Bun's OnLoadArgs interface to include chained content.
 * This makes `args.__chainedContents` globally available and type-safe
 * without needing to import any Frame-Master types.
 */
declare module "bun" {
  interface OnLoadArgs {
    /**
     * Content from previous handlers in the plugin chain.
     *
     * When plugin chaining is enabled in Frame-Master, multiple `onLoad` handlers
     * that match the same file will execute sequentially. Each handler receives
     * the accumulated content from previous handlers via this property.
     *
     * - `undefined` if this is the first handler in the chain or chaining is disabled
     * - `string` for text content from previous handlers
     * - `Uint8Array` for binary content from previous handlers
     *
     * @example
     * ```typescript
     * build.onLoad({ filter: /\.tsx$/ }, async (args) => {
     *   // Use chained content if available, otherwise read from disk
     *   const content = args.__chainedContents ?? await Bun.file(args.path).text();
     *
     *   return {
     *     contents: transform(content),
     *     loader: "tsx",
     *   };
     * });
     * ```
     *
     * @example
     * ```typescript
     * // Handling binary content
     * build.onLoad({ filter: /\.png$/ }, async (args) => {
     *   const content = args.__chainedContents ?? await Bun.file(args.path).bytes();
     *
     *   // Check if it's binary
     *   if (content instanceof Uint8Array) {
     *     // Process binary data
     *   }
     *
     *   return { contents: content, loader: "file" };
     * });
     * ```
     */
    __chainedContents?: string | Uint8Array;

    /**
     * Loader set by the previous handler in the plugin chain.
     *
     * When plugin chaining is enabled, this indicates what type of content
     * the previous handler produced. Use this to know how to interpret
     * `__chainedContents`.
     *
     * - `undefined` if this is the first handler in the chain or chaining is disabled
     * - A `Bun.Loader` value (e.g., "tsx", "js", "css", "html", etc.)
     *
     * @example
     * ```typescript
     * build.onLoad({ filter: /\.tsx$/ }, async (args) => {
     *   const content = args.__chainedContents ?? await Bun.file(args.path).text();
     *   const previousLoader = args.__chainedLoader; // e.g., "tsx", "js", etc.
     *
     *   // Adjust transformation based on what the previous handler produced
     *   if (previousLoader === "js") {
     *     // Content is already JavaScript
     *   }
     *
     *   return { contents: transform(content), loader: "tsx" };
     * });
     * ```
     */
    __chainedLoader?: Loader;
  }

  interface OnLoadResult {
    /**
     * When set to `true`, prevents subsequent plugin handlers in the chain from running.
     *
     * In Frame-Master's plugin chaining system, multiple `onLoad` handlers
     * can match the same file. By default, all matching handlers execute sequentially.
     * Set this to `true` to stop the chain and use this handler's result as final.
     *
     * @example
     * ```typescript
     * build.onLoad({ filter: /\.tsx$/ }, async (args) => {
     *   const content = args.__chainedContents ?? await Bun.file(args.path).text();
     *
     *   // Stop further processing by other plugins
     *   return {
     *     contents: transform(content),
     *     loader: "tsx",
     *     preventChaining: true, // No more handlers will run after this
     *   };
     * });
     * ```
     *
     * @default undefined (chaining continues)
     */
    preventChaining?: boolean;
  }

  interface OnLoadResultSourceCode {
    /**
     * When set to `true`, prevents subsequent plugin handlers in the chain from running.
     *
     * In Frame-Master's plugin chaining system, multiple `onLoad` handlers
     * can match the same file. By default, all matching handlers execute sequentially.
     * Set this to `true` to stop the chain and use this handler's result as final.
     *
     * @example
     * ```typescript
     * build.onLoad({ filter: /\.tsx$/ }, async (args) => {
     *   const content = args.__chainedContents ?? await Bun.file(args.path).text();
     *
     *   // Stop further processing by other plugins
     *   return {
     *     contents: transform(content),
     *     loader: "tsx",
     *     preventChaining: true, // No more handlers will run after this
     *   };
     * });
     * ```
     *
     * @default undefined (chaining continues)
     */
    preventChaining?: boolean;
  }

  /**
   * Callback for the `finally` method on PluginBuilder.
   * Receives the final content after all chained handlers complete.
   */
  type FinallyCallback = (args: {
    /** The final content after all plugin transformations */
    contents: string | Uint8Array;
    /** The file path that was processed */
    path: string;
    /** The loader that will be used */
    loader: Loader;
  }) =>
    | { contents: string | Uint8Array }
    | Promise<{ contents: string | Uint8Array }>;

  interface PluginBuilder {
    /**
     * Register a final transformation that runs after all chained onLoad handlers complete.
     *
     * Frame-Master extension: This method allows plugins to apply a final transformation
     * to content processed by a specific loader. The `finally` handler runs after all
     * `onLoad` handlers in the chain have completed, giving you a chance to modify
     * the final output before it's sent to the bundler.
     *
     * Multiple `finally` handlers for the same loader are chained in registration order.
     *
     * @param loader - The loader type to intercept (e.g., "html", "css", "js", "tsx")
     * @param callback - Function that receives the final content and returns modified content
     *
     * @example
     * ```typescript
     * build.finally("html", ({ contents, path }) => ({
     *   contents: `<!-- Generated from ${path} -->\n${contents}`,
     * }));
     * ```
     *
     * @example
     * ```typescript
     * // Minify CSS as a final step
     * build.finally("css", async ({ contents }) => ({
     *   contents: await minifyCSS(contents.toString()),
     * }));
     * ```
     *
     * @example
     * ```typescript
     * // Add source maps comment
     * build.finally("js", ({ contents, path }) => ({
     *   contents: `${contents}\n//# sourceURL=${path}`,
     * }));
     * ```
     */
    finally(loader: Loader, callback: FinallyCallback): PluginBuilder;
  }
}
