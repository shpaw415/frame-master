import type { parsedPlugin } from "db/schema";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GET as getPlugins } from "@/actions/api/plugins";
import { getAllTags, pluginCategories } from "./common";

// ============================================================================
// TYPES
// ============================================================================
type Plugin = parsedPlugin;

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function PluginsPage() {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedCategory, setSelectedCategory] = useState("all");
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [plugins, setPlugins] = useState<Plugin[]>([]);
	const [page, setPage] = useState(0);
	const [hasMore, setHasMore] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const categories = useMemo(pluginCategories, []);
	const allTags = useMemo(getAllTags, []);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isFilterOpen, setIsFilterOpen] = useState(false);

	// Count active filters for badge
	const activeFilterCount =
		(selectedCategory !== "all" ? 1 : 0) + selectedTags.length;

	// Use plugins directly since filtering is now done server-side
	const filteredPlugins = plugins;

	// Fetch plugins function with filters
	const fetchPlugins = useCallback(
		async (
			isNewSearch = false,
			currentPage = 0,
			searchQuery = "",
			category = "all",
			tags: string[] = [],
		) => {
			try {
				if (isNewSearch) {
					setIsLoading(true);
					setError(null);
				} else {
					setIsLoadingMore(true);
				}

				const params: {
					page: number;
					pageSize: number;
					searchQuery?: string;
					category?: string;
					tags?: string[];
				} = {
					page: currentPage,
					pageSize: 25,
				};

				if (searchQuery) params.searchQuery = searchQuery;
				if (category !== "all") params.category = category;
				if (tags.length > 0) params.tags = tags;

				const data = await getPlugins(params);

				if (!data.success) {
					setError(data.message || "Failed to load plugins");
					return;
				}

				if (isNewSearch) {
					setPlugins(data.plugins);
					setPage(0);
				} else {
					setPlugins((prev) => [...prev, ...data.plugins]);
				}

				setHasMore(data.plugins.length === 25);
			} catch (err: unknown) {
				if (err instanceof Error) {
					setError(err.message || "Failed to load plugins");
				} else {
					setError("Failed to load plugins");
				}
			} finally {
				setIsLoading(false);
				setIsLoadingMore(false);
			}
		},
		[],
	);

	// Initial load
	useEffect(() => {
		fetchPlugins(true);
	}, [fetchPlugins]);

	// Handle filter changes with debounce
	useEffect(() => {
		const timeout = setTimeout(() => {
			fetchPlugins(true, 0, searchQuery, selectedCategory, selectedTags);
		}, 300);

		return () => clearTimeout(timeout);
	}, [searchQuery, selectedCategory, selectedTags, fetchPlugins]);

	// Load more function
	const loadMore = useCallback(() => {
		if (!isLoadingMore && hasMore) {
			const nextPage = page + 1;
			setPage(nextPage);
			fetchPlugins(
				false,
				nextPage,
				searchQuery,
				selectedCategory,
				selectedTags,
			);
		}
	}, [
		isLoadingMore,
		hasMore,
		page,
		fetchPlugins,
		searchQuery,
		selectedCategory,
		selectedTags,
	]);

	const toggleTag = (tag: string) => {
		setSelectedTags((prev) =>
			prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
		);
	};

	const setNewCategory = useCallback((categoryId: string) => {
		setSelectedCategory(categoryId);
	}, []);

	return (
		<div className="min-h-screen bg-theme-bg">
			{/* Hero Section - Optimized for mobile */}
			<section className="py-10 md:py-16 lg:py-20 bg-linear-to-b from-theme-bg to-theme-card border-b border-theme-border">
				<div className="max-w-7xl mx-auto px-4 sm:px-6">
					<div className="text-center mb-8 md:mb-12">
						<h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-theme-text mb-4 md:mb-6 tracking-tight">
							Plugin Marketplace
						</h1>
						<p className="text-base sm:text-lg md:text-xl text-theme-muted max-w-3xl mx-auto px-2">
							Discover and integrate powerful plugins to extend your
							Frame-Master applications.
						</p>
					</div>

					{/* Search Bar */}
					<div className="max-w-2xl mx-auto">
						<div className="relative">
							<input
								type="text"
								placeholder="Search plugins..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="w-full px-4 sm:px-6 py-3 sm:py-4 bg-theme-card border border-theme-border rounded-xl text-theme-text placeholder-theme-disabled focus:outline-none focus:border-blue-500 transition-colors text-sm sm:text-base"
							/>
							<span className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-theme-disabled text-lg sm:text-xl">
								🔍
							</span>
						</div>
					</div>

					{/* Quick Stats */}
					<div className="flex justify-center gap-6 sm:gap-8 mt-6 sm:mt-8">
						<div className="text-center">
							<div className="text-2xl sm:text-3xl font-bold text-blue-500">
								{plugins.length}
							</div>
							<div className="text-xs sm:text-sm text-theme-disabled">
								Plugins
							</div>
						</div>
						<div className="text-center">
							<div className="text-2xl sm:text-3xl font-bold text-blue-500">
								{categories.length - 1}
							</div>
							<div className="text-xs sm:text-sm text-theme-disabled">
								Categories
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Mobile Filter Button - Fixed at bottom */}
			<div className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
				<button
					type="button"
					onClick={() => setIsFilterOpen(true)}
					className="flex items-center gap-2 px-5 py-3 bg-blue-500 text-white font-semibold rounded-full shadow-lg shadow-blue-500/25 active:scale-95 transition-transform"
				>
					<span>⚙️</span>
					<span>Filters</span>
					{activeFilterCount > 0 && (
						<span className="flex items-center justify-center w-5 h-5 bg-white text-blue-500 text-xs font-bold rounded-full">
							{activeFilterCount}
						</span>
					)}
				</button>
			</div>

			{/* Mobile Filter Drawer */}
			{isFilterOpen && (
				<MobileFilterDrawer
					categories={categories}
					allTags={allTags}
					selectedCategory={selectedCategory}
					selectedTags={selectedTags}
					onCategoryChange={setNewCategory}
					onTagToggle={toggleTag}
					onClear={() => {
						setSelectedCategory("all");
						setSelectedTags([]);
						setSearchQuery("");
					}}
					onClose={() => setIsFilterOpen(false)}
				/>
			)}

			{/* Main Content */}
			<section className="py-8 md:py-12 lg:py-16 bg-theme-bg pb-24 lg:pb-16">
				<div className="max-w-7xl mx-auto px-4 sm:px-6">
					<div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
						{/* Filters Sidebar - Desktop only */}
						<aside className="hidden lg:block lg:w-64 shrink-0">
							<div className="sticky top-20 space-y-6">
								{/* Categories */}
								<FilterSection title="Categories">
									{categories.map((category) => (
										<FilterButton
											key={category.id}
											active={selectedCategory === category.id}
											onClick={() => setNewCategory(category.id)}
										>
											<span className="text-lg mr-2">{category.icon}</span>
											{category.name}
										</FilterButton>
									))}
								</FilterSection>

								{/* Tags */}
								<FilterSection title="Tags">
									<div className="flex flex-wrap gap-2">
										{allTags.map((tag) => (
											<TagButton
												key={tag}
												active={selectedTags.includes(tag)}
												onClick={() => toggleTag(tag)}
											>
												{tag}
											</TagButton>
										))}
									</div>
								</FilterSection>

								{/* Clear Filters */}
								{(selectedCategory !== "all" ||
									selectedTags.length > 0 ||
									searchQuery) && (
									<button
										type="button"
										onClick={() => {
											setSelectedCategory("all");
											setSelectedTags([]);
											setSearchQuery("");
										}}
										className="w-full px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-sm text-theme-muted hover:text-theme-text hover:border-blue-500 transition-colors"
									>
										Clear Filters
									</button>
								)}
							</div>
						</aside>

						{/* Plugins Grid */}
						<main className="flex-1 min-w-0">
							{!isLoading && !error && (
								<>
									{/* Results Header */}
									<div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
										<p className="text-sm sm:text-base text-theme-muted">
											{filteredPlugins.length} plugin
											{filteredPlugins.length !== 1 ? "s" : ""} found
										</p>
										{selectedTags.length > 0 && (
											<div className="flex gap-2 flex-wrap">
												{selectedTags.map((tag) => (
													<span
														key={tag}
														className="px-2 sm:px-3 py-1 bg-blue-500/15 text-blue-500 rounded-md text-xs font-semibold flex items-center gap-1 sm:gap-2"
													>
														{tag}
														<button
															type="button"
															onClick={() => toggleTag(tag)}
															className="hover:text-blue-400 p-0.5"
														>
															×
														</button>
													</span>
												))}
											</div>
										)}
									</div>

									{/* Plugins Grid */}
									{filteredPlugins.length > 0 ? (
										<>
											<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4 sm:gap-6">
												{filteredPlugins.map((plugin) => (
													<PluginCard key={plugin.id} plugin={plugin} />
												))}
											</div>

											{/* Load More Button */}
											{hasMore && (
												<div className="mt-6 sm:mt-8 text-center">
													<button
														type="button"
														onClick={loadMore}
														disabled={isLoadingMore}
														className="w-full sm:w-auto px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 active:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
													>
														{isLoadingMore ? (
															<span className="flex items-center justify-center gap-2">
																<span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
																Loading...
															</span>
														) : (
															"Load More Plugins"
														)}
													</button>
												</div>
											)}
										</>
									) : (
										<EmptyState
											onReset={() => {
												setSelectedCategory("all");
												setSelectedTags([]);
												setSearchQuery("");
											}}
										/>
									)}
								</>
							)}

							{/* Loading State */}
							{isLoading && (
								<div className="flex flex-col items-center justify-center min-h-75 sm:min-h-100">
									<div className="animate-spin rounded-full h-12 w-12 sm:h-16 sm:w-16 border-b-2 border-blue-500 mb-4 sm:mb-6"></div>
									<h3 className="text-lg sm:text-xl font-semibold text-theme-text mb-2">
										Loading Plugins...
									</h3>
									<p className="text-sm sm:text-base text-theme-muted text-center px-4">
										Fetching the latest plugins
									</p>
								</div>
							)}

							{/* Error State */}
							{error && (
								<div className="flex flex-col items-center justify-center min-h-75 sm:min-h-100 px-4">
									<div className="text-5xl sm:text-6xl mb-4 sm:mb-6">⚠️</div>
									<h3 className="text-xl sm:text-2xl font-bold text-red-400 mb-3 sm:mb-4 text-center">
										Error Loading Plugins
									</h3>
									<p className="text-sm sm:text-base text-theme-muted mb-4 sm:mb-6 text-center max-w-md">
										{error}
									</p>
									<button
										type="button"
										onClick={() => {
											fetchPlugins(
												true,
												0,
												searchQuery,
												selectedCategory,
												selectedTags,
											);
										}}
										className="w-full sm:w-auto px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors"
									>
										Try Again
									</button>
								</div>
							)}
						</main>
					</div>
				</div>
			</section>

			{/* CTA Section */}
			<section className="py-12 md:py-16 lg:py-20 bg-linear-to-b from-theme-card to-theme-bg border-t border-theme-border">
				<div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
					<h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-theme-text mb-3 sm:mb-4">
						Want to Publish Your Plugin?
					</h2>
					<p className="text-sm sm:text-base md:text-lg text-theme-muted mb-6 sm:mb-8 px-2">
						Share your plugins with the Frame-Master community and help others
						build better applications.
					</p>
					<div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
						<a
							href="/docs/plugin-development"
							className="px-6 sm:px-8 py-3 sm:py-3.5 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 active:bg-blue-700 transition-colors no-underline text-sm sm:text-base"
						>
							Plugin Development Guide
						</a>
						<a
							href="https://github.com/shpaw415/frame-master"
							className="px-6 sm:px-8 py-3 sm:py-3.5 bg-transparent text-theme-secondary border-2 border-theme-border-input font-semibold rounded-xl hover:border-blue-500 hover:bg-blue-500/10 transition-colors no-underline text-sm sm:text-base"
						>
							View on GitHub
						</a>
					</div>
				</div>
			</section>
		</div>
	);
}

