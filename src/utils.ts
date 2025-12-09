import { directiveToolSingleton, reloadPluginLoader } from "./plugins";
import type { masterRequest } from "./server/request-manager";
import { reloadConfig, getConfig } from "./server/config";
import { reloadBuilder } from "./build";
import { getServerInstance, buildServerConfig } from "./server";
import { FileSystemWatcher, type WatchOptions } from "./server/watch";
import chalk from "chalk";

export { directiveToolSingleton as directiveManager };

/**
 * Check if verbose mode is enabled.
 *
 * Verbose mode is enabled when the CLI is run with the `-v` or `--verbose` flag.
 *
 * @returns `true` if verbose mode is enabled, `false` otherwise
 *
 * @example
 * ```typescript
 * import { isVerbose } from "frame-master/utils";
 *
 * if (isVerbose()) {
 *   console.log("Detailed debug information...");
 * }
 * ```
 */
export function isVerbose(): boolean {
  return process.env.FRAME_MASTER_VERBOSE === "true";
}

/**
 * Check if the current process is running in build mode.
 *
 * Build mode is active when `frame-master build` command is executed.
 * Useful for plugins to conditionally run logic only during build command trigger.
 *
 * @returns `true` if running in build mode, `false` otherwise
 *
 * @example
 * ```typescript
 * // bun frame-master build
 * import { isBuildMode } from "frame-master/utils";
 *
 * serverStart: {
 *   main: async () => {
 *     if (isBuildMode()) {
 *       // Only run during build command
 *       await generateStaticAssets();
 *     }
 *   }
 * }
 * ```
 */
export function isBuildMode(): boolean {
  return process.env.BUILD_MODE === "true";
}

/**
 * Execute a callback only when verbose mode is enabled.
 *
 * Convenience helper for conditional logging or debug operations.
 *
 * @param callback - Function to execute or string to log when verbose
 * @returns The result of the callback, or undefined if verbose is disabled
 *
 * @example
 * ```typescript
 * import { onVerbose } from "frame-master/utils";
 *
 * onVerbose(() => console.log("Debug: Processing request..."));
 * onVerbose("Simple log message");
 * ```
 */
export function onVerbose(callback: (() => void | Promise<void>) | string) {
  if (!isVerbose()) return;
  if (typeof callback === "string") {
    console.log(callback);
    return;
  }
  return callback();
}

/**
 * Hot reload plugins by re-importing the config file and reinitializing all systems.
 *
 * This function performs a complete reload of the Frame-Master plugin system:
 * 1. Reloads the `frame-master.config.ts` configuration file
 * 2. Reinitializes the plugin loader with the new config
 * 3. Rebuilds the singleton builder with updated plugin configurations
 *
 * **Use Cases:**
 * - Development hot-reloading when config changes
 * - Dynamic plugin management
 * - Testing different plugin configurations
 *
 * **Note:** This does NOT restart the HTTP server. Active connections and
 * server state are preserved. Only plugin configurations are reloaded.
 *
 * @returns Promise that resolves when reload is complete
 *
 * @example
 * ```typescript
 * import { reloadPlugins } from "frame-master/utils";
 *
 * // Watch for config changes and reload
 * onFileSystemChange: async (event, file, absolutePath) => {
 *   if (file.endsWith("frame-master.config.ts")) {
 *     console.log("Config changed, reloading plugins...");
 *     await reloadPlugins();
 *     console.log("Plugins reloaded!");
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Manual reload trigger (e.g., from an API endpoint)
 * import { reloadPlugins } from "frame-master/utils";
 *
 * router: {
 *   request: async (master) => {
 *     if (master.URL.pathname === "/__reload") {
 *       await reloadPlugins();
 *       master.setResponse("Plugins reloaded");
 *     }
 *   }
 * }
 * ```
 */
