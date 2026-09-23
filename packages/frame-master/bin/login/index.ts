import chalk from "chalk";
import { Command } from "commander";
import { registryFetch } from "../registry/client";
import { writeCredentials } from "../registry/credentials";

function openBrowser(url: string) {
	const command =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "cmd"
				: "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	try {
		Bun.spawn([command, ...args], { stderr: "ignore", stdout: "ignore" });
	} catch {
		// The URL is printed either way.
	}
}

const loginCommand = new Command("login")
	.description("Log in to frame-master.com")
	.option("--no-browser", "Do not open a browser")
	.action(async (options: { browser?: boolean }) => {
		const started = await registryFetch("/api/cli/auth/start", { method: "POST" });
		if (!started.response.ok) {
			console.error(chalk.red(started.data?.error || "Failed to start login"));
			process.exit(1);
		}

		const { deviceCode, expiresIn, interval, userCode, verificationUrl } =
			started.data as {
				deviceCode: string;
				expiresIn: number;
				interval: number;
				userCode: string;
				verificationUrl: string;
			};

		console.log(chalk.bold("\nApprove the Frame-Master CLI\n"));
		console.log(chalk.gray("Code:"), chalk.bold(userCode));
		console.log(chalk.gray("URL: "), chalk.cyan(verificationUrl));
		if (options.browser !== false) openBrowser(verificationUrl);

		const deadline = Date.now() + expiresIn * 1000;
		while (Date.now() < deadline) {
			await Bun.sleep(Math.max(interval, 1) * 1000);
			const polled = await registryFetch("/api/cli/auth/poll", {
				body: JSON.stringify({ deviceCode }),
				method: "POST",
			});
			if (polled.data?.status === "pending") continue;
			if (!polled.response.ok || !polled.data?.token) {
				console.error(chalk.red(polled.data?.error || "Login expired"));
				process.exit(1);
			}
			await writeCredentials({ token: polled.data.token });
			console.log(chalk.green("\nLogged in."));
			return;
		}

		console.error(chalk.red("Login timed out"));
		process.exit(1);
	});

export default loginCommand;
