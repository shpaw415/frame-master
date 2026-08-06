"use dynamic";
import { useMarkdown } from "@markdown";
import { createLoader, createPageConfig } from "@next/ssr";
import { useLoader } from "@next/ssr/hooks";
import type { parsedPlugin } from "db/schema";
import { ThrowNotFound } from "frame-master-plugin-apply-react/utils";
import { useMemo, useState } from "react";
import { APIError } from "@/action_ext/utils";
import { getExample } from "@/actions/api/plugins/examples";
import { getReadme } from "@/actions/api/plugins/readme";
import { getVersions } from "@/actions/api/plugins/versions";
import { CodeBlockWithTheme } from "@/components/codeblock";
import { routes } from "@/utils";

export const ssr_configs = createPageConfig({
	callback() {
		return {
			ttl: 3600 * 24,
		};
	},
});

export const loader_plugin = createLoader({
	name: "plugin",
	//@ts-expect-error - workaround
	async callback(ctx: EventContext<Env, "id", never>) {
		const { getPlugins } = await import("@/actions/api/plugins");
		const pluginId = ctx.params.id as string;
		const plugin = await getPlugins({ id: pluginId, db: ctx.env.DB });

		const exemple = await getExample({ id: pluginId, db: ctx.env.DB });
		if (exemple instanceof APIError) {
			await exemple.log(ctx as never, {
				endpoint: `/plugins/package/${pluginId}`,
				method: "GET",
				additionalContext: { pluginId },
			});
		}

		const readme = await getReadme({ id: pluginId, db: ctx.env.DB });
		if (readme instanceof APIError) {
			await readme.log(ctx as never, {
				endpoint: `/plugins/package/${pluginId}`,
				method: "GET",
				additionalContext: { pluginId },
			});
		}

		const versions = await getVersions({ id: pluginId, db: ctx.env.DB });
		if (versions instanceof APIError) {
			await versions.log(ctx as never, {
				endpoint: `/plugins/package/${pluginId}/versions`,
				method: "GET",
				additionalContext: { pluginId },
			});
		}

		return {
			exempleDoc: exemple instanceof APIError ? exemple.defaultRes : exemple,
			readmeDoc: readme instanceof APIError ? readme.defaultRes : readme,
			versions: versions instanceof APIError ? versions.defaultRes : versions,
			plugin: plugin.plugins.at(0),
			success: true,
			message: "Plugin data fetched successfully",
		};
	},
});

type ExampleSource = "manual" | "missing" | "repository";
type ReadmeSource = "manual" | "repository";

