import type { parsedTemplate } from "db/schema";
import MarkdownIt from "markdown-it";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GET as getGitHubAppStatus } from "@/actions/api/github/app";
import { POST as AIAssistantForMarkDown } from "@/actions/api/plugins/ai";
import {
	POST as createTemplate,
	GET as getTemplate,
	PUT as updateTemplate,
} from "@/actions/api/templates";
import { useAuth } from "@/hooks";
import { navigate, routes, searchParams } from "@/utils";
import { templateCategories } from "./common";

// ============================================================================
// TYPES
// ============================================================================
type TemplateFormData = parsedTemplate;

type AddModifyTemplatePageProps = {
	mode: "create" | "edit";
};

type GitHubAppStatus = {
	connected: boolean;
	installPath: string;
	isAuthenticated: boolean;
	isLoading: boolean;
	link: null | {
		githubLogin: string;
		installationState: "active" | "deleted" | "suspended";
	};
};

function extractGitHubRepoOwner(url: string): string | null {
	if (!url.trim()) {
		return null;
	}

	try {
		const candidate = url.includes("://") ? url : `https://github.com/${url}`;
		const parsed = new URL(candidate);
		if (!/(^|\.)github\.com$/i.test(parsed.hostname)) {
			return null;
		}

		const segments = parsed.pathname.split("/").filter(Boolean);
		return segments[0] || null;
	} catch {
		return null;
	}
}

const emojiCategories = {
	Projects: ["📁", "📂", "🚀", "⚡", "✨", "💼", "🎯", "🏗️"],
	"Tech & Tools": ["⚙️", "🛠️", "🔧", "⚒️", "🔩", "⛏️", "🪛", "🔨"],
	"UI & Design": ["🎨", "🖌️", "✏️", "📐", "📏", "🖍️", "🎭", "🌈"],
	"Data & Files": ["📄", "📊", "📈", "📉", "💾", "💿", "📦", "🗃️"],
	"Network & Cloud": ["☁️", "🌐", "📡", "🛰️", "📶", "🔗", "🌩️", "⛅"],
	"Code & Dev": ["💻", "⌨️", "🖥️", "📱", "🔢", "🧮", "⚛️", "🐛"],
	"Content & Media": ["📝", "📰", "📚", "🎬", "🎵", "🖼️", "📷", "🎥"],
	Commerce: ["🛒", "💳", "💰", "🏪", "🛍️", "📦", "🚚", "💵"],
	Symbols: ["✅", "❌", "❓", "❗", "⚡", "💡", "🎁", "📌"],
};

