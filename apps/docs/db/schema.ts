import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export type PluginDependency = {
  pluginName: string;
  version: string;
};

export type GitHubAppInstallationState = "active" | "deleted" | "suspended";
export type ErrorLogSeverity = "info" | "warning" | "error" | "critical";

// ============================================================================
// RATE LIMITS TABLE
// ============================================================================
export const rateLimits = sqliteTable("rate_limits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  endpoint: text("endpoint").notNull(),
  limit: integer("limit").notNull(),
  period: integer("period").notNull(), // in seconds
  used: integer("used").notNull().default(0),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

export type parsedRateLimit = typeof rateLimits.$inferSelect;

// ============================================================================
// PLUGINS TABLE
// ============================================================================
export const plugins = sqliteTable("plugins", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("🔌"),
  description: text("description").notNull(),
  longDescription: text("long_description"),
  version: text("version").notNull(),
  compatibleVersions: text("compatible_versions").notNull(),
  author: text("author").notNull(),
  ownerId: text("owner_id").notNull(),
  category: text("category").notNull(),
  tags: text("tags", { mode: "json" }).notNull().default("[]").$type<string[]>(),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  npmPackage: text("npm_package").notNull(),
  githubUrl: text("github_url"),
  docsUrl: text("docs_url"),
  installation: text("installation"), // Installation instructions
  quickStart: text("quick_start"), // Quick start code example
  configuration: text("configuration"), // Configuration example
  downloads: integer("downloads").notNull().default(0),
  upvote: real("upvote").default(0), // Average rating
  downvote: real("downvote").default(0), // Average rating
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  dependencies: text("dependencies", { mode: "json" })
    .notNull()
    .default("[]")
    .$type<PluginDependency[]>(),
});

export type parsedPlugin = typeof plugins.$inferSelect;

export const tags = sqliteTable("tags", {
  name: text("id").primaryKey(),
});

export type parsedTag = typeof tags.$inferSelect;

// ============================================================================
// PLUGIN VERSIONS TABLE (track version history)
// ============================================================================
export const pluginVersions = sqliteTable("plugin_versions", {
  id: text("id").primaryKey(),
  pluginId: text("plugin_id")
    .notNull()
    .references(() => plugins.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  deprecated: integer("deprecated", { mode: "boolean" })
    .notNull()
    .default(false),
  releasedAt: integer("released_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type parsedPluginVersions = typeof pluginVersions.$inferSelect;

export const githubAppLinks = sqliteTable("github_app_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().unique(),
  githubUserId: text("github_user_id").notNull().unique(),
  githubLogin: text("github_login").notNull(),
  githubAvatarUrl: text("github_avatar_url"),
  installationId: text("installation_id").notNull().unique(),
  installationTargetType: text("installation_target_type").notNull(),
  installationState: text("installation_state")
    .notNull()
    .default("active")
    .$type<GitHubAppInstallationState>(),
  installedAt: integer("installed_at", { mode: "timestamp" }).notNull(),
  lastValidatedAt: integer("last_validated_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type parsedGitHubAppLink = typeof githubAppLinks.$inferSelect;

// ============================================================================
// ERROR LOGS TABLE
// ============================================================================
export const errorLogs = sqliteTable("error_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id"),
  errorMessage: text("error_message").notNull(),
  errorStack: text("error_stack"),
  errorType: text("error_type"), // e.g., "TypeError", "ReferenceError", etc.
  endpoint: text("endpoint"), // API endpoint where error occurred
  method: text("method"), // HTTP method (GET, POST, etc.)
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  severity: text("severity")
    .notNull()
    .default("error")
    .$type<ErrorLogSeverity>(),
  context: text("context", { mode: "json" }).$type<Record<string, any> | null>(),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  resolvedBy: text("resolved_by"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type parsedErrorLog = typeof errorLogs.$inferSelect;

export const releaseNotes = sqliteTable("release_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: text("version").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  githubUrl: text("github_url").notNull(),
  releasedAt: integer("released_at", { mode: "timestamp" }).notNull(),
});

export type parsedReleaseNote = typeof releaseNotes.$inferSelect;

// ============================================================================
// TEMPLATES TABLE
// ============================================================================
export const templates = sqliteTable("templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("📁"),
  description: text("description").notNull(),
  longDescription: text("long_description"),
  author: text("author").notNull(),
  ownerId: text("owner_id").notNull(),
  category: text("category").notNull(),
  tags: text("tags", { mode: "json" }).notNull().default("[]").$type<string[]>(),
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  githubReleaseUrl: text("github_release_url").notNull(), // e.g., https://github.com/owner/repo/releases/tag/v1.0.0
  githubRepoUrl: text("github_repo_url").notNull(),
  defaultVersion: text("default_version").notNull(), // The recommended version to use
  installation: text("installation"), // Installation instructions
  features: text("features", { mode: "json" }).$type<string[] | null>(),
  includedPlugins: text("included_plugins", { mode: "json" })
    .notNull()
    .default("[]")
    .$type<string[]>(),
  previewUrl: text("preview_url"), // Optional live preview URL
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type parsedTemplate = typeof templates.$inferSelect;

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;

// ============================================================================
// TYPE EXPORTS
// ============================================================================
export type Plugin = typeof plugins.$inferSelect;
export type NewPlugin = typeof plugins.$inferInsert;

export type PluginVersion = typeof pluginVersions.$inferSelect;
export type NewPluginVersion = typeof pluginVersions.$inferInsert;

export type GitHubAppLink = typeof githubAppLinks.$inferSelect;
export type NewGitHubAppLink = typeof githubAppLinks.$inferInsert;

export type ErrorLog = typeof errorLogs.$inferSelect;
export type NewErrorLog = typeof errorLogs.$inferInsert;
