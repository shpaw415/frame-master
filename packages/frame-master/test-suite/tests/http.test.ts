import { afterEach, describe, expect, test } from "bun:test";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { createPluginTestEnv } from "../src/create-env";
import type { PluginTestEnv } from "../src/types";

describe("plugin test suite — http", () => {
	let env: PluginTestEnv | undefined;

	afterEach(async () => {
		await env?.dispose();
		env = undefined;
	});

	test("fetch hits plugin router.request response", async () => {
		const plugin: FrameMasterPlugin = {
			name: "hello-route",
			version: "1.0.0",
			router: {
				request(master) {
					if (master.URL.pathname === "/hello") {
						master.setResponse("hello-from-plugin", {
							status: 200,
							headers: { "Content-Type": "text/plain" },
						});
					}
				},
			},
		};

		env = await createPluginTestEnv({ plugins: [plugin] });
		const res = await env.fetch("/hello");
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("hello-from-plugin");
		expect(env.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
	});

	test("higher-priority plugin can short-circuit with sendNow", async () => {
		const plugins: FrameMasterPlugin[] = [
			{
				name: "high-priority",
				version: "1.0.0",
				priority: 1,
				router: {
					request(master) {
						if (master.URL.pathname === "/priority") {
							master.setResponse("from-high", { status: 200 });
							master.sendNow();
						}
					},
				},
			},
			{
				name: "low-priority",
				version: "1.0.0",
				priority: 50,
				router: {
					request(master) {
						if (master.URL.pathname === "/priority") {
							master.setResponse("from-low", { status: 200 });
						}
					},
				},
			},
		];

		env = await createPluginTestEnv({ plugins });
		const res = await env.fetch("/priority");
		expect(await res.text()).toBe("from-high");
	});

	test("serverReady receives server and builder", async () => {
		let ready = false;
		let sawServer = false;
		let sawBuilder = false;

		const plugin: FrameMasterPlugin = {
			name: "ready-plugin",
			version: "1.0.0",
			serverReady: async (props) => {
				ready = true;
				sawServer = Boolean(props.server?.port !== undefined);
				sawBuilder = Boolean(props.builder);
			},
			router: {
				request(master) {
					if (master.URL.pathname === "/ok") {
						master.setResponse("ok");
					}
				},
			},
		};

		env = await createPluginTestEnv({ plugins: [plugin] });
		expect(ready).toBe(true);
		expect(sawServer).toBe(true);
		expect(sawBuilder).toBe(true);
		const res = await env.fetch("/ok");
		expect(res.status).toBe(200);
	});

	test("startServer: false still allows later fetch via start", async () => {
		env = await createPluginTestEnv({
			plugins: [
				{
					name: "lazy",
					version: "1.0.0",
					router: {
						request(master) {
							if (master.URL.pathname === "/lazy") {
								master.setResponse("lazy-ok");
							}
						},
					},
				},
			],
			startServer: false,
		});

		expect(env.server).toBeNull();
		const res = await env.fetch("/lazy");
		expect(await res.text()).toBe("lazy-ok");
		expect(env.server).not.toBeNull();
	});
});
