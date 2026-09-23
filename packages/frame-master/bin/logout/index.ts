import chalk from "chalk";
import { Command } from "commander";
import { registryFetch } from "../registry/client";
import { deleteCredentials, readCredentials } from "../registry/credentials";

const logoutCommand = new Command("logout")
	.description("Log out of frame-master.com")
	.action(async () => {
		const credentials = await readCredentials();
		if (credentials) {
			await registryFetch("/api/cli/auth/logout", {
				method: "POST",
				token: credentials.token,
			}).catch(() => undefined);
		}
		await deleteCredentials();
		console.log(chalk.green("Logged out."));
	});

export default logoutCommand;
