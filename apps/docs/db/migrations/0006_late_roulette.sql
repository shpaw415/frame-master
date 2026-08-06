DROP TABLE `users`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_error_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`error_message` text NOT NULL,
	`error_stack` text,
	`error_type` text,
	`endpoint` text,
	`method` text,
	`user_agent` text,
	`ip_address` text,
	`severity` text DEFAULT 'error' NOT NULL,
	`context` text,
	`resolved` integer DEFAULT false NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_error_logs`("id", "user_id", "error_message", "error_stack", "error_type", "endpoint", "method", "user_agent", "ip_address", "severity", "context", "resolved", "resolved_at", "resolved_by", "created_at") SELECT "id", "user_id", "error_message", "error_stack", "error_type", "endpoint", "method", "user_agent", "ip_address", "severity", "context", "resolved", "resolved_at", "resolved_by", "created_at" FROM `error_logs`;--> statement-breakpoint
DROP TABLE `error_logs`;--> statement-breakpoint
ALTER TABLE `__new_error_logs` RENAME TO `error_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_plugins` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '🔌' NOT NULL,
	`description` text NOT NULL,
	`long_description` text,
	`version` text NOT NULL,
	`compatible_versions` text NOT NULL,
	`author` text NOT NULL,
	`owner_id` text NOT NULL,
	`category` text NOT NULL,
	`tags` text NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`npm_package` text NOT NULL,
	`github_url` text,
	`docs_url` text,
	`installation` text,
	`quick_start` text,
	`configuration` text,
	`upvote` real DEFAULT 0,
	`downvote` real DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`dependencies` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_plugins`("id", "name", "icon", "description", "long_description", "version", "compatible_versions", "author", "owner_id", "category", "tags", "published", "npm_package", "github_url", "docs_url", "installation", "quick_start", "configuration", "upvote", "downvote", "created_at", "updated_at", "dependencies") SELECT "id", "name", "icon", "description", "long_description", "version", "compatible_versions", "author", "owner_id", "category", "tags", "published", "npm_package", "github_url", "docs_url", "installation", "quick_start", "configuration", "upvote", "downvote", "created_at", "updated_at", "dependencies" FROM `plugins`;--> statement-breakpoint
DROP TABLE `plugins`;--> statement-breakpoint
ALTER TABLE `__new_plugins` RENAME TO `plugins`;--> statement-breakpoint
CREATE TABLE `__new_rate_limits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`limit` integer NOT NULL,
	`period` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_rate_limits`("id", "user_id", "endpoint", "limit", "period", "used", "createdAt") SELECT "id", "user_id", "endpoint", "limit", "period", "used", "createdAt" FROM `rate_limits`;--> statement-breakpoint
DROP TABLE `rate_limits`;--> statement-breakpoint
ALTER TABLE `__new_rate_limits` RENAME TO `rate_limits`;