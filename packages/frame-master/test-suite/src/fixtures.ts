import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Create a unique temporary directory under `os.tmpdir()`.
 *
 * @param prefix - Directory name prefix (default: `fm-plugin-test-`)
 */
export async function createTempDir(
	prefix = "fm-plugin-test-",
): Promise<string> {
	return mkdtemp(join(tmpdir(), prefix));
}

/**
 * Remove a directory recursively (best-effort).
 */
export async function removeTempDir(dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true });
}

/**
 * Run `fn` with a temporary directory that is always cleaned up.
 *
 * @example
 * ```ts
 * await withTempDir(async (dir) => {
 *   await writeFixture(dir, "entry.ts", "export const x = 1;");
 * });
 * ```
 */
export async function withTempDir<T>(
	fn: (dir: string) => Promise<T> | T,
	prefix?: string,
): Promise<T> {
	const dir = await createTempDir(prefix);
	try {
		return await fn(dir);
	} finally {
		await removeTempDir(dir);
	}
}

/**
 * Write a file under `root`, creating parent directories as needed.
 *
 * @param root - Absolute base directory
 * @param relativePath - Path relative to root
 * @param contents - File body
 * @returns Absolute path of the written file
 */
export async function writeFixture(
	root: string,
	relativePath: string,
	contents: string | Uint8Array,
): Promise<string> {
	const absolute = join(root, relativePath);
	await mkdir(dirname(absolute), { recursive: true });
	await writeFile(absolute, contents);
	return absolute;
}
