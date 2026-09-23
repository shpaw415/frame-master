import { readFile } from "node:fs/promises";
import chalk from "chalk";
import { Command } from "commander";
import { registryFetch } from "../registry/client";
import { readCredentials } from "../registry/credentials";
import { select } from "../share";
import {
	categoriesFor,
	type InferredListing,
	inferListing,
	type PackageJson,
	type PublishKind,
	toRegistryListing,
} from "./infer";

async function readOptional(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch {
		return null;
	}
}

function gitRemote(): string | null {
	const result = Bun.spawnSync(["git", "config", "--get", "remote.origin.url"], {
		stderr: "ignore",
		stdout: "pipe",
	});
	if (result.exitCode !== 0) return null;
	return result.stdout.toString().trim() || null;
}

async function resolveCategory(listing: InferredListing): Promise<string> {
	if (listing.category) return listing.category;
	if (!process.stdin.isTTY) {
		throw new Error(`Missing category. Pass --category. Choices: ${categoriesFor(listing.kind).join(", ")}`);
	}
	const selected = select({
		message: `Category for this ${listing.kind}`,
		options: categoriesFor(listing.kind).map((value) => ({
			label: value,
			value,
		})),
	});
	if (!selected || typeof selected !== "string") {
		throw new Error("A category is required");
	}
	return selected;
}

const publishCommand = new Command("publish")
	.description("Publish the current plugin or template to frame-master.com")
	.option("--type <kind>", "plugin or template")
	.option("--category <category>", "Listing category")
	.option("--draft", "Save without publishing")
	.option("--dry-run", "Print the payload and do not send it")
	.option("--json", "Print JSON")
	.action(
		async (options: {
			category?: string;
			draft?: boolean;
			dryRun?: boolean;
			json?: boolean;
			type?: string;
		}) => {
			try {
				if (options.type && options.type !== "plugin" && options.type !== "template") {
					throw new Error("--type must be plugin or template");
				}
				const pkg = JSON.parse(await readFile("package.json", "utf8")) as PackageJson;
				const listing = inferListing({
					category: options.category,
					configExample: await readOptional("CONFIG_EXEMPLE.md"),
					draft: options.draft,
					gitRemote: gitRemote(),
					kind: options.type as PublishKind | undefined,
					pkg,
					quickExample: await readOptional("QUICK_EXEMPLE.md"),
					readme: await readOptional("README.md"),
				});
				listing.category = await resolveCategory(listing);
				const payload = {
					kind: listing.kind,
					listing: toRegistryListing(listing),
				};

				if (options.dryRun) {
					console.log(JSON.stringify(payload, null, 2));
					return;
				}

				const credentials = await readCredentials();
				if (!credentials) {
					throw new Error("Not logged in. Run frame-master login.");
				}

				const whoami = await registryFetch("/api/cli/whoami", {
					token: credentials.token,
				});
				if (!whoami.response.ok) {
					throw new Error(whoami.data?.error || "Unauthorized");
				}
				if (!whoami.data.github?.connected) {
					throw new Error(
						`Link the GitHub App before publishing: ${whoami.data.github?.installUrl}`,
					);
				}

				const result = await registryFetch("/api/cli/publish", {
					body: JSON.stringify(payload),
					method: "POST",
					token: credentials.token,
				});
				if (!result.response.ok || !result.data?.success) {
					const install = result.data?.installPath
						? `\n${whoami.data.github.installUrl}`
						: "";
					throw new Error(`${result.data?.error || "Publish failed"}${install}`);
				}

				if (options.json) {
					console.log(JSON.stringify(result.data, null, 2));
					return;
				}

				const verb = result.data.published
					? result.data.created
						? "Published"
						: "Updated"
					: "Saved draft";
				console.log(
					chalk.green(`${verb} ${result.data.kind} ${result.data.name}`),
				);
				console.log(result.data.url);
			} catch (error) {
				console.error(chalk.red(error instanceof Error ? error.message : error));
				process.exit(1);
			}
		},
	);

export default publishCommand;
