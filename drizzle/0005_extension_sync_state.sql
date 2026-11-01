CREATE TABLE "extension_state" (
	"id" text PRIMARY KEY DEFAULT 'current' NOT NULL,
	"last_extension_sync_at" timestamp with time zone,
	"last_background_visit_at" timestamp with time zone,
	"session_status" text DEFAULT 'unknown' NOT NULL,
	"logged_out_alert_at" timestamp with time zone
);
