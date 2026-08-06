import type { parsedPlugin, parsedTemplate } from "db/schema";
import { useState } from "react";
import { toast } from "react-toastify";
import { GET as getDashboardData } from "@/actions/api/dashboard";
import { useAuth, useAuthEffect } from "@/hooks";
import { CacheManager, navigate, routes } from "@/utils";

// ============================================================================
// TYPES
// ============================================================================

type Plugin = parsedPlugin;

type Template = parsedTemplate;

type DashboardStats = {
	totalDownloads: number;
	weeklyDownloads: number;
	monthlyDownloads: number;
	totalPlugins: number;
	publishedPlugins: number;
	draftPlugins: number;
	totalTemplates: number;
	publishedTemplates: number;
	draftTemplates: number;
};

// ============================================================================
// CACHE
// ============================================================================

const cache = new CacheManager();

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DashboardPage() {
	const [plugins, setPlugins] = useState<Plugin[]>([]);
	const [templates, setTemplates] = useState<Template[]>([]);
	const [stats, setStats] = useState<DashboardStats | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedTab, setSelectedTab] = useState<"all" | "published" | "draft">(
		"all",
	);
	const [selectedTemplateTab, setSelectedTemplateTab] = useState<
		"all" | "published" | "draft"
	>("all");
	const [showMobileMenu, setShowMobileMenu] = useState(false);
	const auth = useAuth();

	useAuthEffect(async (client) => {
		if (!client.data.public.inited) {
			await client.updateUserSession("public", {
				inited: true,
			});
			navigate("/welcome");
			return;
		}

		loadPlugins()
			.catch((error) => {
				console.error("Failed to load plugins:", error);
			})
			.finally(() => setIsLoading(false));
	});

	const loadPlugins = async () => {
		try {
			const response = await cache.fetch("dashboard-data", getDashboardData);

			if (response.success && response.data) {
				setPlugins(response.data.plugins);
				setTemplates(response.data.templates);
				setStats(response.data.stats);
			} else {
				console.error("Failed to load dashboard data:", response.error);
				// Set empty state
				setPlugins([]);
				setTemplates([]);
				setStats({
					totalDownloads: 0,
					weeklyDownloads: 0,
					monthlyDownloads: 0,
					totalPlugins: 0,
					publishedPlugins: 0,
					draftPlugins: 0,
					totalTemplates: 0,
					publishedTemplates: 0,
					draftTemplates: 0,
				});
			}
		} catch (error) {
			console.error("Failed to load plugins:", error);
			// Set empty state on error
			setPlugins([]);
			setTemplates([]);
			setStats({
				totalDownloads: 0,
				weeklyDownloads: 0,
				monthlyDownloads: 0,
				totalPlugins: 0,
				publishedPlugins: 0,
				draftPlugins: 0,
				totalTemplates: 0,
				publishedTemplates: 0,
				draftTemplates: 0,
			});
		}
	};

	const handleLogout = async () => {
		auth.logout().finally(() => {
			if (!auth.isAuthenticated) toast.info("Logged out successfully.");
			else toast.error("Logout failed. Please try again.");
			navigate("/login");
		});
	};

	const filteredPlugins = plugins.filter((plugin) => {
		if (selectedTab === "published") return plugin.published;
		if (selectedTab === "draft") return !plugin.published;
		return true;
	});

	const filteredTemplates = templates.filter((template) => {
		if (selectedTemplateTab === "published") return template.published;
		if (selectedTemplateTab === "draft") return !template.published;
		return true;
	});

	if (isLoading) {
		return (
			<div className="min-h-screen bg-theme-bg flex items-center justify-center">
				<div className="flex flex-col items-center gap-4">
					<div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
					<p className="text-theme-text font-medium">Loading dashboard...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-theme-bg pb-20 sm:pb-0">
			{/* Header */}
			<header className="bg-theme-card border-b border-theme-border sticky top-16 z-40">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
					<div className="flex items-center justify-between">
						<div className="min-w-0 flex-1">
							<h1 className="text-lg sm:text-2xl font-black text-theme-text truncate">
								Dashboard
							</h1>
							<p className="text-theme-muted text-xs sm:text-sm mt-0.5 sm:mt-1 truncate">
								Welcome, {auth.userInfo?.email?.split("@")[0] || "User"}!
							</p>
						</div>

						{/* Desktop Actions */}
						<div className="hidden md:flex items-center gap-3">
							<a
								href={routes.createTemplate}
								className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white font-semibold transition-colors no-underline flex items-center gap-2 text-sm"
							>
								<span>+</span>
								<span>Template</span>
							</a>
							<a
								href={routes.createPlugin}
								className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors no-underline flex items-center gap-2 text-sm"
							>
								<span>+</span>
								<span>Plugin</span>
							</a>
							<a
								href={routes.settings}
								className="p-2 bg-theme-input hover:bg-theme-border border border-theme-border-input rounded-lg text-theme-secondary hover:text-theme-text transition-colors"
								title="Settings"
							>
								<svg
									className="w-5 h-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<title>Settings</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
									/>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
									/>
								</svg>
							</a>
							<button
								type="button"
								onClick={handleLogout}
								className="px-4 py-2 bg-theme-input hover:bg-theme-border border border-theme-border-input rounded-lg text-theme-secondary hover:text-theme-text font-semibold transition-colors text-sm"
							>
								Logout
							</button>
						</div>

						{/* Mobile Menu Button */}
						<button
							onClick={() => setShowMobileMenu(!showMobileMenu)}
							className="md:hidden p-2 bg-theme-input border border-theme-border rounded-lg text-theme-muted"
							type="button"
						>
							<svg
								className="w-5 h-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<title>Mobile Menu</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
								/>
							</svg>
						</button>
					</div>

					{/* Mobile Menu Dropdown */}
					{showMobileMenu && (
						<div className="md:hidden mt-3 pt-3 border-t border-theme-border space-y-2">
							<a
								href={routes.createPlugin}
								className="flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold no-underline"
							>
								<span className="text-lg">🔌</span>
								<span>New Plugin</span>
							</a>
							<a
								href={routes.createTemplate}
								className="flex items-center gap-3 px-4 py-3 bg-green-600 hover:bg-green-700 rounded-lg text-white font-semibold no-underline"
							>
								<span className="text-lg">📁</span>
								<span>New Template</span>
							</a>
							<a
								href={routes.settings}
								className="flex items-center gap-3 px-4 py-3 bg-theme-input hover:bg-theme-border border border-theme-border rounded-lg text-theme-text font-semibold no-underline"
							>
								<span className="text-lg">⚙️</span>
								<span>Account Settings</span>
							</a>
							<button
								onClick={handleLogout}
								className="w-full flex items-center gap-3 px-4 py-3 bg-theme-input hover:bg-theme-border border border-theme-border rounded-lg text-theme-text font-semibold"
								type="button"
							>
								<span className="text-lg">🚪</span>
								<span>Logout</span>
							</button>
						</div>
					)}
				</div>
			</header>

			<main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
				{/* Stats Grid */}
				{stats && (
					<div className="grid grid-cols-3 gap-3 sm:gap-6 mb-6 sm:mb-8">
						<StatCard
							title="Published"
							value={stats.publishedPlugins.toString()}
							subtitle={`${stats.draftPlugins} draft`}
							icon="🚀"
						/>
						<StatCard
							title="Total"
							value={stats.totalPlugins.toString()}
							subtitle="plugins"
							icon="🔌"
						/>
						<StatCard
							title="Downloads"
							value={formatNumber(stats.totalDownloads)}
							subtitle="all time"
							icon="📥"
						/>
					</div>
				)}

				{/* Plugins Section */}
				<div className="bg-theme-card border border-theme-border rounded-xl overflow-hidden mb-6 sm:mb-8">
					{/* Section Header */}
					<div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-theme-border flex items-center justify-between">
						<h2 className="text-base sm:text-xl font-bold text-theme-text flex items-center gap-2">
							<span>🔌</span>
							<span>Plugins</span>
						</h2>
						<a
							href={routes.createPlugin}
							className="hidden sm:inline-flex px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors no-underline text-sm"
						>
							+ New
						</a>
					</div>

					{/* Tabs */}
					<div className="border-b border-theme-border px-2 sm:px-6 overflow-x-auto">
						<div className="flex min-w-max">
							<TabButton
								active={selectedTab === "all"}
								onClick={() => setSelectedTab("all")}
							>
								All ({plugins.length})
							</TabButton>
							<TabButton
								active={selectedTab === "published"}
								onClick={() => setSelectedTab("published")}
							>
								Published ({stats?.publishedPlugins || 0})
							</TabButton>
							<TabButton
								active={selectedTab === "draft"}
								onClick={() => setSelectedTab("draft")}
							>
								Drafts ({stats?.draftPlugins || 0})
							</TabButton>
						</div>
					</div>

					{/* Plugins List */}
					<div className="divide-y divide-theme-border">
						{filteredPlugins.length === 0 ? (
							<EmptyState
								icon="🔌"
								title="No plugins yet"
								description="Get started by creating your first plugin"
								actionLabel="Create Plugin"
								actionHref={routes.createPlugin}
								actionColor="blue"
							/>
						) : (
							filteredPlugins.map((plugin) => (
								<PluginRow key={plugin.id} plugin={plugin} />
							))
						)}
					</div>
				</div>

				{/* Templates Section */}
				<div className="bg-theme-card border border-theme-border rounded-xl overflow-hidden">
					{/* Section Header */}
					<div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-theme-border flex items-center justify-between">
						<h2 className="text-base sm:text-xl font-bold text-theme-text flex items-center gap-2">
							<span>📁</span>
							<span>Templates</span>
						</h2>
						<a
							href={routes.createTemplate}
							className="hidden sm:inline-flex px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-white font-semibold transition-colors no-underline text-sm"
						>
							+ New
						</a>
					</div>

					{/* Tabs */}
					<div className="border-b border-theme-border px-2 sm:px-6 overflow-x-auto">
						<div className="flex min-w-max">
							<TabButton
								active={selectedTemplateTab === "all"}
								onClick={() => setSelectedTemplateTab("all")}
							>
								All ({templates.length})
							</TabButton>
							<TabButton
								active={selectedTemplateTab === "published"}
								onClick={() => setSelectedTemplateTab("published")}
							>
								Published ({stats?.publishedTemplates || 0})
							</TabButton>
							<TabButton
								active={selectedTemplateTab === "draft"}
								onClick={() => setSelectedTemplateTab("draft")}
							>
								Drafts ({stats?.draftTemplates || 0})
							</TabButton>
						</div>
					</div>

					{/* Templates List */}
					<div className="divide-y divide-theme-border">
						{filteredTemplates.length === 0 ? (
							<EmptyState
								icon="📁"
								title="No templates yet"
								description="Get started by creating your first template"
								actionLabel="Create Template"
								actionHref={routes.createTemplate}
								actionColor="green"
							/>
						) : (
							filteredTemplates.map((template) => (
								<TemplateRow key={template.id} template={template} />
							))
						)}
					</div>
				</div>
			</main>

			{/* Mobile FAB */}
			<div className="sm:hidden fixed bottom-4 right-4 flex flex-col gap-2 z-40">
				<a
					href={routes.createTemplate}
					className="w-12 h-12 bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-full flex items-center justify-center text-white shadow-lg shadow-green-500/25 no-underline"
					title="New Template"
				>
					<span className="text-xl">📁</span>
				</a>
				<a
					href={routes.createPlugin}
					className="w-14 h-14 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/25 no-underline"
					title="New Plugin"
				>
					<span className="text-2xl">+</span>
				</a>
			</div>
		</div>
	);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatNumber(num: number): string {
	if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
	if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
	return num.toString();
}

// ============================================================================
// COMPONENTS
// ============================================================================

function StatCard({
	title,
	value,
	subtitle,
	icon,
}: {
	title: string;
	value: string;
	subtitle: string;
	icon: string;
}) {
	return (
		<div className="bg-theme-card border border-theme-border rounded-xl p-2 sm:p-6 overflow-hidden">
			<div className="flex items-center gap-1.5 sm:gap-0 sm:flex-col sm:items-start">
				<div className="text-base sm:text-3xl sm:mb-3 shrink-0">{icon}</div>
				<div className="flex-1 min-w-0 sm:w-full">
					<h3 className="text-[9px] sm:text-sm text-theme-muted mb-0.5 sm:mb-1 uppercase tracking-wide truncate">
						{title}
					</h3>
					<div className="text-sm sm:text-3xl font-black text-theme-text truncate">
						{value}
					</div>
					<p className="text-[9px] sm:text-sm text-theme-disabled hidden sm:block truncate">
						{subtitle}
					</p>
				</div>
			</div>
		</div>
	);
}

function TabButton({
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
			className={`px-3 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-base font-semibold transition-colors border-b-2 whitespace-nowrap ${
				active
					? "text-blue-500 border-blue-500"
					: "text-theme-muted border-transparent hover:text-theme-text active:text-theme-text"
			}`}
		>
			{children}
		</button>
	);
}

function EmptyState({
	icon,
	title,
	description,
	actionLabel,
	actionHref,
	actionColor,
}: {
	icon: string;
	title: string;
	description: string;
	actionLabel: string;
	actionHref: string;
	actionColor: "blue" | "green";
}) {
	const colorClasses =
		actionColor === "blue"
			? "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
			: "bg-green-600 hover:bg-green-700 active:bg-green-800";

	return (
		<div className="p-8 sm:p-12 text-center">
			<div className="text-4xl sm:text-6xl mb-3 sm:mb-4">{icon}</div>
			<h3 className="text-lg sm:text-xl font-bold text-theme-text mb-2">
				{title}
			</h3>
			<p className="text-sm text-theme-muted mb-4 sm:mb-6">{description}</p>
			<a
				href={actionHref}
				className={`inline-block px-5 sm:px-6 py-2.5 sm:py-3 ${colorClasses} rounded-lg text-white font-semibold transition-colors no-underline text-sm sm:text-base`}
			>
				{actionLabel}
			</a>
		</div>
	);
}

function PluginRow({ plugin }: { plugin: Plugin }) {
	return (
		<a
			href={routes.editPlugin(String(plugin.id))}
			className="block p-4 sm:p-6 hover:bg-theme-input active:bg-theme-input transition-colors no-underline"
		>
			<div className="flex items-start gap-3 sm:gap-4">
				{/* Icon */}
				<div className="w-10 h-10 sm:w-12 sm:h-12 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-base sm:text-xl shrink-0">
					{plugin.name.charAt(0).toUpperCase()}
				</div>

				{/* Main Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2 mb-1">
						<div className="flex items-center gap-2 min-w-0 flex-1">
							<h3 className="text-sm sm:text-lg font-bold text-theme-text truncate">
								{plugin.name}
							</h3>
							{!plugin.published && (
								<span className="px-1.5 sm:px-2 py-0.5 bg-yellow-500/10 text-yellow-500 text-[10px] sm:text-xs font-semibold rounded shrink-0">
									Draft
								</span>
							)}
						</div>

						{/* Desktop Edit Button */}
						<span className="hidden sm:inline-flex px-3 py-1.5 bg-theme-input hover:bg-theme-border border border-theme-border-input rounded-lg text-theme-text text-sm font-semibold transition-colors shrink-0">
							Edit
						</span>
					</div>

					<p className="text-theme-muted text-xs sm:text-sm mb-2 line-clamp-1 sm:line-clamp-2">
						{plugin.description}
					</p>

					<div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-theme-disabled flex-wrap">
						<span>v{plugin.version}</span>
						<span className="hidden sm:inline">•</span>
						<span>{formatNumber(plugin.downloads)} downloads</span>
						<span className="hidden sm:inline">•</span>
						<span className="hidden sm:inline">
							Updated {new Date(plugin.updatedAt).toLocaleDateString()}
						</span>
					</div>
				</div>

				{/* Mobile Arrow */}
				<span className="sm:hidden text-theme-disabled text-lg">›</span>
			</div>
		</a>
	);
}

function TemplateRow({ template }: { template: Template }) {
	return (
		<a
			href={routes.editTemplate(String(template.id))}
			className="block p-4 sm:p-6 hover:bg-theme-input active:bg-theme-input transition-colors no-underline"
		>
			<div className="flex items-start gap-3 sm:gap-4">
				{/* Icon */}
				<div className="w-10 h-10 sm:w-12 sm:h-12 bg-linear-to-br from-green-500 to-teal-600 rounded-lg flex items-center justify-center text-xl sm:text-2xl shrink-0">
					{template.icon}
				</div>

				{/* Main Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2 mb-1">
						<div className="flex items-center gap-2 min-w-0 flex-1">
							<h3 className="text-sm sm:text-lg font-bold text-theme-text truncate">
								{template.name}
							</h3>
							{!template.published ? (
								<span className="px-1.5 sm:px-2 py-0.5 bg-yellow-500/10 text-yellow-500 text-[10px] sm:text-xs font-semibold rounded shrink-0">
									Draft
								</span>
							) : (
								<span className="px-1.5 sm:px-2 py-0.5 bg-green-500/10 text-green-500 text-[10px] sm:text-xs font-semibold rounded shrink-0">
									Live
								</span>
							)}
						</div>

						{/* Desktop Actions */}
						<div className="hidden sm:flex items-center gap-2 shrink-0">
							<button
								type="button"
								onClick={(e) => {
									e.preventDefault();
									navigate(routes.showTemplate(String(template.id)));
								}}
								className="px-3 py-1.5 bg-theme-input hover:bg-theme-border border border-theme-border-input rounded-lg text-theme-text text-sm font-semibold transition-colors cursor-pointer"
							>
								View
							</button>
							<span className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm font-semibold transition-colors">
								Edit
							</span>
						</div>
					</div>

					<p className="text-theme-muted text-xs sm:text-sm mb-2 line-clamp-1 sm:line-clamp-2">
						{template.description}
					</p>

					<div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-theme-disabled flex-wrap">
						<span>v{template.defaultVersion}</span>
						<span className="hidden sm:inline">•</span>
						<span>{template.category}</span>
						<span className="hidden sm:inline">•</span>
						<span className="hidden sm:inline">
							Updated {new Date(template.updatedAt).toLocaleDateString()}
						</span>
					</div>
				</div>

				{/* Mobile Arrow */}
				<span className="sm:hidden text-theme-disabled text-lg">›</span>
			</div>
		</a>
	);
}