const initialFormData: Partial<TemplateFormData> = {
	name: "",
	description: "",
	longDescription: "",
	icon: "📁",
	author: "",
	category: "fullstack",
	tags: [],
	published: false,
	githubReleaseUrl: "",
	githubRepoUrl: "",
	defaultVersion: "",
	installation: "",
	features: [],
	includedPlugins: [],
	previewUrl: "",
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function AddModifyTemplatePage({
	mode,
}: AddModifyTemplatePageProps) {
	const templateId = searchParams("id");
	const isEditMode = mode === "edit" && !!templateId;

	const [formData, setFormData] =
		useState<Partial<TemplateFormData>>(initialFormData);
	const [tagInput, setTagInput] = useState("");
	const [featureInput, setFeatureInput] = useState("");
	const [pluginInput, setPluginInput] = useState("");
	const [errors, setErrors] = useState<
		Partial<Record<keyof TemplateFormData, string>>
	>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitSuccess, setSubmitSuccess] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [showEmojiPicker, setShowEmojiPicker] = useState(false);
	const [githubAppStatus, setGitHubAppStatus] = useState<GitHubAppStatus>({
		connected: false,
		installPath: "/api/github/app/install?returnTo=%2Ftemplates%2Fadd",
		isAuthenticated: false,
		isLoading: true,
		link: null,
	});
	const [aiFormatting, setAiFormatting] = useState({
		isLoading: false,
		lastUsed: 0,
		modalOpen: false,
		result: "",
		targetField: "longDescription" as keyof TemplateFormData,
	});

	const auth = useAuth();
	const categories = useMemo(
		() => templateCategories().filter((c) => c.id !== "all"),
		[],
	);
	const md = useMemo(
		() =>
			new MarkdownIt({
				html: false,
				linkify: true,
				typographer: true,
			}),
		[],
	);
	const toMD = useCallback((text: string) => md.render(text), [md]);
	const templateEditorReturnTo = useMemo(
		() =>
			templateId ? routes.editTemplate(templateId) : routes.createTemplate,
		[templateId],
	);
	const githubInstallPath = useMemo(
		() =>
			`/api/github/app/install?returnTo=${encodeURIComponent(templateEditorReturnTo)}`,
		[templateEditorReturnTo],
	);
	const linkedGitHubLogin = githubAppStatus.link?.githubLogin || null;
	const repositoryOwner = useMemo(
		() => extractGitHubRepoOwner(formData.githubRepoUrl || ""),
		[formData.githubRepoUrl],
	);
	const repositoryOwnerMismatch =
		!!repositoryOwner &&
		!!linkedGitHubLogin &&
		repositoryOwner.toLowerCase() !== linkedGitHubLogin.toLowerCase();

	const loadGitHubStatus = useCallback(async () => {
		try {
			const response = await getGitHubAppStatus();
			setGitHubAppStatus({
				connected: response.connected,
				installPath: githubInstallPath,
				isAuthenticated: response.isAuthenticated,
				isLoading: false,
				link: response.link
					? {
							githubLogin: response.link.githubLogin,
							installationState: response.link.installationState,
						}
					: null,
			});
		} catch {
			setGitHubAppStatus((prev) => ({
				...prev,
				installPath: githubInstallPath,
				isLoading: false,
			}));
		}
	}, [githubInstallPath]);

	const loadTemplate = useCallback(async (id: string) => {
		try {
			const response = await getTemplate({ id });

			if (
				response.success &&
				response.templates &&
				response.templates.length > 0
			) {
				const template = response.templates[0];
				if (template) {
					setFormData({
						id: template.id,
						name: template.name,
						icon: template.icon,
						description: template.description,
						longDescription: template.longDescription || "",
						author: template.author,
						category: template.category,
						tags: template.tags,
						published: template.published || false,
						githubReleaseUrl: template.githubReleaseUrl,
						githubRepoUrl: template.githubRepoUrl,
						defaultVersion: template.defaultVersion,
						installation: template.installation || "",
						features: template.features || [],
						includedPlugins: template.includedPlugins || [],
						previewUrl: template.previewUrl || "",
					});
				}
			} else {
				console.error("Failed to load template:", response.message);
				navigate(routes.dashboard);
			}
		} catch (error) {
			console.error("Error loading template:", error);
			navigate(routes.dashboard);
		}
	}, []);

	// Check authentication and load template if in edit mode
	useEffect(() => {
		if (!auth.isLoaded) {
			return;
		}

		if (!auth.isAuthenticated) {
			auth.login();
			return;
		}

		loadGitHubStatus();

		if (isEditMode && templateId) {
			setIsLoading(true);
			loadTemplate(templateId).finally(() => setIsLoading(false));
			return;
		}

		setIsLoading(false);
	}, [auth, isEditMode, loadGitHubStatus, loadTemplate, templateId]);

	const updateField = useCallback(
		(
			field: keyof TemplateFormData,
			value: TemplateFormData[keyof TemplateFormData] | undefined,
		) => {
			setFormData((prev) => ({ ...prev, [field]: value }));
			if (errors[field]) {
				setErrors((prev) => {
					const newErrors = { ...prev };
					delete newErrors[field];
					return newErrors;
				});
			}
		},
		[errors],
	);

	const addTag = useCallback(() => {
		const tag = tagInput.trim().toLowerCase();
		if (tag && !(formData.tags || []).includes(tag)) {
			setFormData((prev) => ({
				...prev,
				tags: [...(prev.tags || []), tag],
			}));
			setTagInput("");
		}
	}, [tagInput, formData.tags]);

	const removeTag = useCallback((tagToRemove: string) => {
		setFormData((prev) => ({
			...prev,
			tags: (prev.tags || []).filter((tag) => tag !== tagToRemove),
		}));
	}, []);

	const addFeature = useCallback(() => {
		const feature = featureInput.trim();
		if (feature && !(formData.features || []).includes(feature)) {
			setFormData((prev) => ({
				...prev,
				features: [...(prev.features || []), feature],
			}));
			setFeatureInput("");
		}
	}, [featureInput, formData.features]);

	const removeFeature = useCallback((featureToRemove: string) => {
		setFormData((prev) => ({
			...prev,
			features: (prev.features || []).filter((f) => f !== featureToRemove),
		}));
	}, []);

	const addPlugin = useCallback(() => {
		const plugin = pluginInput.trim();
		if (plugin && !(formData.includedPlugins || []).includes(plugin)) {
			setFormData((prev) => ({
				...prev,
				includedPlugins: [...(prev.includedPlugins || []), plugin],
			}));
			setPluginInput("");
		}
	}, [pluginInput, formData.includedPlugins]);

	const removePlugin = useCallback((pluginToRemove: string) => {
		setFormData((prev) => ({
			...prev,
			includedPlugins: (prev.includedPlugins || []).filter(
				(p) => p !== pluginToRemove,
			),
		}));
	}, []);

	const validate = useCallback((): boolean => {
		const newErrors: Partial<Record<keyof TemplateFormData, string>> = {};

		if (!formData.name?.trim()) {
			newErrors.name = "Template name is required";
		}
		if (!formData.description?.trim()) {
			newErrors.description = "Short description is required";
		}
		if (!formData.author?.trim()) {
			newErrors.author = "Author name is required";
		}
		if (!formData.githubRepoUrl?.trim()) {
			newErrors.githubRepoUrl = "GitHub repository URL is required";
		}
		if ((formData.tags || []).length === 0) {
			newErrors.tags = "At least one tag is required";
		}

		setErrors(newErrors);
		return Object.keys(newErrors).length === 0;
	}, [formData]);

	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();

			if (!validate()) {
				return;
			}

			if (!githubAppStatus.connected) {
				setErrors((prev) => ({
					...prev,
					githubRepoUrl:
						"Install and link the GitHub App before saving a template repository.",
				}));
				return;
			}

			if (repositoryOwnerMismatch && linkedGitHubLogin) {
				setErrors((prev) => ({
					...prev,
					githubRepoUrl: `GitHub repository owner must match your linked GitHub account (${linkedGitHubLogin}).`,
				}));
				return;
			}

			setIsSubmitting(true);

			try {
				let response:
					| Awaited<ReturnType<typeof createTemplate>>
					| Awaited<ReturnType<typeof updateTemplate>>;

				if (isEditMode && templateId && formData.id) {
					// Update existing template
					response = await updateTemplate({
						id: formData.id,
						name: formData.name,
						icon: formData.icon,
						description: formData.description,
						longDescription: formData.longDescription,
						author: formData.author,
						category: formData.category,
						tags: formData.tags,
						published: formData.published,
						githubRepoUrl: formData.githubRepoUrl,
						installation: formData.installation,
						features: formData.features,
						includedPlugins: formData.includedPlugins,
						previewUrl: formData.previewUrl,
					});
				} else {
					// Create new template
					const name = formData.name?.trim() || "";
					const description = formData.description?.trim() || "";
					const author = formData.author?.trim() || "";
					const category = formData.category || "fullstack";
					const githubRepoUrl = formData.githubRepoUrl?.trim() || "";

					response = await createTemplate({
						name,
						icon: formData.icon || "📁",
						description,
						longDescription: formData.longDescription || null,
						author,
						category,
						tags: formData.tags || [],
						published: formData.published || false,
						githubRepoUrl,
						installation: formData.installation || null,
						features: formData.features || null,
						includedPlugins: formData.includedPlugins || [],
						previewUrl: formData.previewUrl || null,
					});
				}

				if (response.success) {
					setSubmitSuccess(true);
					setTimeout(() => {
						navigate(routes.dashboard);
					}, 2000);
				} else {
					const errorMsg = isEditMode
						? ("error" in response ? response.error : undefined) ||
							response.message ||
							"Failed to update template"
						: response.message || "Failed to create template";
					setErrors({ name: errorMsg });
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Failed to submit template";
				console.error("Failed to submit template:", error);
				setErrors({ name: message });
			} finally {
				setIsSubmitting(false);
			}
		},
		[
			formData,
			githubAppStatus.connected,
			isEditMode,
			linkedGitHubLogin,
			repositoryOwnerMismatch,
			templateId,
			validate,
		],
	);

	const formatMarkDownWithAi = useCallback(
		async (text: string, fieldName: keyof TemplateFormData) => {
			// Rate limiting check (60 seconds)
			const now = Date.now();
			if (now - aiFormatting.lastUsed < 60000) {
				const remainingTime = Math.ceil(
					(60000 - (now - aiFormatting.lastUsed)) / 1000,
				);
				alert(
					`Please wait ${remainingTime} seconds before using AI formatting again.`,
				);
				return;
			}

			setAiFormatting((prev) => ({
				...prev,
				isLoading: true,
				targetField: fieldName,
			}));

			try {
				const response = await AIAssistantForMarkDown(text);

				if (response.success) {
					setAiFormatting((prev) => ({
						...prev,
						isLoading: false,
						result: response.result.response,
						modalOpen: true,
						lastUsed: now,
					}));
				} else {
					setAiFormatting((prev) => ({ ...prev, isLoading: false }));
					alert(response.errors.join("\n") || "Failed to format with AI.");
				}
			} catch {
				setAiFormatting((prev) => ({ ...prev, isLoading: false }));
				alert("An error occurred while formatting with AI.");
			}
		},
		[aiFormatting.lastUsed],
	);

	const handleAcceptAiFormat = useCallback(() => {
		if (aiFormatting.result && aiFormatting.targetField) {
			updateField(aiFormatting.targetField, aiFormatting.result);
		}
		setAiFormatting((prev) => ({
			...prev,
			modalOpen: false,
			result: "",
			targetField: "longDescription" as keyof TemplateFormData,
		}));
	}, [aiFormatting.result, aiFormatting.targetField, updateField]);

	const handleRejectAiFormat = useCallback(() => {
		setAiFormatting((prev) => ({
			...prev,
			modalOpen: false,
			result: "",
			targetField: "longDescription" as keyof TemplateFormData,
		}));
	}, []);

	return (
		<div className="min-h-screen bg-theme-bg py-12">
			<div className="max-w-4xl mx-auto px-6">
				{/* Loading State */}
				{isLoading && (
					<div className="flex items-center justify-center min-h-[60vh]">
						<div className="text-theme-text text-xl">Loading...</div>
					</div>
				)}

				{!isLoading && (
					<>
						{/* Header */}
						<div className="mb-8">
							<a href="/templates">
								<button
									type="button"
									className="text-theme-muted hover:text-theme-text transition-colors mb-4 flex items-center gap-2"
								>
									← Back to Templates
								</button>
							</a>
							<h1 className="text-4xl font-black text-theme-text mb-2">
								{isEditMode ? "Edit Template" : "Create New Template"}
							</h1>
							<p className="text-theme-muted">
								{isEditMode
									? "Update your template information below"
									: "Share your project boilerplate with the Frame-Master community"}
							</p>
						</div>

						{/* Success Message */}
						{submitSuccess && (
							<div className="mb-6 p-4 bg-green-500/15 border border-green-500 rounded-lg">
								<p className="text-green-500 font-semibold">
									✓ Template {isEditMode ? "updated" : "created"} successfully!
									Redirecting...
								</p>
							</div>
						)}

						{/* Form */}
						<form onSubmit={handleSubmit} className="space-y-8">
							{/* Basic Information */}
							<Section title="Basic Information">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<FormField label="Template Name" required error={errors.name}>
										<input
											type="text"
											value={formData.name}
											onChange={(e) => updateField("name", e.target.value)}
											placeholder="Next.js Style Starter"
											className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors"
										/>
									</FormField>

									<FormField
										label="Icon (Emoji)"
										error={errors.icon}
										actionButton={
											<button
												type="button"
												onClick={() => setShowEmojiPicker(!showEmojiPicker)}
												className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-semibold rounded-md hover:bg-blue-500/30 hover:text-blue-300 transition-colors border border-blue-500/30"
											>
												{showEmojiPicker ? "Close" : "Pick Emoji"}
											</button>
										}
									>
										<div className="relative">
											<input
												type="text"
												value={formData.icon}
												onChange={(e) => updateField("icon", e.target.value)}
												placeholder="📁"
												maxLength={2}
												className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors pr-24"
											/>

											{showEmojiPicker && (
												<div className="absolute z-50 mt-2 w-full max-w-md bg-theme-card border border-theme-border rounded-lg shadow-xl max-h-96 overflow-y-auto">
													{Object.entries(emojiCategories).map(
														([category, emojis]) => (
															<div
																key={category}
																className="p-3 border-b border-theme-border last:border-b-0"
															>
																<div className="text-xs font-semibold text-theme-muted mb-2">
																	{category}
																</div>
																<div className="grid grid-cols-8 gap-2">
																	{emojis.map((emoji) => (
																		<button
																			key={emoji}
																			type="button"
																			onClick={() => {
																				updateField("icon", emoji);
																				setShowEmojiPicker(false);
																			}}
																			className="text-2xl hover:bg-blue-500/20 rounded p-1 transition-colors"
																			title={emoji}
																		>
																			{emoji}
																		</button>
																	))}
																</div>
															</div>
														),
													)}
												</div>
											)}
										</div>
									</FormField>

									<FormField
										label="Version Sync"
										hint="Latest version and release URL are resolved from GitHub releases on save and updated automatically by GitHub webhooks"
									>
										<div className="rounded-lg border border-theme-border bg-theme-input px-4 py-3 text-sm text-theme-secondary">
											<div className="font-semibold text-theme-text">
												{formData.defaultVersion
													? `Current latest version: ${formData.defaultVersion}`
													: "No version synced yet"}
											</div>
											<p className="mt-2 text-theme-muted">
												Save this template to sync its latest published GitHub
												release.
											</p>
											{formData.githubReleaseUrl && (
												<p className="mt-2 break-all font-mono text-xs text-blue-400">
													{formData.githubReleaseUrl}
												</p>
											)}
										</div>
									</FormField>

									<FormField label="Author" required error={errors.author}>
										<input
											type="text"
											value={formData.author}
											onChange={(e) => updateField("author", e.target.value)}
											placeholder="Your Name or Organization"
											className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors"
										/>
									</FormField>

									<FormField label="Category" required error={errors.category}>
										<select
											value={formData.category}
											onChange={(e) => updateField("category", e.target.value)}
											className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text focus:outline-none focus:border-blue-500 transition-colors"
										>
											{categories.map((cat) => (
												<option key={cat.id} value={cat.id}>
													{cat.icon} {cat.name}
												</option>
											))}
										</select>
									</FormField>
								</div>

								<FormField
									label="Short Description"
									required
									error={errors.description}
									hint="A brief one-line description (max 150 characters)"
								>
									<input
										type="text"
										value={formData.description}
										onChange={(e) => updateField("description", e.target.value)}
										placeholder="A full-stack starter with authentication, database, and API ready..."
										maxLength={150}
										className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors"
									/>
								</FormField>

								<FormField
									label="Tags"
									required
									error={errors.tags}
									hint="Press Enter or click Add to add tags"
								>
									<div className="space-y-2">
										<div className="flex gap-2">
											<input
												type="text"
												value={tagInput}
												onChange={(e) => setTagInput(e.target.value)}
												onKeyPress={(e) => {
													if (e.key === "Enter") {
														e.preventDefault();
														addTag();
													}
												}}
												placeholder="react, typescript, auth..."
												className="flex-1 px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors"
											/>
											<button
												type="button"
												onClick={addTag}
												className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors"
											>
												Add
											</button>
										</div>
										{(formData.tags || []).length > 0 && (
											<div className="flex flex-wrap gap-2">
												{(formData.tags || []).map((tag) => (
													<span
														key={tag}
														className="px-3 py-1 bg-blue-500/15 text-blue-500 rounded-md text-sm font-semibold flex items-center gap-2"
													>
														{tag}
														<button
															type="button"
															onClick={() => removeTag(tag)}
															className="hover:text-blue-400"
														>
															×
														</button>
													</span>
												))}
											</div>
										)}
									</div>
								</FormField>

								<FormField
									label="Publication Status"
									error={errors.published}
									hint="Check to make your template publicly available"
								>
									<label className="flex items-center gap-3 cursor-pointer">
										<input
											type="checkbox"
											checked={formData.published || false}
											onChange={(e) =>
												updateField("published", e.target.checked)
											}
											className="w-5 h-5 bg-theme-card border border-theme-border rounded focus:ring-blue-500 focus:ring-2 text-blue-500"
										/>
										<span className="text-theme-text font-medium">
											Publish template (make it publicly available)
										</span>
									</label>
								</FormField>
							</Section>

							{/* GitHub Information */}
							<Section title="GitHub Repository">
								<div className="space-y-6">
									<FormField
										label="GitHub Repository URL"
										required
										error={errors.githubRepoUrl}
										hint="Repository root used for release syncing and README details"
									>
										<div className="space-y-3">
											<input
												type="url"
												value={formData.githubRepoUrl || ""}
												onChange={(e) =>
													updateField("githubRepoUrl", e.target.value)
												}
												placeholder="https://github.com/username/template-repo"
												className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors"
											/>

											<div
												className={`rounded-lg border px-4 py-3 text-sm ${
													githubAppStatus.isLoading
														? "border-theme-border bg-theme-input text-theme-muted"
														: githubAppStatus.connected
															? repositoryOwnerMismatch
																? "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
																: "border-green-500/40 bg-green-500/10 text-green-300"
															: "border-red-500/40 bg-red-500/10 text-red-300"
												}`}
											>
												{githubAppStatus.isLoading ? (
													<span>Checking GitHub App status...</span>
												) : githubAppStatus.connected && linkedGitHubLogin ? (
													<div className="space-y-1">
														<div className="font-semibold">
															Linked GitHub account: @{linkedGitHubLogin}
														</div>
														<div>
															{repositoryOwnerMismatch
																? `The current repository owner (${repositoryOwner}) does not match your linked GitHub account.`
																: "Template repositories must be owned by this linked GitHub account."}
														</div>
													</div>
												) : (
													<div className="space-y-2">
														<div className="font-semibold">
															GitHub App not linked
														</div>
														<div>
															Install the GitHub App before saving a template so
															releases can update versions automatically.
														</div>
														<a
															href={githubInstallPath}
															className="inline-flex items-center gap-2 font-semibold text-white no-underline"
														>
															Install GitHub App →
														</a>
													</div>
												)}
											</div>
										</div>
									</FormField>

									<FormField
										label="Live Preview URL"
										error={errors.previewUrl}
										hint="Optional: A deployed demo of the template"
									>
										<input
											type="url"
											value={formData.previewUrl || ""}
											onChange={(e) =>
												updateField("previewUrl", e.target.value)
											}
											placeholder="https://template-demo.example.com"
											className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors"
										/>
									</FormField>
								</div>
							</Section>

							{/* Template Details */}
							<Section title="Template Details">
								<div className="space-y-6">
									<FormField
										label="Long Description"
										error={errors.longDescription}
										hint="Manual fallback for template details. If the repository has a README.md, it is shown first on the template page."
										actionButton={
											formData.longDescription && (
												<button
													type="button"
													disabled={aiFormatting.isLoading}
													onClick={() => {
														if (formData.longDescription) {
															formatMarkDownWithAi(
																formData.longDescription,
																"longDescription",
															);
														}
													}}
													className="px-3 py-1 bg-purple-500/20 text-purple-400 text-xs font-semibold rounded-md hover:bg-purple-500/30 hover:text-purple-300 transition-colors border border-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
												>
													{aiFormatting.isLoading &&
													aiFormatting.targetField === "longDescription" ? (
														<>⏳ Formatting...</>
													) : (
														<>✨ Format with AI</>
													)}
												</button>
											)
										}
									>
										<div className="space-y-4">
											<textarea
												value={formData.longDescription || ""}
												onChange={(e) =>
													updateField("longDescription", e.target.value)
												}
												placeholder="This template provides... 

# What's Included
- **Authentication**: Pre-configured auth with Supabase
- **Database**: D1 with Drizzle ORM
- **Styling**: Tailwind CSS 4.x

## Getting Started
Clone and run `bun install` to get started."
												rows={8}
												className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors resize-vertical"
											/>
											{formData.longDescription && (
												<div>
													<div className="text-sm font-semibold text-theme-secondary mb-2">
														Preview:
													</div>
													<div
														className="prose prose-invert max-w-none bg-theme-input border border-theme-border-input rounded-lg p-4"
														dangerouslySetInnerHTML={{
															__html: toMD(formData.longDescription),
														}}
													/>
												</div>
											)}
										</div>
									</FormField>

									<FormField
										label="Installation Command"
										error={errors.installation}
										hint="Command to create a new project from this template"
									>
										<input
											type="text"
											value={formData.installation || ""}
											onChange={(e) =>
												updateField("installation", e.target.value)
											}
											placeholder="frame-master create --template your-template"
											className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
										/>
									</FormField>

									<FormField
										label="Features"
										error={errors.features}
										hint="List the key features of your template"
									>
										<div className="space-y-2">
											<div className="flex gap-2">
												<input
													type="text"
													value={featureInput}
													onChange={(e) => setFeatureInput(e.target.value)}
													onKeyPress={(e) => {
														if (e.key === "Enter") {
															e.preventDefault();
															addFeature();
														}
													}}
													placeholder="Pre-configured authentication with Supabase"
													className="flex-1 px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors"
												/>
												<button
													type="button"
													onClick={addFeature}
													className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors"
												>
													Add
												</button>
											</div>
											{(formData.features || []).length > 0 && (
												<div className="space-y-2">
													{(formData.features || []).map((feature, idx) => (
														<div
															key={idx}
															className="flex items-center justify-between bg-theme-input border border-theme-border-input rounded-lg p-3"
														>
															<div className="flex items-center gap-2">
																<span className="text-green-400">✓</span>
																<span className="text-theme-secondary">
																	{feature}
																</span>
															</div>
															<button
																type="button"
																onClick={() => removeFeature(feature)}
																className="text-red-400 hover:text-red-300 transition-colors"
															>
																×
															</button>
														</div>
													))}
												</div>
											)}
										</div>
									</FormField>

									<FormField
										label="Included Plugins"
										error={errors.includedPlugins}
										hint="List the Frame-Master plugins included in this template"
									>
										<div className="space-y-2">
											<div className="flex gap-2">
												<input
													type="text"
													value={pluginInput}
													onChange={(e) => setPluginInput(e.target.value)}
													onKeyPress={(e) => {
														if (e.key === "Enter") {
															e.preventDefault();
															addPlugin();
														}
													}}
													placeholder="frame-master-plugin-react-to-html"
													className="flex-1 px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
												/>
												<button
													type="button"
													onClick={addPlugin}
													className="px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors"
												>
													Add
												</button>
											</div>
											{(formData.includedPlugins || []).length > 0 && (
												<div className="flex flex-wrap gap-2">
													{(formData.includedPlugins || []).map(
														(plugin, idx) => (
															<span
																key={idx}
																className="px-3 py-1 bg-purple-500/15 text-purple-400 rounded-md text-sm font-semibold flex items-center gap-2 font-mono"
															>
																🔌 {plugin}
																<button
																	type="button"
																	onClick={() => removePlugin(plugin)}
																	className="hover:text-purple-300"
																>
																	×
																</button>
															</span>
														),
													)}
												</div>
											)}
										</div>
									</FormField>
								</div>
							</Section>

							{/* Submit Buttons */}
							<div className="flex gap-4 pt-6 border-t border-theme-border">
								<button
									type="submit"
									disabled={isSubmitting || submitSuccess}
									className="flex-1 px-8 py-3.5 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{isSubmitting
										? "Submitting..."
										: submitSuccess
											? "Success!"
											: isEditMode
												? "Update Template"
												: "Create Template"}
								</button>
								<a href="/templates">
									<button
										type="button"
										disabled={isSubmitting}
										className="px-8 py-3.5 bg-transparent text-theme-secondary border-2 border-theme-border-input font-semibold rounded-xl hover:border-blue-500 hover:bg-blue-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
									>
										Cancel
									</button>
								</a>
							</div>
						</form>
					</>
				)}

				{/* AI Format Result Modal */}
				{aiFormatting.modalOpen && (
					<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
						<div className="bg-theme-card border border-theme-border rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
							<div className="p-6 border-b border-theme-border">
								<h3 className="text-xl font-bold text-theme-text mb-2">
									AI Formatting Result
								</h3>
								<p className="text-theme-muted text-sm">
									Review the AI-formatted content below. Click "Accept" to apply
									the changes.
								</p>
							</div>

							<div className="p-6 max-h-[60vh] overflow-y-auto">
								<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
									<div>
										<h4 className="text-sm font-semibold text-theme-secondary mb-3">
											Original:
										</h4>
										<div className="bg-theme-input border border-theme-border-input rounded-lg p-4 max-h-80 overflow-y-auto">
											<pre className="text-sm text-theme-secondary whitespace-pre-wrap font-mono">
												{formData[aiFormatting.targetField] as string}
											</pre>
										</div>
									</div>

									<div>
										<h4 className="text-sm font-semibold text-theme-secondary mb-3">
											AI Formatted:
										</h4>
										<div className="bg-theme-input border border-theme-border-input rounded-lg p-4 max-h-80 overflow-y-auto">
											{aiFormatting.targetField === "longDescription" ? (
												<div
													className="prose prose-invert prose-sm max-w-none"
													dangerouslySetInnerHTML={{
														__html: toMD(aiFormatting.result),
													}}
												/>
											) : (
												<pre className="text-sm text-theme-secondary whitespace-pre-wrap font-mono">
													{aiFormatting.result}
												</pre>
											)}
										</div>
									</div>
								</div>
							</div>

							<div className="p-6 border-t border-theme-border flex gap-4">
								<button
									type="button"
									onClick={handleAcceptAiFormat}
									className="flex-1 px-6 py-3 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors"
								>
									✓ Accept Changes
								</button>
								<button
									type="button"
									onClick={handleRejectAiFormat}
									className="flex-1 px-6 py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors"
								>
									✗ Reject
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// ============================================================================
// COMPONENTS
// ============================================================================
function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="bg-theme-card border border-theme-border rounded-xl p-6">
			<h2 className="text-2xl font-bold text-theme-text mb-6">{title}</h2>
			<div className="space-y-6">{children}</div>
		</div>
	);
}

function FormField({
	label,
	required,
	error,
	hint,
	actionButton,
	children,
	htmlFor,
}: {
	label: string;
	required?: boolean;
	error?: string;
	hint?: string;
	actionButton?: React.ReactNode;
	children: React.ReactNode;
	htmlFor?: string;
}) {
	return (
		<div>
			<label
				className="block text-sm font-semibold text-theme-secondary mb-2"
				htmlFor={htmlFor}
			>
				{label}
				{required && <span className="text-red-500 ml-1">*</span>}
				{actionButton && <span className="float-right">{actionButton}</span>}
			</label>
			{children}
			{hint && !error && (
				<p className="text-xs text-theme-disabled mt-1">{hint}</p>
			)}
			{error && <p className="text-xs text-red-500 mt-1">{error}</p>}
		</div>
	);
}
