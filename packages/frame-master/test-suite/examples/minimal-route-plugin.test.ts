/**
 * Example: test a minimal route plugin with the public harness.
 *
 * Plugin authors can copy this pattern into their package's `test/` folder.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import type { PluginTestEnv } from "frame-master/testing";
import { createPluginTestEnv } from "frame-master/testing";

function helloPlugin(): FrameMasterPlugin {
	return {
		name: "example-hello",
		version: "0.0.1",
		router: {
			request(master) {
				if (master.URL.pathname === "/api/hello") {
					master.setResponse(JSON.stringify({ ok: true }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
			},
		},
	};
}

describe("example: minimal route plugin", () => {
	let env: PluginTestEnv | undefined;

	afterEach(async () => {
		await env?.dispose();
		env = undefined;
	});

	test("GET /api/hello", async () => {
		env = await createPluginTestEnv({ plugins: [helloPlugin()] });
		const res = await env.fetch("/api/hello");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});
});