const markdownContentClassName =
	"w-full text-theme-secondary prose prose-invert max-w-none prose-headings:text-theme-text prose-strong:text-theme-text prose-code:text-blue-400 prose-code:bg-theme-input prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-theme-input prose-pre:border prose-pre:border-theme-border-input prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:text-theme-muted prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300 prose-img:rounded-lg prose-img:shadow-lg";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ShowPluginInfoPage() {
	const pluginData = useLoader(loader_plugin);

	if (!pluginData?.success)
		throw new Error(
			`Failed to fetch plugin data: ${pluginData?.message || "Unknown error"}`,
		);
	else if (!pluginData.plugin) ThrowNotFound();

	const plugin = pluginData.plugin as parsedPlugin;

	const [copied, setCopied] = useState(false);
	const [activeTab, setActiveTab] = useState<
		"overview" | "installation" | "config"
	>("overview");
	const md = useMarkdown();

	const availableVersions: string[] = pluginData.versions.versions;

	const mdDescription = useMemo(() => {
		try {
			return md?.render(pluginData.readmeDoc.content) || "";
		} catch (err) {
			return `Some error occurred while rendering the README: ${(err as Error).toString()}`;
		}
	}, [md, pluginData.readmeDoc.content]);
	const mdQuickExample = useMemo(() => {
		try {
			return md?.render(pluginData.exempleDoc.quickExample || "") || "";
		} catch (err) {
			return `Some error occurred while rendering the Quick Example: ${(err as Error).toString()}`;
		}
	}, [md, pluginData.exempleDoc.quickExample]);
	const mdConfigurationExample = useMemo(() => {
		try {
			return md?.render(pluginData.exempleDoc.configurationExample || "") || "";
		} catch (err) {
			return `Some error occurred while rendering the Configuration Example: ${(err as Error).toString()}`;
		}
	}, [md, pluginData.exempleDoc.configurationExample]);

	const hasQuickStartContent =
		pluginData.exempleDoc.quickExampleSource !== "missing";
	const hasConfigurationContent =
		pluginData.exempleDoc.configurationSource !== "missing";

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const downloadCount = plugin.downloads || 0;

	// Main Content
	return (
		<div className="min-h-screen bg-theme-bg">
			{/* Hero Section */}
			<section className="relative py-20 bg-linear-to-b bg-theme-bg border-b border-theme-border overflow-hidden">
				{/* Animated Background */}
				<div className="absolute inset-0 opacity-30">
					<div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
					<div className="absolute bottom-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
				</div>

				<div className="max-w-6xl mx-auto px-6 relative z-10">
					{/* Back Button */}
					<a
						href="/plugins"
						className="mb-8 px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-muted hover:text-theme-text hover:border-blue-500 transition-all flex items-center gap-2"
					>
						<span>←</span> Back to Plugins
					</a>

					<div className="flex flex-col md:flex-row gap-8 items-start">
						{/* Plugin Icon & Basic Info */}
						<div className="shrink-0">
							<div className="w-32 h-32 bg-linear-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30 animate-float">
								<span className="text-7xl">{plugin.icon}</span>
							</div>
						</div>

						{/* Plugin Details */}
						<div className="flex-1">
							<div className="flex flex-wrap items-center gap-3 mb-4">
								<h1 className="text-5xl font-black text-theme-text">
									{plugin.name}
								</h1>
							</div>

							<p className="text-xl text-theme-secondary mb-6">
								{plugin.description}
							</p>

							<div className="flex flex-wrap gap-6 text-sm text-theme-muted">
								<div className="flex items-center gap-2">
									<span className="text-blue-400">👤</span>
									<span>by {plugin.author}</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-green-400">📦</span>
									<span>v{plugin.version}</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-purple-400">⬇️</span>
									<span>{downloadCount} downloads</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-yellow-400">📂</span>
									<span>{plugin.category}</span>
								</div>
							</div>

							{/* Tags */}
							<div className="flex flex-wrap gap-2 mt-6">
								{plugin.tags.map((tag) => (
									<span
										key={tag}
										className="px-3 py-1 bg-theme-input text-theme-muted rounded-md text-sm hover:bg-theme-input hover:text-theme-text transition-colors"
									>
										{tag}
									</span>
								))}
							</div>

							{/* Quick Actions */}
							<div className="flex gap-4 mt-8">
								{plugin.githubUrl && (
									<a
										href={plugin.githubUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="px-6 py-3 bg-theme-input text-theme-text font-semibold rounded-lg hover:bg-theme-input transition-colors no-underline flex items-center gap-2"
									>
										<span>💻</span> GitHub
									</a>
								)}
								<a
									href={`https://www.npmjs.com/package/${plugin.npmPackage}`}
									target="_blank"
									rel="noopener noreferrer"
									className="px-6 py-3 bg-theme-input text-theme-text font-semibold rounded-lg hover:bg-theme-input transition-colors no-underline flex items-center gap-2"
								>
									<span>📦</span> npm
								</a>
								{plugin.docsUrl && (
									<a
										href={plugin.docsUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors no-underline flex items-center gap-2"
									>
										<span>📚</span> Documentation
									</a>
								)}
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Installation Section */}
			<section className="py-16 bg-theme-bg">
				<div className="max-w-6xl mx-auto px-6">
					{/* Installation Command */}
					<div className="mb-8">
						<h2 className="text-2xl font-bold text-theme-text mb-4">
							Installation
						</h2>
						<div className="bg-theme-card border border-theme-border rounded-xl p-6">
							<div className="flex items-center justify-between mb-2">
								<span className="text-sm text-theme-disabled">NPM Package</span>
								<button
									type="button"
									onClick={() => copyToClipboard(plugin.installation || "")}
									className="px-3 py-1 bg-theme-input text-theme-muted rounded-md text-sm hover:bg-theme-input hover:text-theme-text transition-colors"
								>
									{copied ? "✓ Copied!" : "📋 Copy"}
								</button>
							</div>
							<code className="text-lg text-blue-400 font-mono block">
								{plugin.installation}
							</code>
						</div>
					</div>

					{/* Tabs Navigation */}
					<div className="border-b border-theme-border mb-8">
						<div className="flex gap-8">
							<button
								type="button"
								onClick={() => setActiveTab("overview")}
								className={`pb-4 px-2 font-semibold transition-all ${
									activeTab === "overview"
										? "text-blue-500 border-b-2 border-blue-500"
										: "text-theme-muted hover:text-theme-text"
								}`}
							>
								Overview
							</button>
							{hasQuickStartContent && (
								<button
									type="button"
									onClick={() => setActiveTab("installation")}
									className={`pb-4 px-2 font-semibold transition-all ${
										activeTab === "installation"
											? "text-blue-500 border-b-2 border-blue-500"
											: "text-theme-muted hover:text-theme-text"
									}`}
								>
									Quick Start
								</button>
							)}
							{hasConfigurationContent && (
								<button
									type="button"
									onClick={() => setActiveTab("config")}
									className={`pb-4 px-2 font-semibold transition-all ${
										activeTab === "config"
											? "text-blue-500 border-b-2 border-blue-500"
											: "text-theme-muted hover:text-theme-text"
									}`}
								>
									Configuration
								</button>
							)}
						</div>
					</div>

					{/* Tab Content */}
					<div>
						{activeTab === "overview" && (
							<div className="bg-theme-card border border-theme-border rounded-xl p-8">
								<div className="mb-4 flex flex-wrap items-center gap-3">
									<h3 className="text-2xl font-bold text-theme-text">README</h3>
									<ReadmeSourceBadge source={pluginData.readmeDoc.source} />
								</div>
								<div
									className={markdownContentClassName}
									dangerouslySetInnerHTML={{
										__html: mdDescription,
									}}
								/>

								{plugin.dependencies && plugin.dependencies.length > 0 && (
									<div className="mt-8">
										<h4 className="text-xl font-bold text-theme-text mb-4">
											Dependencies
										</h4>
										<div className="space-y-2">
											{plugin.dependencies.map((dep) => (
												<div
													key={dep.pluginName}
													className="px-4 py-2 bg-theme-input rounded-lg text-theme-secondary font-mono text-sm"
												>
													{dep.pluginName}@{dep.version}
												</div>
											))}
										</div>
									</div>
								)}

								{availableVersions.length > 0 && (
									<div className="mt-8">
										<h4 className="text-xl font-bold text-theme-text mb-4">
											Available Versions
										</h4>
										<div className="flex flex-wrap gap-2">
											{availableVersions.map((version) => (
												<span
													key={version}
													className="rounded-full bg-blue-500/15 px-3 py-1 font-mono text-sm text-blue-400"
												>
													{version}
												</span>
											))}
										</div>
									</div>
								)}
							</div>
						)}

						{activeTab === "installation" && hasQuickStartContent && (
							<div className="bg-theme-card border border-theme-border rounded-xl p-8">
								<div className="mb-6 flex flex-wrap items-center gap-3">
									<h3 className="text-2xl font-bold text-theme-text">
										Quick Start Guide
									</h3>
									<ExampleSourceBadge
										source={pluginData.exempleDoc.quickExampleSource}
									/>
								</div>
								{pluginData.exempleDoc.quickExampleSource === "repository" ? (
									<div
										className={markdownContentClassName}
										dangerouslySetInnerHTML={{
											__html: mdQuickExample,
										}}
									/>
								) : pluginData.exempleDoc.quickExample ? (
									<CodeBlockWithTheme
										language="tsx"
										code={pluginData.exempleDoc.quickExample}
										filename="example.tsx"
									/>
								) : (
									<div className="text-theme-muted">
										No quick start guide available.
									</div>
								)}
							</div>
						)}

						{activeTab === "config" && hasConfigurationContent && (
							<div className="bg-theme-card border border-theme-border rounded-xl p-8">
								<div className="mb-6 flex flex-wrap items-center gap-3">
									<h3 className="text-2xl font-bold text-theme-text">
										Configuration Options
									</h3>
									<ExampleSourceBadge
										source={pluginData.exempleDoc.configurationSource}
									/>
								</div>
								{pluginData.exempleDoc.configurationSource === "repository" ? (
									<div
										className={markdownContentClassName}
										dangerouslySetInnerHTML={{
											__html: mdConfigurationExample,
										}}
									/>
								) : pluginData.exempleDoc.configurationExample ? (
									<CodeBlockWithTheme
										language="ts"
										code={pluginData.exempleDoc.configurationExample}
										filename="frame-master.config.ts"
									/>
								) : (
									<div className="text-theme-muted">
										No configuration example available.
									</div>
								)}
							</div>
						)}
					</div>

					{/* Author Info */}
					<div className="mt-12 bg-linear-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-6">
						<h3 className="text-lg font-bold text-theme-text mb-4">
							About the Author
						</h3>
						<a
							href={routes.profile(plugin.ownerId)}
							className="flex items-center gap-4 hover:opacity-80 transition-opacity"
						>
							<div className="w-16 h-16 bg-linear-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-2xl font-bold text-theme-text">
								{plugin.author.charAt(0).toUpperCase()}
							</div>
							<div>
								<div className="text-theme-text font-semibold">
									{plugin.author}
								</div>
								<div className="text-sm text-theme-muted">Plugin Developer</div>
								<div className="text-xs text-blue-400 mt-1">View Profile →</div>
							</div>
						</a>
					</div>
				</div>
			</section>
		</div>
	);
}

function ExampleSourceBadge({ source }: { source: ExampleSource }) {
	if (source === "missing") {
		return null;
	}

	return (
		<span
			className={`rounded-full px-3 py-1 text-xs font-semibold ${
				source === "repository"
					? "bg-green-500/15 text-green-400"
					: "bg-yellow-500/15 text-yellow-400"
			}`}
		>
			{source === "repository" ? "Repository Root" : "Manual Fallback"}
		</span>
	);
}

function ReadmeSourceBadge({ source }: { source: ReadmeSource }) {
	return (
		<span
			className={`rounded-full px-3 py-1 text-xs font-semibold ${
				source === "repository"
					? "bg-green-500/15 text-green-400"
					: "bg-yellow-500/15 text-yellow-400"
			}`}
		>
			{source === "repository" ? "Repository Root" : "Stored Fallback"}
		</span>
	);
}
