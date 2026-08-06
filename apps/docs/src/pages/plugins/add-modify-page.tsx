import type { parsedPlugin } from "db/schema";
import MarkdownIt from "markdown-it";
import { useCallback, useMemo, useState } from "react";
import { GET as getGitHubAppStatus } from "@/actions/api/github/app";
import {
	POST as createPlugin,
	GET as getPlugin,
	PUT as updatePlugin,
} from "@/actions/api/plugins";
import { POST as AIAssistantForMarkDown } from "@/actions/api/plugins/ai";
import { GET as getPluginVersions } from "@/actions/api/plugins/versions";
import { CodeBlockWithTheme } from "@/components/codeblock";
import { useAuthEffect } from "@/hooks";
import { navigate, routes, searchParams } from "@/utils";
import { pluginCategories } from "./common";

// ============================================================================
// TYPES
// ============================================================================
type PluginFormData = parsedPlugin;

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
	Common: ["🔌", "⚡", "🚀", "⭐", "✨", "💎", "🎯", "🔥"],
	"Tech & Tools": ["⚙️", "🛠️", "🔧", "⚒️", "🔩", "⛏️", "🪛", "🔨"],
	"UI & Design": ["🎨", "🖌️", "✏️", "📐", "📏", "🖍️", "🎭", "🌈"],
	"Data & Files": ["📁", "📂", "📄", "📊", "📈", "📉", "💾", "💿", "📦"],
	"Network & Cloud": ["☁️", "🌐", "📡", "🛰️", "📶", "🔗", "🌩️", "⛅"],
	"Code & Dev": ["💻", "⌨️", "🖥️", "📱", "🔢", "🧮", "⚛️", "🐛"],
	Security: ["🔒", "🔐", "🔑", "🛡️", "🔏", "🚨", "⚠️"],
	"Time & Speed": ["⏱️", "⏰", "⏲️", "⌛", "⏳", "⚡", "💨", "🏃"],
	Communication: ["💬", "📨", "📧", "📮", "📬", "📭", "📫", "📪"],
	Navigation: ["🧭", "🗺️", "📍", "🎯", "🚦", "🔀", "🔁", "🔄"],
	Science: ["🔬", "🔭", "🧪", "🧬", "⚗️", "🌡️", "📡", "🔭"],
	Nature: ["🌟", "💫", "🌙", "☀️", "🌍", "🌊", "🔥", "💧"],
	Symbols: ["✅", "❌", "❓", "❗", "⚡", "💡", "🎁", "📌"],
};

