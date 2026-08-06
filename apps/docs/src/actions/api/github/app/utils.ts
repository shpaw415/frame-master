"no action";

import type { getDb } from "db/index";
import { parseGitHubAppLink } from "db/parse";
import { githubAppLinks, type parsedGitHubAppLink } from "db/schema";
import { eq } from "drizzle-orm";
import { App } from "octokit";
import { parseGitHubRepositoryUrl } from "@/actions/api/plugins/metadata";

export type GitHubInstallationResponse = {
	account?: {
		avatar_url?: string | null;
		id?: number;
		login?: string;
		type?: string;
	} | null;
	id: number;
	suspended_at?: string | null;
	target_type?: string;
};

type GitHubInstallStatePayload = {
	exp: number;
	returnTo: string;
	userId: string;
};

const GITHUB_INSTALL_STATE_COOKIE = "fm-github-install-state";

const PKCS8_RSA_ALGORITHM_IDENTIFIER = new Uint8Array([
	0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
	0x05, 0x00,
]);

function base64UrlEncode(input: string | Uint8Array): string {
	const bytes =
		typeof input === "string" ? new TextEncoder().encode(input) : input;
	let binary = "";

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
	const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
	const padding = normalized.length % 4;
	const padded = `${normalized}${padding === 0 ? "" : "=".repeat(4 - padding)}`;
	const binary = atob(padded);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

	return new TextDecoder().decode(bytes);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
	const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
	const combined = new Uint8Array(totalLength);
	let offset = 0;

	for (const part of parts) {
		combined.set(part, offset);
		offset += part.length;
	}

	return combined;
}

