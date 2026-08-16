import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import frameMasterPackage from "../package.json";

const docsDir = join(import.meta.dir, "../../../apps/docs");

type PackageJson = {
	dependencies: Record<string, string>;
	name: string;
	peerDependencies?: Record<string, string>;
};

async function readPackageJson(path: string): Promise<PackageJson> {
	return Bun.file(path).json();
}

describe("docs plugin Frame-Master v4 compatibility", () => {
	test("records the plugins that still need a v4 release", async () => {
		const docsPackage = await readPackageJson(join(docsDir, "package.json"));
		const pluginNames = Object.keys(docsPackage.dependencies).filter(
			(name) =>
				name.startsWith("frame-master-plugin-") ||
				name === "frame-master-svg-to-jsx-loader",
		);
		const incompatible: string[] = [];

		for (const name of pluginNames) {
			const pluginPackage = await readPackageJson(
				join(docsDir, "node_modules", name, "package.json"),
			);
			const frameMasterRange = pluginPackage.peerDependencies?.["frame-master"];
			if (
				!frameMasterRange ||
				!Bun.semver.satisfies(frameMasterPackage.version, frameMasterRange)
			) {
				incompatible.push(name);
			}
		}

		expect(incompatible.sort()).toEqual([
			"frame-master-plugin-apply-react",
			"frame-master-plugin-assets-to-build",
			"frame-master-plugin-auto-sitemap",
			"frame-master-plugin-cloudflare-pages-dynamic-ssr",
			"frame-master-plugin-cloudflare-route-file-generator",
			"frame-master-plugin-env-in-html",
			"frame-master-plugin-html-search-engine",
			"frame-master-plugin-image-optimizer",
			"frame-master-plugin-mdx-to-js-loader",
			"frame-master-plugin-node-polyfills",
			"frame-master-plugin-react-to-html",
			"frame-master-plugin-seo",
			"frame-master-plugin-serve-from-build",
			"frame-master-plugin-tailwind",
			"frame-master-svg-to-jsx-loader",
		]);
	});
});
