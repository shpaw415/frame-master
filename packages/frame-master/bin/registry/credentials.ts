import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type Credentials = {
	token: string;
};

export function credentialsPath(): string {
	const root = process.env.FRAME_MASTER_CONFIG_DIR || join(homedir(), ".config");
	return join(root, "frame-master", "credentials.json");
}

export async function readCredentials(): Promise<Credentials | null> {
	if (process.env.FRAME_MASTER_TOKEN) {
		return { token: process.env.FRAME_MASTER_TOKEN };
	}
	try {
		const raw = await readFile(credentialsPath(), "utf8");
		const parsed = JSON.parse(raw) as Credentials;
		return parsed.token ? parsed : null;
	} catch {
		return null;
	}
}

export async function writeCredentials(credentials: Credentials): Promise<void> {
	const path = credentialsPath();
	await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
	await writeFile(path, `${JSON.stringify(credentials, null, 2)}\n`, {
		mode: 0o600,
	});
	await chmod(path, 0o600);
}

export async function deleteCredentials(): Promise<void> {
	await rm(credentialsPath(), { force: true });
}
