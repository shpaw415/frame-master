#!/usr/bin/env bun
import { Command } from "commander";
import { InitBuild } from "frame-master/server/init";
import { DebugBuildServer } from "../../src/debug/server";
import { ensureNodeEnv } from "../share";

const debugBuildCommand = new Command("build")
	.description("Run an instrumented build and expose a debug trace server")
	.option("-p, --port <port>", "Port for the debug UI server", "3011")
	.option(
		"--no-watch",
		"Disable automatic rebuilds while the server is running",
	)
	.option(
		"--save-trace [path]",
		"Persist the current trace after each build to .frame-master/debug-traces or to the provided path",
	)
	.action(
		async (options: {
			port: string;
			watch: boolean;
			saveTrace?: string | boolean;
		}) => {
			process.env.BUILD_MODE = "true";
			ensureNodeEnv();
			await InitBuild();

			const buildModule = await import("../../src/build");
			const builder = buildModule.builder;
			if (!builder) {
				throw new Error(
					"Builder not initialized. Make sure plugins are loaded.",
				);
			}

			builder.startDebugSession({
				watch: options.watch,
				saveTracePath:
					typeof options.saveTrace === "string" ? options.saveTrace : undefined,
			});

			const server = new DebugBuildServer(builder, {
				port: Number(options.port),
				watch: options.watch,
				saveTrace: options.saveTrace,
			});

			await server.startWithDefaultUI();
			process.on("SIGINT", async () => {
				console.log("\nShutting down debug build server...");
				await server.stop();
				process.exit(0);
			});
		},
	);

export const debugCommand = new Command("debug")
	.description("Debug Frame-Master internals")
	.addCommand(debugBuildCommand);

export default debugCommand;
