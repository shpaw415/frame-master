import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("frame-master/plugin export path", () => {
	test('request-manager.ts does not import from "frame-master/plugins"', () => {
		const source = readFileSync(
			join(import.meta.dir, "../src/server/request-manager.ts"),
			"utf8",
		);
		expect(source).not.toContain('from "frame-master/plugins"');
		expect(source).toContain('from "frame-master/plugin"');
	});

	test('frame-master/server/request resolves via package exports', async () => {
		const mod = await import("frame-master/server/request");
		expect(mod).toBeDefined();
		expect(typeof mod.masterRequest).toBe("function");
	});
});
