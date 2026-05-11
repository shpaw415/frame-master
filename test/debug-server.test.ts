import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Builder } from "../src/build";
import { DebugBuildServer } from "../src/debug/server";

const cleanupPaths = new Set<string>();

afterEach(() => {
	for (const path of [...cleanupPaths].reverse()) {
		rmSync(path, { recursive: true, force: true });
	}
	cleanupPaths.clear();
});

function createStubBuilder() {
	return {
		build: async () => ({ success: true }),
		exportDebugTrace: () => JSON.stringify({ buildList: [], builds: [] }),
	} as unknown as Builder;
}

async function invokeRunBuild(server: DebugBuildServer) {
	const runBuild = Reflect.get(server, "runBuild");
	if (typeof runBuild !== "function") {
		throw new TypeError("Expected DebugBuildServer.runBuild to be callable");
	}

	return await Reflect.apply(runBuild, server, []);
}

describe("debug server trace saving", () => {
	test("preserves absolute save-trace paths", async () => {
		const absoluteDir = join(
			tmpdir(),
			`frame-master-debug-server-${Date.now()}-absolute`,
		);
		const savePath = join(absoluteDir, "trace.json");
		const incorrectJoinedPath = join(process.cwd(), savePath);

		cleanupPaths.add(absoluteDir);

		const server = new DebugBuildServer(createStubBuilder(), {
			port: 0,
			watch: false,
			saveTrace: savePath,
		});

		await invokeRunBuild(server);

		expect(existsSync(savePath)).toBe(true);
		expect(existsSync(incorrectJoinedPath)).toBe(false);
	});

	test("keeps watched traces under .frame-master debug-traces", async () => {
		const requestedDir = join(
			process.cwd(),
			`.tmp-debug-server-${Date.now()}-requested`,
		);
		const requestedSavePath = join(requestedDir, "trace.json");
		const expectedSavePath = join(
			process.cwd(),
			".frame-master",
			"debug-traces",
			basename(requestedSavePath),
		);

		cleanupPaths.add(requestedDir);
		cleanupPaths.add(expectedSavePath);
		cleanupPaths.add(dirname(expectedSavePath));

		const server = new DebugBuildServer(createStubBuilder(), {
			port: 0,
			watch: true,
			saveTrace: requestedSavePath,
		});

		await invokeRunBuild(server);

		expect(existsSync(requestedSavePath)).toBe(false);
		expect(existsSync(expectedSavePath)).toBe(true);
	});
});
