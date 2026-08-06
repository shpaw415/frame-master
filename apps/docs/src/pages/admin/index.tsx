import { GET as getState } from "@api/admin/state";
import { clsx } from "clsx";
import { useState } from "react";
import { toast } from "react-toastify";
import { useAuthEffect } from "@/hooks";
import { routes } from "@/utils";

// ============================================================================
// TYPES
// ============================================================================

interface QuickAction {
	label: string;
	description: string;
	icon: string;
	href: string;
	color: string;
}

interface StatCard {
	label: string;
	value: string | number;
	change?: string;
	changeType?: "positive" | "negative" | "neutral";
	icon: string;
}

// ============================================================================
// CONFIG
// ============================================================================

const quickActions: QuickAction[] = [
	{
		label: "Manage Users",
		description: "View and edit user accounts",
		icon: "👥",
		href: routes.admin.user,
		color: "blue",
	},
	{
		label: "Manage Plugins",
		description: "Review and moderate plugins",
		icon: "🔌",
		href: routes.admin.plugin,
		color: "purple",
	},
	{
		label: "Manage Templates",
		description: "Review and moderate templates",
		icon: "📁",
		href: routes.admin.templates,
		color: "green",
	},
	{
		label: "View Error Logs",
		description: "Monitor application errors",
		icon: "🐛",
		href: routes.admin.logs,
		color: "red",
	},
	{
		label: "Release Notes",
		description: "Manage version releases",
		icon: "📝",
		href: routes.admin.release,
		color: "orange",
	},
	{
		label: "Back to Site",
		description: "Return to main website",
		icon: "🏠",
		href: "/",
		color: "gray",
	},
];

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminIndexPage() {
	const [stats, setStats] = useState<StatCard[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	useAuthEffect(() => {
		getState().then((res) => {
			if (!res.success) {
				// Handle error (e.g., show notification)
				toast.error(res.message || "Failed to load admin stats.");
				setIsLoading(false);
				return;
			}
			setStats([
				{ label: "Total Users", value: res.data.userCount, icon: "👥" },
				{
					label: "Active Plugins",
					value: res.data.pluginCount ?? 0,
					icon: "🔌",
				},
				{ label: "Templates", value: res.data.templateCount ?? 0, icon: "📁" },
				{
					label: "Open Errors",
					value: res.data.errorLogCount ?? 0,
					icon: "🐛",
					changeType: "neutral",
				},
			]);
			setIsLoading(false);
			return;
		});
	});
	return (
		<div className="min-h-screen bg-theme-bg">
			{/* Header */}
			<div className="bg-theme-card border-b border-theme-border">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div>
							<h1 className="text-2xl sm:text-3xl font-black text-theme-text">
								Welcome back! 👋
							</h1>
							<p className="text-theme-muted mt-1 text-sm sm:text-base">
								Here's what's happening with your platform today.
							</p>
						</div>
						<div className="flex items-center gap-2 text-sm text-theme-muted">
							<span>🕐</span>
							<span>
								{new Date().toLocaleDateString("en-US", {
									weekday: "long",
									month: "short",
									day: "numeric",
								})}
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
				{/* Stats Grid */}
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
					{isLoading
						? Array.from({ length: 4 }).map((_, i) => (
								<div
									key={i}
									className="bg-theme-card border border-theme-border rounded-xl p-4 sm:p-6 animate-pulse"
								>
									<div className="flex items-center gap-3">
										<div className="w-10 h-10 sm:w-12 sm:h-12 bg-theme-input rounded-lg" />
										<div className="flex-1">
											<div className="h-3 bg-theme-input rounded w-16 mb-2" />
											<div className="h-6 bg-theme-input rounded w-12" />
										</div>
									</div>
								</div>
							))
						: stats.map((stat) => (
								<div
									key={stat.label}
									className="bg-theme-card border border-theme-border rounded-xl p-4 sm:p-6"
								>
									<div className="flex items-center gap-3">
										<div className="w-10 h-10 sm:w-12 sm:h-12 bg-theme-input rounded-lg flex items-center justify-center text-xl sm:text-2xl shrink-0">
											{stat.icon}
										</div>
										<div className="min-w-0">
											<p className="text-[10px] sm:text-xs text-theme-muted uppercase tracking-wide truncate">
												{stat.label}
											</p>
											<p className="text-lg sm:text-2xl font-black text-theme-text">
												{stat.value}
											</p>
											{stat.change && (
												<p
													className={`text-[10px] sm:text-xs ${
														stat.changeType === "positive"
															? "text-green-500"
															: stat.changeType === "negative"
																? "text-red-500"
																: "text-theme-muted"
													}`}
												>
													{stat.change}
												</p>
											)}
										</div>
									</div>
								</div>
							))}
				</div>

				{/* Quick Actions */}
				<div className="mb-6 sm:mb-8">
					<h2 className="text-lg sm:text-xl font-bold text-theme-text mb-4">
						Quick Actions
					</h2>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
						{quickActions.map((action) => (
							<a
								key={action.label}
								href={action.href}
								className={clsx(
									"flex items-start gap-4 p-4 sm:p-5 border rounded-xl transition-all duration-200 no-underline group active:scale-[0.98]",
									action.color === "blue" &&
										"bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/50",
									action.color === "purple" &&
										"bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-500/50",
									action.color === "green" &&
										"bg-green-500/10 border-green-500/30 hover:bg-green-500/20 hover:border-green-500/50",
									action.color === "red" &&
										"bg-red-500/10 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50",
									action.color === "orange" &&
										"bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20 hover:border-orange-500/50",
									action.color === "gray" &&
										"bg-gray-500/10 border-gray-500/30 hover:bg-gray-500/20 hover:border-gray-500/50",
								)}
							>
								<div className="text-2xl sm:text-3xl shrink-0">
									{action.icon}
								</div>
								<div className="min-w-0 flex-1">
									<h3 className="font-bold text-theme-text group-hover:text-theme-text text-sm sm:text-base">
										{action.label}
									</h3>
									<p className="text-theme-muted text-xs sm:text-sm mt-0.5 line-clamp-2">
										{action.description}
									</p>
								</div>
								<svg
									className="w-5 h-5 text-theme-disabled group-hover:text-theme-muted shrink-0 mt-0.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<title>{action.label}</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M9 5l7 7-7 7"
									/>
								</svg>
							</a>
						))}
					</div>
				</div>

				{/* Tips Section */}
				<div className="bg-linear-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-5 sm:p-6">
					<div className="flex items-start gap-4">
						<div className="text-2xl sm:text-3xl">💡</div>
						<div>
							<h3 className="font-bold text-theme-text text-sm sm:text-base mb-1">
								Admin Tips
							</h3>
							<ul className="text-theme-muted text-xs sm:text-sm space-y-1">
								<li>
									• Use the sidebar to navigate between different management
									sections
								</li>
								<li>
									• Check the Error Logs regularly to monitor application health
								</li>
								<li>
									• Review pending plugins and templates before publishing
								</li>
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