export async function reloadPlugins(): Promise<void> {
  // Capture old config before reload to detect critical changes
  const oldConfig = getConfig();
  const oldPort = oldConfig?.HTTPServer?.port;
  const oldHostname = oldConfig?.HTTPServer?.hostname;
  const oldTls = oldConfig?.HTTPServer?.tls;

  onVerbose("[Frame-Master] Reloading plugins...");

  // 1. Reload config file (bust cache with timestamp)
  await reloadConfig();
  onVerbose("[Frame-Master] Config reloaded");

  // 2. Reinitialize plugin loader with new config
  reloadPluginLoader();
  onVerbose("[Frame-Master] Plugin loader reinitialized");

  // 3. Rebuild the builder with updated plugin configurations
  await reloadBuilder();
  onVerbose("[Frame-Master] Builder reloaded");

  // 4. Check if HTTPServer critical options changed (require cold restart)
  const newConfig = getConfig();
  const needsColdRestart =
    oldPort !== newConfig?.HTTPServer?.port ||
    oldHostname !== newConfig?.HTTPServer?.hostname ||
    JSON.stringify(oldTls) !== JSON.stringify(newConfig?.HTTPServer?.tls);

  if (needsColdRestart) {
    logColdRestartWarning(oldPort, oldHostname, oldTls, newConfig);
  }

  // 5. Reload server routes if server is running
  const server = getServerInstance();
  if (server) {
    const newServerConfig = buildServerConfig();
    if (newServerConfig) {
      server.reload(newServerConfig as Parameters<typeof server.reload>[0]);
      onVerbose("[Frame-Master] Server routes reloaded");
    }
  }

  onVerbose("[Frame-Master] Hot reload complete!");
  console.log(chalk.green("[Frame-Master] ✓ Hot reload complete"));
}

/**
 * Log a warning when HTTPServer critical options change and require cold restart.
 */
function logColdRestartWarning(
  oldPort: string | number | undefined,
  oldHostname: string | undefined,
  oldTls: unknown,
  newConfig: ReturnType<typeof getConfig>
) {
  console.log(
    chalk.yellow.bold(
      "\n┌─────────────────────────────────────────────────────┐"
    )
  );
  console.log(
    chalk.yellow.bold("│") +
      chalk.white("  ⚠️  Server config changed - Cold restart required  ") +
      chalk.yellow.bold("│")
  );
  console.log(
    chalk.yellow.bold("├─────────────────────────────────────────────────────┤")
  );
  if (oldPort !== newConfig?.HTTPServer?.port) {
    console.log(
      chalk.yellow.bold("│") +
        chalk.gray(
          `  Port: ${oldPort ?? "default"} → ${
            newConfig?.HTTPServer?.port ?? "default"
          }`.padEnd(50)
        ) +
        chalk.yellow.bold("│")
    );
  }
  if (oldHostname !== newConfig?.HTTPServer?.hostname) {
    console.log(
      chalk.yellow.bold("│") +
        chalk.gray(
          `  Hostname: ${oldHostname ?? "default"} → ${
            newConfig?.HTTPServer?.hostname ?? "default"
          }`.padEnd(50)
        ) +
        chalk.yellow.bold("│")
    );
  }
  if (JSON.stringify(oldTls) !== JSON.stringify(newConfig?.HTTPServer?.tls)) {
    console.log(
      chalk.yellow.bold("│") +
        chalk.gray("  TLS configuration changed".padEnd(50)) +
        chalk.yellow.bold("│")
    );
  }
  console.log(
    chalk.yellow.bold("│") +
      chalk.cyan("  Please restart the server to apply these changes.  ") +
      chalk.yellow.bold("│")
  );
  console.log(
    chalk.yellow.bold(
      "└─────────────────────────────────────────────────────┘\n"
    )
  );
}

/**
 * Hot reload the HTTP server with the new configuration.
 *
 * This function reloads plugins first, then applies the new server configuration
 * to the running Bun server using `server.reload()`. This allows changing:
 * - Server routes
 * - WebSocket handlers
 * - Fetch handler behavior
 *
 * **Note:** Some server options like `port`, `hostname`, and `tls` cannot be
 * changed without a full server restart. If these change, the function will
 * log a warning suggesting a cold restart.
 *
 * @returns Promise that resolves when reload is complete
 *
 * @example
 * ```typescript
 * import { reloadServer } from "frame-master/utils";
 *
 * // Full hot reload including server config
 * onFileSystemChange: async (event, file, absolutePath) => {
 *   if (file.endsWith("frame-master.config.ts")) {
 *     await reloadServer();
 *   }
 * }
 * ```
 */
