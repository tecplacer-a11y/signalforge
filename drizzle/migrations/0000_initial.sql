CREATE TABLE IF NOT EXISTS "enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"sequence_id" integer NOT NULL,
	"current_step" integer DEFAULT 0,
	"status" text DEFAULT 'active',
	"next_send_at" text DEFAULT '',
	"enrolled_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"type" text NOT NULL,
	"detail" text DEFAULT '',
	"actor" text DEFAULT 'system',
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "icp_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slice" text NOT NULL,
	"active" boolean DEFAULT true,
	"industries" text DEFAULT '[]',
	"technologies" text DEFAULT '[]',
	"headcount" text DEFAULT '["11-50","51-200"]',
	"funding_stages" text DEFAULT '["seed","series_a","series_b","series_c"]',
	"country" text DEFAULT 'US',
	"rotation_order" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intake_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"enabled" boolean DEFAULT false,
	"channel" text DEFAULT 'A',
	"config" text DEFAULT '{}',
	"builtin" boolean DEFAULT true,
	"last_ingest_at" text DEFAULT '',
	CONSTRAINT "intake_sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"connected" boolean DEFAULT false,
	"env_var" text DEFAULT '',
	"meta" text DEFAULT '{}',
	CONSTRAINT "integrations_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"email" text DEFAULT '',
	"first_name" text DEFAULT '',
	"last_name" text DEFAULT '',
	"title" text DEFAULT '',
	"company_name" text DEFAULT '',
	"company_domain" text DEFAULT '',
	"channel" text DEFAULT 'A',
	"tier" text DEFAULT 'C',
	"role_class" text DEFAULT '',
	"icp_slice" text DEFAULT '',
	"meddpicc_score" integer DEFAULT 0,
	"icp_fit" integer DEFAULT 0,
	"contact_confidence" integer DEFAULT 0,
	"signal_age_days" integer DEFAULT 0,
	"verifier_status" text DEFAULT '',
	"status" text DEFAULT 'Captured',
	"source_tag" text DEFAULT '',
	"signal_name" text DEFAULT '',
	"trigger_event" text DEFAULT '',
	"linkedin_url" text DEFAULT '',
	"phone" text DEFAULT '',
	"enrichment_needed" boolean DEFAULT false,
	"review_reason" text DEFAULT '',
	"missing_fields" text DEFAULT '',
	"workstream" text DEFAULT 'BD',
	"captured_date" text NOT NULL,
	"last_seen" text NOT NULL,
	"last_updated" text NOT NULL,
	CONSTRAINT "leads_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"ingested" integer DEFAULT 0,
	"deduped" integer DEFAULT 0,
	"enriched" integer DEFAULT 0,
	"scored" integer DEFAULT 0,
	"routed" integer DEFAULT 0,
	"tier_a" integer DEFAULT 0,
	"tier_b" integer DEFAULT 0,
	"tier_c" integer DEFAULT 0,
	"error_message" text DEFAULT '',
	"started_at" text NOT NULL,
	"finished_at" text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT false,
	"connected" boolean DEFAULT false,
	"env_var" text DEFAULT '',
	"base_url" text DEFAULT '',
	"config" text DEFAULT '{}',
	"builtin" boolean DEFAULT true,
	CONSTRAINT "providers_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scoring_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"baseline_a" integer DEFAULT 60,
	"baseline_b_sig" integer DEFAULT 45,
	"baseline_b_disc" integer DEFAULT 30,
	"baseline_c" integer DEFAULT 35,
	"bonus_decision_maker" integer DEFAULT 20,
	"bonus_influencer" integer DEFAULT 10,
	"confidence_weight" integer DEFAULT 10,
	"signal_decay_days" integer DEFAULT 60,
	"signal_decay_floor" double precision DEFAULT 0.2,
	"tier_a_threshold" integer DEFAULT 80,
	"tier_b_threshold" integer DEFAULT 60,
	"classifier_keywords" text DEFAULT '{}'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '',
	"channel" text DEFAULT 'email',
	"active" boolean DEFAULT true,
	"auto_enroll_tier" text DEFAULT '',
	"steps" text DEFAULT '[]',
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