// ============================================================================
// COMPONENTS
// ============================================================================

function MobileFilterDrawer({
	categories,
	allTags,
	selectedCategory,
	selectedTags,
	onCategoryChange,
	onTagToggle,
	onClear,
	onClose,
}: {
	categories: ReturnType<typeof pluginCategories>;
	allTags: string[];
	selectedCategory: string;
	selectedTags: string[];
	onCategoryChange: (id: string) => void;
	onTagToggle: (tag: string) => void;
	onClear: () => void;
	onClose: () => void;
}) {
	// Prevent body scroll when drawer is open
	useEffect(() => {
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = "";
		};
	}, []);

	return (
		<div className="fixed inset-0 z-50 lg:hidden">
			{/* Backdrop */}
			<button
				type="button"
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={onClose}
			/>

			{/* Drawer */}
			<div className="absolute bottom-0 left-0 right-0 bg-theme-card rounded-t-2xl max-h-[85vh] flex flex-col animate-slide-up">
				{/* Handle */}
				<div className="flex justify-center pt-3 pb-2">
					<div className="w-10 h-1 bg-theme-border rounded-full" />
				</div>

				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-theme-border">
					<h2 className="text-lg font-bold text-theme-text">Filters</h2>
					<button
						type="button"
						onClick={onClose}
						className="p-2 text-theme-muted hover:text-theme-text transition-colors"
					>
						✕
					</button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto p-4 space-y-6">
					{/* Categories */}
					<div>
						<h3 className="text-sm font-bold text-theme-text mb-3 uppercase tracking-wider">
							Categories
						</h3>
						<div className="grid grid-cols-2 gap-2">
							{categories.map((category) => (
								<button
									type="button"
									key={category.id}
									onClick={() => onCategoryChange(category.id)}
									className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
										selectedCategory === category.id
											? "bg-blue-500 text-white font-semibold"
											: "bg-theme-input text-theme-muted active:bg-theme-border"
									}`}
								>
									<span>{category.icon}</span>
									<span className="truncate">{category.name}</span>
								</button>
							))}
						</div>
					</div>

					{/* Tags */}
					<div>
						<h3 className="text-sm font-bold text-theme-text mb-3 uppercase tracking-wider">
							Tags
						</h3>
						<div className="flex flex-wrap gap-2">
							{allTags.map((tag) => (
								<button
									type="button"
									key={tag}
									onClick={() => onTagToggle(tag)}
									className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
										selectedTags.includes(tag)
											? "bg-blue-500 text-white"
											: "bg-theme-input text-theme-muted active:bg-theme-border"
									}`}
								>
									{tag}
								</button>
							))}
						</div>
					</div>
				</div>

				{/* Footer Actions */}
				<div className="p-4 border-t border-theme-border flex gap-3 bg-theme-card">
					<button
						type="button"
						onClick={onClear}
						className="flex-1 px-4 py-3 bg-theme-input text-theme-muted font-semibold rounded-lg active:bg-theme-border transition-colors"
					>
						Clear All
					</button>
					<button
						type="button"
						onClick={onClose}
						className="flex-1 px-4 py-3 bg-blue-500 text-white font-semibold rounded-lg active:bg-blue-600 transition-colors"
					>
						Apply Filters
					</button>
				</div>
			</div>

			<style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
		</div>
	);
}

