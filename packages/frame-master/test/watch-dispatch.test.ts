import { describe, expect, test } from "bun:test";
import type { FileChangeCallback } from "../src/plugins/types";
import { dispatchFileChangeCallbacks } from "../src/server/watch";

describe("dispatchFileChangeCallbacks", () => {
	test("delivers all four arguments", async () => {
		const received: unknown[] = [];
		const callback: FileChangeCallback = (
			eventType,
			filePath,
			projectRootPath,
			absolutePath,
		) => {
			received.push(eventType, filePath, projectRootPath, absolutePath);
		};

		await dispatchFileChangeCallbacks(
			[callback],
			"change",
			"index.tsx",
			"src/index.tsx",
			"/app/src/index.tsx",
		);

		expect(received).toEqual([
			"change",
			"index.tsx",
			"src/index.tsx",
			"/app/src/index.tsx",
		]);
	});

	test("3-arg callbacks still receive events", async () => {
		const received: string[] = [];
		const threeArg = (
			_event: "change" | "rename",
			_file: string,
			projectRootPath: string,
		) => {
			received.push(projectRootPath);
		};

		await dispatchFileChangeCallbacks(
			[threeArg],
			"rename",
			"index.tsx",
			"src/index.tsx",
			"/app/src/index.tsx",
		);

		expect(received).toEqual(["src/index.tsx"]);
	});

	test("a sync throw does not skip later plugins", async () => {
		const order: string[] = [];
		const logged: unknown[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => {
			logged.push(args);
		};

		try {
			await dispatchFileChangeCallbacks(
				[
					() => {
						order.push("a");
						throw new Error("boom");
					},
					(_event, _file, projectRootPath, absolutePath) => {
						order.push("b");
						expect(projectRootPath).toBe("src/index.tsx");
						expect(absolutePath).toBe("/app/src/index.tsx");
					},
				],
				"change",
				"index.tsx",
				"src/index.tsx",
				"/app/src/index.tsx",
			);
		} finally {
			console.error = original;
		}

		expect(order).toEqual(["a", "b"]);
		expect(logged).toHaveLength(1);
	});

	test("an async reject does not skip later plugins", async () => {
		const order: string[] = [];
		const logged: unknown[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => {
			logged.push(args);
		};

		try {
			await dispatchFileChangeCallbacks(
				[
					async () => {
						order.push("a");
						throw new Error("async boom");
					},
					() => {
						order.push("b");
					},
				],
				"change",
				"index.tsx",
				"src/index.tsx",
				"/app/src/index.tsx",
			);
		} finally {
			console.error = original;
		}

		expect(order).toEqual(["a", "b"]);
		expect(logged).toHaveLength(1);
	});
});
