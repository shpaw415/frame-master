import chalk from "chalk";
import { Command } from "commander";
import { readAccessToken } from "../registry/auth";
import { registryFetch } from "../registry/client";

const whoamiCommand = new Command("whoami")
	.description("Show the logged-in frame-master.com account")
	.option("--json", "Print JSON")
	.action(async (options: { json?: boolean }) => {
		const token = await readAccessToken().catch(() => null);
		if (!token) {
			console.error(chalk.red("Not logged in. Run frame-master login."));
			process.exit(1);
		}

		const result = await registryFetch("/api/cli/whoami", { token });
		if (!result.response.ok) {
			console.error(chalk.red(result.data?.error || "Unauthorized"));
			process.exit(1);
		}

		if (options.json) {
			console.log(JSON.stringify(result.data, null, 2));
			return;
		}

		console.log(chalk.gray("User:  "), result.data.userId);
		if (result.data.github?.connected) {
			console.log(chalk.gray("GitHub:"), result.data.github.login);
			return;
		}
		console.log(chalk.yellow("GitHub: not connected"));
		console.log(
			chalk.gray("Install the GitHub App:"),
			result.data.github?.installUrl,
		);
	});

export default whoamiCommand;