function encodeDerLength(length: number): Uint8Array {
	if (length < 0x80) {
		return Uint8Array.of(length);
	}

	const bytes: number[] = [];
	let remaining = length;

	while (remaining > 0) {
		bytes.unshift(remaining & 0xff);
		remaining = Math.floor(remaining / 0x100);
	}

	return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function encodeDer(tag: number, value: Uint8Array): Uint8Array {
	return concatBytes(Uint8Array.of(tag), encodeDerLength(value.length), value);
}

function decodeBase64(input: string): Uint8Array {
	const normalized = input.replace(/\s+/g, "");
	const padding = normalized.length % 4;
	const padded = `${normalized}${padding === 0 ? "" : "=".repeat(4 - padding)}`;
	const binary = atob(padded);

	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function encodeBase64(input: Uint8Array): string {
	let binary = "";

	for (const byte of input) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

function parsePemBlock(input: string): { body: string; label: string } | null {
	const match = input.match(
		/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+?)-----END \1-----/,
	);

	if (!match) {
		return null;
	}

	const label = match[1];
	const body = match[2];

	if (!label || !body) {
		return null;
	}

	return {
		label,
		body: body.replace(/\s+/g, ""),
	};
}

function encodePem(label: string, body: Uint8Array): string {
	const lines =
		encodeBase64(body)
			.match(/.{1,64}/g)
			?.join("\n") ?? "";

	return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function convertPkcs1PrivateKeyToPkcs8(body: string): string {
	const pkcs1Bytes = decodeBase64(body);
	const pkcs8Bytes = encodeDer(
		0x30,
		concatBytes(
			Uint8Array.of(0x02, 0x01, 0x00),
			PKCS8_RSA_ALGORITHM_IDENTIFIER,
			encodeDer(0x04, pkcs1Bytes),
		),
	);

	return encodePem("PRIVATE KEY", pkcs8Bytes);
}

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function normalizeReturnTo(returnTo: string | null | undefined): string {
	if (!returnTo?.startsWith("/") || returnTo.startsWith("//")) {
		return "/settings";
	}

	return returnTo;
}

function constantTimeEquals(left: string, right: string): boolean {
	if (left.length !== right.length) {
		return false;
	}

	let difference = 0;
	for (let index = 0; index < left.length; index += 1) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}

	return difference === 0;
}

function getGitHubStateSecret(env: Cloudflare.Env): string {
	return env.AUTH_SECRET;
}

function normalizeGitHubAppPrivateKey(privateKey: string): string {
	const normalized = privateKey.replace(/\\n/g, "\n").trim();
	const parsedPem = parsePemBlock(normalized);

	if (!parsedPem) {
		return normalized;
	}

	if (parsedPem.label === "RSA PRIVATE KEY") {
		return convertPkcs1PrivateKeyToPkcs8(parsedPem.body);
	}

	if (parsedPem.label === "PRIVATE KEY") {
		return encodePem("PRIVATE KEY", decodeBase64(parsedPem.body));
	}

	return normalized;
}

export function getRequiredGitHubAppConfig(env: Cloudflare.Env): {
	appId: string;
	privateKey: string;
	slug: string;
} {
	if (
		!env.GITHUB_APP_ID ||
		!env.GITHUB_APP_PRIVATE_KEY ||
		!env.GITHUB_APP_SLUG
	) {
		throw new Error("Missing GitHub App configuration");
	}

	return {
		appId: env.GITHUB_APP_ID,
		privateKey: normalizeGitHubAppPrivateKey(env.GITHUB_APP_PRIVATE_KEY),
		slug: env.GITHUB_APP_SLUG,
	};
}

export function createGitHubApp(env: Cloudflare.Env): App {
	const { appId, privateKey } = getRequiredGitHubAppConfig(env);
	return new App({
		appId,
		privateKey,
	});
}

async function createHmacSignature(
	payload: string,
	secret: string,
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{
			name: "HMAC",
			hash: "SHA-256",
		},
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(payload),
	);

	return toHex(signature);
}

export async function createGitHubInstallState(params: {
	env: Cloudflare.Env;
	returnTo?: string | null;
	userId: string;
}): Promise<string> {
	const payload = base64UrlEncode(
		JSON.stringify({
			exp: Date.now() + 10 * 60 * 1000,
			returnTo: normalizeReturnTo(params.returnTo),
			userId: params.userId,
		} satisfies GitHubInstallStatePayload),
	);
	const signature = await createHmacSignature(
		payload,
		getGitHubStateSecret(params.env),
	);

	return `${payload}.${signature}`;
}

export async function verifyGitHubInstallState(params: {
	env: Cloudflare.Env;
	state: string | null;
}): Promise<GitHubInstallStatePayload> {
	if (!params.state) {
		throw new Error("Missing GitHub install state");
	}

	const [payload, signature] = params.state.split(".");
	if (!payload || !signature) {
		throw new Error("Invalid GitHub install state");
	}

	const expectedSignature = await createHmacSignature(
		payload,
		getGitHubStateSecret(params.env),
	);

	if (!constantTimeEquals(expectedSignature, signature)) {
		throw new Error("Invalid GitHub install state signature");
	}

	const parsedPayload = JSON.parse(
		base64UrlDecode(payload),
	) as GitHubInstallStatePayload;

	if (
		!parsedPayload.userId ||
		!parsedPayload.exp ||
		parsedPayload.exp < Date.now()
	) {
		throw new Error("GitHub install state expired");
	}

	return {
		...parsedPayload,
		returnTo: normalizeReturnTo(parsedPayload.returnTo),
	};
}

function parseCookieHeader(
	cookieHeader: string | null,
): Record<string, string> {
	if (!cookieHeader) {
		return {};
	}

	return cookieHeader
		.split(";")
		.reduce<Record<string, string>>((cookies, part) => {
			const separatorIndex = part.indexOf("=");
			if (separatorIndex === -1) {
				return cookies;
			}

			const key = part.slice(0, separatorIndex).trim();
			const value = part.slice(separatorIndex + 1).trim();

			if (!key) {
				return cookies;
			}

			cookies[key] = value;
			return cookies;
		}, {});
}

export function createGitHubInstallStateCookie(params: {
	request: Request;
	state: string;
}): string {
	const isSecure = new URL(params.request.url).protocol === "https:";

	return `${GITHUB_INSTALL_STATE_COOKIE}=${encodeURIComponent(params.state)}; Path=/api/github/app/callback; HttpOnly; SameSite=Lax; Max-Age=600;${isSecure ? " Secure;" : ""}`;
}

export function clearGitHubInstallStateCookie(request: Request): string {
	const isSecure = new URL(request.url).protocol === "https:";

	return `${GITHUB_INSTALL_STATE_COOKIE}=; Path=/api/github/app/callback; HttpOnly; SameSite=Lax; Max-Age=0;${isSecure ? " Secure;" : ""}`;
}

export function getGitHubInstallStateFromCookie(
	request: Request,
): string | null {
	const cookies = parseCookieHeader(request.headers.get("cookie"));
	const state = cookies[GITHUB_INSTALL_STATE_COOKIE];

	if (!state) {
		return null;
	}

	try {
		return decodeURIComponent(state);
	} catch {
		return state;
	}
}

export function buildGitHubAppInstallUrl(params: {
	env: Cloudflare.Env;
	state: string;
}): string {
	const { slug } = getRequiredGitHubAppConfig(params.env);
	const installUrl = new URL(
		`https://github.com/apps/${slug}/installations/new`,
	);
	installUrl.searchParams.set("state", params.state);

	return installUrl.toString();
}

export function buildGitHubAppInstallPath(returnTo = "/settings"): string {
	const installUrl = new URL(
		"/api/github/app/install",
		"https://frame-master.local",
	);
	installUrl.searchParams.set("returnTo", normalizeReturnTo(returnTo));
	return `${installUrl.pathname}${installUrl.search}`;
}

export function buildGitHubAppSettingsRedirect(params: {
	request: Request;
	returnTo?: string | null;
	result: "linked" | "unlinked";
	error?: string;
}): string {
	const url = new URL(normalizeReturnTo(params.returnTo), params.request.url);

	if (params.error) {
		url.searchParams.set("github_app_error", params.error);
	} else {
		url.searchParams.set("github_app", params.result);
	}

	return url.toString();
}

export async function fetchGitHubInstallation(params: {
	env: Cloudflare.Env;
	installationId: string;
}): Promise<GitHubInstallationResponse> {
	const installationId = Number(params.installationId);

	if (!Number.isInteger(installationId) || installationId <= 0) {
		throw new Error("Invalid GitHub installation ID");
	}

	const app = createGitHubApp(params.env);
	const response = await app.octokit.request(
		"GET /app/installations/{installation_id}",
		{
			installation_id: installationId,
			headers: {
				"X-GitHub-Api-Version": "2022-11-28",
			},
		},
	);

	return response.data as GitHubInstallationResponse;
}

export async function getGitHubAppLinkByUserId(params: {
	db: ReturnType<typeof getDb>;
	userId: string;
}): Promise<parsedGitHubAppLink | null> {
	const link = await params.db
		.select()
		.from(githubAppLinks)
		.where(eq(githubAppLinks.userId, params.userId))
		.get();

	return link ? parseGitHubAppLink(link) : null;
}

export async function upsertGitHubAppLink(params: {
	db: ReturnType<typeof getDb>;
	installation: GitHubInstallationResponse;
	userId: string;
}): Promise<parsedGitHubAppLink> {
	const githubLogin = params.installation.account?.login;
	const githubUserId = params.installation.account?.id;
	const accountType =
		params.installation.account?.type || params.installation.target_type;

	if (!githubLogin || !githubUserId) {
		throw new Error("GitHub installation is missing account information");
	}

	if (accountType !== "User") {
		throw new Error(
			"Only personal GitHub repositories are currently supported",
		);
	}

	const now = new Date();
	const existingLink = await getGitHubAppLinkByUserId({
		db: params.db,
		userId: params.userId,
	});

	if (existingLink) {
		const updated = await params.db
			.update(githubAppLinks)
			.set({
				githubAvatarUrl: params.installation.account?.avatar_url || null,
				githubLogin,
				githubUserId: String(githubUserId),
				installationId: String(params.installation.id),
				installationState: params.installation.suspended_at
					? "suspended"
					: "active",
				installationTargetType: accountType,
				installedAt: now,
				lastValidatedAt: now,
				updatedAt: now,
			})
			.where(eq(githubAppLinks.userId, params.userId))
			.returning()
			.get();

		if (!updated) {
			throw new Error("Failed to update GitHub App link");
		}

		return parseGitHubAppLink(updated);
	}

	const created = await params.db
		.insert(githubAppLinks)
		.values({
			githubAvatarUrl: params.installation.account?.avatar_url || null,
			githubLogin,
			githubUserId: String(githubUserId),
			installationId: String(params.installation.id),
			installationState: params.installation.suspended_at
				? "suspended"
				: "active",
			installationTargetType: accountType,
			installedAt: now,
			lastValidatedAt: now,
			updatedAt: now,
			userId: params.userId,
		})
		.returning()
		.get();

	if (!created) {
		throw new Error("Failed to create GitHub App link");
	}

	return parseGitHubAppLink(created);
}

export async function unlinkGitHubAppLink(params: {
	db: ReturnType<typeof getDb>;
	userId: string;
}): Promise<void> {
	await params.db
		.delete(githubAppLinks)
		.where(eq(githubAppLinks.userId, params.userId))
		.run();
}

export async function requireActiveGitHubAppLinkForRepo(params: {
	db: ReturnType<typeof getDb>;
	githubUrl: string;
	userId: string;
}): Promise<parsedGitHubAppLink> {
	const link = await getGitHubAppLinkByUserId({
		db: params.db,
		userId: params.userId,
	});

	if (!link || link.installationState !== "active") {
		throw new Error(
			"Link your GitHub account and install the GitHub App before saving a plugin or template repository",
		);
	}

	const repository = parseGitHubRepositoryUrl(params.githubUrl);
	if (repository.owner.toLowerCase() !== link.githubLogin.toLowerCase()) {
		throw new Error(
			`GitHub repository owner must match your linked GitHub account (${link.githubLogin})`,
		);
	}

	return link;
}
