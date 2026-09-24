import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const AUTH_ISSUER =
	"https://455431595f324bd1a1e1bde3f57783b9-auth.webcreas.com";
export const AUTH_CLIENT_ID = "__frame_master_8cba5930";

type CliClient = {
	isAuthenticated: boolean;
	login(options?: {
		onAuthorize?: (url: string) => void | Promise<void>;
		open?: boolean;
	}): Promise<{ access: string }>;
	logout(): void;
	getValidAccessToken(): Promise<string>;
};

type CliModule = {
	OpenAuthsterCliClient: new (options: {
		clientID: string;
		issuer: string;
		open?: (url: string) => void | Promise<void>;
		tokenPath?: string;
	}) => CliClient;
	openSystemBrowser: (url: string) => Promise<void>;
};

async function loadCli(): Promise<CliModule> {
	const specifier = "openauthster-shared/client/cli";
	return import(specifier);
}

export function legacyCredentialsPath(): string {
	const root = process.env.FRAME_MASTER_CONFIG_DIR || join(homedir(), ".config");
	return join(root, "frame-master", "credentials.json");
}

export async function createCliAuth(): Promise<CliClient> {
	const { OpenAuthsterCliClient, openSystemBrowser } = await loadCli();
	return new OpenAuthsterCliClient({
		clientID: process.env.FRAME_MASTER_AUTH_CLIENT_ID || AUTH_CLIENT_ID,
		issuer: process.env.FRAME_MASTER_AUTH_ISSUER || AUTH_ISSUER,
		open: async (url) => {
			try {
				await openSystemBrowser(url);
			} catch {
				// The authorize URL is printed either way.
			}
		},
		tokenPath: process.env.FRAME_MASTER_AUTH_TOKEN_PATH,
	});
}

export async function readAccessToken(): Promise<string | null> {
	if (process.env.FRAME_MASTER_TOKEN) return process.env.FRAME_MASTER_TOKEN;
	const auth = await createCliAuth();
	if (!auth.isAuthenticated) return null;
	return auth.getValidAccessToken();
}

export async function deleteLegacyCredentials(): Promise<void> {
	await rm(legacyCredentialsPath(), { force: true });
}
