import type {
	errorLogs,
	githubAppLinks,
	parsedErrorLog,
	parsedGitHubAppLink,
	parsedPlugin,
	parsedReleaseNote,
	parsedTemplate,
	plugins,
	releaseNotes,
	templates,
} from "./schema";

function asJsonArray<T>(value: unknown): T[] {
	if (Array.isArray(value)) return value as T[];
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value) as unknown;
			if (Array.isArray(parsed)) return parsed as T[];
		} catch {
			return [];
		}
	}
	return [];
}

export function parsePlugin(plugin: typeof plugins.$inferSelect): parsedPlugin {
	return {
		...plugin,
		dependencies: asJsonArray(plugin.dependencies),
		tags: asJsonArray(plugin.tags),
	};
}

export function parsePluginsToDB(
	plugin: Partial<parsedPlugin>,
): Partial<typeof plugins.$inferInsert> {
	return plugin;
}

export function parseErrorLog(
	log: typeof errorLogs.$inferSelect,
): parsedErrorLog {
	return log;
}

export function parseGitHubAppLink(
	link: typeof githubAppLinks.$inferSelect,
): parsedGitHubAppLink {
	return link;
}

export function parseReleaseNote(
	releaseNote: typeof releaseNotes.$inferSelect,
): parsedReleaseNote {
	return releaseNote;
}

export function parseTemplate(
	template: typeof templates.$inferSelect,
): parsedTemplate {
	return {
		...template,
		features: asJsonArray(template.features),
		includedPlugins: asJsonArray(template.includedPlugins),
		tags: asJsonArray(template.tags),
	};
}

export function parseTemplateToDB(
	template: Partial<parsedTemplate>,
): Partial<typeof templates.$inferInsert> {
	return template;
}
