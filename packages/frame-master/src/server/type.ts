import type { FrameMasterPlugin } from "../plugins/types";

export type FrameMasterConfig = {
	/**
	 * HTTP server config
	 */
	HTTPServer: Omit<
		Bun.Serve.Options<undefined, string> & {
			static?: {} | undefined;
		},
		"fetch"
	>;
	/**
	 * Frame-Master Plugins to load
	 */
	plugins: FrameMasterPlugin<any>[];
	pluginsOptions?: Partial<{
		disableHttpServerOptionsConflictWarning?: boolean;
		/**
		 * Disable automatic onLoad handler chaining for build and runtime plugins.
		 *
		 * When enabled (default), multiple plugins with onLoad handlers for the same
		 * file pattern will have their handlers chained together - each handler
		 * receives the transformed output from the previous handler.
		 *
		 * Set to `true` to disable chaining and use the default Bun behavior where
		 * only the first matching onLoad handler is executed.
		 *
		 * @default false
		 */
		disableOnLoadChaining?: boolean;
		/**
		 * Additional entrypoints to include in every build.
		 *
		 * These paths are merged with entrypoints provided by plugins and those
		 * passed directly to `builder.build()`. Useful for adding global client-side
		 * scripts or shared modules without modifying individual plugin configs.
		 *
		 * @example
		 * ```typescript
		 * pluginsOptions: {
		 *   entrypoints: [
		 *     "./src/global.ts",
		 *     "./src/analytics.ts"
		 *   ]
		 * }
		 * ```
		 */
		entrypoints?: string[];
		/**
		 * Allow existing Bun plugins to read registered virtual-module source through
		 * `Bun.file(args.path)`. This returns the declaration's original registry
		 * source, not output from preceding chained transforms. Use
		 * `getChainableContent(args)` when a transform must preserve chain output.
		 *
		 * @default false
		 */
		virtualModuleFileProxy?: boolean;
	}>;
};

declare global {
	var __PROCESS_ENV__: Record<string, string>;
}
