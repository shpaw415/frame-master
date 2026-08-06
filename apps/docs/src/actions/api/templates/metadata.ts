"server only";

import {
	fetchRepositoryReadme,
	normalizeGitHubRepoUrl,
	parseGitHubRepositoryUrl,
} from "@/actions/api/plugins/metadata";

const GITHUB_API_HEADERS = {
	Accept: "application/vnd.github+json",
	"User-Agent": "frame-master-site",
};

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

type GitHubReleaseResponse = Array<{
	draft?: boolean;
	published_at?: string;
	tag_name?: string;
}>;

export type ResolvedTemplateVersion = {
	releaseUrl: string;
	releasedAt: Date;
	tagName: string;
	version: string;
};

export type ResolvedTemplateMetadata = {
	defaultVersion: string;
	githubReleaseUrl: string;
	githubRepoUrl: string;
	versions: ResolvedTemplateVersion[];
};

function normalizeVersionTag(
	version: string | null | undefined,
): string | null {
	if (!version) {
		return null;
	}

	const sanitized = version.trim().replace(/^refs\/tags\//, "");
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

function parseDate(value: string | null | undefined): Date | null {
	if (!value) {
		return null;
	}

	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function sortVersionsDescending<T extends { version: string }>(
	versions: T[],
): T[] {
	return [...versions].sort(
		(left, right) => -compareVersionStrings(left.version, right.version),
	);
}

function dedupeVersions(
	versions: ResolvedTemplateVersion[],
): ResolvedTemplateVersion[] {
	const map = new Map<string, ResolvedTemplateVersion>();

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

async function fetchGitHubReleaseVersions(
	githubRepoUrl: string,
): Promise<ResolvedTemplateVersion[]> {
	const repository = parseGitHubRepositoryUrl(githubRepoUrl);
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
			if (release.draft || !release.tag_name) {
				return [];
			}

			const version = normalizeVersionTag(release.tag_name);
			if (!version) {
				return [];
			}

			return [
				{
					releaseUrl: `${normalizeGitHubRepoUrl(githubRepoUrl)}/releases/tag/${encodeURIComponent(release.tag_name)}`,
					releasedAt: parseDate(release.published_at) || new Date(),
					tagName: release.tag_name,
					version,
				},
			];
		}),
	);
}

export async function resolveTemplateMetadata(input: {
	githubRepoUrl: string;
}): Promise<ResolvedTemplateMetadata> {
	const githubRepoUrl = normalizeGitHubRepoUrl(input.githubRepoUrl);
	const versions = await fetchGitHubReleaseVersions(githubRepoUrl);

	if (versions.length === 0) {
		throw new Error(
			"No published GitHub releases were found for this repository",
		);
	}

	const latestVersion = versions[0] as ResolvedTemplateVersion;

	return {
		defaultVersion: latestVersion.version,
		githubReleaseUrl: latestVersion.releaseUrl,
		githubRepoUrl,
		versions,
	};
}

export async function fetchTemplateRepositoryReadme(
	githubRepoUrl: string,
): Promise<string | null> {
	return fetchRepositoryReadme(githubRepoUrl);
}
