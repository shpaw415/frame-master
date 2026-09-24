import chalk from "chalk";
import { Command } from "commander";
import { createCliAuth, deleteLegacyCredentials } from "../registry/auth";

const logoutCommand = new Command("logout")
	.description("Log out of frame-master.com")
	.action(async () => {
		(await createCliAuth()).logout();
		await deleteLegacyCredentials();
		console.log(chalk.green("Logged out."));
	});

export default logoutCommand;
