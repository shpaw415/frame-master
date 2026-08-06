CREATE TABLE `release_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`github_url` text NOT NULL,
	`released_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL
);
