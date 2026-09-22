import { afterEach, describe, expect, test } from "bun:test";
import { BuildUnifier, getBuildPipeline } from "frame-master/plugin";
import { createPluginTestEnv } from "../src/create-env";
import type { PluginTestEnv } from "../src/types";

describe("plugin test suite - build pipeline env", () => {
	let env: PluginTestEnv | undefined;

	afterEach(async () => {
		await env?.dispose();
		env = undefined;
	});

	test("initializes a BuildUnifier pipeline before serverStart", async () => {
		const errors: unknown[][] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => {
			errors.push(args);
		};
		try {
			env = await createPluginTestEnv({
				plugins: [
					...BuildUnifier({
						plugins: [{ name: "pipeline-env-plugin", version: "1.0.0" }],
					}),
				],
				startServer: false,
			});
		} finally {
			console.error = original;
		}

		expect(
			errors.some((args) =>
				args
					.join(" ")
					.includes("Frame-Master config or plugin loader is not ready"),
			),
		).toBe(false);
		await expect(
			getBuildPipeline("pipeline-env-plugin").getBuilder("pipeline-env-plugin"),
		).resolves.toBeDefined();
	});

	test("lets the next env register the same plugin after dispose", async () => {
		const plugins = () =>
			BuildUnifier({
				plugins: [{ name: "sequential-pipeline-plugin", version: "1.0.0" }],
			});

		env = await createPluginTestEnv({
			plugins: [...plugins()],
			startServer: false,
		});
		await env.dispose();
		env = undefined;

		env = await createPluginTestEnv({
			plugins: [...plugins()],
			startServer: false,
		});
		await expect(
			getBuildPipeline("sequential-pipeline-plugin").getBuilder(),
		).resolves.toBeDefined();
	});
});
