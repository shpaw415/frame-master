import { watch, type FSWatcher } from "fs";
import { join, relative } from "path";
import { stat, readdir } from "fs/promises";

export type WatchEventType = "change" | "rename";

export type FileChangeCallback = (
  eventType: WatchEventType,
  filePath: string,
  absolutePath: string
) => void | Promise<void>;

export interface WatchOptions {
  /**
   * Path to watch (relative or absolute)
   */
  path: string;
  /**
   * Callback function to execute when changes are detected
   */
  callback: FileChangeCallback;
  /**
   * Debounce delay in milliseconds to avoid multiple rapid fire events
   * @default 100
   */
  debounceDelay?: number;
  /**
   * Patterns to ignore (glob-like matching)
   * @example [".git", "node_modules", "*.log"]
   */
  ignore?: string[];
  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean;
}

export class FileSystemWatcher {
  private watchers: Map<string, FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private options: Required<Omit<WatchOptions, "path" | "callback">> & {
    path: string;
    callback: FileChangeCallback;
  };
  private isWatching: boolean = false;

  constructor(options: WatchOptions) {
    this.options = {
      path: options.path,
      callback: options.callback,
      debounceDelay: options.debounceDelay ?? 100,
      ignore: options.ignore ?? [".git", "node_modules", ".DS_Store"],
      verbose: options.verbose ?? false,
    };
  }

  /**
   * Check if a path should be ignored based on ignore patterns
   */
  private shouldIgnore(filePath: string): boolean {
    const relativePath = relative(this.options.path, filePath);
    
    return this.options.ignore.some((pattern) => {
      // Simple glob-like matching
      if (pattern.startsWith("*")) {
        const ext = pattern.slice(1);
        return relativePath.endsWith(ext);
      }
      
      // Check if path contains the ignore pattern
      const pathParts = relativePath.split("/");
      return pathParts.some((part) => part === pattern);
    });
  }

  /**
   * Log messages if verbose mode is enabled
   */
  private log(...args: any[]): void {
    if (this.options.verbose) {
      console.log("[FileSystemWatcher]", ...args);
    }
  }

  /**
   * Handle file system events with debouncing
   */
  private handleEvent(
    eventType: WatchEventType,
    filename: string | null,
    watchPath: string
  ): void {
    if (!filename) return;

    const absolutePath = join(watchPath, filename);

    // Check if should be ignored
    if (this.shouldIgnore(absolutePath)) {
      return;
    }

    // Debounce the event
    const debounceKey = `${eventType}:${absolutePath}`;
    
    if (this.debounceTimers.has(debounceKey)) {
      clearTimeout(this.debounceTimers.get(debounceKey)!);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(debounceKey);
      
      this.log(`${eventType} detected:`, absolutePath);
      
      try {
        await this.options.callback(eventType, filename, absolutePath);
      } catch (error) {
        console.error(
          "[FileSystemWatcher] Error in callback:",
          error
        );
      }
    }, this.options.debounceDelay);

    this.debounceTimers.set(debounceKey, timer);
  }

  /**
   * Recursively watch a directory and all its subdirectories
   */
  private async watchDirectory(dirPath: string): Promise<void> {
    // Don't watch if already watching this directory
    if (this.watchers.has(dirPath)) {
      return;
    }

    try {
      const stats = await stat(dirPath);
      
      if (!stats.isDirectory()) {
        return;
      }

      // Check if should be ignored
      if (this.shouldIgnore(dirPath)) {
        return;
      }

      this.log("Watching directory:", dirPath);

      // Create watcher for this directory
      const watcher = watch(
        dirPath,
        { persistent: true, recursive: false },
        (eventType, filename) => {
          this.handleEvent(eventType, filename, dirPath);
        }
      );

      this.watchers.set(dirPath, watcher);

      // Recursively watch subdirectories
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDirPath = join(dirPath, entry.name);
          await this.watchDirectory(subDirPath);
        }
      }
    } catch (error) {
      // Silently ignore errors for files that don't exist or can't be accessed
      if (this.options.verbose) {
        console.error(
          `[FileSystemWatcher] Error watching ${dirPath}:`,
          error
        );
      }
    }
  }

  /**
   * Start watching the configured path
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      this.log("Already watching");
      return;
    }

    this.log("Starting file system watcher for:", this.options.path);
    
    try {
      const stats = await stat(this.options.path);
      
      if (stats.isDirectory()) {
        await this.watchDirectory(this.options.path);
      } else if (stats.isFile()) {
        // Watch single file
        const watcher = watch(
          this.options.path,
          (eventType, filename) => {
            this.handleEvent(eventType, filename, this.options.path);
          }
        );
        this.watchers.set(this.options.path, watcher);
      }
      
      this.isWatching = true;
      this.log(
        `Watching ${this.watchers.size} path(s)`
      );
    } catch (error) {
      console.error(
        "[FileSystemWatcher] Failed to start watcher:",
        error
      );
      throw error;
    }
  }

  /**
   * Stop watching and clean up all watchers
   */
  stop(): void {
    if (!this.isWatching) {
      return;
    }

    this.log("Stopping file system watcher");

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Close all watchers
    for (const [path, watcher] of this.watchers.entries()) {
      try {
        watcher.close();
        this.log("Closed watcher for:", path);
      } catch (error) {
        console.error(
          `[FileSystemWatcher] Error closing watcher for ${path}:`,
          error
        );
      }
    }
    
    this.watchers.clear();
    this.isWatching = false;
    
    this.log("File system watcher stopped");
  }

  /**
   * Check if the watcher is currently active
   */
  isActive(): boolean {
    return this.isWatching;
  }

  /**
   * Get the number of paths being watched
   */
  getWatchCount(): number {
    return this.watchers.size;
  }
}

/**
 * Convenience function to create and start a file system watcher
 */
export async function createWatcher(
  options: WatchOptions
): Promise<FileSystemWatcher> {
  const watcher = new FileSystemWatcher(options);
  await watcher.start();
  return watcher;
}

/**
 * Example usage:
 * 
 * const watcher = await createWatcher({
 *   path: "./src",
 *   callback: async (eventType, filename, absolutePath) => {
 *     console.log(`File ${eventType}:`, filename);
 *     console.log(`Absolute path:`, absolutePath);
 *   },
 *   debounceDelay: 200,
 *   ignore: ["node_modules", ".git", "*.log"],
 *   verbose: true
 * });
 * 
 * // Later, to stop watching:
 * watcher.stop();
 */
