import { afterEach, describe, expect, test } from "bun:test";
import type { FrameMasterPlugin } from "frame-master/plugin/types";
import { createPluginTestEnv } from "../src/create-env";
import type { PluginTestEnv } from "../src/types";

describe("plugin test suite — request pipeline", () => {
	let env: PluginTestEnv | undefined;

	afterEach(async () => {
		await env?.dispose();
		env = undefined;
	});

	test("handleRequest runs before → request → after in order", async () => {
		const order: string[] = [];

		const plugin: FrameMasterPlugin = {
			name: "lifecycle-order",
			version: "1.0.0",
			router: {
				before_request(master) {
					if (master.URL.pathname === "/order") {
						order.push("before");
					}
				},
				request(master) {
					if (master.URL.pathname === "/order") {
						order.push("request");
						master.setResponse("ordered", { status: 200 });
					}
				},
				after_request(master) {
					if (master.URL.pathname === "/order") {
						order.push("after");
						master.response?.headers.set("X-After", "1");
					}
				},
			},
		};

		env = await createPluginTestEnv({
			plugins: [plugin],
			startServer: false,
		});

		const { response, master } = await env.handleRequest(
			new Request("http://test/order"),
		);

		expect(order).toEqual(["before", "request", "after"]);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ordered");
		expect(response.headers.get("X-After")).toBe("1");
		expect(master.isResponseSetted()).toBe(true);
	});

	test("context flows across request stages", async () => {
		const plugin: FrameMasterPlugin = {
			name: "context-plugin",
			version: "1.0.0",
			router: {
				before_request(master) {
					if (master.URL.pathname === "/ctx") {
						master.setContext({ stage: "before" });
					}
				},
				request(master) {
					if (master.URL.pathname === "/ctx") {
						const ctx = master.getContext<{ stage: string }>();
						master.setContext({ stage: `${ctx.stage}+request` });
						master.setResponse("ctx-ok");
					}
				},
				after_request(master) {
					if (master.URL.pathname === "/ctx") {
						const ctx = master.getContext<{ stage: string }>();
						master.setContext({ stage: `${ctx.stage}+after` });
					}
				},
			},
		};

		env = await createPluginTestEnv({
			plugins: [plugin],
			startServer: false,
		});

		const { master } = await env.handleRequest(new Request("http://test/ctx"));
		expect(master.getContext<{ stage: string }>().stage).toBe(
			"before+request+after",
		);
	});

	test("priority order: lower number runs first", async () => {
		const order: string[] = [];
		const plugins: FrameMasterPlugin[] = [
			{
				name: "p-low",
				version: "1.0.0",
				priority: 1,
				router: {
					request(master) {
						if (master.URL.pathname === "/prio") {
							order.push("low");
							master.setResponse("done");
						}
					},
				},
			},
			{
				name: "p-high",
				version: "1.0.0",
				priority: 10,
				router: {
					request(master) {
						if (master.URL.pathname === "/prio") {
							order.push("high");
						}
					},
				},
			},
		];

		env = await createPluginTestEnv({
			plugins,
			startServer: false,
		});

		await env.handleRequest(new Request("http://test/prio"));
		expect(order).toEqual(["low", "high"]);
	});
});
