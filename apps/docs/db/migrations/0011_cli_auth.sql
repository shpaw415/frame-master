CREATE TABLE `cli_auth_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`device_code_hash` text NOT NULL,
	`user_code` text NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_auth_codes_device_code_hash_unique` ON `cli_auth_codes` (`device_code_hash`);
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_auth_codes_user_code_unique` ON `cli_auth_codes` (`user_code`);
--> statement-breakpoint
CREATE TABLE `cli_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_tokens_token_hash_unique` ON `cli_tokens` (`token_hash`);
