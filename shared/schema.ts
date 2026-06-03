import { pgTable, text, integer, serial, doublePrecision, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// USERS (team members + partners — sharing with roles)
// ─────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("member"), // admin | member | viewer
  createdAt: text("created_at").notNull(),
});
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─────────────────────────────────────────────────────────────
// LEADS (replaces the Airtable "Leads" table — faithful fields)
// ─────────────────────────────────────────────────────────────
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  leadId: text("lead_id").notNull().unique(), // deterministic dedup key
  email: text("email").default(""),
  firstName: text("first_name").default(""),
  lastName: text("last_name").default(""),
  title: text("title").default(""),
  companyName: text("company_name").default(""),
  companyDomain: text("company_domain").default(""),
  channel: text("channel").default("A"), // A | B-Sig | B-Disc | C
  tier: text("tier").default("C"), // A | B | C
  roleClass: text("role_class").default(""), // decision_maker | influencer
  icpSlice: text("icp_slice").default(""), // AI/ML | Robotics | Hardware
  meddpiccScore: integer("meddpicc_score").default(0),
  icpFit: integer("icp_fit").default(0),
  contactConfidence: integer("contact_confidence").default(0),
  signalAgeDays: integer("signal_age_days").default(0),
  verifierStatus: text("verifier_status").default(""), // valid | accept_all | webmail | risky | invalid | disposable
  status: text("status").default("Captured"), // pipeline stage (see STATUSES)
  sourceTag: text("source_tag").default(""),
  signalName: text("signal_name").default(""),
  triggerEvent: text("trigger_event").default(""),
  linkedinUrl: text("linkedin_url").default(""),
  phone: text("phone").default(""),
  enrichmentNeeded: boolean("enrichment_needed").default(false),
  reviewReason: text("review_reason").default(""),
  missingFields: text("missing_fields").default(""),
  workstream: text("workstream").default("BD"),
  capturedDate: text("captured_date").notNull(),
  lastSeen: text("last_seen").notNull(),
  lastUpdated: text("last_updated").notNull(),
});
export const insertLeadSchema = createInsertSchema(leads).omit({ id: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

// ─────────────────────────────────────────────────────────────
// PIPELINE RUNS (observability — replaces invisible n8n executions)
// ─────────────────────────────────────────────────────────────
export const pipelineRuns = pgTable("pipeline_runs", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull(), // A | B-Sig | B-Disc | all
  trigger: text("trigger").notNull().default("manual"), // manual | scheduled
  status: text("status").notNull().default("running"), // running | success | error
  ingested: integer("ingested").default(0),
  deduped: integer("deduped").default(0),
  enriched: integer("enriched").default(0),
  scored: integer("scored").default(0),
  routed: integer("routed").default(0),
  tierA: integer("tier_a").default(0),
  tierB: integer("tier_b").default(0),
  tierC: integer("tier_c").default(0),
  errorMessage: text("error_message").default(""),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at").default(""),
});
export const insertPipelineRunSchema = createInsertSchema(pipelineRuns).omit({ id: true });
export type InsertPipelineRun = z.infer<typeof insertPipelineRunSchema>;
export type PipelineRun = typeof pipelineRuns.$inferSelect;

// ─────────────────────────────────────────────────────────────
// EVENTS (per-lead audit timeline)
// ─────────────────────────────────────────────────────────────
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  type: text("type").notNull(), // captured | enriched | scored | status_change | outreach_sent | replied | meeting | note
  detail: text("detail").default(""),
  actor: text("actor").default("system"),
  createdAt: text("created_at").notNull(),
});
export const insertEventSchema = createInsertSchema(events).omit({ id: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

// ─────────────────────────────────────────────────────────────
// SEQUENCES + STEPS (outreach engine)
// ─────────────────────────────────────────────────────────────
export const sequences = pgTable("sequences", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  channel: text("channel").default("email"), // email | linkedin | mixed
  active: boolean("active").default(true),
  autoEnrollTier: text("auto_enroll_tier").default(""), // "" | A | B | C — auto-enroll new leads of this tier
  steps: text("steps").default("[]"), // JSON: [{order, delayDays, channel, subject, body}]
  createdAt: text("created_at").notNull(),
});
export const insertSequenceSchema = createInsertSchema(sequences).omit({ id: true });
export type InsertSequence = z.infer<typeof insertSequenceSchema>;
export type Sequence = typeof sequences.$inferSelect;

// ─────────────────────────────────────────────────────────────
// ENROLLMENTS (a lead in a sequence)
// ─────────────────────────────────────────────────────────────
export const enrollments = pgTable("enrollments", {
  id: serial("id").primaryKey(),
  leadId: text("lead_id").notNull(),
  sequenceId: integer("sequence_id").notNull(),
  currentStep: integer("current_step").default(0),
  status: text("status").default("active"), // active | paused | replied | bounced | completed
  nextSendAt: text("next_send_at").default(""),
  enrolledAt: text("enrolled_at").notNull(),
});
export const insertEnrollmentSchema = createInsertSchema(enrollments).omit({ id: true });
export type InsertEnrollment = z.infer<typeof insertEnrollmentSchema>;
export type Enrollment = typeof enrollments.$inferSelect;

// ─────────────────────────────────────────────────────────────
// ICP CONFIGS (no-code — replaces "Pick Weekly ICP Slice" node)
// ─────────────────────────────────────────────────────────────
export const icpConfigs = pgTable("icp_configs", {
  id: serial("id").primaryKey(),
  slice: text("slice").notNull(), // AI/ML | Robotics | Hardware
  active: boolean("active").default(true),
  industries: text("industries").default("[]"), // JSON array
  technologies: text("technologies").default("[]"), // JSON array
  headcount: text("headcount").default('["11-50","51-200"]'), // JSON array
  fundingStages: text("funding_stages").default('["seed","series_a","series_b","series_c"]'),
  country: text("country").default("US"),
  rotationOrder: integer("rotation_order").default(0), // week % 3 slot
});
export const insertIcpConfigSchema = createInsertSchema(icpConfigs).omit({ id: true });
export type InsertIcpConfig = z.infer<typeof insertIcpConfigSchema>;
export type IcpConfig = typeof icpConfigs.$inferSelect;

// ─────────────────────────────────────────────────────────────
// SCORING CONFIG (no-code — replaces "MEDDPICC Score" node)
// Single row store of the tunable weights.
// ─────────────────────────────────────────────────────────────
export const scoringConfigs = pgTable("scoring_configs", {
  id: serial("id").primaryKey(),
  baselineA: integer("baseline_a").default(60),
  baselineBSig: integer("baseline_b_sig").default(45),
  baselineBDisc: integer("baseline_b_disc").default(30),
  baselineC: integer("baseline_c").default(35),
  bonusDecisionMaker: integer("bonus_decision_maker").default(20),
  bonusInfluencer: integer("bonus_influencer").default(10),
  confidenceWeight: integer("confidence_weight").default(10),
  signalDecayDays: integer("signal_decay_days").default(60),
  signalDecayFloor: doublePrecision("signal_decay_floor").default(0.2),
  tierAThreshold: integer("tier_a_threshold").default(80),
  tierBThreshold: integer("tier_b_threshold").default(60),
  // Fully editable role-classifier keyword lists (JSON). Lets the user retarget
  // to ANY vertical/function without touching code. Empty => use code defaults.
  classifierKeywords: text("classifier_keywords").default("{}"),
});
export const insertScoringConfigSchema = createInsertSchema(scoringConfigs).omit({ id: true });
export type InsertScoringConfig = z.infer<typeof insertScoringConfigSchema>;
export type ScoringConfig = typeof scoringConfigs.$inferSelect;

// ─────────────────────────────────────────────────────────────
// INTEGRATIONS (secrets stored as env refs — never raw keys)
// ─────────────────────────────────────────────────────────────
export const integrations = pgTable("integrations", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // gmail | outlook | hunter | anthropic | slack | quickmail
  label: text("label").notNull(),
  connected: boolean("connected").default(false),
  envVar: text("env_var").default(""), // name of the env var holding the secret
  meta: text("meta").default("{}"), // JSON misc (schedule, channel, etc.)
});
export const insertIntegrationSchema = createInsertSchema(integrations).omit({ id: true });
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type Integration = typeof integrations.$inferSelect;

