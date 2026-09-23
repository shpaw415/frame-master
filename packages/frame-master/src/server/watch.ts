import { type FSWatcher, watch } from "fs";
import { readdir, stat } from "fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "path";
import type { FileChangeCallback, WatchEventType } from "../plugins";

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

export type ResolvedFileChangePaths = {
	filePath: string;
	projectRootPath: string;
	absolutePath: string;
};

export function resolveFileChangePaths(
	watchPath: string,
	filename: string | null,
	projectRoot: string = process.cwd(),
	options?: { watchTargetIsFile?: boolean },
): ResolvedFileChangePaths | null {
	const resolvedWatchPath = isAbsolute(watchPath)
		? watchPath
		: resolve(projectRoot, watchPath);

	if (options?.watchTargetIsFile) {
		const absolutePath = resolve(resolvedWatchPath);
		if (!isAbsolute(absolutePath)) return null;
		let projectRootPath = relative(projectRoot, absolutePath).replaceAll(
			"\\",
			"/",
		);
		if (!projectRootPath) projectRootPath = ".";
		const filePath =
			filename &&
			filename.trim() !== "" &&
			filename !== "." &&
			filename !== ".."
				? filename
				: basename(absolutePath);
		return { filePath, projectRootPath, absolutePath };
	}

	if (filename == null) return null;
	const trimmed = filename.trim();
	if (trimmed === "" || trimmed === "." || trimmed === "..") return null;

	const absolutePath = resolve(resolvedWatchPath, filename);
	if (!isAbsolute(absolutePath)) return null;

	let projectRootPath = relative(projectRoot, absolutePath).replaceAll(
		"\\",
		"/",
	);
	if (!projectRootPath) projectRootPath = ".";

	return {
		filePath: filename,
		projectRootPath,
		absolutePath,
	};
}

export async function dispatchFileChangeCallbacks(
	callbacks: FileChangeCallback[],
	eventType: WatchEventType,
	filePath: string,
	projectRootPath: string,
	absolutePath: string,
): Promise<void> {
	const results = await Promise.allSettled(
		callbacks.map(async (callback) =>
			callback(eventType, filePath, projectRootPath, absolutePath),
		),
	);

	for (const result of results) {
		if (result.status === "rejected") {
			console.error("[FileSystemWatcher] Error in callback:", result.reason);
		}
	}
}

export class FileSystemWatcher {
	private watchers: Map<string, FSWatcher> = new Map();
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
	private options: Required<Omit<WatchOptions, "path" | "callback">> & {
		path: string;
		callback: FileChangeCallback;
	};
	private isWatching: boolean = false;
	private watchTargetIsFile: boolean = false;

	constructor(options: WatchOptions) {
		this.options = {
			path: resolve(options.path),
			callback: options.callback,
			debounceDelay: options.debounceDelay ?? 100,
			ignore: options.ignore ?? [".git", "node_modules", ".DS_Store"],
			verbose: options.verbose ?? false,
		};
	}

	private shouldIgnore(filePath: string): boolean {
		const relativePath = relative(this.options.path, filePath).replaceAll(
			"\\",
			"/",
		);

		return this.options.ignore.some((pattern) => {
			if (pattern.startsWith("*")) {
				const ext = pattern.slice(1);
				return relativePath.endsWith(ext);
			}

			const pathParts = relativePath.split("/");
			return pathParts.some((part) => part === pattern);
		});
	}

	private log(...args: any[]): void {
		if (this.options.verbose) {
			console.log("[FileSystemWatcher]", ...args);
		}
	}

	private handleEvent(
		eventType: WatchEventType,
		filename: string | null,
		watchPath: string,
	): void {
		const resolved = resolveFileChangePaths(
			watchPath,
			filename,
			process.cwd(),
			{ watchTargetIsFile: this.watchTargetIsFile },
		);
		if (!resolved) return;

		if (this.shouldIgnore(resolved.absolutePath)) {
			return;
		}

		const debounceKey = `${eventType}:${resolved.absolutePath}`;

		if (this.debounceTimers.has(debounceKey)) {
			clearTimeout(this.debounceTimers.get(debounceKey)!);
		}

		const timer = setTimeout(async () => {
			this.debounceTimers.delete(debounceKey);

			this.log(`${eventType} detected:`, resolved.absolutePath);

			try {
				await this.options.callback(
					eventType,
					resolved.filePath,
					resolved.projectRootPath,
					resolved.absolutePath,
				);
			} catch (error) {
				console.error("[FileSystemWatcher] Error in callback:", error);
			}
		}, this.options.debounceDelay);

		this.debounceTimers.set(debounceKey, timer);
	}

	private async watchDirectory(dirPath: string): Promise<void> {
		if (this.watchers.has(dirPath)) {
			return;
		}

		try {
			const stats = await stat(dirPath);

			if (!stats.isDirectory()) {
				return;
			}

			if (this.shouldIgnore(dirPath)) {
				return;
			}

			this.log("Watching directory:", dirPath);

			const watcher = watch(
				dirPath,
				{ persistent: true, recursive: false },
				(eventType, filename) => {
					this.handleEvent(eventType, filename, dirPath);
				},
			);

			this.watchers.set(dirPath, watcher);

			const entries = await readdir(dirPath, { withFileTypes: true });

			for (const entry of entries) {
				if (entry.isDirectory()) {
					const subDirPath = join(dirPath, entry.name);
					await this.watchDirectory(subDirPath);
				}
			}
		} catch (error) {
			if (this.options.verbose) {
				console.error(`[FileSystemWatcher] Error watching ${dirPath}:`, error);
			}
		}
	}

	async start(): Promise<void> {
		if (this.isWatching) {
			this.log("Already watching");
			return;
		}

		this.log("Starting file system watcher for:", this.options.path);

		try {
			const stats = await stat(this.options.path);

			if (stats.isDirectory()) {
				this.watchTargetIsFile = false;
				await this.watchDirectory(this.options.path);
			} else if (stats.isFile()) {
				this.watchTargetIsFile = true;
				const watcher = watch(this.options.path, (eventType, filename) => {
					this.handleEvent(eventType, filename, this.options.path);
				});
				this.watchers.set(this.options.path, watcher);
			}

			this.isWatching = true;
			this.log(`Watching ${this.watchers.size} path(s)`);
		} catch (error) {
			console.error("[FileSystemWatcher] Failed to start watcher:", error);
			throw error;
		}
	}

	stop(): void {
		if (!this.isWatching) {
			return;
		}

		this.log("Stopping file system watcher");

		for (const timer of this.debounceTimers.values()) {
			clearTimeout(timer);
		}
		this.debounceTimers.clear();

		for (const [path, watcher] of this.watchers.entries()) {
			try {
				watcher.close();
				this.log("Closed watcher for:", path);
			} catch (error) {
				console.error(
					`[FileSystemWatcher] Error closing watcher for ${path}:`,
					error,
				);
			}
		}

		this.watchers.clear();
		this.isWatching = false;

		this.log("File system watcher stopped");
	}

	isActive(): boolean {
		return this.isWatching;
	}

	getWatchCount(): number {
		return this.watchers.size;
	}
}

export async function createWatcher(
	options: WatchOptions,
): Promise<FileSystemWatcher> {
	const watcher = new FileSystemWatcher(options);
	await watcher.start();
	return watcher;
}
