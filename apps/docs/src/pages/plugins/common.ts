export const pluginCategories = () =>
	[
		{ id: "all", name: "All Categories", icon: "📦" },
		{ id: "frontend", name: "Frontend", icon: "⚛️" },
		{ id: "authentication", name: "Authentication", icon: "🔐" },
		{ id: "database", name: "Database", icon: "🗄️" },
		{ id: "api", name: "Data & APIs", icon: "🔌" },
		{ id: "styling", name: "Styling", icon: "🎨" },
		{ id: "realtime", name: "Real-time", icon: "⚡" },
		{ id: "cache", name: "Cache", icon: "💾" },
		{ id: "utilities", name: "Utilities", icon: "🛠️" },
		{ id: "testing", name: "Testing", icon: "🧪" },
		{ id: "build", name: "Build Tools", icon: "🏗️" },
		{ id: "other", name: "Other", icon: "❓" },
		{ id: "state", name: "State Management", icon: "📊" },
		{ id: "routing", name: "Routing", icon: "🛣️" },
	] as const;

export function getAllTags() {
	return [
		"react",
		"ssr",
		"auth",
		"database",
		"css",
		"realtime",
		"api",
		"security",
		"cache",
		"email",
		"files",
		"i18n",
	];
}