// ─────────────────────────────────────────────
// PROVIDERS (pluggable enrichment + lead-tracking/CRM destinations)
// Lets each deployment swap Hunter/Airtable for Apollo, Clearbit,
// HubSpot, Salesforce, Pipedrive, Notion, Google Sheets, etc.
// A provider is "active" within its category to be used by the pipeline.
// ─────────────────────────────────────────────────────────────
export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // enrichment | verification | tracking | discovery | alerts
  key: text("key").notNull().unique(),  // hunter | apollo | clearbit | zoominfo | airtable | hubspot | salesforce | pipedrive | notion | sheets | slack | custom
  label: text("label").notNull(),
  active: boolean("active").default(false), // the chosen provider for its category
  connected: boolean("connected").default(false),
  envVar: text("env_var").default(""), // secret env var name (never store raw secret)
  baseUrl: text("base_url").default(""), // for custom/self-hosted endpoints
  config: text("config").default("{}"), // JSON: field mappings, table/base ids, etc.
  builtin: boolean("builtin").default(true),
});
export const insertProviderSchema = createInsertSchema(providers).omit({ id: true });
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Provider = typeof providers.$inferSelect;

export const PROVIDER_CATEGORIES = ["enrichment", "verification", "tracking", "discovery", "alerts"] as const;

// ─────────────────────────────────────────────
// INTAKE SOURCES (pluggable lead ingestion)
// Leads no longer come only from email polling + Hunter. Any number of
// sources can be ENABLED at once: poll an inbox folder, paste/type text,
// dictate by voice (transcribed), receive a webhook, upload a CSV, or a
// public capture form. Each enabled source feeds the SAME parse→dedup→
// enrich→score→route pipeline.
// ─────────────────────────────────────────────
export const intakeSources = pgTable("intake_sources", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // email_poll | manual_text | voice | webhook | csv_upload | form | hunter_signal | hunter_discover
  kind: text("kind").notNull(),        // email | manual | voice | webhook | upload | form | discovery
  label: text("label").notNull(),
  enabled: boolean("enabled").default(false),
  channel: text("channel").default("A"), // which pipeline channel this maps to (A | B-Sig | B-Disc | C)
  config: text("config").default("{}"),  // JSON: folder, schedule, webhook token, field mappings, etc.
  builtin: boolean("builtin").default(true),
  lastIngestAt: text("last_ingest_at").default(""),
});
export const insertIntakeSourceSchema = createInsertSchema(intakeSources).omit({ id: true });
export type InsertIntakeSource = z.infer<typeof insertIntakeSourceSchema>;
export type IntakeSource = typeof intakeSources.$inferSelect;

export const INTAKE_KINDS = ["email", "manual", "voice", "webhook", "upload", "form", "discovery"] as const;

// Pipeline status stages (mirrors Airtable Status single-select)
export const STATUSES = [
  "Captured",
  "Validated",
  "Enriching",
  "Scored",
  "Narrative Ready",
  "Review Required",
  "Outreach Active",
  "Responded",
  "Meeting Booked",
  "Disqualified",
  "Nurture",
] as const;
