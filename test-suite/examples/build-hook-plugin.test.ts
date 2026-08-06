/**
 * Example: test a plugin that contributes to the unified build pipeline.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import {
	createPluginTestEnv,
	type PluginTestEnv,
	withTempDir,
	writeFixture,
} from "frame-master/testing";

function assetPlugin(outdir: string, entry: string): FrameMasterPlugin {
	return {
		name: "example-build",
		version: "0.0.1",
		build: {
			buildConfig: {
				outdir,
				target: "bun",
				entrypoints: [entry],
			},
		},
	};
}

describe("example: build hook plugin", () => {
	let env: PluginTestEnv | undefined;

	afterEach(async () => {
		await env?.dispose();
		env = undefined;
	});

	test("builds entrypoint into outdir", async () => {
		await withTempDir(async (dir) => {
			const entry = await writeFixture(
				dir,
				"client.ts",
				`export const built = true;\n`,
			);
			const outdir = join(dir, "dist");

			env = await createPluginTestEnv({
				plugins: [assetPlugin(outdir, entry)],
				startServer: false,
				cwd: dir,
			});

			const result = await env.build();
			expect(result.success).toBe(true);
			expect(result.outputs.length).toBeGreaterThan(0);
		});
	});
});
