import {
	DELETE as deletePlugin,
	PATCH as updatePlugin,
} from "@api/admin/plugin";
import type { parsedPlugin } from "db/schema";
import { useState } from "react";
import { GET as getPlugins } from "@/actions/api/plugins";
import { useAuthEffect } from "@/hooks";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminPluginPanel() {
	const [plugins, setPlugins] = useState<parsedPlugin[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [showModal, setShowModal] = useState(false);
	const [selectedPlugin, setSelectedPlugin] = useState<parsedPlugin | null>(
		null,
	);
	const [searchTerm, setSearchTerm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [statusFilter, setStatusFilter] = useState<
		"all" | "published" | "draft"
	>("all");

	const [formData, setFormData] = useState<Partial<parsedPlugin>>({
		name: "",
		description: "",
		version: "",
		published: false,
	});

	// Check authentication
	useAuthEffect((client) => {
		if (client.isAuthenticated) loadPlugins();
	}, []);

	// Load plugins
	const loadPlugins = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const response = await getPlugins();
			if (response.success && Array.isArray(response.plugins)) {
				setPlugins(response.plugins);
			} else {
				setError(response.message || "Failed to load plugins");
			}
		} catch (err) {
			setError("An error occurred while loading plugins");
			console.error(err);
		} finally {
			setIsLoading(false);
		}
	};

	// Open modal for editing a plugin
	const handleEditPlugin = (plugin: parsedPlugin) => {
		setSelectedPlugin(plugin);
		setFormData({
			id: plugin.id,
			name: plugin.name,
			description: plugin.description,
			version: plugin.version,
			published: plugin.published,
			icon: plugin.icon,
			longDescription: plugin.longDescription,
			category: plugin.category,
			tags: plugin.tags,
			npmPackage: plugin.npmPackage,
			githubUrl: plugin.githubUrl,
			docsUrl: plugin.docsUrl,
		});
		setShowModal(true);
	};

	// Delete plugin
	const handleDeletePlugin = async (pluginId: number) => {
		if (
			!confirm(
				"Are you sure you want to delete this plugin? This action cannot be undone.",
			)
		)
			return;

		try {
			const response = await deletePlugin(pluginId);
			if (response.success) {
				setPlugins(plugins.filter((p) => p.id !== pluginId));
			} else {
				alert(response.error || "Failed to delete plugin");
			}
		} catch (err) {
			alert("An error occurred while deleting the plugin");
			console.error(err);
		}
	};

	// Submit form
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (!formData.id) return;

		try {
			const response = await updatePlugin(
				formData as Partial<parsedPlugin> & { id: string },
			);
			if (response.success) {
				await loadPlugins();
				setShowModal(false);
			} else {
				setError(response.error || "Failed to update plugin");
			}
		} catch (err) {
			setError("An error occurred while updating the plugin");
			console.error(err);
		}
	};

	// Filter plugins based on search and status
	const filteredPlugins = plugins.filter((plugin) => {
		const matchesSearch =
			plugin.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			plugin.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			plugin.author?.toLowerCase().includes(searchTerm.toLowerCase());
		const matchesStatus =
			statusFilter === "all" ||
			(statusFilter === "published" && plugin.published) ||
			(statusFilter === "draft" && !plugin.published);
		return matchesSearch && matchesStatus;
	});

	const publishedCount = plugins.filter((p) => p.published).length;
	const draftCount = plugins.filter((p) => !p.published).length;

	if (isLoading) {
		return (
			<div className="min-h-screen bg-theme-bg flex items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
					<p className="text-theme-muted">Loading plugins...</p>
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
								Plugin Management
							</h1>
							<p className="text-theme-muted text-xs sm:text-sm mt-0.5">
								{plugins.length} plugins • {publishedCount} published •{" "}
								{draftCount} drafts
							</p>
						</div>
						<button
							type="button"
							onClick={loadPlugins}
							disabled={isLoading}
							className="self-start sm:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 text-sm flex items-center gap-2"
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
							placeholder="Search plugins by name, description, or author..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="w-full pl-10 pr-4 py-2.5 bg-theme-card border border-theme-border rounded-lg focus:outline-none focus:border-blue-500 transition-colors text-sm"
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
										? "bg-blue-600 text-white"
										: "bg-theme-card border border-theme-border text-theme-muted hover:bg-theme-input"
								}`}
							>
								{status === "all" && `All (${plugins.length})`}
								{status === "published" && `Published (${publishedCount})`}
								{status === "draft" && `Drafts (${draftCount})`}
							</button>
						))}
					</div>
				</div>

				{/* Plugins List */}
				{filteredPlugins.length === 0 ? (
					<div className="bg-theme-card border border-theme-border rounded-xl p-8 sm:p-12 text-center">
						<div className="text-4xl sm:text-6xl mb-3">🔌</div>
						<h3 className="text-lg sm:text-xl font-bold text-theme-text mb-2">
							No plugins found
						</h3>
						<p className="text-theme-muted text-sm">
							{searchTerm
								? "Try adjusting your search"
								: "No plugins have been created yet"}
						</p>
					</div>
				) : (
					<>
						{/* Mobile Cards */}
						<div className="lg:hidden space-y-3">
							{filteredPlugins.map((plugin) => (
								<div
									key={plugin.id}
									className="bg-theme-card border border-theme-border rounded-xl p-4"
								>
									<div className="flex items-start gap-3 mb-3">
										<div className="w-12 h-12 bg-theme-input rounded-lg flex items-center justify-center text-2xl shrink-0">
											{plugin.icon || "🔌"}
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2 mb-1">
												<h3 className="font-bold text-theme-text truncate">
													{plugin.name}
												</h3>
												<span
													className={`px-2 py-0.5 text-[10px] font-semibold rounded shrink-0 ${
														plugin.published
															? "bg-green-500/15 text-green-500"
															: "bg-yellow-500/15 text-yellow-500"
													}`}
												>
													{plugin.published ? "Published" : "Draft"}
												</span>
											</div>
											<p className="text-xs text-theme-muted line-clamp-2">
												{plugin.description}
											</p>
										</div>
									</div>

									<div className="flex items-center justify-between text-xs text-theme-disabled mb-3">
										<span>by {plugin.author}</span>
										<span className="font-mono">v{plugin.version}</span>
									</div>

									<div className="flex items-center gap-2 mb-3">
										<span className="text-xs text-theme-muted">
											{plugin.downloads.toLocaleString()} downloads
										</span>
									</div>

									<div className="flex gap-2">
										<button
											type="button"
											onClick={() => handleEditPlugin(plugin)}
											className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg transition-colors text-sm font-semibold text-white"
										>
											Edit
										</button>
										<button
											type="button"
											onClick={() => handleDeletePlugin(plugin.id)}
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
											Plugin
										</th>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											Author
										</th>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											Version
										</th>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											Status
										</th>
										<th className="px-6 py-4 text-left text-sm font-semibold text-theme-text">
											Downloads
										</th>
										<th className="px-6 py-4 text-right text-sm font-semibold text-theme-text">
											Actions
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-theme-border">
									{filteredPlugins.map((plugin) => (
										<tr
											key={plugin.id}
											className="hover:bg-theme-input/50 transition-colors"
										>
											<td className="px-6 py-4">
												<div className="flex items-center gap-3">
													<span className="text-2xl">
														{plugin.icon || "🔌"}
													</span>
													<div>
														<div className="font-medium text-theme-text">
															{plugin.name}
														</div>
														<div className="text-sm text-theme-muted line-clamp-1">
															{plugin.description}
														</div>
													</div>
												</div>
											</td>
											<td className="px-6 py-4 text-theme-secondary">
												{plugin.author}
											</td>
											<td className="px-6 py-4">
												<span className="px-2 py-1 bg-theme-input rounded text-sm font-mono text-theme-text">
													{plugin.version}
												</span>
											</td>
											<td className="px-6 py-4">
												<span
													className={`px-2 py-1 text-xs font-semibold rounded ${
														plugin.published
															? "bg-green-500/15 text-green-500"
															: "bg-yellow-500/15 text-yellow-500"
													}`}
												>
													{plugin.published ? "Published" : "Draft"}
												</span>
											</td>
											<td className="px-6 py-4 text-theme-muted text-sm">
												{plugin.downloads.toLocaleString()}
											</td>
											<td className="px-6 py-4">
												<div className="flex justify-end gap-2">
													<button
														type="button"
														onClick={() => handleEditPlugin(plugin)}
														className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors text-sm text-white font-medium"
													>
														Edit
													</button>
													<button
														type="button"
														onClick={() => handleDeletePlugin(plugin.id)}
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
			{showModal && selectedPlugin && (
				<div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
					<button
						className="absolute inset-0"
						type="button"
						onClick={() => setShowModal(false)}
					/>
					<div className="relative bg-theme-card border border-theme-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-2xl max-h-[85vh] sm:max-h-[90vh] flex flex-col">
						{/* Header */}
						<div className="shrink-0 bg-theme-card border-b border-theme-border px-4 sm:px-6 py-4 flex items-center justify-between rounded-t-2xl sm:rounded-t-xl">
							<h2 className="text-lg sm:text-xl font-bold text-theme-text">
								Edit Plugin
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
										htmlFor="plugin-name"
									>
										Plugin Name
									</label>
									<input
										id="plugin-name"
										type="text"
										value={formData.name || ""}
										onChange={(e) =>
											setFormData({ ...formData, name: e.target.value })
										}
										className="w-full px-4 py-2.5 bg-theme-input border border-theme-border-input rounded-lg focus:outline-none focus:border-blue-500 text-sm"
									/>
								</div>

								{/* Description */}
								<div>
									<label
										className="block text-sm font-semibold mb-2 text-theme-text"
										htmlFor="plugin-description"
									>
										Description
									</label>
									<textarea
										id="plugin-description"
										value={formData.description || ""}
										onChange={(e) =>
											setFormData({ ...formData, description: e.target.value })
										}
										rows={3}
										className="w-full px-4 py-2.5 bg-theme-input border border-theme-border-input rounded-lg focus:outline-none focus:border-blue-500 text-sm resize-none"
									/>
								</div>

								{/* Version */}
								<div>
									<label
										className="block text-sm font-semibold mb-2 text-theme-text"
										htmlFor="plugin-version"
									>
										Version
									</label>
									<input
										id="plugin-version"
										type="text"
										value={formData.version || ""}
										onChange={(e) =>
											setFormData({ ...formData, version: e.target.value })
										}
										className="w-full px-4 py-2.5 bg-theme-input border border-theme-border-input rounded-lg focus:outline-none focus:border-blue-500 text-sm font-mono"
									/>
								</div>

								{/* Status Toggle */}
								<div>
									<label
										className="block text-sm font-semibold mb-2 text-theme-text"
										htmlFor="plugin-status"
									>
										Status
									</label>
									<label className="flex items-center gap-3 p-3 bg-theme-input rounded-lg cursor-pointer hover:bg-theme-border-input transition-colors">
										<input
											id="plugin-status"
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
												Make this plugin visible to users
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
									className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-semibold text-white text-sm"
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
