DROP TABLE `plugin_dependencies`;--> statement-breakpoint
DROP TABLE `plugin_downloads`;--> statement-breakpoint
DROP TABLE `plugin_reviews`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`official` integer DEFAULT false NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`npm_package` text NOT NULL,
	`github_url` text,
	`docs_url` text,
	`installation` text,
	`quick_start` text,
	`configuration` text,
	`downloads` integer DEFAULT 0 NOT NULL,
	`upvote` real DEFAULT 0,
	`downvote` real DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`dependencies` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_plugins`("id", "name", "icon", "description", "long_description", "version", "compatible_versions", "author", "owner_id", "category", "tags", "official", "featured", "published", "npm_package", "github_url", "docs_url", "installation", "quick_start", "configuration", "downloads", "upvote", "downvote", "created_at", "updated_at", "dependencies") SELECT "id", "name", "icon", "description", "long_description", "version", "compatible_versions", "author", "owner_id", "category", "tags", "official", "featured", "published", "npm_package", "github_url", "docs_url", "installation", "quick_start", "configuration", "downloads", "upvote", "downvote", "created_at", "updated_at", "dependencies" FROM `plugins`;--> statement-breakpoint
DROP TABLE `plugins`;--> statement-breakpoint
ALTER TABLE `__new_plugins` RENAME TO `plugins`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `users` ADD `access` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `plugin_versions` DROP COLUMN `changelog`;--> statement-breakpoint
ALTER TABLE `plugin_versions` DROP COLUMN `release_notes`;