import {
	DELETE as deleteTemplate,
	PATCH as updateTemplate,
} from "@api/admin/template";
import type { parsedTemplate } from "db/schema";
import { useState } from "react";
import { GET as getTemplates } from "@/actions/api/templates";
import { useAuthEffect } from "@/hooks";
import { CacheManager } from "@/utils";

// ============================================================================
// CACHE
// ============================================================================
const cache = new CacheManager<"template">();

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminTemplatePanel() {
	const [templates, setTemplates] = useState<parsedTemplate[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [showModal, setShowModal] = useState(false);
	const [selectedTemplate, setSelectedTemplate] =
		useState<parsedTemplate | null>(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [statusFilter, setStatusFilter] = useState<
		"all" | "published" | "draft"
	>("all");

	const [formData, setFormData] = useState<Partial<parsedTemplate>>({
		name: "",
		description: "",
		defaultVersion: "",
		published: false,
	});

	useAuthEffect(() => {
		loadTemplates();
	});

	// Load templates
	const loadTemplates = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const response = await cache.fetch("template", () =>
				getTemplates({ published: false }),
			);
			if (response.success && Array.isArray(response.templates)) {
				setTemplates(response.templates);
			} else {
				setError(response.message || "Failed to load templates");
			}
		} catch (err) {
			setError("An error occurred while loading templates");
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	// Open modal for editing a template
	const handleEditTemplate = (template: parsedTemplate) => {
		setSelectedTemplate(template);
		setFormData({
			id: template.id,
			name: template.name,
			description: template.description,
			defaultVersion: template.defaultVersion,
			published: template.published,
			icon: template.icon,
			longDescription: template.longDescription,
			category: template.category,
			tags: template.tags,
			githubReleaseUrl: template.githubReleaseUrl,
			githubRepoUrl: template.githubRepoUrl,
			previewUrl: template.previewUrl,
			features: template.features,
			includedPlugins: template.includedPlugins,
		});
		setShowModal(true);
	};

	// Delete template
	const handleDeleteTemplate = async (templateId: number) => {
		if (
			!confirm(
				"Are you sure you want to delete this template? This action cannot be undone.",
			)
		)
			return;

		try {
			const response = await deleteTemplate(templateId);
			if (response.success) {
				setTemplates(templates.filter((t) => t.id !== templateId));
			} else {
				alert(response.error || "Failed to delete template");
			}
		} catch (err) {
			alert("An error occurred while deleting the template");
			console.error(err);
		}
	};

	// Submit form
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!formData.id) return;

		try {
			const response = await updateTemplate(
				formData as Partial<parsedTemplate> & { id: string },
			);
			if (response.success) {
				await loadTemplates();
				setShowModal(false);
			} else {
				setError(response.error || "Failed to update template");
			}
		} catch (err) {
			setError("An error occurred while updating the template");
			console.error(err);
		}
	};

	// Filter templates based on search and status
	const filteredTemplates = templates.filter((template) => {
		const matchesSearch =
			template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
			template.author.toLowerCase().includes(searchTerm.toLowerCase());
		const matchesStatus =
			statusFilter === "all" ||
			(statusFilter === "published" && template.published) ||
			(statusFilter === "draft" && !template.published);
		return matchesSearch && matchesStatus;
	});

	const publishedCount = templates.filter((t) => t.published).length;
	const draftCount = templates.filter((t) => !t.published).length;

	if (isLoading) {
		return (
			<div className="min-h-screen bg-theme-bg flex items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="w-10 h-10 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin" />
					<p className="text-theme-muted">Loading templates...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-theme-bg pb-20 lg:pb-0">
			{/* Header */}
			<div className="bg-theme-card border-b border-theme-border sticky top-[calc(4rem+52px)] lg:top-16 z-30">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
						<div>
							<h1 className="text-xl sm:text-3xl font-black text-theme-text">
								Template Management
							</h1>
							<p className="text-theme-muted text-xs sm:text-sm mt-0.5">
								{templates.length} templates • {publishedCount} published •{" "}
								{draftCount} drafts
							</p>
						</div>
						<button
							type="button"
							onClick={loadTemplates}
							disabled={isLoading}
							className="self-start sm:self-auto px-4 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 text-sm flex items-center gap-2"
						>
							<svg
								className="w-4 h-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<title>Refresh</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
								/>
							</svg>
							<span>Refresh</span>
						</button>
					</div>
				</div>
			</div>

			<div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
				{/* Error Message */}
				{error && (
					<div className="mb-4 p-4 bg-red-500/15 border border-red-500 rounded-lg">
						<p className="text-red-500 font-semibold text-sm">{error}</p>
					</div>
				)}

				{/* Search & Filter */}
				<div className="mb-4 sm:mb-6 space-y-3">
					{/* Search Bar */}
					<div className="relative">
						<svg
							className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-disabled"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<title>Search</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
						<input
							type="text"
							placeholder="Search templates by name, description, or author..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="w-full pl-10 pr-4 py-2.5 bg-theme-card border border-theme-border rounded-lg focus:outline-none focus:border-green-500 transition-colors text-sm"
						/>
					</div>

					{/* Status Tabs */}
					<div className="flex gap-2 overflow-x-auto pb-1">
						{(["all", "published", "draft"] as const).map((status) => (
							<button
								type="button"
								key={status}
								onClick={() => setStatusFilter(status)}
								className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
									statusFilter === status
										? "bg-green-600 text-white"
										: "bg-theme-card border border-theme-border text-theme-muted hover:bg-theme-input"
								}`}
							>
								{status === "all" && `All (${templates.length})`}
								{status === "published" && `Published (${publishedCount})`}
								{status === "draft" && `Drafts (${draftCount})`}
							</button>
						))}
					</div>
				</div>

				{/* Templates List */}
				{filteredTemplates.length === 0 ? (
					<div className="bg-theme-card border border-theme-border rounded-xl p-8 sm:p-12 text-center">
						<div className="text-4xl sm:text-6xl mb-3">📁</div>
						<h3 className="text-lg sm:text-xl font-bold text-theme-text mb-2">
							No templates found
						</h3>
						<p className="text-theme-muted text-sm">
							{searchTerm
								? "Try adjusting your search"
								: "No templates have been created yet"}
						</p>
					</div>
				) : (
					<>
						{/* Mobile Cards */}
						<div className="lg:hidden space-y-3">
							{filteredTemplates.map((template) => (
								<div
									key={template.id}
									className="bg-theme-card border border-theme-border rounded-xl p-4"
								>
									<div className="flex items-start gap-3 mb-3">
										<div className="w-12 h-12 bg-theme-input rounded-lg flex items-center justify-center text-2xl shrink-0">
											{template.icon || "📁"}
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2 mb-1">
												<h3 className="font-bold text-theme-text truncate">
													{template.name}
												</h3>
												<span
													className={`px-2 py-0.5 text-[10px] font-semibold rounded shrink-0 ${
														template.published
															? "bg-green-500/15 text-green-500"
															: "bg-yellow-500/15 text-yellow-500"
													}`}
												>
													{template.published ? "Published" : "Draft"}
												</span>
											</div>
											<p className="text-xs text-theme-muted line-clamp-2">
												{template.description}
											</p>
										</div>
									</div>

									<div className="flex items-center justify-between text-xs text-theme-disabled mb-3">
										<span>by {template.author}</span>
										<div className="flex items-center gap-2">
											<span className="px-2 py-0.5 bg-theme-input rounded text-theme-muted">
												{template.category}
											</span>
											<span className="font-mono">
												v{template.defaultVersion}
											</span>
										</div>
									</div>

									<div className="flex gap-2">
										<button
											type="button"
											onClick={() => handleEditTemplate(template)}
											className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-lg transition-colors text-sm font-semibold text-white"
										>
											Edit
										</button>
										<button
											type="button"
											onClick={() => handleDeleteTemplate(template.id)}
											className="px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 active:bg-red-500/40 text-red-400 rounded-lg transition-colors text-sm font-semibold"
										>
											Delete
										</button>
									</div>
								</div>
							))}
						</div>

						{/* Desktop Table */}
						<div className="hidden lg:block bg-theme-card rounded-xl border border-theme-border overflow-hidden">
							<table className="w-full">
								<thead className="bg-theme-input">
									<tr>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											Template
										</th>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											Author
										</th>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											Version
										</th>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											Category
										</th>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											Status
										</th>
										<th className="px-6 py-4 text-right text-sm font-semibold text-theme-text">
											Actions
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-theme-border">
									{filteredTemplates.map((template) => (
										<tr
											key={template.id}
											className="hover:bg-theme-input/50 transition-colors"
										>
											<td className="px-6 py-4">
												<div className="flex items-center gap-3">
													<span className="text-2xl">
														{template.icon || "📁"}
													</span>
													<div>
														<div className="font-medium text-theme-text">
															{template.name}
														</div>
														<div className="text-sm text-theme-muted line-clamp-1">
															{template.description}
														</div>
													</div>
												</div>
											</td>
											<td className="px-6 py-4 text-theme-secondary">
												{template.author}
											</td>
											<td className="px-6 py-4">
												<span className="px-2 py-1 bg-theme-input rounded text-sm font-mono text-theme-text">
													{template.defaultVersion}
												</span>
											</td>
											<td className="px-6 py-4">
												<span className="px-2 py-1 bg-theme-input rounded text-sm text-theme-secondary">
													{template.category}
												</span>
											</td>
											<td className="px-6 py-4">
												<span
													className={`px-2 py-1 text-xs font-semibold rounded ${
														template.published
															? "bg-green-500/15 text-green-500"
															: "bg-yellow-500/15 text-yellow-500"
													}`}
												>
													{template.published ? "Published" : "Draft"}
												</span>
											</td>
											<td className="px-6 py-4">
												<div className="flex justify-end gap-2">
													<button
														type="button"
														onClick={() => handleEditTemplate(template)}
														className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors text-sm text-white font-medium"
													>
														Edit
													</button>
													<button
														type="button"
														onClick={() => handleDeleteTemplate(template.id)}
														className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors text-sm font-medium"
													>
														Delete
													</button>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
				)}
			</div>

			{/* Edit Modal */}
			{showModal && selectedTemplate && (
				<div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
					<button
						type="button"
						className="absolute inset-0"
						onClick={() => setShowModal(false)}
					/>
					<div className="relative bg-theme-card border border-theme-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-2xl max-h-[85vh] sm:max-h-[90vh] flex flex-col">
						{/* Header */}
						<div className="shrink-0 bg-theme-card border-b border-theme-border px-4 sm:px-6 py-4 flex items-center justify-between rounded-t-2xl sm:rounded-t-xl">
							<h2 className="text-lg sm:text-xl font-bold text-theme-text">
								Edit Template
							</h2>
							<button
								type="button"
								onClick={() => setShowModal(false)}
								className="p-2 -mr-2 hover:bg-theme-input rounded-lg transition-colors"
							>
								<svg
									className="w-5 h-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<title>Close</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>

						<form
							onSubmit={handleSubmit}
							className="overflow-y-auto flex-1 flex flex-col"
						>
							<div className="p-4 sm:p-6 space-y-4 flex-1">
								{/* Name */}
								<div>
									<label
										className="block text-sm font-semibold mb-2 text-theme-text"
										htmlFor="template-name"
									>
										Template Name
									</label>
									<input
										type="text"
										id="template-name"
										value={formData.name || ""}
										onChange={(e) =>
											setFormData({ ...formData, name: e.target.value })
										}
										className="w-full px-4 py-2.5 bg-theme-input border border-theme-border-input rounded-lg focus:outline-none focus:border-green-500 text-sm"
									/>
								</div>

								{/* Description */}
								<div>
									<label
										className="block text-sm font-semibold mb-2 text-theme-text"
										htmlFor="template-description"
									>
										Description
									</label>
									<textarea
										id="template-description"
										value={formData.description || ""}
										onChange={(e) =>
											setFormData({ ...formData, description: e.target.value })
										}
										rows={3}
										className="w-full px-4 py-2.5 bg-theme-input border border-theme-border-input rounded-lg focus:outline-none focus:border-green-500 text-sm resize-none"
									/>
								</div>

								{/* Version & Category */}
								<div className="grid grid-cols-2 gap-4">
									<div>
										<label
											className="block text-sm font-semibold mb-2 text-theme-text"
											htmlFor="template-version"
										>
											Latest Synced Version
										</label>
										<input
											type="text"
											id="template-version"
											value={formData.defaultVersion || ""}
											readOnly
											className="w-full px-4 py-2.5 bg-theme-input border border-theme-border-input rounded-lg text-sm font-mono text-theme-secondary"
										/>
										<p className="mt-1 text-xs text-theme-muted">
											Synced automatically from the latest published GitHub
											release on save and webhook updates.
										</p>
									</div>
									<div>
										<label
											className="block text-sm font-semibold mb-2 text-theme-text"
											htmlFor="template-category"
										>
											Category
										</label>
										<input
											type="text"
											id="template-category"
											value={formData.category || ""}
											onChange={(e) =>
												setFormData({ ...formData, category: e.target.value })
											}
											className="w-full px-4 py-2.5 bg-theme-input border border-theme-border-input rounded-lg focus:outline-none focus:border-green-500 text-sm"
										/>
									</div>
								</div>

								{/* GitHub URLs */}
								<div>
									<label
										className="block text-sm font-semibold mb-2 text-theme-text"
										htmlFor="template-github-repo-url"
									>
										GitHub Repo URL
									</label>
									<input
										type="text"
										id="template-github-repo-url"
										value={formData.githubRepoUrl || ""}
										onChange={(e) =>
											setFormData({
												...formData,
												githubRepoUrl: e.target.value,
											})
										}
										className="w-full px-4 py-2.5 bg-theme-input border border-theme-border-input rounded-lg focus:outline-none focus:border-green-500 text-sm"
									/>
								</div>

								<div>
									<label
										className="block text-sm font-semibold mb-2 text-theme-text"
										htmlFor="template-github-release-url"
									>
										Current Release URL
									</label>
									<input
										type="text"
										id="template-github-release-url"
										value={formData.githubReleaseUrl || ""}
										readOnly
										className="w-full px-4 py-2.5 bg-theme-input border border-theme-border-input rounded-lg text-sm text-theme-secondary"
									/>
									<p className="mt-1 text-xs text-theme-muted">
										Derived from the repository above. Change the repository URL
										to resync it.
									</p>
								</div>

								<div>
									<label
										className="block text-sm font-semibold mb-2 text-theme-text"
										htmlFor="template-preview-url"
									>
										Preview URL (optional)
									</label>
									<input
										type="text"
										id="template-preview-url"
										value={formData.previewUrl || ""}
										onChange={(e) =>
											setFormData({ ...formData, previewUrl: e.target.value })
										}
										className="w-full px-4 py-2.5 bg-theme-input border border-theme-border-input rounded-lg focus:outline-none focus:border-green-500 text-sm"
									/>
								</div>

								{/* Status Toggle */}
								<div>
									<label
										className="block text-sm font-semibold mb-2 text-theme-text"
										htmlFor="template-status"
									>
										Status
									</label>
									<label className="flex items-center gap-3 p-3 bg-theme-input rounded-lg cursor-pointer hover:bg-theme-border-input transition-colors">
										<input
											type="checkbox"
											checked={formData.published || false}
											onChange={(e) =>
												setFormData({
													...formData,
													published: e.target.checked,
												})
											}
											className="w-5 h-5 rounded"
										/>
										<div>
											<span className="font-medium text-theme-text text-sm">
												Published
											</span>
											<p className="text-xs text-theme-muted">
												Make this template visible to users
											</p>
										</div>
									</label>
								</div>
							</div>

							{/* Footer */}
							<div className="shrink-0 bg-theme-card border-t border-theme-border px-4 sm:px-6 py-4 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
								<button
									type="button"
									onClick={() => setShowModal(false)}
									className="px-6 py-2.5 bg-theme-input hover:bg-theme-border-input rounded-lg transition-colors text-theme-text font-semibold text-sm"
								>
									Cancel
								</button>
								<button
									type="submit"
									className="px-6 py-2.5 bg-green-600 hover:bg-green-700 rounded-lg transition-colors font-semibold text-white text-sm"
								>
									Save Changes
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
