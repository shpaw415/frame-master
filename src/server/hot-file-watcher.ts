import { watch, type FSWatcher } from "fs";
import { join, isAbsolute } from "path";

export type HotFileWatcherCallback<T = void> = (
  filePath: string
) => T | Promise<T>;

export interface HotFileWatcherOptions {
  /**
   * Path to the file to watch (relative to cwd or absolute).
   */
  filePath: string;

  /**
   * Callback function to execute when the file changes.
   * Receives the absolute path to the changed file.
   */
  onReload: HotFileWatcherCallback;

  /**
   * Debounce delay in milliseconds to avoid multiple rapid fire events.
   * @default 100
   */
  debounceDelay?: number;

  /**
   * Optional name for logging purposes.
   * @default "HotFileWatcher"
   */
  name?: string;

  /**
   * Enable verbose logging.
   * @default false
   */
  verbose?: boolean;
}

/**
 * HotFileWatcher provides a simple API for watching individual files
 * and executing callbacks when they change.
 *
 * Useful for plugin developers who need to watch configuration files,
 * templates, or other files that should trigger hot-reload behavior.
 *
 * Features:
 * - Debounced file change detection
 * - Automatic path resolution
 * - Error handling with logging
 * - Simple start/stop lifecycle
 *
 * @example
 * ```typescript
 * import { HotFileWatcher } from "frame-master/server/hot-file-watcher";
 *
 * const watcher = new HotFileWatcher({
 *   filePath: "my-plugin.config.json",
 *   onReload: async (path) => {
 *     console.log("Config changed:", path);
 *     await reloadMyPluginConfig();
 *   },
 *   debounceDelay: 200,
 *   name: "MyPluginConfig",
 *   verbose: true
 * });
 *
 * await watcher.start();
 *
 * // Later, to stop watching:
 * watcher.stop();
 * ```
 *
 * @example
 * Plugin integration:
 * ```typescript
 * import { HotFileWatcher } from "frame-master/server/hot-file-watcher";
 * import type { FrameMasterPlugin } from "frame-master/plugin/types";
 *
 * export function myPlugin(configPath: string): FrameMasterPlugin {
 *   let watcher: HotFileWatcher | null = null;
 *
 *   return {
 *     name: "my-plugin",
 *     version: "1.0.0",
 *     serverStart: {
 *       dev_main: async () => {
 *         watcher = new HotFileWatcher({
 *           filePath: configPath,
 *           onReload: () => {
 *             console.log("Plugin config changed, reloading...");
 *           }
 *         });
 *         await watcher.start();
 *       }
 *     }
 *   };
 * }
 * ```
 */
export class HotFileWatcher {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isWatching: boolean = false;
  private absolutePath: string;

  readonly options: Required<HotFileWatcherOptions>;

  constructor(options: HotFileWatcherOptions) {
    this.options = {
      filePath: options.filePath,
      onReload: options.onReload,
      debounceDelay: options.debounceDelay ?? 100,
      name: options.name ?? "HotFileWatcher",
      verbose: options.verbose ?? false,
    };

    // Resolve to absolute path
    this.absolutePath = isAbsolute(options.filePath)
      ? options.filePath
      : join(process.cwd(), options.filePath);
  }

  /**
   * Get the absolute path being watched.
   */
  getPath(): string {
    return this.absolutePath;
  }

  /**
   * Log messages if verbose mode is enabled.
   */
  private log(...args: unknown[]): void {
    if (this.options.verbose) {
      console.log(`[${this.options.name}]`, ...args);
    }
  }

  /**
   * Start watching the file for changes.
   *
   * @returns Promise that resolves when watching has started
   * @throws Error if file doesn't exist or watching fails
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      this.log("Already watching file");
      return;
    }

    try {
      const file = Bun.file(this.absolutePath);
      if (!(await file.exists())) {
        console.warn(
          `[${this.options.name}] File not found, skipping watch:`,
          this.absolutePath
        );
        return;
      }

      this.watcher = watch(this.absolutePath, (eventType) => {
        if (eventType === "change") {
          this.handleChange();
        }
      });

      this.isWatching = true;
      this.log(`[${this.options.name}] Watching file:`, this.absolutePath);
    } catch (error) {
      console.error(`[${this.options.name}] Failed to start watching:`, error);
      throw error;
    }
  }

  /**
   * Handle file changes with debouncing.
   */
  private handleChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      await this.triggerReload();
    }, this.options.debounceDelay);
  }

  /**
   * Manually trigger the reload callback.
   *
   * Useful for programmatic reload without file change.
   */
  async triggerReload(): Promise<void> {
    this.log("File changed, triggering reload...");

    try {
      await this.options.onReload(this.absolutePath);
      this.log("Reload completed successfully");
    } catch (error) {
      console.error(`[${this.options.name}] Error during reload:`, error);
    }
  }

  /**
   * Stop watching the file.
   */
  stop(): void {
    if (!this.isWatching) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.isWatching = false;
    this.log("Stopped watching file");
  }

  /**
   * Check if currently watching the file.
   */
  isActive(): boolean {
    return this.isWatching;
  }
}

/**
 * Convenience function to create and start a file watcher.
 *
 * @example
 * ```typescript
 * import { createHotFileWatcher } from "frame-master/server/hot-file-watcher";
 *
 * const watcher = await createHotFileWatcher({
 *   filePath: "config.json",
 *   onReload: (path) => console.log("Changed:", path)
 * });
 *
 * // Later:
 * watcher.stop();
 * ```
 */
export async function createHotFileWatcher(
  options: HotFileWatcherOptions
): Promise<HotFileWatcher> {
  const watcher = new HotFileWatcher(options);
  await watcher.start();
  return watcher;
}
