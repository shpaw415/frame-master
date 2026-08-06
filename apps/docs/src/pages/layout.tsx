import { usePath } from "frame-master-plugin-react-to-html/hooks";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useAuth } from "@/hooks";
import { useTheme } from "@/theme";
import { routes } from "@/utils";

export default function LayoutPage({ children }: { children: JSX.Element }) {
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

	const currentPath = usePath();

	const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

	const auth = useAuth();

	return (
		<div className="min-h-screen bg-theme-bg flex flex-col">
			{/* Header */}
			<header className="sticky top-0 z-50 bg-theme-bg/95 backdrop-blur-sm border-b border-theme-border">
				<div className="max-w-7xl mx-auto px-6">
					<div className="flex items-center justify-between h-16">
						{/* Logo */}
						<div className="flex items-center gap-8">
							<a
								href="/"
								className="group flex items-center gap-3 no-underline"
							>
								<span className="w-10 h-10 transition-transform group-hover:translate-x-0.75">
									<img
										src="/static/logo.png"
										alt="Frame-master logo"
										className="w-full h-full"
									/>
								</span>
								<span className="relative overflow-hidden text-theme-text font-bold text-xl hidden md:block">
									Frame-Master
									<div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-linear-to-r from-transparent via-white/40 to-transparent -skew-x-45" />
								</span>
							</a>

							{/* Desktop Navigation */}
							<nav className="hidden lg:flex items-center gap-1">
								<NavLink href="/" active={currentPath === "/"}>
									Home
								</NavLink>
								<NavLink
									href="/plugins"
									active={currentPath.startsWith("/plugins")}
								>
									Plugins
								</NavLink>
								<NavLink
									href="/templates"
									active={currentPath.startsWith("/templates")}
								>
									Templates
								</NavLink>
								<NavLink href="/docs" active={currentPath.startsWith("/docs")}>
									Docs
								</NavLink>
								<NavLink href="/blog" active={currentPath.startsWith("/blog")}>
									Blog
								</NavLink>
								{auth.userMeta.role === "admin" && (
									<NavLink
										href="/admin"
										active={currentPath.startsWith("/admin")}
									>
										Admin
									</NavLink>
								)}
							</nav>
						</div>

						{/* Right Side Actions */}
						<div className="flex items-center gap-4">
							{/* Theme Toggle */}
							<ThemeToggle />

							{/* GitHub Link */}
							<a
								href="https://github.com/shpaw415/frame-master"
								target="_blank"
								rel="noopener noreferrer"
								className="hidden md:flex items-center gap-2 px-4 py-2 bg-theme-card border border-theme-border rounded-lg text-theme-muted hover:text-theme-text hover:border-theme-disabled transition-colors no-underline"
							>
								<span className="text-xl">⭐</span>
								<span className="text-sm font-semibold">GitHub</span>
							</a>

							{/* Login Button */}
							<LoginButton />

							{/* Mobile Menu Toggle */}
							<button
								type="button"
								onClick={toggleMobileMenu}
								className="lg:hidden flex items-center justify-center w-10 h-10 bg-theme-card border border-theme-border rounded-lg text-theme-muted hover:text-theme-text hover:border-theme-disabled transition-colors"
							>
								{isMobileMenuOpen ? "✕" : "☰"}
							</button>
						</div>
					</div>
				</div>

				{/* Mobile Menu */}
				{isMobileMenuOpen && (
					<div className="lg:hidden border-t border-theme-border bg-theme-card">
						<nav className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-2">
							<MobileNavLink
								href="/"
								active={currentPath === "/"}
								onClick={() => setIsMobileMenuOpen(false)}
							>
								Home
							</MobileNavLink>
							<MobileNavLink
								href="/plugins"
								active={currentPath.startsWith("/plugins")}
								onClick={() => setIsMobileMenuOpen(false)}
							>
								Plugins
							</MobileNavLink>
							<MobileNavLink
								href="/templates"
								active={currentPath.startsWith("/templates")}
								onClick={() => setIsMobileMenuOpen(false)}
							>
								Templates
							</MobileNavLink>
							<MobileNavLink
								href="/docs"
								active={currentPath.startsWith("/docs")}
								onClick={() => setIsMobileMenuOpen(false)}
							>
								Docs
							</MobileNavLink>
							<MobileNavLink
								href="/blog"
								active={currentPath.startsWith("/blog")}
								onClick={() => setIsMobileMenuOpen(false)}
							>
								Blog
							</MobileNavLink>
							{auth.userMeta.role === "admin" && (
								<MobileNavLink
									href="/admin"
									active={currentPath.startsWith("/admin")}
									onClick={() => setIsMobileMenuOpen(false)}
								>
									Admin
								</MobileNavLink>
							)}
							<NavLinkLoginButton onClick={() => setIsMobileMenuOpen(false)} />
							<div className="pt-2 mt-2 border-t border-theme-border">
								<a
									href="https://github.com/shpaw415/frame-master"
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-2 px-4 py-2 text-theme-muted hover:text-theme-text transition-colors no-underline"
								>
									<span className="text-xl">⭐</span>
									<span className="font-semibold">Star on GitHub</span>
								</a>
							</div>
						</nav>
					</div>
				)}
			</header>

			{/* Main Content */}
			<main className="flex-1 w-full">
				<ErrorBoundary FallbackComponent={ErrorFallback}>
					{children}
				</ErrorBoundary>
			</main>

			{/* Footer */}
			<footer className="bg-theme-card border-t border-theme-border mt-auto">
				<div className="max-w-7xl mx-auto px-6 py-12">
					<div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
						{/* Brand */}
						<div>
							<div className="flex items-center gap-3 mb-4">
								<div className="w-10 h-10 flex">
									<img
										src="/static/logo.png"
										alt="Frame-master logo"
										className="w-full h-full object-fill"
									/>
								</div>
								<span className="text-theme-text font-bold text-xl">
									Frame-Master
								</span>
							</div>
							<p className="text-sm text-theme-muted">
								The modern full-stack framework built on Bun. Fast, flexible,
								and plugin-driven.
							</p>
						</div>

						{/* Documentation */}
						<div>
							<h3 className="text-theme-text font-semibold mb-4">
								Documentation
							</h3>
							<ul className="space-y-2">
								<FooterLink href={routes.docs.quickStart}>
									Getting Started
								</FooterLink>
								<FooterLink href={routes.docs.core.configuration}>
									Configuration
								</FooterLink>
								<FooterLink href={routes.docs.plugins.overview}>
									Plugin Development
								</FooterLink>
							</ul>
						</div>

						{/* Community */}
						<div>
							<h3 className="text-theme-text font-semibold mb-4">Community</h3>
							<ul className="space-y-2">
								<FooterLink href="https://github.com/shpaw415/frame-master">
									GitHub
								</FooterLink>
								<FooterLink href="https://discord.gg/DzcPejNX">
									Discord
								</FooterLink>
								<FooterLink href="#">Twitter</FooterLink>
								<FooterLink href="/community/contributing">
									Contributing
								</FooterLink>
							</ul>
						</div>

						{/* Resources */}
						<div>
							<h3 className="text-theme-text font-semibold mb-4">Resources</h3>
							<ul className="space-y-2">
								<FooterLink href={routes.plugins}>Browse Plugins</FooterLink>
								<FooterLink href={routes.createPlugin}>
									Submit Plugin
								</FooterLink>
								<FooterLink href={routes.blog}>Changelog</FooterLink>
							</ul>
						</div>
					</div>

					{/* Bottom Bar */}
					<div className="pt-8 border-t border-theme-border flex flex-col md:flex-row justify-between items-center gap-4">
						<p className="text-sm text-theme-disabled">
							© {new Date().getFullYear()} Frame-Master. Built with ❤️ using Bun.
						</p>
						<div className="flex gap-6">
							<a
								href="/privacy"
								className="text-sm text-theme-disabled hover:text-theme-text transition-colors no-underline"
							>
								Privacy
							</a>
							<a
								href="/terms"
								className="text-sm text-theme-disabled hover:text-theme-text transition-colors no-underline"
							>
								Terms
							</a>
							<a
								href="/license"
								className="text-sm text-theme-disabled hover:text-theme-text transition-colors no-underline"
							>
								License
							</a>
						</div>
					</div>
				</div>
			</footer>
		</div>
	);
}

