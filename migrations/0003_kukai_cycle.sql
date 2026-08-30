CREATE TABLE `comments` (
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
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_kukai_submission_idx` ON `comments` (`kukai_id`,`submission_id`);--> statement-breakpoint
CREATE TABLE `kukai` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`organizer_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`theme` text DEFAULT '' NOT NULL,
	`submissions_per_user` integer DEFAULT 1 NOT NULL,
	`special_count` integer DEFAULT 1 NOT NULL,
	`regular_count` integer DEFAULT 5 NOT NULL,
	`reverse_count` integer DEFAULT 0 NOT NULL,
	`special_points` integer DEFAULT 3 NOT NULL,
	`regular_points` integer DEFAULT 1 NOT NULL,
	`reverse_points` integer DEFAULT -1 NOT NULL,
	`allow_guest` integer DEFAULT false NOT NULL,
	`guest_can_submit` integer DEFAULT false NOT NULL,
	`guest_can_select` integer DEFAULT false NOT NULL,
	`guest_can_comment` integer DEFAULT false NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`phase` text DEFAULT 'draft' NOT NULL,
	`scheduled_submission_start_at` integer,
	`scheduled_submission_end_at` integer,
	`scheduled_selection_start_at` integer,
	`scheduled_selection_end_at` integer,
	`scheduled_result_at` integer,
	`scheduled_comment_start_at` integer,
	`scheduled_comment_end_at` integer,
	`authors_revealed_at` integer,
	`deleted_at` integer,
	`deleted_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organizer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deleted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `kukai_org_phase_deleted_idx` ON `kukai` (`organization_id`,`phase`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `kukai_organizer_idx` ON `kukai` (`organizer_id`);--> statement-breakpoint
CREATE TABLE `kukai_phase_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kukai_id` text NOT NULL,
	`from_phase` text NOT NULL,
	`to_phase` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`kukai_id`) REFERENCES `kukai`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `kukai_phase_events_kukai_idx` ON `kukai_phase_events` (`kukai_id`);--> statement-breakpoint
CREATE TABLE `selections` (
	`id` text PRIMARY KEY NOT NULL,
	`kukai_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`selector_user_id` text,
	`selector_guest_id` text,
	`kind` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`kukai_id`) REFERENCES `kukai`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`selector_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `selections_kukai_idx` ON `selections` (`kukai_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `selections_submission_user_uq` ON `selections` (`submission_id`,`selector_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `selections_submission_guest_uq` ON `selections` (`submission_id`,`selector_guest_id`);--> statement-breakpoint
CREATE TABLE `submissions` (
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
	FOREIGN KEY (`hidden_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `submissions_kukai_idx` ON `submissions` (`kukai_id`);