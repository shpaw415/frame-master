"server only";

import type { getDb } from "db/index";
import { pluginVersions } from "db/schema";
import { eq } from "drizzle-orm";

export const QUICK_EXAMPLE_FILE = "QUICK_EXEMPLE.md";
export const CONFIG_EXAMPLE_FILE = "CONFIG_EXEMPLE.md";
export const README_FILES = ["README.md", "readme.md", "README.MD"] as const;

const GITHUB_API_HEADERS = {
	Accept: "application/vnd.github+json",
	"User-Agent": "frame-master-site",
};

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const NPM_PACKAGE_PATTERN =
	/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

type GitHubRepository = {
	owner: string;
	repo: string;
	canonicalUrl: string;
};

export type ResolvedPluginVersion = {
	version: string;
	releasedAt: Date;
	deprecated: boolean;
};

export type ResolvedPluginMetadata = {
	githubUrl: string;
	latestVersion: string;
	npmPackage: string;
	npmUrl: string;
	source: "github" | "npm";
	versions: ResolvedPluginVersion[];
};

type NpmRegistryResponse = {
	"dist-tags"?: {
		latest?: string;
	};
	time?: Record<string, string>;
	versions?: Record<string, unknown>;
};

type GitHubReleaseResponse = Array<{
	draft?: boolean;
	prerelease?: boolean;
	published_at?: string;
	tag_name?: string;
}>;

type GitHubContentResponse = {
	content?: string;
	download_url?: string;
	encoding?: string;
};

