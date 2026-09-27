import { createInterface } from "node:readline/promises";
import chalk from "chalk";
import { Command } from "commander";
import { createCliAuth } from "../registry/auth";

function isRemoteSession() {
	return Boolean(
		process.env.SSH_CONNECTION || process.env.SSH_CLIENT || process.env.SSH_TTY,
	);
}

function promptCallback(signal: AbortSignal): Promise<string> {
	if (!process.stdin.isTTY || signal.aborted) return new Promise(() => {});
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: true,
	});
	const close = () => {
		rl.close();
	};
	signal.addEventListener("abort", close, { once: true });
	const ask = async (): Promise<string> => {
		const value = await rl.question(chalk.gray("Callback URL or code: "));
		if (signal.aborted) return new Promise(() => {});
		if (!value.trim()) return ask();
		return value;
	};
	return ask().finally(() => {
		signal.removeEventListener("abort", close);
		rl.close();
	});
}

const loginCommand = new Command("login")
	.description("Log in to frame-master.com")
	.option("--no-browser", "Do not open a browser")
	.option("--code <callback>", "Paste a callback URL or authorization code")
	.option(
		"--host <address>",
		"Listen for the callback on this private address, such as a Tailscale IP",
	)
	.action(async (options: { browser?: boolean; code?: string; host?: string }) => {
		const remote = isRemoteSession() || Boolean(options.host);
		const openBrowser = options.browser !== false && !remote && !options.code;
		const auth = await createCliAuth({ hostname: options.host });
		try {
			console.log(chalk.bold("\nSign in with OpenAuthster\n"));
			if (remote || !openBrowser) {
				console.log(
					chalk.gray(
						"Open the URL on a machine with a browser. If the callback cannot reach this host, paste the redirected URL.",
					),
				);
			}
			await auth.login({
				onAuthorize: (url) => {
					console.log(chalk.gray("URL: "), chalk.cyan(url));
					console.log(
						chalk.gray(
							"\nPaste the callback URL if the browser cannot reach this machine.\n",
						),
					);
				},
				open: openBrowser,
				readCode: options.code
					? async () => options.code || ""
					: (signal) => promptCallback(signal),
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
