import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isDebugUiAssetName,
	rewriteDebugUiHtml,
	serveDebugUiAsset,
} from "../src/debug/ui-assets";

describe("debug UI assets", () => {
	test("rewrites relative chunks and opts module scripts out of Rocket Loader", () => {
		const html = rewriteDebugUiHtml(`<!DOCTYPE html>
<html>
	<head>
		<link rel="stylesheet" crossorigin href="./chunk-abc.css">
		<script type="module" crossorigin src="./chunk-abc.js"></script>
	</head>
	<body>
		<div id="frame-master-debug-root"></div>
	</body>
</html>`);

		expect(html).toContain('href="/chunk-abc.css"');
		expect(html).toContain('src="/chunk-abc.js"');
		expect(html).toContain('data-cfasync="false"');
		expect(html).toContain("fm-debug-boot-watchdog");
	});

	test("serves rewritten HTML and existing chunk files from disk", async () => {
		const assetsDir = join(tmpdir(), `fm-debug-ui-${Date.now()}`);
		mkdirSync(assetsDir, { recursive: true });
		writeFileSync(
			join(assetsDir, "index.html"),
			`<html><head><script type="module" src="./chunk-abc.js"></script></head><body></body></html>`,
		);
		writeFileSync(join(assetsDir, "chunk-abc.js"), "window.__ok = true;");

		expect(isDebugUiAssetName("chunk-abc.js")).toBe(true);
		expect(isDebugUiAssetName("../secret.js")).toBe(false);

		const html = await serveDebugUiAsset("/index.html", assetsDir);
		expect(html?.ok).toBe(true);
		expect(await html?.text()).toContain('src="/chunk-abc.js"');

		const js = await serveDebugUiAsset("/chunk-abc.js", assetsDir);
		expect(js?.ok).toBe(true);
		expect(await js?.text()).toBe("window.__ok = true;");
	});
});
