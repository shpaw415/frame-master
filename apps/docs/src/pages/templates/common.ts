export const templateCategories = () =>
	[
		{ id: "all", name: "All Categories", icon: "📁" },
		{ id: "fullstack", name: "Full-Stack", icon: "🚀" },
		{ id: "frontend", name: "Frontend", icon: "⚛️" },
		{ id: "backend", name: "Backend/API", icon: "🔧" },
		{ id: "cdn", name: "CDN/Static", icon: "🌐" },
		{ id: "blog", name: "Blog/CMS", icon: "📝" },
		{ id: "ecommerce", name: "E-commerce", icon: "🛒" },
		{ id: "dashboard", name: "Dashboard", icon: "📊" },
		{ id: "saas", name: "SaaS Starter", icon: "💼" },
		{ id: "landing", name: "Landing Page", icon: "📄" },
		{ id: "other", name: "Other", icon: "❓" },
	] as const;

export function getAllTemplateTags() {
	return [
		"react",
		"ssr",
		"auth",
		"database",
		"tailwind",
		"cloudflare",
		"d1",
		"supabase",
		"api",
		"typescript",
		"drizzle",
		"cdn",
		"static",
	];
}