function decodeBase64Utf8(input: string): string {
	const binary = atob(input);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

function normalizeVersionTag(
	version: string | null | undefined,
): string | null {
	if (!version) {
		return null;
	}

	const sanitized = version
		.trim()
		.replace(/^refs\/tags\//, "")
		.replace(/\.git$/, "");

	const withoutPrefix = /^v\d/.test(sanitized) ? sanitized.slice(1) : sanitized;

	return VERSION_PATTERN.test(withoutPrefix) ? withoutPrefix : null;
}

function comparePrereleaseIdentifiers(left: string, right: string): number {
	const leftNumeric = /^\d+$/.test(left);
	const rightNumeric = /^\d+$/.test(right);

	if (leftNumeric && rightNumeric) {
		return Number(left) - Number(right);
	}

	if (leftNumeric) {
		return -1;
	}

	if (rightNumeric) {
		return 1;
	}

	return left.localeCompare(right);
}

function compareVersionStrings(left: string, right: string): number {
	const [leftCore, leftSuffix = ""] = left.split(/-(.+)/, 2) as [
		string,
		string?,
	];
	const [rightCore, rightSuffix = ""] = right.split(/-(.+)/, 2) as [
		string,
		string?,
	];
	const leftParts = leftCore.split(".").map(Number);
	const rightParts = rightCore.split(".").map(Number);

	const length = Math.max(leftParts.length, rightParts.length);
	for (let index = 0; index < length; index += 1) {
		const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
		if (diff !== 0) {
			return diff;
		}
	}

	if (!leftSuffix && !rightSuffix) {
		return 0;
	}

	if (!leftSuffix) {
		return 1;
	}

	if (!rightSuffix) {
		return -1;
	}

	const leftIdentifiers = leftSuffix.split(".");
	const rightIdentifiers = rightSuffix.split(".");
	const maxLength = Math.max(leftIdentifiers.length, rightIdentifiers.length);

	for (let index = 0; index < maxLength; index += 1) {
		const leftIdentifier = leftIdentifiers[index];
		const rightIdentifier = rightIdentifiers[index];

		if (!leftIdentifier) {
			return -1;
		}

		if (!rightIdentifier) {
			return 1;
		}

		const diff = comparePrereleaseIdentifiers(leftIdentifier, rightIdentifier);
		if (diff !== 0) {
			return diff;
		}
	}

	return 0;
}

function sortVersionsDescending<T extends { version: string }>(
	versions: T[],
): T[] {
	return [...versions].sort(
		(left, right) => -compareVersionStrings(left.version, right.version),
	);
}

function parseDate(value: string | null | undefined): Date | null {
	if (!value) {
		return null;
	}

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function dedupeVersions(
	versions: ResolvedPluginVersion[],
): ResolvedPluginVersion[] {
	const map = new Map<string, ResolvedPluginVersion>();

	for (const version of versions) {
		const existing = map.get(version.version);
		if (
			!existing ||
			existing.releasedAt.getTime() < version.releasedAt.getTime()
		) {
			map.set(version.version, version);
		}
	}

	return sortVersionsDescending(Array.from(map.values()));
}

export function canonicalNpmPackageUrl(packageName: string): string {
	return `https://www.npmjs.com/package/${packageName}`;
}

export function normalizeNpmPackageInput(input: string): {
	npmPackage: string;
	npmUrl: string;
} {
	const trimmedInput = input.trim();

	if (!trimmedInput) {
		throw new Error("NPM package URL is required");
	}

	let npmPackage = trimmedInput;

	if (trimmedInput.includes("://") || trimmedInput.startsWith("www.")) {
		const normalizedUrl = trimmedInput.startsWith("www.")
			? `https://${trimmedInput}`
			: trimmedInput;
		const url = new URL(normalizedUrl);

		if (!/(^|\.)npmjs\.com$/i.test(url.hostname)) {
			throw new Error("NPM URL must point to npmjs.com");
		}

		const pathSegments = url.pathname.split("/").filter(Boolean);
		if (pathSegments[0] !== "package" || pathSegments.length < 2) {
			throw new Error("NPM URL must use the /package/<name> format");
		}

		npmPackage = decodeURIComponent(pathSegments.slice(1).join("/"));
	}

	if (!NPM_PACKAGE_PATTERN.test(npmPackage)) {
		throw new Error("Invalid NPM package name or URL");
	}

	return {
		npmPackage,
		npmUrl: canonicalNpmPackageUrl(npmPackage),
	};
}

export function normalizeGitHubRepoUrl(input: string): string {
	return getGitHubRepository(input).canonicalUrl;
}

export function parseGitHubRepositoryUrl(input: string): GitHubRepository {
	return getGitHubRepository(input);
}

function getGitHubRepository(input: string): GitHubRepository {
	const trimmedInput = input.trim();

	if (!trimmedInput) {
		throw new Error("GitHub repository URL is required");
	}

	const sshMatch = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(
		trimmedInput,
	);
	if (sshMatch) {
		return {
			owner: sshMatch[1] as string,
			repo: sshMatch[2] as string,
			canonicalUrl: `https://github.com/${sshMatch[1]}/${sshMatch[2]}`,
		};
	}

	const candidateUrl = trimmedInput.includes("://")
		? trimmedInput
		: trimmedInput.startsWith("github.com/")
			? `https://${trimmedInput}`
			: `https://github.com/${trimmedInput.replace(/^\/+/, "")}`;

	const url = new URL(candidateUrl);
	if (!/(^|\.)github\.com$/i.test(url.hostname)) {
		throw new Error("GitHub repository URL must point to github.com");
	}

	const pathSegments = url.pathname.split("/").filter(Boolean);
	if (pathSegments.length < 2) {
		throw new Error(
			"GitHub repository URL must include an owner and repository",
		);
	}

	const owner = pathSegments[0] as string;
	const repo = (pathSegments[1] as string).replace(/\.git$/, "");

	if (!owner || !repo) {
		throw new Error(
			"GitHub repository URL must include an owner and repository",
		);
	}

	return {
		owner,
		repo,
		canonicalUrl: `https://github.com/${owner}/${repo}`,
	};
}

async function fetchNpmPackageVersions(
	npmPackage: string,
): Promise<ResolvedPluginVersion[]> {
	const response = await fetch(
		`https://registry.npmjs.org/${encodeURIComponent(npmPackage)}`,
	);

	if (response.status === 404) {
		return [];
	}

	if (!response.ok) {
		throw new Error(`Failed to fetch NPM metadata (${response.status})`);
	}

	const payload = (await response.json()) as NpmRegistryResponse;
	const versions = Object.keys(payload.versions || {}).flatMap((version) => {
		const normalizedVersion = normalizeVersionTag(version);
		if (!normalizedVersion) {
			return [];
		}

		const releasedAt =
			parseDate(payload.time?.[version]) ||
			parseDate(payload.time?.[normalizedVersion]) ||
			new Date();

		return [
			{
				version: normalizedVersion,
				releasedAt,
				deprecated: false,
			},
		];
	});

	const dedupedVersions = dedupeVersions(versions);
	const latestFromDistTag = normalizeVersionTag(payload["dist-tags"]?.latest);

	if (!latestFromDistTag) {
		return dedupedVersions;
	}

	const latestVersion = dedupedVersions.find(
		(entry) => entry.version === latestFromDistTag,
	);

	if (!latestVersion) {
		return dedupedVersions;
	}

	return [
		latestVersion,
		...dedupedVersions.filter(
			(entry) => entry.version !== latestVersion.version,
		),
	];
}

async function fetchGitHubReleaseVersions(
	githubUrl: string,
): Promise<ResolvedPluginVersion[]> {
	const repository = getGitHubRepository(githubUrl);
	const response = await fetch(
		`https://api.github.com/repos/${repository.owner}/${repository.repo}/releases?per_page=100`,
		{
			headers: GITHUB_API_HEADERS,
		},
	);

	if (response.status === 404) {
		return [];
	}

	if (!response.ok) {
		throw new Error(`Failed to fetch GitHub releases (${response.status})`);
	}

	const payload = (await response.json()) as GitHubReleaseResponse;
	return dedupeVersions(
		payload.flatMap((release) => {
			if (release.draft) {
				return [];
			}

			const normalizedVersion = normalizeVersionTag(release.tag_name);
			if (!normalizedVersion) {
				return [];
			}

			return [
				{
					version: normalizedVersion,
					releasedAt: parseDate(release.published_at) || new Date(),
					deprecated: false,
				},
			];
		}),
	);
}

export async function resolvePluginMetadata(input: {
	githubUrl: string;
	npmPackage: string;
}): Promise<ResolvedPluginMetadata> {
	const githubUrl = normalizeGitHubRepoUrl(input.githubUrl);
	const { npmPackage, npmUrl } = normalizeNpmPackageInput(input.npmPackage);

	const npmVersions = await fetchNpmPackageVersions(npmPackage);
	if (npmVersions.length > 0) {
		return {
			githubUrl,
			latestVersion: (npmVersions[0] as ResolvedPluginVersion).version,
			npmPackage,
			npmUrl,
			source: "npm",
			versions: npmVersions,
		};
	}

	const githubVersions = await fetchGitHubReleaseVersions(githubUrl);
	if (githubVersions.length === 0) {
		throw new Error(
			"No versions were found on npm, and no GitHub releases were available as a fallback",
		);
	}

	return {
		githubUrl,
		latestVersion: (githubVersions[0] as ResolvedPluginVersion).version,
		npmPackage,
		npmUrl,
		source: "github",
		versions: githubVersions,
	};
}

export async function replacePluginVersionHistory(params: {
	db: ReturnType<typeof getDb>;
	pluginId: number;
	versions: ResolvedPluginVersion[];
}): Promise<void> {
	await params.db
		.delete(pluginVersions)
		.where(eq(pluginVersions.pluginId, String(params.pluginId)));

	if (params.versions.length === 0) {
		return;
	}

	await params.db.insert(pluginVersions).values(
		params.versions.map((version) => ({
			id: `${params.pluginId}:${version.version}`,
			pluginId: String(params.pluginId),
			version: version.version,
			deprecated: version.deprecated,
			releasedAt: version.releasedAt,
		})),
	);
}

async function fetchGitHubRepositoryFile(
	githubUrl: string,
	fileName: string,
): Promise<string | null> {
	const repository = getGitHubRepository(githubUrl);
	const response = await fetch(
		`https://api.github.com/repos/${repository.owner}/${repository.repo}/contents/${encodeURIComponent(fileName)}`,
		{
			headers: GITHUB_API_HEADERS,
		},
	);

	if (response.status === 404) {
		return null;
	}

	if (!response.ok) {
		throw new Error(
			`Failed to fetch ${fileName} from GitHub (${response.status})`,
		);
	}

	const payload = (await response.json()) as GitHubContentResponse;

	if (payload.download_url) {
		const rawResponse = await fetch(payload.download_url, {
			headers: {
				Accept: "text/plain",
			},
		});

		if (rawResponse.ok) {
			return rawResponse.text();
		}
	}

	if (payload.content && payload.encoding === "base64") {
		return decodeBase64Utf8(payload.content.replace(/\n/g, ""));
	}

	return null;
}

async function fetchFirstRepositoryFile(
	githubUrl: string,
	fileNames: readonly string[],
): Promise<string | null> {
	for (const fileName of fileNames) {
		const content = await fetchGitHubRepositoryFile(githubUrl, fileName);
		if (content) {
			return content;
		}
	}

	return null;
}

export async function fetchRepositoryExamples(githubUrl: string): Promise<{
	configurationExample: string | null;
	quickExample: string | null;
}> {
	const normalizedGithubUrl = normalizeGitHubRepoUrl(githubUrl);
	const [quickExample, configurationExample] = await Promise.all([
		fetchGitHubRepositoryFile(normalizedGithubUrl, QUICK_EXAMPLE_FILE),
		fetchGitHubRepositoryFile(normalizedGithubUrl, CONFIG_EXAMPLE_FILE),
	]);

	return {
		configurationExample,
		quickExample,
	};
}

export async function fetchRepositoryReadme(
	githubUrl: string,
): Promise<string | null> {
	const normalizedGithubUrl = normalizeGitHubRepoUrl(githubUrl);
	return fetchFirstRepositoryFile(normalizedGithubUrl, README_FILES);
}

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
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

export async function verifyGitHubWebhookSignature(params: {
	payload: string;
	secret: string;
	signatureHeader: string | null;
}): Promise<boolean> {
	if (!params.signatureHeader?.startsWith("sha256=")) {
		return false;
	}

	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(params.secret),
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
		new TextEncoder().encode(params.payload),
	);
	const expectedSignature = `sha256=${toHex(signature)}`;

	return constantTimeEquals(expectedSignature, params.signatureHeader);
}
