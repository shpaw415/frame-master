import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PIPELINES = join(import.meta.dir, "../src/build/pipelines.ts");
const TEMP_DIR = join(import.meta.dir, "../.test-temp-pipeline-bundle");

afterEach(() => {
	rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe("build pipelines client import surface", () => {
	test("does not statically import server-only plugin utils or config", () => {
		const source = readFileSync(PIPELINES, "utf8");
		expect(source).not.toContain('from "../plugins/utils"');
		expect(source).not.toContain('from "../server/config"');
		expect(source).toContain('from "../plugins/global-context"');
	});

	test("can import pipeline context helpers when server-only utils are emptied", async () => {
		mkdirSync(TEMP_DIR, { recursive: true });
		const entry = join(TEMP_DIR, "entry.ts");
		const contextModule = join(
			import.meta.dir,
			"../src/plugins/global-context.ts",
		);
		writeFileSync(
			entry,
			`import { getGlobalPluginContext, setGlobalPluginContext } from ${JSON.stringify(contextModule)};
setGlobalPluginContext("bundle-safe", { ok: true });
export const value = getGlobalPluginContext("bundle-safe");
`,
		);

		const result = await Bun.build({
			entrypoints: [entry],
			outdir: TEMP_DIR,
			target: "browser",
			plugins: [
				{
					name: "empty-server-only",
					setup(build) {
						build.onLoad({ filter: /.*/ }, (args) => {
							const path = args.path.replaceAll("\\", "/");
							if (
								path.endsWith("/plugins/utils.ts") ||
								path.endsWith("/paths.ts") ||
								path.endsWith("/plugin-loader.ts")
							) {
								return { contents: "", loader: "js" };
							}
						});
					},
				},
			],
		});

		expect(result.success).toBe(true);
	});
});
