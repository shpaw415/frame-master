import { CodeBlockWithTheme } from "@/components/codeblock";
import { routes } from "@/utils";

// ============================================================================
export default function Home() {
	return (
		<div className="min-h-screen bg-theme-bg">
			<Hero />
			<Features />
			<QuickStart />
			<CTA />
		</div>
	);
}

// ============================================================================
// HERO SECTION
// ============================================================================
export function Hero() {
	return (
		<section className="py-32 md:py-20 text-center bg-linear-to-b from-theme-bg to-theme-card border-b border-theme-border">
			<div className="max-w-7xl mx-auto px-6">
				<div className="flex flex-col items-center gap-6">
					<Logo />
					<h1 className="text-7xl md:text-5xl font-black bg-linear-to-br from-theme-gradient-from to-theme-gradient-to bg-clip-text text-transparent tracking-tight">
						Frame-Master
					</h1>
					<p className="text-3xl md:text-2xl font-semibold text-blue-500 max-w-3xl">
						Build your perfect full-stack framework, one plugin at a time
					</p>
					<p className="text-lg text-theme-muted max-w-2xl leading-relaxed">
						Framework-agnostic, plugin-driven architecture powered by Bun.js.
						Choose your frontend, pick your backend, add your features.
					</p>
					<div className="flex gap-4 mt-4 flex-wrap justify-center">
						<Button href={routes.docs.quickStart} variant="primary">
							Get Started
							<span className="text-xl transition-transform group-hover:translate-x-1">
								→
							</span>
						</Button>
						<Button href={routes.plugins} variant="secondary">
							Browse Plugins
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
}

// ============================================================================
// FEATURES SECTION
// ============================================================================
export function Features() {
	const features = [
		{
			icon: "🔧",
			title: "Framework Agnostic",
			description:
				"React, Vue, Svelte, or Vanilla JS. Use any frontend framework you prefer with seamless integration.",
		},
		{
			icon: "🔌",
			title: "Plugin Everything",
			description:
				"Authentication, databases, real-time features. Add exactly what you need through our plugin system.",
		},
		{
			icon: "⚡",
			title: "Lightning Fast",
			description:
				"Built exclusively for Bun.js runtime. Experience blazing-fast performance out of the box.",
		},
		{
			icon: "🌐",
			title: "Community Driven",
			description:
				"Share plugins, contribute to the ecosystem, and build reusable components for everyone.",
		},
	];

	return (
		<section className="py-25 bg-theme-bg">
			<div className="max-w-7xl mx-auto px-6">
				<h2 className="text-5xl md:text-4xl font-extrabold text-center mb-16 text-theme-text tracking-tight">
					Why Frame-Master?
				</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
					{features.map((feature, index) => (
						<FeatureCard key={index} {...feature} />
					))}
				</div>
			</div>
		</section>
	);
}

function FeatureCard({
	icon,
	title,
	description,
}: {
	icon: string;
	title: string;
	description: string;
}) {
	return (
		<div className="p-10 md:p-8 bg-theme-card border border-theme-border rounded-2xl transition-all duration-300 hover:border-blue-500 hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(59,130,246,0.2)]">
			<div className="text-5xl mb-5">{icon}</div>
			<h3 className="text-2xl font-bold text-theme-text mb-3">{title}</h3>
			<p className="text-base text-theme-muted leading-relaxed">
				{description}
			</p>
		</div>
	);
}

// ============================================================================
// QUICK START SECTION
// ============================================================================
export function QuickStart() {
	return (
		<section className="py-25 bg-theme-card border-t border-theme-border">
			<div className="max-w-7xl mx-auto px-6">
				<h2 className="text-5xl md:text-4xl font-extrabold text-center mb-16 text-theme-text tracking-tight">
					Get Started in Seconds
				</h2>
				<CodeBlockWithTheme language="bash">
					{`# Install Frame-Master
bun add frame-master

# Initialize your project
bun frame-master init

# Start development server
bun frame-master dev`}
				</CodeBlockWithTheme>
				<div className="mt-12">
					<h3 className="text-3xl font-bold text-theme-text mb-6">
						Configure Your Stack
					</h3>
					<CodeBlockWithTheme language="ts" filename="frame-master.config.ts">
						{`import type { FrameMasterConfig } from "frame-master/server/types";
import reactPlugin from "frame-master-plugin-react-ssr/plugin";

const config: FrameMasterConfig = {
  HTTPServer: { port: 3000 },
  plugins: [reactPlugin()],
};

export default config;`}
					</CodeBlockWithTheme>
				</div>
			</div>
		</section>
	);
}

// ============================================================================
// CTA SECTION
// ============================================================================
export function CTA() {
	return (
		<section className="py-25 bg-linear-to-b from-theme-card to-theme-bg border-t border-theme-border text-center">
			<div className="max-w-3xl mx-auto px-6">
				<h2 className="text-5xl md:text-4xl font-extrabold text-theme-text mb-5 tracking-tight">
					Ready to Build Your Perfect Framework?
				</h2>
				<p className="text-xl text-theme-muted mb-10">
					Join developers who stopped settling for "almost perfect" frameworks.
				</p>
				<div className="flex gap-4 justify-center flex-wrap">
					<Button href="/docs/getting-started" variant="primary">
						Get Started
						<span className="text-xl transition-transform group-hover:translate-x-1">
							→
						</span>
					</Button>
					<Button
						href="https://github.com/shpaw415/frame-master"
						variant="secondary"
					>
						View on GitHub
					</Button>
				</div>
			</div>
		</section>
	);
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================
export function Logo() {
	return (
		<div className="mb-2">
			<div className="w-36 h-36 flex transition-transform duration-300 hover:scale-105">
				<img
					src="/static/logo.png"
					alt="Frame-Master Logo"
					className="h-full w-full"
				/>
			</div>
		</div>
	);
}

export function Button({
	href,
	variant,
	children,
}: {
	href: string;
	variant: "primary" | "secondary";
	children: React.ReactNode;
}) {
	const baseClasses =
		"group inline-flex items-center gap-2 px-8 py-3.5 text-base font-semibold rounded-xl no-underline transition-all duration-300";
	const variantClasses = {
		primary:
			"bg-blue-500 text-white hover:bg-blue-600 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(59,130,246,0.4)]",
		secondary:
			"bg-transparent text-theme-secondary border-2 border-theme-border-input hover:border-blue-500 hover:bg-blue-500/10",
	};

	return (
		<a href={href} className={`${baseClasses} ${variantClasses[variant]}`}>
			{children}
		</a>
	);
}
