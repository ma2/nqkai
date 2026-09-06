CREATE TABLE `guest_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`kukai_id` text NOT NULL,
	`code` text NOT NULL,
	`max_uses` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`kukai_id`) REFERENCES `kukai`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_codes_code_unique` ON `guest_codes` (`code`);--> statement-breakpoint
CREATE INDEX `guest_codes_kukai_idx` ON `guest_codes` (`kukai_id`);--> statement-breakpoint
CREATE TABLE `guest_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`kukai_id` text NOT NULL,
	`guest_code_id` text NOT NULL,
	`display_name` text NOT NULL,
	`can_submit` integer DEFAULT false NOT NULL,
	`can_select` integer DEFAULT false NOT NULL,
	`can_comment` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`kukai_id`) REFERENCES `kukai`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`guest_code_id`) REFERENCES `guest_codes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_participants_kukai_display_uq` ON `guest_participants` (`kukai_id`,`display_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_participants_session_kukai_uq` ON `guest_participants` (`session_id`,`kukai_id`);--> statement-breakpoint
CREATE INDEX `guest_participants_session_idx` ON `guest_participants` (`session_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`kukai_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`author_user_id` text,
	`author_guest_id` text,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`kukai_id`) REFERENCES `kukai`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_guest_id`) REFERENCES `guest_participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_comments`("id", "kukai_id", "submission_id", "author_user_id", "author_guest_id", "body", "created_at", "updated_at") SELECT "id", "kukai_id", "submission_id", "author_user_id", "author_guest_id", "body", "created_at", "updated_at" FROM `comments`;--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
ALTER TABLE `__new_comments` RENAME TO `comments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `comments_kukai_submission_idx` ON `comments` (`kukai_id`,`submission_id`);--> statement-breakpoint
CREATE TABLE `__new_selections` (
	`id` text PRIMARY KEY NOT NULL,
	`kukai_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`selector_user_id` text,
	`selector_guest_id` text,
	`kind` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`kukai_id`) REFERENCES `kukai`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`selector_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`selector_guest_id`) REFERENCES `guest_participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_selections`("id", "kukai_id", "submission_id", "selector_user_id", "selector_guest_id", "kind", "created_at") SELECT "id", "kukai_id", "submission_id", "selector_user_id", "selector_guest_id", "kind", "created_at" FROM `selections`;--> statement-breakpoint
DROP TABLE `selections`;--> statement-breakpoint
ALTER TABLE `__new_selections` RENAME TO `selections`;--> statement-breakpoint
CREATE INDEX `selections_kukai_idx` ON `selections` (`kukai_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `selections_submission_user_uq` ON `selections` (`submission_id`,`selector_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `selections_submission_guest_uq` ON `selections` (`submission_id`,`selector_guest_id`);--> statement-breakpoint
CREATE TABLE `__new_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`kukai_id` text NOT NULL,
	`author_user_id` text,
	`author_guest_id` text,
	`content` text NOT NULL,
	`sort_key` text NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`hidden_by` text,
	`hidden_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`kukai_id`) REFERENCES `kukai`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_guest_id`) REFERENCES `guest_participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hidden_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_submissions`("id", "kukai_id", "author_user_id", "author_guest_id", "content", "sort_key", "is_hidden", "hidden_by", "hidden_reason", "created_at", "updated_at") SELECT "id", "kukai_id", "author_user_id", "author_guest_id", "content", "sort_key", "is_hidden", "hidden_by", "hidden_reason", "created_at", "updated_at" FROM `submissions`;--> statement-breakpoint
DROP TABLE `submissions`;--> statement-breakpoint
ALTER TABLE `__new_submissions` RENAME TO `submissions`;--> statement-breakpoint
CREATE INDEX `submissions_kukai_idx` ON `submissions` (`kukai_id`);