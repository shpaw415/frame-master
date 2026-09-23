export type PublishKind = "plugin" | "template";

export type PackageJson = {
	author?: string | { name?: string };
	dependencies?: Record<string, string>;
	description?: string;
	devDependencies?: Record<string, string>;
	homepage?: string;
	keywords?: string[];
	name?: string;
	peerDependencies?: Record<string, string>;
	repository?: string | { url?: string };
	frameMaster?: { features?: string[] };
};

export type InferredListing = {
	author: string;
	category: string;
	compatibleVersions?: string;
	configuration?: string;
	description: string;
	docsUrl?: string;
	features?: string[];
	githubUrl: string;
	icon: string;
	includedPlugins?: string[];
	installation?: string;
	kind: PublishKind;
	longDescription?: string;
	name: string;
	npmPackage?: string;
	previewUrl?: string;
	published: boolean;
	quickStart?: string;
	tags: string[];
};

const PLUGIN_CATEGORIES = [
	"frontend",
	"authentication",
	"database",
	"api",
	"styling",
	"realtime",
	"cache",
	"utilities",
	"testing",
	"build",
	"state",
	"routing",
	"other",
] as const;

const TEMPLATE_CATEGORIES = [
	"fullstack",
	"frontend",
	"backend",
	"cdn",
	"blog",
	"ecommerce",
	"dashboard",
	"saas",
	"landing",
	"other",
] as const;

export function categoriesFor(kind: PublishKind): readonly string[] {
	return kind === "plugin" ? PLUGIN_CATEGORIES : TEMPLATE_CATEGORIES;
}

export function detectKind(
	pkg: PackageJson,
	override?: PublishKind,
): PublishKind {
	if (override) return override;
	const name = pkg.name || "";
	const keywords = pkg.keywords || [];
	if (
		name.startsWith("frame-master-plugin-") ||
		keywords.includes("frame-master-plugin")
	) {
		return "plugin";
	}
	if (
		name.startsWith("frame-master-template-") ||
		keywords.includes("frame-master-template")
	) {
		return "template";
	}
	throw new Error(
		"Could not detect plugin or template. Pass --type plugin or --type template.",
	);
}

export function parseGitHubRemote(remote: string | null | undefined): string | null {
	if (!remote) return null;
	const trimmed = remote.trim().replace(/\.git$/, "");
	const ssh = /^git@github\.com:([^/]+)\/([^/]+)$/i.exec(trimmed);
	if (ssh) return `https://github.com/${ssh[1]}/${ssh[2]}`;
	try {
		const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
		if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
		const [owner, repo] = url.pathname.split("/").filter(Boolean);
		if (!owner || !repo) return null;
		return `https://github.com/${owner}/${repo}`;
	} catch {
		return null;
	}
}

function authorName(author: PackageJson["author"], githubUrl: string): string {
	if (typeof author === "string" && author.trim()) return author.trim();
	if (author && typeof author === "object" && author.name) return author.name;
	return githubUrl.split("/")[3] || "";
}

function includedPlugins(pkg: PackageJson): string[] {
	return [
		...Object.keys(pkg.dependencies || {}),
		...Object.keys(pkg.devDependencies || {}),
	].filter((name) => name.startsWith("frame-master-plugin-"));
}

export function inferListing(input: {
	category?: string;
	configExample?: string | null;
	draft?: boolean;
	gitRemote?: string | null;
	kind?: PublishKind;
	pkg: PackageJson;
	quickExample?: string | null;
	readme?: string | null;
}): InferredListing {
	const kind = detectKind(input.pkg, input.kind);
	const name = input.pkg.name?.trim();
	if (!name) throw new Error("package.json is missing a name");
	const description = input.pkg.description?.trim();
	if (!description) throw new Error("package.json is missing a description");

	const repository =
		typeof input.pkg.repository === "string"
			? input.pkg.repository
			: input.pkg.repository?.url;
	const githubUrl = parseGitHubRemote(repository) || parseGitHubRemote(input.gitRemote);
	if (!githubUrl) {
		throw new Error("Could not find a GitHub repository in package.json or git remote");
	}

	const category = input.category?.trim() || "";
	if (category && !categoriesFor(kind).includes(category)) {
		throw new Error(
			`Unknown ${kind} category "${category}". Expected one of: ${categoriesFor(kind).join(", ")}`,
		);
	}

	const readme = input.readme?.trim();
	const listing: InferredListing = {
		author: authorName(input.pkg.author, githubUrl),
		category,
		description,
		githubUrl,
		icon: kind === "plugin" ? "🔌" : "📁",
		kind,
		name,
		published: !input.draft,
		tags: input.pkg.keywords || [],
	};

	if (readme) listing.longDescription = readme.slice(0, 50000);
	if (input.quickExample?.trim()) listing.quickStart = input.quickExample.trim();
	if (input.configExample?.trim()) {
		listing.configuration = input.configExample.trim();
	}
	if (input.pkg.homepage) {
		if (kind === "plugin") listing.docsUrl = input.pkg.homepage;
		else listing.previewUrl = input.pkg.homepage;
	}
	if (input.pkg.frameMaster?.features?.length) {
		listing.features = input.pkg.frameMaster.features;
	}

	if (kind === "plugin") {
		listing.npmPackage = name;
		listing.compatibleVersions =
			input.pkg.peerDependencies?.["frame-master"] || "^4.0.0";
		listing.installation = `bun add ${name}`;
	} else {
		listing.installation = `frame-master create my-app --template ${name}`;
		const plugins = includedPlugins(input.pkg);
		if (plugins.length > 0) listing.includedPlugins = plugins;
	}

	return listing;
}

export function toRegistryListing(listing: InferredListing) {
	if (listing.kind === "plugin") {
		return {
			author: listing.author,
			category: listing.category,
			compatibleVersions: listing.compatibleVersions,
			configuration: listing.configuration,
			description: listing.description,
			docsUrl: listing.docsUrl,
			githubUrl: listing.githubUrl,
			icon: listing.icon,
			installation: listing.installation,
			longDescription: listing.longDescription,
			name: listing.name,
			npmPackage: listing.npmPackage,
			published: listing.published,
			quickStart: listing.quickStart,
			tags: listing.tags,
		};
	}

	return {
		author: listing.author,
		category: listing.category,
		configuration: listing.configuration,
		description: listing.description,
		features: listing.features,
		githubRepoUrl: listing.githubUrl,
		icon: listing.icon,
		includedPlugins: listing.includedPlugins,
		installation: listing.installation,
		longDescription: listing.longDescription,
		name: listing.name,
		previewUrl: listing.previewUrl,
		published: listing.published,
		tags: listing.tags,
	};
}