function PluginCard({ plugin }: { plugin: Plugin }) {
	const [copied, setCopied] = useState(false);

	const copyInstallCommand = () => {
		navigator.clipboard.writeText(plugin.installation as string);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="p-4 sm:p-6 bg-theme-card border border-theme-border rounded-xl hover:border-blue-500 transition-all duration-300 flex flex-col">
			{/* Header */}
			<a
				className="flex items-start gap-3 mb-3 sm:mb-4 cursor-pointer hover:bg-blue-800/5 rounded-xl p-1 -m-1 transition-colors"
				href={`/plugins/package/${plugin.id}`}
			>
				<div className="text-3xl sm:text-4xl shrink-0">{plugin.icon}</div>
				<div className="min-w-0 flex-1">
					<h3 className="text-base sm:text-xl font-bold text-theme-text truncate">
						{plugin.name}
					</h3>
					<p className="text-xs text-theme-disabled truncate">
						v{plugin.version} · by {plugin.author}
					</p>
				</div>
			</a>

			{/* Description */}
			<p className="text-xs sm:text-sm text-theme-muted mb-3 sm:mb-4 grow line-clamp-2 sm:line-clamp-3">
				{plugin.description}
			</p>

			{/* Tags */}
			<div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
				{plugin.tags.slice(0, 2).map((tag) => (
					<span
						key={tag}
						className="px-2 py-0.5 sm:py-1 bg-theme-input text-theme-muted rounded text-xs"
					>
						{tag}
					</span>
				))}
				{plugin.tags.length > 2 && (
					<span className="px-2 py-0.5 sm:py-1 bg-theme-input text-theme-muted rounded text-xs">
						+{plugin.tags.length - 2}
					</span>
				)}
			</div>

			{/* Stats */}
			<div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4 text-xs text-theme-disabled">
				<span className="flex items-center gap-1">
					<span>📦</span>
					<span className="truncate">{plugin.downloads.toLocaleString()}</span>
				</span>
				<span className="flex items-center gap-1">
					<span>📂</span>
					<span className="truncate">{plugin.category}</span>
				</span>
			</div>

			{/* Install Command */}
			<div className="mb-3 sm:mb-4">
				<button
					type="button"
					className="flex items-center justify-between bg-theme-bg border border-theme-border rounded-lg px-2 sm:px-3 py-2 cursor-pointer hover:border-theme-hover-border active:bg-theme-input transition-colors gap-2"
					onClick={copyInstallCommand}
				>
					<code className="text-xs text-theme-secondary font-mono truncate flex-1">
						{plugin.installation}
					</code>
					<button
						type="button"
						className="text-theme-disabled hover:text-theme-text transition-colors text-sm shrink-0 p-1"
					>
						{copied ? "✓" : "📋"}
					</button>
				</button>
			</div>

			{/* Links */}
			<div className="flex gap-2">
				{plugin.docsUrl && (
					<a
						href={plugin.docsUrl}
						className="flex-1 px-3 sm:px-4 py-2 bg-blue-500 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-blue-600 active:bg-blue-700 transition-colors text-center no-underline"
					>
						Docs
					</a>
				)}
				{plugin.githubUrl && (
					<a
						href={plugin.githubUrl}
						className="flex-1 px-3 sm:px-4 py-2 bg-theme-input text-theme-secondary text-xs sm:text-sm font-semibold rounded-lg hover:bg-theme-border active:bg-theme-border transition-colors text-center no-underline"
					>
						GitHub
					</a>
				)}
			</div>
		</div>
	);
}

function FilterSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="bg-theme-card border border-theme-border rounded-xl p-4">
			<h3 className="text-sm font-bold text-theme-text mb-3 uppercase tracking-wider">
				{title}
			</h3>
			<div className="space-y-1">{children}</div>
		</div>
	);
}

function FilterButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`w-full px-3 py-2.5 rounded-lg text-sm text-left transition-colors flex items-center ${
				active
					? "bg-blue-500 text-white font-semibold"
					: "text-theme-muted hover:bg-theme-input hover:text-theme-text"
			}`}
		>
			{children}
		</button>
	);
}

function TagButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
				active
					? "bg-blue-500 text-white"
					: "bg-theme-input text-theme-muted hover:text-theme-text"
			}`}
		>
			{children}
		</button>
	);
}

function EmptyState({ onReset }: { onReset: () => void }) {
	return (
		<div className="text-center py-12 sm:py-16 px-4">
			<div className="text-5xl sm:text-6xl mb-4">🔍</div>
			<h3 className="text-xl sm:text-2xl font-bold text-theme-text mb-2">
				No plugins found
			</h3>
			<p className="text-sm sm:text-base text-theme-muted mb-6">
				Try adjusting your filters or search query
			</p>
			<button
				type="button"
				onClick={onReset}
				className="w-full sm:w-auto px-6 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 active:bg-blue-700 transition-colors"
			>
				Clear All Filters
			</button>
		</div>
	);
}
