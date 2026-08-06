import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	createTempDir,
	removeTempDir,
	withTempDir,
	writeFixture,
} from "../src/fixtures";

describe("fixtures", () => {
	let leftover: string | undefined;

	afterEach(async () => {
		if (leftover) {
			await removeTempDir(leftover);
			leftover = undefined;
		}
	});

	test("createTempDir creates a directory", async () => {
		leftover = await createTempDir("fm-fixture-");
		expect(existsSync(leftover)).toBe(true);
	});

	test("writeFixture writes nested files", async () => {
		await withTempDir(async (dir) => {
			const path = await writeFixture(dir, "a/b/c.txt", "hello");
			expect(path).toBe(join(dir, "a/b/c.txt"));
			expect(await Bun.file(path).text()).toBe("hello");
		});
	});

	test("withTempDir cleans up after success", async () => {
		let captured = "";
		await withTempDir(async (dir) => {
			captured = dir;
			await writeFixture(dir, "x.txt", "1");
			expect(existsSync(join(dir, "x.txt"))).toBe(true);
		});
		expect(existsSync(captured)).toBe(false);
	});

	test("withTempDir cleans up after error", async () => {
		let captured = "";
		await expect(
			withTempDir(async (dir) => {
				captured = dir;
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(existsSync(captured)).toBe(false);
	});
});