export async function reloadServer(): Promise<void> {
  // First reload plugins (config, plugin loader, builder)
  // Note: reloadPlugins() already shows warning for critical config changes
  await reloadPlugins();

  const server = getServerInstance();
  if (!server) {
    console.warn(
      chalk.yellow(
        "[Frame-Master] No server instance found. Cannot reload server."
      )
    );
    return;
  }

  const newServerConfig = buildServerConfig();

  if (!newServerConfig) {
    console.error(
      chalk.red("[Frame-Master] Failed to build server config for reload.")
    );
    return;
  }

  // Reload the server with new config (routes, fetch handler, websocket handlers)
  server.reload(newServerConfig as Parameters<typeof server.reload>[0]);

  onVerbose("[Frame-Master] Server reloaded with new configuration");
  console.log(chalk.green("[Frame-Master] ✓ Server hot-reloaded successfully"));
}

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

export interface WatchFileOptions {
  /**
   * Debounce delay in milliseconds to avoid multiple rapid fire events
   * @default 100
   */
  debounceDelay?: number;
  /**
   * Enable verbose logging
   * @default false (uses isVerbose() as fallback)
   */
  verbose?: boolean;
}

export interface WatchFileResult {
  /**
   * Stop watching the file
   */
  stop: () => void;
  /**
   * Check if the watcher is currently active
   */
  isActive: () => boolean;
}

/**
 * Watch a specific file for changes and execute a callback when it changes.
 *
 * This is a convenience utility for watching a single file. For watching
 * directories or multiple files, use the plugin's `fileSystemWatchDir` option instead.
 *
 * @param filePath - Absolute or relative path to the file to watch
 * @param callback - Function to execute when the file changes
 * @param options - Optional configuration for the watcher
 * @returns Object with `stop()` method to stop watching and `isActive()` to check status
 *
 * @example
 * ```typescript
 * import { watchFile } from "frame-master/utils";
 *
 * // Basic usage - watch a config file
 * const watcher = await watchFile("./config.json", async (event, filename) => {
 *   console.log(`Config file ${event}:`, filename);
 *   // Reload config, restart service, etc.
 * });
 *
 * // Later, stop watching
 * watcher.stop();
 * ```
 *
 * @example
 * ```typescript
 * // Watch with options
 * const watcher = await watchFile(
 *   "/absolute/path/to/data.json",
 *   async (event, filename, absolutePath) => {
 *     if (event === "change") {
 *       const data = await Bun.file(absolutePath).json();
 *       updateCache(data);
 *     }
 *   },
 *   { debounceDelay: 200, verbose: true }
 * );
 *
 * // Check if still watching
 * if (watcher.isActive()) {
 *   console.log("Still watching file");
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Use in a plugin's serverStart hook
 * import { watchFile } from "frame-master/utils";
 *
 * export default {
 *   serverStart: {
 *     main: async () => {
 *       // Watch external config and reload on change
 *       await watchFile("./external-config.yaml", async () => {
 *         console.log("External config changed, reloading...");
 *         await reloadExternalConfig();
 *       });
 *     }
 *   }
 * } satisfies FrameMasterPlugin;
 * ```
 */
export async function watchFile(
  filePath: string,
  callback: (
    event: "change" | "rename",
    filename: string,
    absolutePath: string
  ) => void | Promise<void>,
  options?: WatchFileOptions
): Promise<WatchFileResult> {
  const resolvedPath = filePath.startsWith("/")
    ? filePath
    : join(process.cwd(), filePath);

  const watcher = new FileSystemWatcher({
    path: resolvedPath,
    callback: callback,
    debounceDelay: options?.debounceDelay ?? 100,
    ignore: [], // No ignore patterns for single file watching
    verbose: options?.verbose ?? isVerbose(),
  });

  await watcher.start();

  onVerbose(`[Frame-Master] Watching file: ${resolvedPath}`);

  return {
    stop: () => {
      watcher.stop();
      onVerbose(`[Frame-Master] Stopped watching file: ${resolvedPath}`);
    },
    isActive: () => watcher.isActive(),
  };
}
