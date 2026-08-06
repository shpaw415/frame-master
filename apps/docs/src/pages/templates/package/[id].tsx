"use dynamic";

import { useMarkdown } from "@markdown";
import { ThrowNotFound } from "@next/client";
import { createLoader, createPageConfig } from "@next/ssr";
import { useLoader } from "@next/ssr/hooks";
import { useMemo, useState } from "react";
import { APIError } from "@/action_ext/utils";
import { navigate, routes } from "@/utils";

export const ssr_configs = createPageConfig({
	callback() {
		return {
			ttl: 3600 * 24,
		};
	},
});

export const loader_template = createLoader({
	name: "template",
	//@ts-expect-error - workaround
	async callback(ctx: EventContext<Env, "id", never>) {
		const { getTemplates } = await import("@/actions/api/templates");
		const { getTemplateReadme } = await import(
			"@/actions/api/templates/readme"
		);
		const templateId = ctx.params.id as string;

		const template = await getTemplates({ id: templateId, db: ctx.env.DB });
		if (template instanceof APIError) {
			await template.log(ctx, {
				method: "GET",
				endpoint: new URL(ctx.request.url).pathname,
			});
		}

		const readme = await getTemplateReadme({ id: templateId, db: ctx.env.DB });
		if (readme instanceof APIError) {
			await readme.log(ctx, {
				method: "GET",
				endpoint: new URL(ctx.request.url).pathname,
			});
		}

		return {
			template: template instanceof APIError ? template.defaultRes : template,
			readme: readme instanceof APIError ? readme.defaultRes : readme,
		};
	},
});

type ReadmeSource = "manual" | "repository";

