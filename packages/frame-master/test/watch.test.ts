import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
	createWatcher,
	type FileSystemWatcher,
} from "../src/server/watch";
import { withTempDir } from "../test-suite/src/fixtures";

async function waitUntil(
	predicate: () => boolean,
	timeoutMs = 3000,
): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) {
			throw new Error("timed out waiting for watcher event");
		}
		await Bun.sleep(20);
	}
}

describe("createWatcher", () => {
	let watcher: FileSystemWatcher | undefined;

	afterEach(() => {
		watcher?.stop();
		watcher = undefined;
	});

	test("emits projectRootPath and OS absolutePath for a nested file", async () => {
		await withTempDir(async (dir) => {
			await mkdir(join(dir, "src", "pages"), { recursive: true });
			const events: Array<{
				filePath: string;
				projectRootPath: string;
				absolutePath: string;
			}> = [];

			watcher = await createWatcher({
				path: join(dir, "src"),
				debounceDelay: 20,
				callback(_event, filePath, projectRootPath, absolutePath) {
					events.push({ filePath, projectRootPath, absolutePath });
				},
			});

			const target = join(dir, "src", "pages", "index.tsx");
			await writeFile(target, "export default 1;\n");
			await waitUntil(() => events.length > 0);

			const event = events[0];
			expect(event?.filePath).toBe("index.tsx");
			expect(event?.absolutePath).toBe(resolve(target));
			expect(isAbsolute(event?.absolutePath ?? "")).toBe(true);
			expect(event?.projectRootPath).toBe(
				relative(process.cwd(), resolve(target)).replaceAll("\\", "/"),
			);
		});
	});

	test("3-arg callbacks still run", async () => {
		await withTempDir(async (dir) => {
			await mkdir(join(dir, "src"), { recursive: true });
			const received: string[] = [];

			watcher = await createWatcher({
				path: join(dir, "src"),
				debounceDelay: 20,
				callback(_event, _file, projectRootPath) {
					received.push(projectRootPath);
				},
			});

			await writeFile(join(dir, "src", "a.ts"), "export {};\n");
			await waitUntil(() => received.length > 0);
			expect(received[0]?.includes("src/a.ts") || received[0]?.endsWith("src/a.ts")).toBe(
				true,
			);
		});
	});

	test("throwing callback does not stop later events", async () => {
		await withTempDir(async (dir) => {
			await mkdir(join(dir, "src"), { recursive: true });
			let count = 0;
			const original = console.error;
			console.error = () => {};

			try {
				watcher = await createWatcher({
					path: join(dir, "src"),
					debounceDelay: 20,
					callback() {
						count++;
						if (count === 1) throw new Error("boom");
					},
				});

				await writeFile(join(dir, "src", "a.ts"), "1\n");
				await waitUntil(() => count >= 1);
				await writeFile(join(dir, "src", "b.ts"), "2\n");
				await waitUntil(() => count >= 2);
				expect(count).toBeGreaterThanOrEqual(2);
			} finally {
				console.error = original;
			}
		});
	});

	test("ignore patterns skip matching files", async () => {
		await withTempDir(async (dir) => {
			await mkdir(join(dir, "src"), { recursive: true });
			const received: string[] = [];

			watcher = await createWatcher({
				path: join(dir, "src"),
				debounceDelay: 20,
				ignore: ["*.log"],
				callback(_event, filePath) {
					received.push(filePath);
				},
			});

			await writeFile(join(dir, "src", "notes.log"), "log\n");
			await writeFile(join(dir, "src", "ok.ts"), "export {};\n");
			await waitUntil(() => received.includes("ok.ts"));
			expect(received.includes("notes.log")).toBe(false);
		});
	});

	test("debounce coalesces a burst of writes", async () => {
		await withTempDir(async (dir) => {
			await mkdir(join(dir, "src"), { recursive: true });
			const file = join(dir, "src", "burst.ts");
			await writeFile(file, "0\n");
			let count = 0;

			watcher = await createWatcher({
				path: join(dir, "src"),
				debounceDelay: 80,
				callback() {
					count++;
				},
			});

			writeFileSync(file, "1\n");
			writeFileSync(file, "2\n");
			writeFileSync(file, "3\n");
			await Bun.sleep(250);
			expect(count).toBeGreaterThanOrEqual(1);
			expect(count).toBeLessThanOrEqual(2);
		});
	});

	test("stop() drops later writes", async () => {
		await withTempDir(async (dir) => {
			await mkdir(join(dir, "src"), { recursive: true });
			let count = 0;

			watcher = await createWatcher({
				path: join(dir, "src"),
				debounceDelay: 20,
				callback() {
					count++;
				},
			});

			watcher.stop();
			watcher = undefined;
			await writeFile(join(dir, "src", "after-stop.ts"), "export {};\n");
			await Bun.sleep(150);
			expect(count).toBe(0);
		});
	});
});
