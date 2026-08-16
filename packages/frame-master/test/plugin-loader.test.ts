import { describe, expect, test } from "bun:test";
import type { FrameMasterConfig } from "frame-master/server/type";
import { PluginLoader } from "../src/plugins/plugin-loader";

function configWithUnsatisfiedRequirement(): FrameMasterConfig {
	return {
		HTTPServer: { port: 0 },
		plugins: [
			{
				name: "requires-future-frame-master",
				version: "1.0.0",
				requirement: { frameMasterVersion: ">=999.0.0" },
			},
		],
	};
}

describe("plugin requirement checks", () => {
	test("enforces plugin requirements by default", () => {
		expect(() => new PluginLoader(configWithUnsatisfiedRequirement())).toThrow(
			"requires-future-frame-master",
		);
	});

	test("can skip runtime plugin requirement checks from configuration", () => {
		const config = configWithUnsatisfiedRequirement();
		config.pluginsOptions = { skipRequirementsCheck: true };

		expect(() => new PluginLoader(config)).not.toThrow();
	});
});
