import type { parsedPlugin } from "db/schema";
import { useCallback, useEffect, useState } from "react";
import {
	GET as getProfile,
	type PublicUserProfile,
} from "@/actions/api/profile";
import { navigate, routes, searchParams } from "@/utils";

// ============================================================================
// LOADING SKELETON
// ============================================================================

function ProfileSkeleton() {
	return (
		<div className="min-h-screen bg-theme-bg p-6">
			<div className="max-w-4xl mx-auto">
				{/* Profile Header Skeleton */}
				<div className="bg-theme-card border border-theme-border rounded-xl p-8 mb-8">
					<div className="flex flex-col md:flex-row items-center md:items-start gap-6">
						<div className="w-32 h-32 rounded-full bg-theme-input animate-pulse" />
						<div className="flex-1 text-center md:text-left">
							<div className="h-8 w-48 bg-theme-input rounded animate-pulse mb-3" />
							<div className="h-4 w-64 bg-theme-input rounded animate-pulse mb-4" />
							<div className="h-4 w-32 bg-theme-input rounded animate-pulse" />
						</div>
					</div>
				</div>

				{/* Plugins Skeleton */}
				<div className="h-8 w-40 bg-theme-input rounded animate-pulse mb-4" />
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{[1, 2, 3, 4].map((i) => (
						<div
							key={i}
							className="bg-theme-card border border-theme-border rounded-xl p-6"
						>
							<div className="h-6 w-32 bg-theme-input rounded animate-pulse mb-2" />
							<div className="h-4 w-full bg-theme-input rounded animate-pulse mb-2" />
							<div className="h-4 w-3/4 bg-theme-input rounded animate-pulse" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// ERROR STATE
// ============================================================================

function ProfileError({ message }: { message: string }) {
	return (
		<div className="min-h-screen bg-theme-bg p-6 flex items-center justify-center">
			<div className="bg-theme-card border border-red-500/30 rounded-xl p-8 max-w-md text-center">
				<div className="text-6xl mb-4">😕</div>
				<h1 className="text-2xl font-bold text-theme-text mb-2">
					Profile Not Found
				</h1>
				<p className="text-theme-muted mb-6">{message}</p>
				<button
					type="button"
					onClick={() => navigate(routes.home)}
					className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-all font-semibold"
				>
					Go Home
				</button>
			</div>
		</div>
	);
}

// ============================================================================
// PLUGIN CARD
// ============================================================================

function PluginCard({ plugin }: { plugin: parsedPlugin }) {
	return (
		<a
			href={routes.showPlugin(String(plugin.id))}
			className="bg-theme-card border border-theme-border rounded-xl p-6 transition-all duration-300 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5 block"
		>
			<div className="flex items-start gap-3 mb-3">
				<span className="text-2xl">{plugin.icon}</span>
				<div className="flex-1 min-w-0">
					<h3 className="text-lg font-semibold text-theme-text truncate">
						{plugin.name}
					</h3>
					<span className="text-xs text-theme-disabled">v{plugin.version}</span>
				</div>
			</div>
			<p className="text-theme-muted text-sm line-clamp-2 mb-3">
				{plugin.description}
			</p>
			<div className="flex flex-wrap gap-2">
				<span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-full">
					{plugin.category}
				</span>
				{plugin.tags.slice(0, 2).map((tag) => (
					<span
						key={tag}
						className="px-2 py-1 bg-theme-input text-theme-muted text-xs rounded-full"
					>
						{tag}
					</span>
				))}
			</div>
		</a>
	);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ProfilePage() {
	const userId = searchParams("id");
	const [profile, setProfile] = useState<PublicUserProfile | null>(null);
	const [plugins, setPlugins] = useState<parsedPlugin[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const loadProfile = useCallback(async () => {
		setIsLoading(true);

		try {
			const response = await getProfile({ userId: userId as string });

			if (!response.success || !response.profile) {
				throw new Error(response.message || "User not found");
			}

			setProfile(response.profile);
			setPlugins(response.plugins || []);
		} catch (err: any) {
			throw new Error(err.message || "Failed to load profile");
		} finally {
			setIsLoading(false);
		}
	}, [userId]);

	useEffect(() => {
		if (!userId) {
			throw new Error("No user ID provided");
		}

		loadProfile();
	}, [userId, loadProfile]);

	if (isLoading) {
		return <ProfileSkeleton />;
	}

	if (!profile) {
		return <ProfileError message="User not found" />;
	}

	const memberSince = profile.createdAt
		? new Date(profile.createdAt).toLocaleDateString("en-US", {
				month: "long",
				year: "numeric",
			})
		: null;

	return (
		<div className="min-h-screen bg-theme-bg p-6">
			<div className="max-w-4xl mx-auto">
				{/* Profile Header */}
				<div className="bg-theme-card border border-theme-border rounded-xl p-8 mb-8">
					<div className="flex flex-col md:flex-row items-center md:items-start gap-6">
						{/* Avatar */}
						{profile.avatarUrl ? (
							<img
								src={profile.avatarUrl}
								alt={profile.name}
								className="w-32 h-32 rounded-full object-cover border-4 border-theme-border"
							/>
						) : (
							<div className="w-32 h-32 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-theme-text text-4xl font-bold">
								{profile.name.charAt(0).toUpperCase()}
							</div>
						)}

						{/* Profile Info */}
						<div className="flex-1 text-center md:text-left">
							<h1 className="text-3xl font-bold text-theme-text mb-2">
								{profile.name}
							</h1>

							{profile.bio && (
								<p className="text-theme-secondary mb-4 max-w-xl">
									{profile.bio}
								</p>
							)}

							<div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-theme-muted">
								{memberSince && (
									<div className="flex items-center gap-2">
										<svg
											className="w-4 h-4"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<title>Member since</title>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
											/>
										</svg>
										<span>Member since {memberSince}</span>
									</div>
								)}

								{profile.githubUrl && (
									<a
										href={profile.githubUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center gap-2 hover:text-theme-text transition-colors"
									>
										<svg
											className="w-4 h-4"
											fill="currentColor"
											viewBox="0 0 24 24"
										>
											<title>GitHub Profile</title>
											<path
												fillRule="evenodd"
												d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
												clipRule="evenodd"
											/>
										</svg>
										<span>GitHub</span>
									</a>
								)}

								<div className="flex items-center gap-2">
									<svg
										className="w-4 h-4"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<title>Number of Plugins</title>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
										/>
									</svg>
									<span>
										{plugins.length} plugin{plugins.length !== 1 ? "s" : ""}
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Plugins Section */}
				<div>
					<h2 className="text-2xl font-semibold text-theme-text mb-6 flex items-center gap-3">
						<svg
							className="w-6 h-6 text-blue-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<title>Published Plugins</title>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
							/>
						</svg>
						Published Plugins
					</h2>

					{plugins.length === 0 ? (
						<div className="bg-theme-card border border-theme-border rounded-xl p-8 text-center">
							<div className="text-4xl mb-4">📦</div>
							<h3 className="text-lg font-semibold text-theme-text mb-2">
								No plugins yet
							</h3>
							<p className="text-theme-muted">
								This user hasn't published any plugins yet.
							</p>
						</div>
					) : (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							{plugins.map((plugin) => (
								<PluginCard key={plugin.id} plugin={plugin} />
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
