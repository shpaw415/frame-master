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
}