const initialFormData: Partial<PluginFormData> = {
	name: "",
	description: "",
	version: "",
	tags: [],
	compatibleVersions: "^2.0.0",
	published: false,
	icon: "🔌",
	author: "",
	category: "utilities",
	npmPackage: "",
	githubUrl: "",
	docsUrl: "",
	longDescription: "",
	installation: "",
	quickStart: "",
	configuration: "",
	dependencies: [],
	upvote: 0,
	downvote: 0,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function AddModifyPluginPage() {
	const pluginId = searchParams("id");
	const isEditMode = !!pluginId;

	const [formData, setFormData] =
		useState<Partial<PluginFormData>>(initialFormData);
	const [tagInput, setTagInput] = useState("");
	const [errors, setErrors] = useState<
		Partial<Record<keyof PluginFormData, string>>
	>({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitSuccess, setSubmitSuccess] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [showEmojiPicker, setShowEmojiPicker] = useState(false);
	const [dependencyInput, setDependencyInput] = useState({
		name: "",
		version: "",
	});
	const [versionList, setVersionList] = useState<string[]>([]);
	const [isLoadingVersions, setIsLoadingVersions] = useState(false);
	const [githubAppStatus, setGitHubAppStatus] = useState<GitHubAppStatus>({
		connected: false,
		installPath: "/api/github/app/install?returnTo=%2Fplugins%2Fadd",
		isAuthenticated: false,
		isLoading: true,
		link: null,
	});
	const [aiFormatting, setAiFormatting] = useState({
		isLoading: false,
		lastUsed: 0,
		modalOpen: false,
		result: "",
		targetField: "name" as keyof PluginFormData,
	});
	const categories = useMemo(pluginCategories, []);
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
	const toNpmPackageUrl = useCallback(
		(value: string) =>
			value.includes("npmjs.com/package/")
				? value
				: `https://www.npmjs.com/package/${value}`,
		[],
	);
	const pluginEditorReturnTo = useMemo(
		() => (pluginId ? routes.editPlugin(pluginId) : routes.createPlugin),
		[pluginId],
	);
	const githubInstallPath = useMemo(
		() =>
			`/api/github/app/install?returnTo=${encodeURIComponent(pluginEditorReturnTo)}`,
		[pluginEditorReturnTo],
	);
	const linkedGitHubLogin = githubAppStatus.link?.githubLogin || null;
	const repositoryOwner = useMemo(
		() => extractGitHubRepoOwner(formData.githubUrl || ""),
		[formData.githubUrl],
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

	useAuthEffect(() => {
		loadGitHubStatus();
		if (isEditMode && pluginId) {
			loadPlugin(pluginId).finally(() => setIsLoading(false));
		} else setIsLoading(false);
	}, [isEditMode, loadGitHubStatus, pluginId]);

	const loadPlugin = useCallback(
		async (id: string) => {
			try {
				const response = await getPlugin({ id });

				if (
					response.success &&
					response.plugins &&
					response.plugins.length > 0
				) {
					const plugin = response.plugins[0];
					if (plugin) {
						setIsLoadingVersions(true);
						setFormData({
							id: plugin.id,
							name: plugin.name,
							icon: plugin.icon,
							description: plugin.description,
							version: plugin.version,
							author: plugin.author,
							category: plugin.category,
							tags: plugin.tags,
							npmPackage: toNpmPackageUrl(plugin.npmPackage),
							githubUrl: plugin.githubUrl || "",
							docsUrl: plugin.docsUrl || "",
							longDescription: plugin.longDescription || "",
							installation: plugin.installation || "",
							quickStart: plugin.quickStart || "",
							configuration: plugin.configuration || "",
							compatibleVersions: plugin.compatibleVersions,
							published: plugin.published || false,
							dependencies: plugin.dependencies || [],
							upvote: plugin.upvote,
							downvote: plugin.downvote,
						});

						const versionsResponse = await getPluginVersions({ id: plugin.id });
						if (versionsResponse.success) {
							setVersionList(versionsResponse.versions);
						}
					}
				} else {
					console.error("Failed to load plugin:", response.message);
					navigate("/dashboard");
				}
			} catch (error) {
				console.error("Error loading plugin:", error);
				navigate("/dashboard");
			} finally {
				setIsLoadingVersions(false);
			}
		},
		[toNpmPackageUrl],
	);

	const updateField = useCallback(
		(field: keyof PluginFormData, value: unknown) => {
			setFormData((prev) => ({ ...prev, [field]: value }));
			// Clear error for this field when user starts typing
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

	const addDependency = useCallback(() => {
		const pluginName = dependencyInput.name.trim();
		const version = dependencyInput.version.trim();

		if (pluginId && version) {
			const newDep = { pluginName, version };
			const currentDeps = formData.dependencies || [];

			// Check if dependency already exists (by pluginId)
			const existingIndex = currentDeps.findIndex(
				(dep) => dep.pluginName === pluginId,
			);

			if (existingIndex >= 0) {
				// Update existing dependency
				const updatedDeps = [...currentDeps];
				updatedDeps[existingIndex] = newDep;
				setFormData((prev) => ({
					...prev,
					dependencies: updatedDeps,
				}));
			} else {
				// Add new dependency
				setFormData((prev) => ({
					...prev,
					dependencies: [...currentDeps, newDep],
				}));
			}

			setDependencyInput({ name: "", version: "" });
		}
	}, [dependencyInput, pluginId, formData.dependencies]);

	const removeDependency = useCallback((pluginIdToRemove: string) => {
		setFormData((prev) => ({
			...prev,
			dependencies: (prev.dependencies || []).filter(
				(dep) => dep.pluginName !== pluginIdToRemove,
			),
		}));
	}, []);

	const validate = useCallback((): boolean => {
		const newErrors: Partial<Record<keyof PluginFormData, string>> = {};

		if (!formData.name?.trim()) {
			newErrors.name = "Plugin name is required";
		}
		if (!formData.description?.trim()) {
			newErrors.description = "Short description is required";
		}
		if (!formData.author?.trim()) {
			newErrors.author = "Author name is required";
		}
		if (!formData.npmPackage?.trim()) {
			newErrors.npmPackage = "NPM package URL is required";
		}
		if (!formData.githubUrl?.trim()) {
			newErrors.githubUrl = "GitHub repository URL is required";
		}
		if ((formData.tags || []).length === 0) {
			newErrors.tags = "At least one tag is required";
		}
		if (!formData.longDescription?.trim()) {
			newErrors.longDescription = "Detailed description is required";
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
					githubUrl:
						"Install and link the GitHub App before saving a plugin repository.",
				}));
				return;
			}

			if (repositoryOwnerMismatch && linkedGitHubLogin) {
				setErrors((prev) => ({
					...prev,
					githubUrl: `GitHub repository owner must match your linked GitHub account (${linkedGitHubLogin}).`,
				}));
				return;
			}

			setIsSubmitting(true);

			try {
				let response:
					| Awaited<ReturnType<typeof createPlugin>>
					| Awaited<ReturnType<typeof updatePlugin>>;

				if (isEditMode && pluginId && formData.id) {
					// Update existing plugin
					response = await updatePlugin({
						id: formData.id,
						name: formData.name,
						icon: formData.icon,
						description: formData.description,
						longDescription: formData.longDescription,
						compatibleVersions: formData.compatibleVersions,
						author: formData.author,
						category: formData.category,
						tags: formData.tags,
						published: formData.published,
						npmPackage: formData.npmPackage,
						githubUrl: formData.githubUrl,
						docsUrl: formData.docsUrl,
						installation: formData.installation,
						quickStart: formData.quickStart,
						configuration: formData.configuration,
						dependencies: formData.dependencies,
					});
				} else {
					// Create new plugin
					response = await createPlugin({
						name: formData.name as string,
						icon: formData.icon || "🔌",
						description: formData.description as string,
						longDescription: formData.longDescription || "",
						compatibleVersions: formData.compatibleVersions as string,
						author: formData.author as string,
						category: formData.category as string,
						tags: formData.tags || [],
						published: formData.published || false,
						npmPackage: formData.npmPackage as string,
						githubUrl: formData.githubUrl || null,
						docsUrl: formData.docsUrl || null,
						installation: formData.installation || null,
						quickStart: formData.quickStart || null,
						configuration: formData.configuration || null,
						dependencies: formData.dependencies || [],
					});
				}

				if (response.success) {
					setSubmitSuccess(true);
					setTimeout(() => {
						navigate("/dashboard");
					}, 2000);
				} else {
					const errorMsg = isEditMode
						? (response.message ?? "Failed to update plugin")
						: (response.message ?? "Failed to create plugin");
					setErrors({ name: errorMsg });
				}
			} catch (error) {
				console.error("Failed to submit plugin:", error);
				setErrors({
					name: (error as Error).message || "Failed to submit plugin",
				});
			} finally {
				setIsSubmitting(false);
			}
		},
		[
			formData,
			githubAppStatus.connected,
			isEditMode,
			linkedGitHubLogin,
			pluginId,
			repositoryOwnerMismatch,
			validate,
		],
	);

	const formatMarkDownWithAi = useCallback(
		async (text: string, fieldName: keyof PluginFormData) => {
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
			} catch (_error) {
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
			targetField: "name" as keyof PluginFormData,
		}));
	}, [aiFormatting.result, aiFormatting.targetField, updateField]);

	const handleRejectAiFormat = useCallback(() => {
		setAiFormatting((prev) => ({
			...prev,
			modalOpen: false,
			result: "",
			targetField: "name" as keyof PluginFormData,
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
							<a href="/plugins">
								<button
									type="button"
									className="text-theme-muted hover:text-theme-text transition-colors mb-4 flex items-center gap-2"
								>
									← Back to Plugins
								</button>
							</a>
							<h1 className="text-4xl font-black text-theme-text mb-2">
								{isEditMode ? "Edit Plugin" : "Add New Plugin"}
							</h1>
							<p className="text-theme-muted">
								{isEditMode
									? "Update your plugin information below"
									: "Share your plugin with the Frame-Master community"}
							</p>
						</div>

						{/* Success Message */}
						{submitSuccess && (
							<div className="mb-6 p-4 bg-green-500/15 border border-green-500 rounded-lg">
								<p className="text-green-500 font-semibold">
									✓ Plugin {isEditMode ? "updated" : "submitted"} successfully!
									Redirecting...
								</p>
							</div>
						)}

						{/* Form */}
						<form onSubmit={handleSubmit} className="space-y-8">
							{/* Basic Information */}
							<Section title="Basic Information">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<FormField label="Plugin Name" required error={errors.name}>
										<input
											type="text"
											value={formData.name}
											onChange={(e) => updateField("name", e.target.value)}
											placeholder="React SSR"
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
												placeholder="⚛️"
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
										hint="Latest version and version history are resolved from the NPM URL on save, with GitHub releases used as a fallback source"
									>
										<div className="rounded-lg border border-theme-border bg-theme-input px-4 py-3 text-sm text-theme-secondary">
											<div className="font-semibold text-theme-text">
												{formData.version
													? `Current latest version: ${formData.version}`
													: "No version synced yet"}
											</div>
											<p className="mt-2 text-theme-muted">
												Save this plugin to sync versions from npm. If npm has
												no usable versions, GitHub releases are used
												automatically.
											</p>
											{isEditMode && (
												<div className="mt-3">
													<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-theme-disabled">
														Stored version list
													</div>
													{isLoadingVersions ? (
														<div className="text-theme-muted">
															Loading versions...
														</div>
													) : versionList.length > 0 ? (
														<div className="flex flex-wrap gap-2">
															{versionList.map((version) => (
																<span
																	key={version}
																	className="rounded-full bg-blue-500/15 px-3 py-1 font-mono text-xs text-blue-400"
																>
																	{version}
																</span>
															))}
														</div>
													) : (
														<div className="text-theme-muted">
															No stored version history yet.
														</div>
													)}
												</div>
											)}
										</div>
									</FormField>

									<FormField
										label="Compatible Versions"
										required
										error={errors.compatibleVersions}
										hint="Frame-Master version compatibility (semver range)"
									>
										<input
											type="text"
											value={formData.compatibleVersions}
											onChange={(e) =>
												updateField("compatibleVersions", e.target.value)
											}
											placeholder="^2.0.0"
											className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors"
										/>
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
													{cat.name}
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
										placeholder="Server-side rendering with React 19..."
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
												placeholder="react, ssr, routing..."
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
									hint="Check to make your plugin publicly available"
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
											Publish plugin (make it publicly available)
										</span>
									</label>
								</FormField>
							</Section>

							{/* Links & Resources */}
							<Section title="Links & Resources">
								<div className="space-y-6">
									<FormField
										label="NPM Package URL"
										required
										error={errors.npmPackage}
										hint="Use the full npm package URL. The package name will be derived automatically."
									>
										<input
											type="url"
											value={formData.npmPackage}
											onChange={(e) =>
												updateField("npmPackage", e.target.value)
											}
											placeholder="https://www.npmjs.com/package/frame-master-plugin-react-ssr"
											className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors"
										/>
									</FormField>

									<FormField
										label="GitHub Repository URL"
										required
										error={errors.githubUrl}
										hint="Repository root used for release fallback and live example discovery"
									>
										<div className="space-y-3">
											<input
												type="url"
												value={formData.githubUrl || ""}
												onChange={(e) =>
													updateField("githubUrl", e.target.value)
												}
												placeholder="https://github.com/username/repo"
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
																: "Plugin repositories must be owned by this linked GitHub account."}
														</div>
													</div>
												) : (
													<div className="space-y-2">
														<div className="font-semibold">
															GitHub App not linked
														</div>
														<div>
															Install the GitHub App before saving a plugin so
															release webhooks can update versions
															automatically.
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

									<FormField label="Documentation URL" error={errors.docsUrl}>
										<input
											type="url"
											value={formData.docsUrl || ""}
											onChange={(e) => updateField("docsUrl", e.target.value)}
											placeholder="/docs/plugins/your-plugin"
											className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors"
										/>
									</FormField>

									<FormField
										label="Plugin Dependencies"
										error={errors.dependencies}
										hint="Add other Frame-Master plugins this plugin depends on"
									>
										<div className="space-y-4">
											<div className="grid grid-cols-1 md:grid-cols-3 gap-2">
												<input
													type="text"
													value={dependencyInput.name}
													onChange={(e) =>
														setDependencyInput((prev) => ({
															...prev,
															name: e.target.value,
														}))
													}
													onKeyPress={(e) => {
														if (e.key === "Enter") {
															e.preventDefault();
															addDependency();
														}
													}}
													placeholder="frame-master-plugin-tailwind"
													className="md:col-span-2 px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
												/>
												<div className="flex gap-2">
													<input
														type="text"
														value={dependencyInput.version}
														onChange={(e) =>
															setDependencyInput((prev) => ({
																...prev,
																version: e.target.value,
															}))
														}
														onKeyPress={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																addDependency();
															}
														}}
														placeholder="^1.0.0"
														className="flex-1 px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
													/>
													<button
														type="button"
														onClick={addDependency}
														className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors text-sm"
													>
														Add
													</button>
												</div>
											</div>

											{(formData.dependencies || []).length > 0 && (
												<div className="space-y-2">
													<div className="text-sm font-semibold text-theme-secondary">
														Dependencies:
													</div>
													<div className="space-y-2">
														{(formData.dependencies || []).map((dep, index) => (
															<div
																key={index}
																className="flex items-center justify-between bg-theme-input border border-theme-border-input rounded-lg p-3"
															>
																<div className="flex items-center gap-3">
																	<span className="text-blue-400 font-mono text-sm">
																		{dep.pluginName}
																	</span>
																	<span className="text-theme-disabled">:</span>
																	<span className="text-green-400 font-mono text-sm">
																		{dep.version}
																	</span>
																</div>
																<button
																	type="button"
																	onClick={() =>
																		removeDependency(dep.pluginName)
																	}
																	className="text-red-400 hover:text-red-300 transition-colors"
																>
																	×
																</button>
															</div>
														))}
													</div>
												</div>
											)}
										</div>
									</FormField>
								</div>
							</Section>

							{/* Detailed Information */}
							<Section title="Detailed Information">
								<div className="space-y-6">
									<FormField
										label="Long Description"
										required
										error={errors.longDescription}
										hint="Provide a comprehensive description of your plugin's features and capabilities (Markdown supported)"
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
												placeholder="This plugin provides... 

# Features
- **Easy Integration**: Simple setup process
- **High Performance**: Optimized for speed
- **Flexible Configuration**: Customize to your needs

## Getting Started
Follow the quick start guide to begin using this plugin."
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
										label="Installation Instructions"
										error={errors.installation}
										hint="Command to install your plugin"
									>
										<div className="space-y-4">
											<textarea
												value={formData.installation || ""}
												onChange={(e) =>
													updateField("installation", e.target.value)
												}
												placeholder="bun add frame-master-plugin-yourplugin"
												rows={3}
												className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm resize-vertical"
											/>
											{formData.installation && (
												<div>
													<div className="text-sm font-semibold text-theme-secondary mb-2">
														Preview:
													</div>
													<CodeBlockWithTheme
														language="bash"
														code={formData.installation}
													/>
												</div>
											)}
										</div>
									</FormField>

									<FormField
										label="Quick Start Fallback"
										error={errors.quickStart}
										hint="Used only when QUICK_EXEMPLE.md is missing from the repository root"
									>
										<div className="space-y-4">
											<textarea
												value={formData.quickStart || ""}
												onChange={(e) =>
													updateField("quickStart", e.target.value)
												}
												placeholder="import { Plugin } from 'your-plugin';"
												rows={4}
												className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm resize-vertical"
											/>
											{formData.quickStart && (
												<div>
													<div className="text-sm font-semibold text-theme-secondary mb-2">
														Preview:
													</div>
													<CodeBlockWithTheme
														language="tsx"
														code={formData.quickStart}
													/>
												</div>
											)}
										</div>
									</FormField>

									<FormField
										label="Configuration Fallback"
										error={errors.configuration}
										hint="Used only when CONFIG_EXEMPLE.md is missing from the repository root"
									>
										<div className="space-y-4">
											<textarea
												value={formData.configuration || ""}
												onChange={(e) =>
													updateField("configuration", e.target.value)
												}
												placeholder="// Add to frame-master.config.ts..."
												rows={4}
												className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm resize-vertical"
											/>
											{formData.configuration && (
												<div>
													<div className="text-sm font-semibold text-theme-secondary mb-2">
														Preview:
													</div>
													<CodeBlockWithTheme
														language="ts"
														code={formData.configuration}
														filename="frame-master.config.ts"
													/>
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
												? "Update Plugin"
												: "Submit Plugin"}
								</button>
								<a href="/plugins">
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
}: {
	label: string;
	required?: boolean;
	error?: string;
	hint?: string;
	actionButton?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div>
			<label
				className="block text-sm font-semibold text-theme-secondary mb-2"
				htmlFor={(children as React.ReactElement<{ id?: string }>).props.id}
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
