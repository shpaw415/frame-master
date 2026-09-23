import { describe, expect, test } from "bun:test";
import {
	detectKind,
	inferListing,
	parseGitHubRemote,
	toRegistryListing,
} from "../../bin/publish/infer";

describe("publish infer", () => {
	test("detects plugins and templates from name or keywords", () => {
		expect(detectKind({ name: "frame-master-plugin-seo" })).toBe("plugin");
		expect(detectKind({ name: "frame-master-template-cloudflare-nextjs" })).toBe(
			"template",
		);
		expect(detectKind({ name: "seo", keywords: ["frame-master-plugin"] })).toBe(
			"plugin",
		);
		expect(detectKind({ name: "app", keywords: ["frame-master-template"] })).toBe(
			"template",
		);
		expect(detectKind({ name: "seo" }, "plugin")).toBe("plugin");
		expect(() => detectKind({ name: "unknown" })).toThrow(/--type/);
	});

	test("parses GitHub remotes", () => {
		expect(parseGitHubRemote("git@github.com:shpaw415/frame-master.git")).toBe(
			"https://github.com/shpaw415/frame-master",
		);
		expect(
			parseGitHubRemote("https://github.com/shpaw415/frame-master.git"),
		).toBe("https://github.com/shpaw415/frame-master");
		expect(parseGitHubRemote("https://gitlab.com/org/repo")).toBeNull();
	});

	test("infers a plugin listing", () => {
		const listing = inferListing({
			category: "utilities",
			configExample: "config",
			pkg: {
				author: "Ada",
				description: "SEO helpers",
				keywords: ["seo"],
				name: "frame-master-plugin-seo",
				peerDependencies: { "frame-master": "^4.0.0" },
			},
			quickExample: "quick",
			readme: "# SEO",
			gitRemote: "git@github.com:ada/frame-master-plugin-seo.git",
		});

		expect(listing.kind).toBe("plugin");
		expect(listing.published).toBe(true);
		expect(listing.npmPackage).toBe("frame-master-plugin-seo");
		expect(listing.compatibleVersions).toBe("^4.0.0");
		expect(listing.githubUrl).toBe("https://github.com/ada/frame-master-plugin-seo");
		expect(toRegistryListing(listing).npmPackage).toBe(
			"frame-master-plugin-seo",
		);
		expect(toRegistryListing(listing).dependencies).toEqual([]);
	});

	test("infers a draft template listing", () => {
		const listing = inferListing({
			category: "fullstack",
			draft: true,
			pkg: {
				dependencies: { "frame-master-plugin-tailwind": "^2.0.0" },
				description: "Cloudflare starter",
				name: "frame-master-template-cloudflare-nextjs",
				repository: { url: "https://github.com/ada/cloudflare-nextjs" },
			},
		});

		expect(listing.kind).toBe("template");
		expect(listing.published).toBe(false);
		expect(listing.includedPlugins).toEqual(["frame-master-plugin-tailwind"]);
		expect(toRegistryListing(listing).githubRepoUrl).toBe(
			"https://github.com/ada/cloudflare-nextjs",
		);
	});
});
