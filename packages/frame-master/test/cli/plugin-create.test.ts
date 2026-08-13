import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dir, "..", "..", "bin", "index.ts");

describe("frame-master plugin create", () => {
	let dir: string | undefined;

	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
		dir = undefined;
	});

	test("scaffolds the test preload configuration", async () => {
		dir = await mkdtemp(join(tmpdir(), "frame-master-plugin-create-"));
		const process = Bun.spawn(
			["bun", CLI_PATH, "plugin", "create", "example-plugin", "--dir", dir],
			{ cwd: dir, stdout: "pipe", stderr: "pipe" },
		);
		await process.exited;

		expect(process.exitCode).toBe(0);

		const pluginDir = join(dir, "example-plugin");
		const bunfig = Bun.file(join(pluginDir, "bunfig.toml"));
		const preload = Bun.file(join(pluginDir, "test", "preload.ts"));
		const testFile = Bun.file(join(pluginDir, "test", "plugin.test.ts"));

		expect(await bunfig.exists()).toBeTrue();
		expect(await preload.exists()).toBeTrue();
		expect(await testFile.exists()).toBeTrue();
		expect(await bunfig.text()).toContain(
			'[test]\npreload = ["./test/preload.ts"]',
		);
		expect(await preload.text()).toContain("loadRuntimePluginFromPlugins");
		expect(await preload.text()).toContain('import plugin from "../index"');
		expect(await testFile.text()).toContain('from "../index"');
	});
});
