import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_PATH = join(import.meta.dir, "..", "..", "bin", "index.ts");

async function runCli(
	args: string[],
	cwd: string,
	env: Record<string, string> = {},
) {
	const proc = Bun.spawn(["bun", CLI_PATH, ...args], {
		cwd,
		env: { ...process.env, ...env },
		stderr: "pipe",
		stdout: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { exitCode, stderr, stdout };
}

describe("frame-master publish", () => {
	let dir: string | undefined;

	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
		dir = undefined;
	});

	test("prints a dry-run payload without calling the API", async () => {
		dir = await mkdtemp(join(tmpdir(), "fm-publish-"));
		await writeFile(
			join(dir, "package.json"),
			JSON.stringify({
				description: "SEO helpers",
				name: "frame-master-plugin-seo",
				peerDependencies: { "frame-master": "^4.0.0" },
				repository: "https://github.com/ada/frame-master-plugin-seo",
			}),
		);

		const result = await runCli(
			["publish", "--dry-run", "--category", "utilities"],
			dir,
		);

		expect(result.exitCode).toBe(0);
		const payload = JSON.parse(result.stdout);
		expect(payload.kind).toBe("plugin");
		expect(payload.listing.name).toBe("frame-master-plugin-seo");
		expect(payload.listing.published).toBe(true);
	});

	test("rejects another owner's listing name from the mock API", async () => {
		dir = await mkdtemp(join(tmpdir(), "fm-publish-"));
		await writeFile(
			join(dir, "package.json"),
			JSON.stringify({
				description: "SEO helpers",
				name: "frame-master-plugin-seo",
				repository: "https://github.com/ada/frame-master-plugin-seo",
			}),
		);

		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(request) {
				const url = new URL(request.url);
				if (url.pathname === "/api/cli/whoami") {
					return Response.json({
						github: {
							connected: true,
							installUrl: "https://example.test/settings",
							login: "ada",
							state: "active",
						},
						success: true,
						userId: "user-1",
					});
				}
				if (url.pathname === "/api/cli/publish") {
					return Response.json(
						{
							code: "forbidden",
							error: "Plugin with this name is owned by another account",
							success: false,
						},
						{ status: 403 },
					);
				}
				return new Response("not found", { status: 404 });
			},
		});

		const result = await runCli(
			["publish", "--category", "utilities"],
			dir,
			{
				FRAME_MASTER_BASE_URL: `http://127.0.0.1:${server.port}`,
				FRAME_MASTER_TOKEN: "fm_cli_test",
			},
		);
		server.stop();

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("owned by another account");
	});
});

describe("frame-master login", () => {
	let dir: string | undefined;

	afterEach(async () => {
		if (dir) await rm(dir, { recursive: true, force: true });
		dir = undefined;
	});

	test("stores a token after the device code is approved", async () => {
		dir = await mkdtemp(join(tmpdir(), "fm-login-"));
		let polls = 0;
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch(request) {
				const url = new URL(request.url);
				if (url.pathname === "/api/cli/auth/start") {
					return Response.json({
						deviceCode: "device-1",
						expiresIn: 30,
						interval: 0,
						userCode: "ABCD-EFGH",
						verificationUrl: "https://example.test/cli/login?code=ABCD-EFGH",
					});
				}
				if (url.pathname === "/api/cli/auth/poll") {
					polls += 1;
					if (polls === 1) return Response.json({ status: "pending" });
					return Response.json({ status: "approved", token: "fm_cli_secret" });
				}
				return new Response("not found", { status: 404 });
			},
		});

		const result = await runCli(["login", "--no-browser"], dir, {
			FRAME_MASTER_BASE_URL: `http://127.0.0.1:${server.port}`,
			FRAME_MASTER_CONFIG_DIR: dir,
		});
		server.stop();

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("ABCD-EFGH");
		const credentials = JSON.parse(
			await Bun.file(join(dir, "frame-master", "credentials.json")).text(),
		);
		expect(credentials.token).toBe("fm_cli_secret");
	});
});