const markdownContentClassName =
	"text-theme-secondary prose prose-invert max-w-none prose-headings:text-theme-text prose-strong:text-theme-text prose-code:text-blue-400 prose-code:bg-theme-input prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-theme-input prose-pre:border prose-pre:border-theme-border-input prose-blockquote:border-blue-500 prose-blockquote:text-theme-muted prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ShowTemplateInfoPage() {
	const templateData = useLoader(loader_template);

	const template = templateData?.template.templates.at(0) || null;

	if (!template) {
		ThrowNotFound();
	}

	const overviewDoc = templateData?.readme;

	const [error, _setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [activeTab, setActiveTab] = useState<
		"overview" | "features" | "plugins"
	>("overview");
	const md = useMarkdown();

	const mdDescription = useMemo(
		() => md.render(overviewDoc?.content ?? "") ?? "",
		[md, overviewDoc?.content],
	);

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	// Error State
	if (error || !template) {
		return (
			<div className="min-h-screen bg-theme-bg flex items-center justify-center">
				<div className="text-center max-w-md px-6">
					<div className="text-8xl mb-6 animate-bounce">❌</div>
					<h2 className="text-3xl font-bold text-theme-text mb-4">Oops!</h2>
					<p className="text-theme-muted mb-8">
						{error || "Template not found"}
					</p>
					<button
						type="button"
						onClick={() => navigate("/templates")}
						className="px-8 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors"
					>
						Back to Templates
					</button>
				</div>
			</div>
		);
	}

	const installCommand =
		template.installation ||
		`frame-master create --template ${template.githubReleaseUrl}`;

	// Main Content
	return (
		<div className="min-h-screen bg-theme-bg">
			{/* Hero Section */}
			<section className="relative py-20 bg-linear-to-b from-theme-bg via-[#0f0f0f] to-theme-bg border-b border-theme-border overflow-hidden">
				{/* Animated Background */}
				<div className="absolute inset-0 opacity-30">
					<div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
					<div className="absolute bottom-0 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl"></div>
				</div>

				<div className="max-w-6xl mx-auto px-6 relative z-10">
					{/* Back Button */}
					<button
						type="button"
						onClick={() => navigate("/templates")}
						className="mb-8 px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-muted hover:text-theme-text hover:border-blue-500 transition-all flex items-center gap-2"
					>
						<span>←</span> Back to Templates
					</button>

					<div className="flex flex-col md:flex-row gap-8 items-start">
						{/* Template Icon & Basic Info */}
						<div className="shrink-0">
							<div className="w-32 h-32 bg-linear-to-br from-blue-500 to-green-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30 animate-float">
								<span className="text-7xl">{template.icon}</span>
							</div>
						</div>

						{/* Template Details */}
						<div className="flex-1">
							<div className="flex flex-wrap items-center gap-3 mb-4">
								<h1 className="text-5xl font-black text-theme-text">
									{template.name}
								</h1>
							</div>

							<p className="text-xl text-theme-secondary mb-6">
								{template.description}
							</p>

							<div className="flex flex-wrap gap-6 text-sm text-theme-muted">
								<div className="flex items-center gap-2">
									<span className="text-blue-400">👤</span>
									<span>by {template.author}</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-green-400">📦</span>
									<span>v{template.defaultVersion}</span>
								</div>
								<div className="flex items-center gap-2">
									<span className="text-yellow-400">📂</span>
									<span>{template.category}</span>
								</div>
								{template.includedPlugins.length > 0 && (
									<div className="flex items-center gap-2">
										<span className="text-purple-400">🔌</span>
										<span>
											{template.includedPlugins.length} plugins included
										</span>
									</div>
								)}
							</div>

							{/* Tags */}
							<div className="flex flex-wrap gap-2 mt-6">
								{template.tags.map((tag) => (
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
								<a
									href={template.githubRepoUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="px-6 py-3 bg-theme-input text-theme-text font-semibold rounded-lg hover:bg-theme-input transition-colors no-underline flex items-center gap-2"
								>
									<span>💻</span> GitHub
								</a>
								{template.previewUrl && (
									<a
										href={template.previewUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors no-underline flex items-center gap-2"
									>
										<span>👁️</span> Live Preview
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
							Quick Start
						</h2>
						<div className="bg-theme-card border border-theme-border rounded-xl p-6">
							<div className="flex items-center justify-between mb-2">
								<span className="text-sm text-theme-disabled">
									Create new project from template
								</span>
								<button
									type="button"
									onClick={() => copyToClipboard(installCommand)}
									className="px-3 py-1 bg-theme-input text-theme-muted rounded-md text-sm hover:bg-theme-input hover:text-theme-text transition-colors"
								>
									{copied ? "✓ Copied!" : "📋 Copy"}
								</button>
							</div>
							<code className="text-lg text-blue-400 font-mono block break-all">
								{installCommand}
							</code>
						</div>

						{/* Version Selection Info */}
						<div className="mt-4 p-4 bg-theme-input border border-theme-border-input rounded-lg">
							<div className="flex items-start gap-3">
								<span className="text-xl">💡</span>
								<div>
									<p className="text-sm text-theme-secondary">
										<strong className="text-theme-text">Tip:</strong> You can
										specify a different version by using the GitHub release URL:
									</p>
									<code className="text-xs text-theme-muted font-mono mt-1 block">
										frame-master create --template {template.githubRepoUrl}
										@vX.Y.Z
									</code>
								</div>
							</div>
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
							{template.features && template.features.length > 0 && (
								<button
									type="button"
									onClick={() => setActiveTab("features")}
									className={`pb-4 px-2 font-semibold transition-all ${
										activeTab === "features"
											? "text-blue-500 border-b-2 border-blue-500"
											: "text-theme-muted hover:text-theme-text"
									}`}
								>
									Features
								</button>
							)}
							{template.includedPlugins.length > 0 && (
								<button
									type="button"
									onClick={() => setActiveTab("plugins")}
									className={`pb-4 px-2 font-semibold transition-all ${
										activeTab === "plugins"
											? "text-blue-500 border-b-2 border-blue-500"
											: "text-theme-muted hover:text-theme-text"
									}`}
								>
									Included Plugins
								</button>
							)}
						</div>
					</div>

					{/* Tab Content */}
					<div className="prose prose-invert max-w-none">
						{activeTab === "overview" && (
							<div className="bg-theme-card border border-theme-border rounded-xl p-8">
								<div className="mb-4 flex flex-wrap items-center gap-3">
									<h3 className="text-2xl font-bold text-theme-text">
										About This Template
									</h3>
									<ReadmeSourceBadge source={overviewDoc?.source || "manual"} />
								</div>
								<div
									className={markdownContentClassName}
									dangerouslySetInnerHTML={{
										__html: mdDescription,
									}}
								/>

								{/* GitHub Release Info */}
								<div className="mt-8 p-4 bg-theme-input border border-theme-border-input rounded-lg">
									<h4 className="text-lg font-bold text-theme-text mb-2">
										Source Repository
									</h4>
									<div className="flex flex-col gap-2">
										<a
											href={template.githubRepoUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="text-blue-400 hover:text-blue-300 no-underline flex items-center gap-2"
										>
											<span>📂</span> {template.githubRepoUrl}
										</a>
										<a
											href={template.githubReleaseUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="text-green-400 hover:text-green-300 no-underline flex items-center gap-2"
										>
											<span>🏷️</span> Release: v{template.defaultVersion}
										</a>
									</div>
								</div>
							</div>
						)}

						{activeTab === "features" &&
							template.features &&
							template.features.length > 0 && (
								<div className="bg-theme-card border border-theme-border rounded-xl p-8">
									<h3 className="text-2xl font-bold text-theme-text mb-6">
										Template Features
									</h3>
									<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
										{template.features.map((feature) => (
											<div
												key={feature}
												className="flex items-start gap-3 p-4 bg-theme-input rounded-lg"
											>
												<span className="text-green-400 text-xl">✓</span>
												<span className="text-theme-secondary">{feature}</span>
											</div>
										))}
									</div>
								</div>
							)}

						{activeTab === "plugins" && template.includedPlugins.length > 0 && (
							<div className="bg-theme-card border border-theme-border rounded-xl p-8">
								<h3 className="text-2xl font-bold text-theme-text mb-6">
									Pre-configured Plugins
								</h3>
								<p className="text-theme-muted mb-6">
									This template comes with the following plugins already set up
									and configured:
								</p>
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
									{template.includedPlugins.map((plugin) => (
										<div
											key={plugin}
											className="flex items-center gap-3 p-4 bg-theme-input rounded-lg hover:bg-theme-card transition-colors"
										>
											<span className="text-2xl">🔌</span>
											<span className="text-theme-text font-medium">
												{plugin}
											</span>
										</div>
									))}
								</div>
							</div>
						)}
					</div>

					{/* Author Info */}
					<div className="mt-12 bg-linear-to-r from-blue-500/10 to-green-500/10 border border-blue-500/20 rounded-xl p-6">
						<h3 className="text-lg font-bold text-theme-text mb-4">
							About the Author
						</h3>
						<a
							href={routes.profile(template.ownerId)}
							className="flex items-center gap-4 hover:opacity-80 transition-opacity"
						>
							<div className="w-16 h-16 bg-linear-to-br from-blue-500 to-green-600 rounded-full flex items-center justify-center text-2xl font-bold text-theme-text">
								{template.author.charAt(0).toUpperCase()}
							</div>
							<div>
								<div className="text-theme-text font-semibold">
									{template.author}
								</div>
								<div className="text-sm text-theme-muted">Template Creator</div>
								<div className="text-xs text-blue-400 mt-1">View Profile →</div>
							</div>
						</a>
					</div>
				</div>
			</section>
		</div>
	);
}

function ReadmeSourceBadge({ source }: { source: ReadmeSource }) {
	return (
		<span
			className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
				source === "repository"
					? "bg-green-500/15 text-green-400"
					: "bg-theme-input text-theme-muted"
			}`}
		>
			{source === "repository" ? "README from GitHub" : "Manual fallback"}
		</span>
	);
}
