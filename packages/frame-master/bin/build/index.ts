import chalk from "chalk";
import { Command } from "commander";
import { InitBuild } from "frame-master/server/init";
import { verboseLog } from "frame-master/utils";
import { ensureNodeEnv, onVerbose } from "../share";

export const buildCommand = new Command("build")
	.description("Build the Frame Master project")
	.action(async () => {
		process.env.BUILD_MODE = "true";
		ensureNodeEnv();
		onVerbose(() => console.log(chalk.gray("Initializing server...")));
		await InitBuild();

		console.log(
			"\n" + chalk.bold.cyan("┌─────────────────────────────────────────┐"),
		);
		console.log(
			chalk.bold.cyan("│") +
				chalk.bold.white("  🔨 Starting Frame Master Build        ") +
				chalk.bold.cyan("│"),
		);
		console.log(
			chalk.bold.cyan("└─────────────────────────────────────────┘") + "\n",
		);

		try {
			// Import and initialize the builder
			onVerbose(() => console.log(chalk.gray("Importing builder...")));
			const { builder } = await import("../../src/build");

			if (!builder) {
				console.error(
					chalk.red("✗ Builder not initialized. Make sure plugins are loaded."),
				);
				throw new Error(
					"Builder not initialized. Make sure plugins are loaded.",
				);
			}

			// Check if a build is already in progress
			if (builder.isBuilding()) {
				console.log(chalk.yellow("⚠ Build already in progress, waiting..."));
				await builder.awaitBuildFinish();
			}

			// Start the build
			const startTime = performance.now();
			const result = await builder.build();
			const duration = performance.now() - startTime;

			verboseLog(result);

			if (result.success) {
				console.log(
					"\n" +
						chalk.bold.green("┌─────────────────────────────────────────┐"),
				);
				console.log(
					chalk.bold.green("│") +
						chalk.bold.white("  ✅ Build Completed Successfully       ") +
						chalk.bold.green("│"),
				);
				console.log(
					chalk.bold.green("├─────────────────────────────────────────┤"),
				);
				console.log(
					chalk.bold.green("│") +
						"  " +
						chalk.gray("Duration: ") +
						chalk.bold.white(`${duration.toFixed(2)}ms`.padEnd(28)) +
						chalk.bold.green("│"),
				);
				console.log(
					chalk.bold.green("│") +
						"  " +
						chalk.gray("Outputs:  ") +
						chalk.bold.white(`${result.outputs.length} files`.padEnd(28)) +
						chalk.bold.green("│"),
				);
				console.log(
					chalk.bold.green("└─────────────────────────────────────────┘") +
						"\n",
				);

				// Show build report
				if (builder.outputs && builder.outputs.length > 0) {
					const analysis = builder.analyzeBuild();
					const formatSize = (bytes: number) => {
						if (bytes < 1024) return `${bytes}B`;
						if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
						return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
					};

					console.log(chalk.bold("📦 Build Summary:"));
					console.log(
						chalk.gray(`  Total Size: `) +
							chalk.white(formatSize(analysis.totalSize)),
					);
					console.log(
						chalk.gray(`  Average Size: `) +
							chalk.white(formatSize(Math.round(analysis.averageSize))),
					);
					console.log();

					console.log(chalk.bold("🔝 Largest Files:"));
					for (const file of analysis.largestFiles.slice(0, 5)) {
						const relativePath = file.path.split("/").slice(-3).join("/");
						console.log(
							chalk.gray(`  ${formatSize(file.size).padStart(10)}`) +
								" - " +
								chalk.cyan(relativePath),
						);
					}
					console.log();
				}

				process.exit(0);
			} else {
				console.error(
					"\n" + chalk.bold.red("┌─────────────────────────────────────────┐"),
				);
				console.error(
					chalk.bold.red("│") +
						chalk.bold.white("  ❌ Build Failed                        ") +
						chalk.bold.red("│"),
				);
				console.error(
					chalk.bold.red("└─────────────────────────────────────────┘") + "\n",
				);

				if (result.logs && result.logs.length > 0) {
					console.error(chalk.red("Build errors:"));
					for (const log of result.logs) {
						console.error(chalk.red(`  ${log.message}`));
					}
				}

				throw new Error("Build process failed", { cause: result.logs });
			}
		} catch (error) {
			console.error(
				"\n" + chalk.bold.red("┌─────────────────────────────────────────┐"),
			);
			console.error(
				chalk.bold.red("│") +
					chalk.bold.white("  ❌ Build Error                         ") +
					chalk.bold.red("│"),
			);
			console.error(
				chalk.bold.red("└─────────────────────────────────────────┘") + "\n",
			);
			console.log();
			throw new Error("Build process failed", {
				cause: error as Error,
			});
		}
	});
