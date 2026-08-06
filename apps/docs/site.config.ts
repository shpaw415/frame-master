import type { SEOPluginOptions } from "frame-master-plugin-seo";

type SiteConfigType = {
	/** Base URL of the website. Required for sitemap index generation. Example: https://example.com */
	siteUrl: string;
	SEO: SEOPluginOptions;
	frameworkConfig: {
		/**
		 * @default [".tsx", ".jsx"]
		 */
		routesExtensions?: string[];
	};
};

export default {
	siteUrl: "https://frame-master.com",
	SEO: {
		title: "Frame-Master Documentation - Plugins store",
		description:
			"Create your own plugins for Frame-Master and share them with the community in our plugins store.",
		keywords: ["Frame-Master", "Optimization", "Plugins", "Documentation"],
		author: "Justin Halle (@shpaw415)",
		canonical: "https://frame-master.com",
		robots: "index, follow",
		themeColor: "#0a0a0a",
		openGraph: {
			title: "Frame-Master Documentation - Plugins store",
			description:
				"Create your own plugins for Frame-Master and share them with the community in our plugins store.",
			url: "https://frame-master.com",
			type: "website",
			image: "https://frame-master.com/static/logo.png",
			site_name: "Frame-Master Documentation - Plugins store",
		},
		twitter: {
			card: "summary_large_image",
			site: "@frame-master",
			creator: "@shpaw415",
			title: "Frame-Master Documentation - Plugins store",
			description:
				"Create your own plugins for Frame-Master and share them with the community in our plugins store.",
			image: "https://frame-master.com/static/logo.png",
		},
		customTags: [],
	},
	frameworkConfig: {
		routesExtensions: [".tsx", ".mdx"],
	},
} satisfies SiteConfigType;
