CREATE TABLE `github_app_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`github_user_id` text NOT NULL,
	`github_login` text NOT NULL,
	`github_avatar_url` text,
	`installation_id` text NOT NULL,
	`installation_target_type` text NOT NULL,
	`installation_state` text DEFAULT 'active' NOT NULL,
	`installed_at` integer NOT NULL,
	`last_validated_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_app_links_user_id_unique` ON `github_app_links` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `github_app_links_github_user_id_unique` ON `github_app_links` (`github_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `github_app_links_installation_id_unique` ON `github_app_links` (`installation_id`);--> statement-breakpoint
DROP TABLE `user_roles`;