ALTER TABLE "jobs" ADD COLUMN "claim_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "submission_started_at" timestamp with time zone;