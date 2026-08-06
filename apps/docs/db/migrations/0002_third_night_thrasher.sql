CREATE TABLE `error_logs` (
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
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
