import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pluginRegex } from "../src/utils";

const UTILS = join(import.meta.dir, "../src/utils.ts");
const TEMP_DIR = join(import.meta.dir, "../.test-temp-utils-bundle");

afterEach(() => {
	rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe("utils tests", () => {
	test("pluginRegex creates correct regex", () => {
		const regex = pluginRegex({
			path: ["src", "components"],
			ext: ["ts", "tsx"],
		});

		[
			"src/components/Button.tsx",
			"src/components/utils/helper.ts",
			"src/components/index.ts",
		].map((path) => expect(regex.test(path)).toBe(true));

		[
			"src/pages/index.tsx",
			"src/components/style.css",
			"src/components/subdir/image.png",
			"src/components2/Button.tsx",
			join(process.cwd(), "src", "components", "Button.tsx"),
		].map((path) => expect(regex.test(path)).toBe(false));
	});

	test("does not import the plugin barrel or server-only plugin utils", () => {
		const source = readFileSync(UTILS, "utf8");
		expect(source).not.toContain('from "./plugins"');
		expect(source).not.toContain('from "./plugins/utils"');
		expect(source).not.toContain("directiveToolSingleton");
		expect(source).not.toContain("directiveManager");
	});

	test("browser bundle of join/isProd stays free of Bun.file and plugin loader", async () => {
		mkdirSync(TEMP_DIR, { recursive: true });
		const entry = join(TEMP_DIR, "entry.ts");
		writeFileSync(
			entry,
			`import { join, isProd, isDev, verboseLog } from ${JSON.stringify(UTILS)};
export const path = join("src", "pages");
export const prod = isProd();
export const dev = isDev();
verboseLog("ok");
`,
		);

		const result = await Bun.build({
			entrypoints: [entry],
			outdir: TEMP_DIR,
			target: "browser",
		});

		expect(result.success).toBe(true);
		const bundled = (
			await Promise.all(result.outputs.map((output) => output.text()))
		).join("\n");
		expect(bundled).not.toContain("Bun.file");
		expect(bundled).not.toContain("nativeBunFile");
		expect(bundled).not.toContain("plugin-loader");
		expect(bundled).not.toContain("frame-master.config");
	});
});
