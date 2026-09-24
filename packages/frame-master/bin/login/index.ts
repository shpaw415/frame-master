import chalk from "chalk";
import { Command } from "commander";
import { createCliAuth } from "../registry/auth";

const loginCommand = new Command("login")
	.description("Log in to frame-master.com")
	.option("--no-browser", "Do not open a browser")
	.action(async (options: { browser?: boolean }) => {
		const auth = await createCliAuth();
		try {
			console.log(chalk.bold("\nSign in with OpenAuthster\n"));
			await auth.login({
				onAuthorize: (url) => {
					console.log(chalk.gray("URL: "), chalk.cyan(url));
				},
				open: options.browser !== false,
			});
			console.log(chalk.green("\nLogged in."));
		} catch (error) {
			console.error(
				chalk.red(error instanceof Error ? error.message : "Login failed"),
			);
			process.exit(1);
		}
	});

export default loginCommand;