// ============================================================================
// COMPONENTS
// ============================================================================

function NavLink({
	href,
	active,
	children,
}: {
	href: string;
	active: boolean;
	children: React.ReactNode;
}) {
	return (
		<a
			href={href}
			className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors no-underline ${
				active
					? "bg-blue-500/15 text-blue-500"
					: "text-theme-muted hover:text-theme-text hover:bg-theme-input"
			}`}
		>
			{children}
		</a>
	);
}

function MobileNavLink({
	href,
	active,
	onClick,
	children,
	variant,
}: {
	href: string;
	active: boolean;
	onClick?: React.DOMAttributes<HTMLAnchorElement>["onClick"];
	children: React.ReactNode;
	variant?: "diabled";
}) {
	const classes = useMemo(
		() =>
			[
				"px-4 py-3 rounded-lg text-sm font-semibold transition-colors no-underline",
				active
					? "bg-blue-500/15 text-blue-500"
					: "text-theme-muted hover:text-theme-text hover:bg-theme-input",
				variant === "diabled" ? "pointer-events-none opacity-50" : "",
			].join(" "),
		[active, variant],
	);

	return (
		<a href={href} onClick={onClick} className={classes}>
			{children}
		</a>
	);
}

function FooterLink({
	href,
	children,
}: {
	href: string;
	children: React.ReactNode;
}) {
	const isExternal = href.startsWith("http");
	return (
		<li>
			<a
				href={href}
				target={isExternal ? "_blank" : undefined}
				rel={isExternal ? "noopener noreferrer" : undefined}
				className="text-sm text-theme-muted hover:text-theme-text transition-colors no-underline"
			>
				{children}
			</a>
		</li>
	);
}

function NavLinkLoginButton({ onClick }: { onClick: () => void }) {
	const path = usePath();
	const user = useAuth();

	if (!user.isLoaded)
		return (
			<MobileNavLink
				onClick={() => user.login()}
				href=""
				active={path === "/login"}
				variant="diabled"
			>
				Login
			</MobileNavLink>
		);

	return user.isAuthenticated ? (
		<MobileNavLink
			href="/dashboard"
			active={path === "/dashboard"}
			onClick={onClick}
		>
			Dashboard
		</MobileNavLink>
	) : (
		<MobileNavLink
			href="/login"
			active={path === "/login"}
			onClick={() => user.login()}
		>
			Login
		</MobileNavLink>
	);
}

function LoginButton() {
	const session = useAuth();

	return session.isAuthenticated && session.isLoaded ? (
		<a
			href="/dashboard"
			className="hidden lg:flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors no-underline"
		>
			<span className="text-sm">Dashboard</span>
		</a>
	) : (
		<a
			href="/login"
			className="hidden lg:flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold transition-colors no-underline"
		>
			<span className="text-sm">Login</span>
		</a>
	);
}

function ErrorFallback({
	error,
	resetErrorBoundary,
}: {
	error: unknown;
	resetErrorBoundary: () => void;
}) {
	const message = error instanceof Error ? error.message : String(error);
	return (
		<div className="min-h-screen bg-theme-bg flex items-center justify-center px-6">
			<div className="max-w-lg w-full">
				{/* Card */}
				<div className="relative bg-theme-card border border-red-500/30 rounded-2xl p-10 overflow-hidden shadow-2xl">
					{/* Glow background */}
					<div className="absolute inset-0 -z-10 opacity-20">
						<div className="absolute top-0 right-0 w-64 h-64 bg-red-500 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
						<div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-500 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
					</div>

					{/* Icon */}
					<div className="flex justify-center mb-6">
						<div className="w-20 h-20 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-4xl shadow-lg">
							💥
						</div>
					</div>

					{/* Heading */}
					<h2 className="text-center text-2xl font-black text-theme-text mb-2">
						Something went wrong
					</h2>
					<p className="text-center text-theme-muted text-sm mb-6">
						An unexpected error occurred. You can try again or go back home.
					</p>

					{/* Error message */}
					<div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 mb-8 font-mono text-sm text-red-400 break-words">
						{message || "An unexpected error occurred."}
					</div>

					{/* Actions */}
					<div className="flex flex-col sm:flex-row gap-3">
						<button
							type="button"
							onClick={resetErrorBoundary}
							className="flex-1 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
						>
							Try again
						</button>
						<a
							href="/"
							className="flex-1 px-5 py-3 bg-theme-input hover:bg-theme-card border border-theme-border text-theme-text font-semibold rounded-xl transition-colors text-center no-underline"
						>
							Go home
						</a>
					</div>
				</div>

				{/* Debugging hint */}
				<p className="text-center text-xs text-theme-disabled mt-4">
					Check the browser console for the full stack trace.
				</p>
			</div>
		</div>
	);
}

function ThemeToggle() {
	const { theme, toggleTheme } = useTheme();

	return (
		<button
			type="button"
			onClick={toggleTheme}
			className="flex items-center justify-center w-10 h-10 bg-theme-card border border-theme-border rounded-lg text-theme-muted hover:text-theme-text hover:border-theme-disabled transition-colors"
			aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
		>
			{theme === "dark" ? (
				<span className="text-lg">☀️</span>
			) : (
				<span className="text-lg">🌙</span>
			)}
		</button>
	);
}
