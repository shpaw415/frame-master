import { errorLogs, githubAppLinks, plugins, releaseNotes, templates } from "./schema";
import type {
  parsedPlugin,
  parsedGitHubAppLink,
  parsedErrorLog,
  parsedReleaseNote,
  parsedTemplate,
} from "./schema";

export function parsePlugin(plugin: typeof plugins.$inferSelect): parsedPlugin {
  return plugin;
}

export function parsePluginsToDB(
  plugin: Partial<parsedPlugin>
): Partial<typeof plugins.$inferInsert> {
  return plugin;
}

export function parseErrorLog(
  log: typeof errorLogs.$inferSelect
): parsedErrorLog {
  return log;
}

export function parseGitHubAppLink(
  link: typeof githubAppLinks.$inferSelect
): parsedGitHubAppLink {
  return link;
}

export function parseReleaseNote(
  releaseNote: typeof releaseNotes.$inferSelect
): parsedReleaseNote {
  return releaseNote;
}

export function parseTemplate(
  template: typeof templates.$inferSelect
): parsedTemplate {
  return template;
}

export function parseTemplateToDB(
  template: Partial<parsedTemplate>
): Partial<typeof templates.$inferInsert> {
  return template;
}
