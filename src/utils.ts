import { directiveToolSingleton } from "./plugins";
import type { masterRequest } from "./server/request-manager";

export { directiveToolSingleton as directiveManager };

type RouteCallback = (master: masterRequest) => void | Promise<void>;
type MethodKeys =
  | "POST"
  | "GET"
  | "DELETE"
  | "PUT"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

/**
 * to use on router plugin
 * @example
 * router: {
 *   request: (master) =>
 *      onRoute(master, {
 *          "/api/some_route": {
 *              POST: (master) => { ... },
 *              GET: (master) => { ... }
 *         },
 *         "/api/another_route": (master) => { ... }
 *    })
 * }
 * */
export function onRoute(
  master: masterRequest,
  routes: Record<
    string,
    RouteCallback | Partial<Record<MethodKeys, RouteCallback>>
  >
) {
  const currentRoute = routes[master.URL.pathname];

  if (typeof currentRoute == "function") {
    return currentRoute(master);
  } else if (currentRoute) {
    return currentRoute[master.request.method as MethodKeys]?.(master);
  }
}

export function join(...parts: string[]) {
  return parts
    .map((part, index) => {
      // Normalize backslashes to forward slashes
      part = part.replace(/\\/g, "/");

      if (index === 0) {
        // First part: remove trailing slashes only
        return part.replace(/\/+$/g, "");
      } else if (index === parts.length - 1) {
        // Last part: remove leading slashes only (preserve filenames like index.js)
        return part.replace(/^\/+/g, "");
      } else {
        // Middle parts: remove both leading and trailing slashes
        return part.replace(/^\/+|\/+$/g, "");
      }
    })
    .filter((part) => part.length > 0)
    .join("/");
}

/**
 * Creates a RegExp for filtering files in Bun.build plugins based on path and extensions.
 *
 * **Public API** - Use this helper to create file filters for Bun plugins in your build config.
 *
 * Useful for creating filter patterns in Bun plugins to match specific files by directory
 * and file extension. The generated regex escapes special characters in paths and creates
 * an extension matcher with OR logic.
 *
 *  **If the path is in the current path add `process.cwd()` to the path.**
 *
 * @param options - Configuration for the regex pattern
 * @param options.path - Array of path segments to match (e.g., ["src", "components"])
 * @param options.ext - Array of file extensions without dots (e.g., ["ts", "tsx", "js"])
 *
 * @returns RegExp that matches files in the specified path with any of the given extensions
 *
 * @example
 * // Match TypeScript files in src/components
 * const filter = pluginRegex({
 *   path: ["src", "components"],
 *   ext: ["ts", "tsx"]
 * });
 * // Matches: src/components/Button.tsx, src/components/utils/helper.ts
 * // Doesn't match: src/pages/index.tsx, src/components/style.css
 *
 * @example
 * // Use in a Bun.build plugin
 * const plugin: BunPlugin = {
 *   name: "my-plugin",
 *   setup(build) {
 *     const filter = pluginRegex({
 *       path: ["src", "server"],
 *       ext: ["ts", "js"]
 *     });
 *
 *     build.onLoad({ filter }, async (args) => {
 *       // Handle server-side files
 *       return { contents: "...", loader: "ts" };
 *     });
 *   }
 * };
 *
 * @example
 * // Match all CSS/SCSS in styles directory
 * const styleFilter = pluginRegex({
 *   path: ["src", "styles"],
 *   ext: ["css", "scss", "sass"]
 * });
 */
export function pluginRegex({ path, ext }: { path: string[]; ext: string[] }) {
  return new RegExp(
    `^${escapeRegExp(join(...path))}\\/.*\\.(${ext
      .map(escapeRegExp)
      .join("|")})$`
  );
}
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if Frame-Master is running in verbose mode.
 *
 * Verbose mode is enabled by setting the `FRAME_MASTER_VERBOSE` environment variable to `"true"`.
 *
 * **Public API** - Use this helper in your plugins for conditional logging.
 *
 * @returns `true` if verbose mode is enabled, `false` otherwise
 *
 * @example
 * ```typescript
 * import { isVerbose } from "frame-master/utils";
 *
 * if (isVerbose()) {
 *   console.log("[MyPlugin] Debug info:", debugData);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // In a plugin
 * export function myPlugin(): FrameMasterPlugin {
 *   return {
 *     name: "my-plugin",
 *     version: "1.0.0",
 *     serverStart: {
 *       main: () => {
 *         if (isVerbose()) {
 *           console.log("[MyPlugin] Initializing with verbose logging...");
 *         }
 *       }
 *     }
 *   };
 * }
 * ```
 */
export function isVerbose(): boolean {
  return process.env.FRAME_MASTER_VERBOSE === "true";
}

export function onVerbose(
  callback: () => void | Promise<void>
): void | Promise<void> {
  if (isVerbose()) {
    return callback();
  }
}

/**
 * Log a message only if verbose mode is enabled.
 *
 * Convenience function that combines `isVerbose()` check with logging.
 *
 * @param args - Arguments to pass to `console.log`
 *
 * @example
 * ```typescript
 * import { verboseLog } from "frame-master/utils";
 *
 * verboseLog("[MyPlugin] Processing file:", filePath);
 * ```
 */
export function verboseLog(...args: unknown[]): void {
  if (isVerbose()) {
    console.log(...args);
  }
}

/**
 * Check if Frame-Master is currently in build mode.
 *
 * Build mode is active when `BUILD_MODE` is `true` (before server starts serving requests).
 * This is useful for plugins that need to behave differently during build vs runtime.
 *
 * **Public API** - Use this helper to conditionally execute code during build phase.
 *
 * @returns `true` if in build/initialization mode, `false` if server is running
 *
 * @example
 * ```typescript
 * import { isBuildMode } from "frame-master/utils";
 *
 * if (isBuildMode()) {
 *   console.log("[MyPlugin] Running during build phase");
 * } else {
 *   console.log("[MyPlugin] Server is running");
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Skip expensive operations during build
 * export function myPlugin(): FrameMasterPlugin {
 *   return {
 *     name: "my-plugin",
 *     version: "1.0.0",
 *     router: {
 *       before_request: (master) => {
 *         if (isBuildMode()) return; // Skip during dry run
 *         // Expensive runtime-only logic
 *       }
 *     }
 *   };
 * }
 * ```
 */
export function isBuildMode(): boolean {
  return globalThis.process.env.BUILD_MODE === "true";
}

/**
 * Check if Frame-Master server is running (not in build mode).
 *
 * Inverse of `isBuildMode()`. Returns `true` when server is actively handling requests.
 *
 * @returns `true` if server is running, `false` if in build/initialization mode
 *
 * @example
 * ```typescript
 * import { isServerRunning } from "frame-master/utils";
 *
 * if (isServerRunning()) {
 *   // Server is ready to handle requests
 * }
 * ```
 */
export function isServerRunning(): boolean {
  return Boolean(globalThis.__SERVER_INSTANCE__);
}

/**
 * Check if running in development mode.
 *
 * @returns `true` if `NODE_ENV` is not `"production"`
 *
 * @example
 * ```typescript
 * import { isDev } from "frame-master/utils";
 *
 * if (isDev()) {
 *   console.log("[MyPlugin] Development mode enabled");
 * }
 * ```
 */
export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Check if running in production mode.
 *
 * @returns `true` if `NODE_ENV` is `"production"`
 *
 * @example
 * ```typescript
 * import { isProd } from "frame-master/utils";
 *
 * if (isProd()) {
 *   // Production-only optimizations
 * }
 * ```
 */
export function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}
