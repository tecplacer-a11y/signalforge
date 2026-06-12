CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'trial' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stripe_customer_id" text DEFAULT '',
	"leads_this_period" integer DEFAULT 0,
	"period_resets_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
-- Default org: owns all rows that existed before multi-tenancy (single-tenant
-- bridge until JWT auth supplies org_id per request — roadmap Task 1.4).
INSERT INTO "organizations" ("name", "slug")
SELECT 'Default Organization', 'default'
WHERE NOT EXISTS (SELECT 1 FROM "organizations" WHERE "slug" = 'default');
--> statement-breakpoint
-- Per-tenant uniqueness replaces global uniqueness. IF EXISTS guards cover
-- both constraint name generations: drizzle-kit names (*_unique) on DBs
-- baselined by 0000_initial, and legacy inline-UNIQUE names (*_key) on DBs
-- created by the old ensureSchema() bootstrap.
ALTER TABLE "intake_sources" DROP CONSTRAINT IF EXISTS "intake_sources_key_unique";--> statement-breakpoint
ALTER TABLE "intake_sources" DROP CONSTRAINT IF EXISTS "intake_sources_key_key";--> statement-breakpoint
ALTER TABLE "integrations" DROP CONSTRAINT IF EXISTS "integrations_key_unique";--> statement-breakpoint
ALTER TABLE "integrations" DROP CONSTRAINT IF EXISTS "integrations_key_key";--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_lead_id_unique";--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_lead_id_key";--> statement-breakpoint
ALTER TABLE "providers" DROP CONSTRAINT IF EXISTS "providers_key_unique";--> statement-breakpoint
ALTER TABLE "providers" DROP CONSTRAINT IF EXISTS "providers_key_key";--> statement-breakpoint
-- Add org_id as NULLABLE first, backfill existing rows to the default org,
-- then enforce NOT NULL (a direct ADD COLUMN NOT NULL would fail on any
-- table that already has rows).
ALTER TABLE "enrollments" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "icp_configs" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "intake_sources" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "scoring_configs" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "sequences" ADD COLUMN "org_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "org_id" uuid;--> statement-breakpoint
UPDATE "enrollments" SET "org_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default') WHERE "org_id" IS NULL;--> statement-breakpoint
UPDATE "events" SET "org_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default') WHERE "org_id" IS NULL;--> statement-breakpoint
UPDATE "icp_configs" SET "org_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default') WHERE "org_id" IS NULL;--> statement-breakpoint
UPDATE "intake_sources" SET "org_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default') WHERE "org_id" IS NULL;--> statement-breakpoint
UPDATE "integrations" SET "org_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default') WHERE "org_id" IS NULL;--> statement-breakpoint
UPDATE "leads" SET "org_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default') WHERE "org_id" IS NULL;--> statement-breakpoint
UPDATE "pipeline_runs" SET "org_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default') WHERE "org_id" IS NULL;--> statement-breakpoint
UPDATE "providers" SET "org_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default') WHERE "org_id" IS NULL;--> statement-breakpoint
UPDATE "scoring_configs" SET "org_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default') WHERE "org_id" IS NULL;--> statement-breakpoint
UPDATE "sequences" SET "org_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default') WHERE "org_id" IS NULL;--> statement-breakpoint
UPDATE "users" SET "org_id" = (SELECT "id" FROM "organizations" WHERE "slug" = 'default') WHERE "org_id" IS NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "icp_configs" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "intake_sources" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scoring_configs" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sequences" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_unique" ON "org_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_org_members_user" ON "org_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "icp_configs" ADD CONSTRAINT "icp_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_sources" ADD CONSTRAINT "intake_sources_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_configs" ADD CONSTRAINT "scoring_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_enrollments_org" ON "enrollments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_events_org" ON "events" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_icp_configs_org" ON "icp_configs" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intake_sources_org_key_unique" ON "intake_sources" USING btree ("org_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_org_key_unique" ON "integrations" USING btree ("org_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_org_lead_id_unique" ON "leads" USING btree ("org_id","lead_id");--> statement-breakpoint
CREATE INDEX "idx_pipeline_runs_org" ON "pipeline_runs" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "providers_org_key_unique" ON "providers" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "idx_scoring_configs_org" ON "scoring_configs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_sequences_org" ON "sequences" USING btree ("org_id");
