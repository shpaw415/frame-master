"use dynamic";

import { createLoader, createPageConfig } from "@next/ssr";
import { useLoader } from "@next/ssr/hooks";
import type { parsedReleaseNote } from "db/schema";
import { getReleaseNotes } from "@/action_ext/utils";
import type MarkdownIt from "markdown-it";
import { useMarkdown } from "@markdown";

export const ssr_configs = createPageConfig({
	callback(_ctx) {
		return { ttl: 3600 * 24 }; // Cache the page for 24 hours
	},
});

export const loader_releases = createLoader({
	name: "releases",
	async callback(ctx) {
		const response = await getReleaseNotes({ db: ctx.env.DB });
		if (!response.success) {
			throw new Error("Failed to fetch release notes");
		}
		return response.data as parsedReleaseNote[];
	},
});

export default function BlogPage() {
	return (
		<div className="min-h-screen bg-theme-bg">
			<BlogHeader />
			<ReleasesList />
		</div>
	);
}

// ============================================================================
// HEADER SECTION
// ============================================================================
function BlogHeader() {
	return (
		<section className="py-20 md:py-16 bg-linear-to-b from-theme-bg to-theme-card border-b border-theme-border">
			<div className="max-w-7xl mx-auto px-6">
				<div className="text-center">
					<h1 className="text-6xl md:text-5xl font-black bg-linear-to-br from-theme-gradient-from to-theme-gradient-to bg-clip-text text-transparent tracking-tight mb-4">
						Release Notes
					</h1>
					<p className="text-xl text-theme-muted max-w-2xl mx-auto leading-relaxed">
						Stay up to date with the latest features, improvements, and bug
						fixes in Frame-Master
					</p>
				</div>
			</div>
		</section>
	);
}

// ============================================================================
// RELEASES LIST
// ============================================================================
function ReleasesList() {
	const releases = useLoader(loader_releases);
	const md = useMarkdown();

	if (releases?.length === 0) {
		return (
			<section className="py-20 bg-theme-bg">
				<div className="max-w-5xl mx-auto px-6 text-center">
					<div className="p-12 bg-theme-card border border-theme-border rounded-2xl">
						<span className="text-6xl mb-4 block">📝</span>
						<p className="text-xl text-theme-muted">
							No release notes available yet
						</p>
					</div>
				</div>
			</section>
		);
	}

	return (
		<section className="py-20 bg-theme-bg">
			<div className="max-w-5xl mx-auto px-6">
				<div className="space-y-8">
					{releases?.map((release, index) => (
						<ReleaseCard key={release.id} {...release} md={md} index={index} />
					))}
				</div>
			</div>
		</section>
	);
}

// ============================================================================
// RELEASE CARD COMPONENT
// ============================================================================
function ReleaseCard({
	version,
	releasedAt,
	title,
	content,
	githubUrl,
	md,
	index,
}: parsedReleaseNote & { md: MarkdownIt; index: number }) {
	const formatDate = (date: Date) => {
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	};

	const renderMarkdown = (markdown: string) => {
		return { __html: md.render(markdown) };
	};

	// Determine version tag based on version number
	const getVersionTag = (ver: string) => {
		if (ver.includes("beta") || ver.includes("alpha")) {
			return { tag: "Beta", color: "bg-yellow-500/20 text-yellow-400" };
		}
		return { tag: "Release", color: "bg-blue-500/20 text-blue-400" };
	};

	const versionInfo =
		index === 0
			? { tag: "Latest", color: "bg-green-500/20 text-green-400" }
			: getVersionTag(version);

	return (
		<article
			onKeyUp={() => window.open(githubUrl, "_blank")}
			className="group p-8 bg-theme-card border border-theme-border rounded-2xl transition-all duration-300 hover:border-blue-500 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(59,130,246,0.2)] cursor-pointer"
		>
			{/* Header */}
			<div className="flex items-start justify-between mb-6 flex-wrap gap-4">
				<div className="flex-1">
					<div className="flex items-center gap-3 mb-2">
						<h2 className="text-4xl font-bold text-theme-text group-hover:text-blue-400 transition-colors">
							v{version}
						</h2>
						<span
							className={`px-3 py-1 ${versionInfo.color} rounded-md text-xs font-semibold uppercase tracking-wider`}
						>
							{versionInfo.tag}
						</span>
					</div>
					<p className="text-sm text-theme-disabled flex items-center gap-2">
						<span className="text-base">📅</span>
						{formatDate(releasedAt)}
					</p>
				</div>
				<div className="text-theme-muted group-hover:text-blue-400 transition-colors">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						strokeWidth={2}
						stroke="currentColor"
						className="w-6 h-6"
					>
						<title>View on GitHub</title>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
						/>
					</svg>
				</div>
			</div>

			{/* Title */}
			<h3 className="text-2xl font-bold text-theme-text mb-6 group-hover:text-blue-400 transition-colors">
				{title}
			</h3>

			{/* Content (Markdown) */}
			<div
				className="prose prose-invert prose-sm max-w-none mb-6
          prose-headings:text-theme-text prose-headings:font-bold
          prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3
          prose-h3:text-lg prose-h3:mt-4 prose-h3:mb-2
          prose-p:text-theme-muted prose-p:leading-relaxed
          prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300
          prose-strong:text-theme-text prose-strong:font-semibold
          prose-ul:my-4 prose-li:text-theme-muted prose-li:my-1
          prose-code:text-blue-400 prose-code:bg-blue-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
          prose-pre:bg-theme-card prose-pre:border prose-pre:border-theme-border"
				dangerouslySetInnerHTML={renderMarkdown(content)}
			/>

			{/* Footer */}
			<div className="mt-8 pt-6 border-t border-theme-border flex items-center justify-between">
				<span className="text-sm text-theme-disabled flex items-center gap-2">
					<span className="text-base">🔗</span>
					View full release notes on GitHub
				</span>
				<span className="text-blue-500 group-hover:translate-x-2 transition-transform text-xl">
					→
				</span>
			</div>
		</article>
	);
}
