import { usePath } from "frame-master-plugin-react-to-html/hooks";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { RedirectToLogin } from "@/components/redirectToLogin";
import { useAuth } from "@/hooks";
import { navigate, routes } from "@/utils";

// ============================================================================
// TYPES
// ============================================================================

interface NavItem {
	label: string;
	shortLabel: string;
	path: string;
	icon: string;
}

// ============================================================================
// NAVIGATION CONFIG
// ============================================================================

const navigationItems: NavItem[] = [
	{
		label: "Dashboard",
		shortLabel: "Home",
		path: routes.admin.index,
		icon: "📊",
	},
	{
		label: "User Management",
		shortLabel: "Users",
		path: routes.admin.user,
		icon: "👥",
	},
	{
		label: "Plugin Management",
		shortLabel: "Plugins",
		path: routes.admin.plugin,
		icon: "🔌",
	},
	{
		label: "Template Management",
		shortLabel: "Templates",
		path: routes.admin.templates,
		icon: "📁",
	},
	{
		label: "Error Logs",
		shortLabel: "Logs",
		path: routes.admin.logs,
		icon: "🐛",
	},
	{
		label: "Release Notes",
		shortLabel: "Releases",
		path: routes.admin.release,
		icon: "📝",
	},
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminPanelLayout({
	children,
}: {
	children: JSX.Element;
}) {
	const auth = useAuth();
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const currentPath = usePath();

	// Close mobile menu on route change
	useEffect(() => {
		currentPath;
		setIsMobileMenuOpen(false);
	}, [currentPath]);

	// Close mobile menu on escape key
	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") setIsMobileMenuOpen(false);
		};
		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, []);

	const toggleSidebar = () => {
		setIsSidebarOpen(!isSidebarOpen);
	};

	const handleNavigation = (path: string) => {
		navigate(path);
		setIsMobileMenuOpen(false);
	};

	const handleLogout = () => {
		navigate("/");
	};

	// Get current page title
	const currentPage = navigationItems.find((item) => currentPath === item.path);

	if (!auth.isAuthenticated && auth.isLoaded) return <RedirectToLogin />;

	return (
		<div className="min-h-screen bg-theme-bg text-theme-text">
			{/* Mobile Header */}
			<header className="lg:hidden sticky top-16 z-40 bg-theme-card border-b border-theme-border">
				<div className="flex items-center justify-between px-4 py-3">
					<button
						type="button"
						onClick={() => setIsMobileMenuOpen(true)}
						className="p-2 -ml-2 hover:bg-theme-input rounded-lg transition-colors"
						aria-label="Open menu"
					>
						<svg
							className="w-6 h-6"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<title>Open menu</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M4 6h16M4 12h16M4 18h16"
							/>
						</svg>
					</button>
					<div className="flex items-center gap-2">
						<span className="text-lg">{currentPage?.icon || "⚙️"}</span>
						<h1 className="font-bold text-theme-text">
							{currentPage?.shortLabel || "Admin"}
						</h1>
					</div>
					<a
						href="/"
						className="p-2 -mr-2 hover:bg-theme-input rounded-lg transition-colors"
						aria-label="Back to site"
					>
						<svg
							className="w-6 h-6"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<title>Back to site</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
							/>
						</svg>
					</a>
				</div>
			</header>

			{/* Mobile Sidebar Overlay */}
			{isMobileMenuOpen && (
				<button
					type="button"
					className="lg:hidden fixed inset-0 bg-black/60 z-50"
					onClick={() => setIsMobileMenuOpen(false)}
				/>
			)}

			{/* Mobile Sidebar Drawer */}
			<aside
				className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-theme-card border-r border-theme-border transform transition-transform duration-300 ease-out ${
					isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				{/* Mobile Sidebar Header */}
				<div className="p-4 border-b border-theme-border flex items-center justify-between">
					<div>
						<h1 className="text-xl font-bold">Admin Panel</h1>
						<p className="text-xs text-theme-muted">Management Dashboard</p>
					</div>
					<button
						type="button"
						onClick={() => setIsMobileMenuOpen(false)}
						className="p-2 hover:bg-theme-input rounded-lg transition-colors"
						aria-label="Close menu"
					>
						<svg
							className="w-5 h-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<title>Close menu</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>

				{/* Mobile Navigation */}
				<nav className="flex-1 p-4 overflow-y-auto">
					<ul className="space-y-1">
						{navigationItems.map((item) => {
							const isActive = currentPath === item.path;
							return (
								<li key={item.path}>
									<button
										type="button"
										onClick={() => handleNavigation(item.path)}
										className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors active:scale-[0.98] ${
											isActive
												? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
												: "hover:bg-theme-input text-theme-secondary"
										}`}
									>
										<span className="text-xl">{item.icon}</span>
										<span className="font-medium">{item.label}</span>
										{isActive && (
											<svg
												className="w-5 h-5 ml-auto"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<title>Current page</title>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													strokeWidth={2}
													d="M9 5l7 7-7 7"
												/>
											</svg>
										)}
									</button>
								</li>
							);
						})}
					</ul>
				</nav>

				{/* Mobile Footer */}
				<div className="p-4 border-t border-theme-border space-y-2">
					<button
						type="button"
						onClick={() => handleNavigation("/")}
						className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-theme-input text-theme-secondary active:scale-[0.98]"
					>
						<span className="text-xl">🏠</span>
						<span className="font-medium">Back to Site</span>
					</button>
					<button
						type="button"
						onClick={handleLogout}
						className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-red-500/20 text-red-400 active:scale-[0.98]"
					>
						<span className="text-xl">🚪</span>
						<span className="font-medium">Logout</span>
					</button>
				</div>
			</aside>

			<div className="flex">
				{/* Desktop Sidebar */}
				<aside
					className={`hidden lg:flex ${
						isSidebarOpen ? "w-64" : "w-20"
					} bg-theme-card border-r border-theme-border transition-all duration-300 flex-col sticky top-16 h-[calc(100vh-4rem)]`}
				>
					{/* Desktop Sidebar Header */}
					<div className="p-4 border-b border-theme-border flex items-center justify-between">
						{isSidebarOpen && (
							<div className="min-w-0">
								<h1 className="text-xl font-bold truncate">Admin Panel</h1>
								<p className="text-xs text-theme-muted">Management Dashboard</p>
							</div>
						)}
						<button
							type="button"
							onClick={toggleSidebar}
							className="p-2 hover:bg-theme-input rounded-lg transition-colors shrink-0"
							title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
						>
							<svg
								className={`w-5 h-5 transition-transform ${
									isSidebarOpen ? "" : "rotate-180"
								}`}
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<title>
									{isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
								</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
								/>
							</svg>
						</button>
					</div>

					{/* Desktop Navigation */}
					<nav className="flex-1 p-3 overflow-y-auto">
						<ul className="space-y-1">
							{navigationItems.map((item) => {
								const isActive = currentPath === item.path;
								return (
									<li key={item.path}>
										<button
											type="button"
											onClick={() => handleNavigation(item.path)}
											className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
												isActive
													? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
													: "hover:bg-theme-input text-theme-secondary"
											}`}
											title={!isSidebarOpen ? item.label : ""}
										>
											<span
												className={`${
													isSidebarOpen ? "text-xl" : "text-2xl mx-auto"
												}`}
											>
												{item.icon}
											</span>
											{isSidebarOpen && (
												<span className="font-medium text-sm truncate">
													{item.label}
												</span>
											)}
										</button>
									</li>
								);
							})}
						</ul>
					</nav>

					{/* Desktop Footer */}
					<div className="p-3 border-t border-theme-border space-y-1">
						<button
							type="button"
							onClick={() => handleNavigation("/")}
							className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-theme-input text-theme-secondary"
							title={!isSidebarOpen ? "Back to Site" : ""}
						>
							<span
								className={`${isSidebarOpen ? "text-xl" : "text-2xl mx-auto"}`}
							>
								🏠
							</span>
							{isSidebarOpen && (
								<span className="font-medium text-sm">Back to Site</span>
							)}
						</button>
						<button
							type="button"
							onClick={handleLogout}
							className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors hover:bg-red-500/20 text-red-400"
							title={!isSidebarOpen ? "Logout" : ""}
						>
							<span
								className={`${isSidebarOpen ? "text-xl" : "text-2xl mx-auto"}`}
							>
								🚪
							</span>
							{isSidebarOpen && (
								<span className="font-medium text-sm">Logout</span>
							)}
						</button>
					</div>
				</aside>

				{/* Main Content */}
				<main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>
			</div>
		</div>
	);
}
