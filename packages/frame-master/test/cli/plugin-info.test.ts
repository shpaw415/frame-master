import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dir, "..", "..", "bin", "index.ts");

describe("frame-master plugin info", () => {
	let dir: string | undefined;

	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
		dir = undefined;
	});

	test("lists virtual modules with their pipeline availability", async () => {
		dir = await mkdtemp(join(tmpdir(), "frame-master-plugin-info-"));
		await writeFile(
			join(dir, "frame-master.config.ts"),
			`export default {
	HTTPServer: { port: 0 },
	plugins: [{
		name: "virtual-modules-plugin",
		version: "1.0.0",
		virtualModules: {
			"@test/runtime": {
				contents: "export const runtime = true;",
				loader: "js",
				injectRuntime: true,
			},
			"@test/build-only": {
				contents: "export const buildOnly = true;",
				loader: "js",
				injectRuntime: false,
			},
		},
	}],
};
`,
		);

		const process = Bun.spawn(
			["bun", CLI_PATH, "plugin", "info", "virtual-modules-plugin"],
			{ cwd: dir, stdout: "pipe", stderr: "pipe" },
		);
		const output = await new Response(process.stdout).text();
		await process.exited;

		expect(process.exitCode).toBe(0);
		expect(output).toContain("Virtual Modules:");
		expect(output).toContain("@test/runtime (runtime and build)");
		expect(output).toContain("@test/build-only (build only)");
	});
});
