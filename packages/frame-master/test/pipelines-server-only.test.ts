import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pkgRoot = join(import.meta.dir, "..");

function stubServerOnlyPlugin(): import("bun").BunPlugin {
	return {
		name: "stub-server-only",
		setup(build) {
			build.onLoad({ filter: /.*/ }, async (args) => {
				if (
					!args.path.endsWith(".ts") &&
					!args.path.endsWith(".tsx") &&
					!args.path.endsWith(".js")
				) {
					return;
				}
				const text = await Bun.file(args.path).text().catch(() => "");
				if (/^["']server[-\s]only["']/.test(text.trimStart())) {
					return { contents: "", loader: "js" };
				}
			});
		},
	};
}

describe("pipelines vs server-only utils", () => {
	test("client join from frame-master/utils survives server-only stubbing", async () => {
		const dir = mkdtempSync(join(tmpdir(), "fm-server-only-"));
		const entry = join(dir, "entry.ts");
		writeFileSync(
			entry,
			`import { join } from ${JSON.stringify(join(pkgRoot, "src/utils.ts"))};
console.log(join("a", "b"));
`,
		);

		const result = await Bun.build({
			entrypoints: [entry],
			target: "bun",
			plugins: [stubServerOnlyPlugin()],
		});

		expect(result.success).toBe(true);
		expect(result.logs.map(String).join("\n")).not.toContain(
			"getGlobalPluginContext",
		);
	});

	test("pipelines module resolves context helpers when utils is stubbed", async () => {
		const dir = mkdtempSync(join(tmpdir(), "fm-pipelines-stub-"));
		const entry = join(dir, "entry.ts");
		writeFileSync(
			entry,
			`import { BuildUnifier } from ${JSON.stringify(join(pkgRoot, "src/build/pipelines.ts"))};
export const plugins = BuildUnifier({
	id: "client",
	plugins: [{ name: "demo", version: "1.0.0" }],
});
`,
		);

		const result = await Bun.build({
			entrypoints: [entry],
			target: "bun",
			plugins: [stubServerOnlyPlugin()],
		});

		expect(result.success).toBe(true);
		expect(result.logs.map(String).join("\n")).not.toContain(
			'No matching export',
		);
	});
});
