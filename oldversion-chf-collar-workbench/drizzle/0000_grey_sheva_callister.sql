CREATE TABLE `client_display` (
	`id` integer PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`bucket` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`expires_at` integer NOT NULL
);
