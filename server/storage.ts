import {
  users, leads, pipelineRuns, events, sequences, enrollments,
  icpConfigs, scoringConfigs, integrations, providers, intakeSources,
} from "@shared/schema";
import type {
  User, InsertUser, Lead, InsertLead, PipelineRun, InsertPipelineRun,
  Event, InsertEvent, Sequence, InsertSequence, Enrollment, InsertEnrollment,
  IcpConfig, InsertIcpConfig, ScoringConfig, InsertScoringConfig,
  Integration, InsertIntegration, Provider, InsertProvider,
  IntakeSource, InsertIntakeSource,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc } from "drizzle-orm";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

// Create tables if missing (lightweight migration for prototype)
export async function ensureSchema() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  lead_id TEXT NOT NULL UNIQUE,
  email TEXT DEFAULT '',
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  title TEXT DEFAULT '',
  company_name TEXT DEFAULT '',
  company_domain TEXT DEFAULT '',
  channel TEXT DEFAULT 'A',
  tier TEXT DEFAULT 'C',
  role_class TEXT DEFAULT '',
  icp_slice TEXT DEFAULT '',
  meddpicc_score INTEGER DEFAULT 0,
  icp_fit INTEGER DEFAULT 0,
  contact_confidence INTEGER DEFAULT 0,
  signal_age_days INTEGER DEFAULT 0,
  verifier_status TEXT DEFAULT '',
  status TEXT DEFAULT 'Captured',
  source_tag TEXT DEFAULT '',
  signal_name TEXT DEFAULT '',
  trigger_event TEXT DEFAULT '',
  linkedin_url TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  enrichment_needed BOOLEAN DEFAULT FALSE,
  review_reason TEXT DEFAULT '',
  missing_fields TEXT DEFAULT '',
  workstream TEXT DEFAULT 'BD',
  captured_date TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  last_updated TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'running',
  ingested INTEGER DEFAULT 0,
  deduped INTEGER DEFAULT 0,
  enriched INTEGER DEFAULT 0,
  scored INTEGER DEFAULT 0,
  routed INTEGER DEFAULT 0,
  tier_a INTEGER DEFAULT 0,
  tier_b INTEGER DEFAULT 0,
  tier_c INTEGER DEFAULT 0,
  error_message TEXT DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  lead_id TEXT NOT NULL,
  type TEXT NOT NULL,
  detail TEXT DEFAULT '',
  actor TEXT DEFAULT 'system',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sequences (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  channel TEXT DEFAULT 'email',
  active BOOLEAN DEFAULT TRUE,
  auto_enroll_tier TEXT DEFAULT '',
  steps TEXT DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enrollments (
  id SERIAL PRIMARY KEY,
  lead_id TEXT NOT NULL,
  sequence_id INTEGER NOT NULL,
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  next_send_at TEXT DEFAULT '',
  enrolled_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS icp_configs (
  id SERIAL PRIMARY KEY,
  slice TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  industries TEXT DEFAULT '[]',
  technologies TEXT DEFAULT '[]',
  headcount TEXT DEFAULT '["11-50","51-200"]',
  funding_stages TEXT DEFAULT '["seed","series_a","series_b","series_c"]',
  country TEXT DEFAULT 'US',
  rotation_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS scoring_configs (
  id SERIAL PRIMARY KEY,
  baseline_a INTEGER DEFAULT 60,
  baseline_b_sig INTEGER DEFAULT 45,
  baseline_b_disc INTEGER DEFAULT 30,
  baseline_c INTEGER DEFAULT 35,
  bonus_decision_maker INTEGER DEFAULT 20,
  bonus_influencer INTEGER DEFAULT 10,
  confidence_weight INTEGER DEFAULT 10,
  signal_decay_days INTEGER DEFAULT 60,
  signal_decay_floor DOUBLE PRECISION DEFAULT 0.2,
  tier_a_threshold INTEGER DEFAULT 80,
  tier_b_threshold INTEGER DEFAULT 60,
  classifier_keywords TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS integrations (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  connected BOOLEAN DEFAULT FALSE,
  env_var TEXT DEFAULT '',
  meta TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS providers (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  active BOOLEAN DEFAULT FALSE,
  connected BOOLEAN DEFAULT FALSE,
  env_var TEXT DEFAULT '',
  base_url TEXT DEFAULT '',
  config TEXT DEFAULT '{}',
  builtin BOOLEAN DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS intake_sources (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  channel TEXT DEFAULT 'A',
  config TEXT DEFAULT '{}',
  builtin BOOLEAN DEFAULT TRUE,
  last_ingest_at TEXT DEFAULT ''
);
  `);
}

export interface IStorage {
  // users
  listUsers(): Promise<User[]>;
  createUser(u: InsertUser): Promise<User>;
  // leads
  listLeads(): Promise<Lead[]>;
  getLead(leadId: string): Promise<Lead | undefined>;
  upsertLead(l: InsertLead): Promise<Lead>;
  updateLead(leadId: string, patch: Partial<InsertLead>): Promise<Lead | undefined>;
  // runs
  listRuns(): Promise<PipelineRun[]>;
  createRun(r: InsertPipelineRun): Promise<PipelineRun>;
  updateRun(id: number, patch: Partial<InsertPipelineRun>): Promise<PipelineRun | undefined>;
  // events
  listEvents(leadId: string): Promise<Event[]>;
  createEvent(e: InsertEvent): Promise<Event>;
  // sequences
  listSequences(): Promise<Sequence[]>;
  createSequence(s: InsertSequence): Promise<Sequence>;
  updateSequence(id: number, patch: Partial<InsertSequence>): Promise<Sequence | undefined>;
  deleteSequence(id: number): Promise<void>;
  // enrollments
  listEnrollments(): Promise<Enrollment[]>;
  createEnrollment(e: InsertEnrollment): Promise<Enrollment>;
  updateEnrollment(id: number, patch: Partial<InsertEnrollment>): Promise<Enrollment | undefined>;
  // icp
  listIcpConfigs(): Promise<IcpConfig[]>;
  createIcpConfig(c: InsertIcpConfig): Promise<IcpConfig>;
  updateIcpConfig(id: number, patch: Partial<InsertIcpConfig>): Promise<IcpConfig | undefined>;
  deleteIcpConfig(id: number): Promise<void>;
  // scoring
  getScoringConfig(): Promise<ScoringConfig>;
  updateScoringConfig(patch: Partial<InsertScoringConfig>): Promise<ScoringConfig>;
  // integrations
  listIntegrations(): Promise<Integration[]>;
  updateIntegration(key: string, patch: Partial<InsertIntegration>): Promise<Integration | undefined>;
  // providers (pluggable enrichment / tracking)
  listProviders(): Promise<Provider[]>;
  createProvider(p: InsertProvider): Promise<Provider>;
  updateProvider(key: string, patch: Partial<InsertProvider>): Promise<Provider | undefined>;
  deleteProvider(key: string): Promise<void>;
  setActiveProvider(category: string, key: string): Promise<void>;
  // intake sources (pluggable lead ingestion)
  listIntakeSources(): Promise<IntakeSource[]>;
  createIntakeSource(s: InsertIntakeSource): Promise<IntakeSource>;
  updateIntakeSource(key: string, patch: Partial<InsertIntakeSource>): Promise<IntakeSource | undefined>;
  deleteIntakeSource(key: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async listUsers() { return db.select().from(users); }
  async createUser(u: InsertUser) {
    return (await db.insert(users).values({ ...u, createdAt: new Date().toISOString() }).returning())[0];
  }

  async listLeads() { return db.select().from(leads).orderBy(desc(leads.lastUpdated)); }
  async getLead(leadId: string) {
    return (await db.select().from(leads).where(eq(leads.leadId, leadId)).limit(1))[0];
  }
  async upsertLead(l: InsertLead) {
    const existing = await this.getLead(l.leadId);
    if (existing) {
      return (await db.update(leads).set(l).where(eq(leads.leadId, l.leadId)).returning())[0];
    }
    return (await db.insert(leads).values(l).returning())[0];
  }
  async updateLead(leadId: string, patch: Partial<InsertLead>) {
    return (await db.update(leads).set(patch).where(eq(leads.leadId, leadId)).returning())[0];
  }

  async listRuns() { return db.select().from(pipelineRuns).orderBy(desc(pipelineRuns.startedAt)); }
  async createRun(r: InsertPipelineRun) {
    return (await db.insert(pipelineRuns).values(r).returning())[0];
  }
  async updateRun(id: number, patch: Partial<InsertPipelineRun>) {
    return (await db.update(pipelineRuns).set(patch).where(eq(pipelineRuns.id, id)).returning())[0];
  }

  async listEvents(leadId: string) {
    return db.select().from(events).where(eq(events.leadId, leadId)).orderBy(desc(events.createdAt));
  }
  async createEvent(e: InsertEvent) {
    return (await db.insert(events).values(e).returning())[0];
  }

  async listSequences() { return db.select().from(sequences).orderBy(desc(sequences.createdAt)); }
  async createSequence(s: InsertSequence) {
    return (await db.insert(sequences).values(s).returning())[0];
  }
  async updateSequence(id: number, patch: Partial<InsertSequence>) {
    return (await db.update(sequences).set(patch).where(eq(sequences.id, id)).returning())[0];
  }
  async deleteSequence(id: number) { await db.delete(sequences).where(eq(sequences.id, id)); }

  async listEnrollments() { return db.select().from(enrollments).orderBy(desc(enrollments.enrolledAt)); }
  async createEnrollment(e: InsertEnrollment) {
    return (await db.insert(enrollments).values(e).returning())[0];
  }
  async updateEnrollment(id: number, patch: Partial<InsertEnrollment>) {
    return (await db.update(enrollments).set(patch).where(eq(enrollments.id, id)).returning())[0];
  }

  async listIcpConfigs() { return db.select().from(icpConfigs).orderBy(icpConfigs.rotationOrder); }
  async createIcpConfig(c: InsertIcpConfig) {
    return (await db.insert(icpConfigs).values(c).returning())[0];
  }
  async updateIcpConfig(id: number, patch: Partial<InsertIcpConfig>) {
    return (await db.update(icpConfigs).set(patch).where(eq(icpConfigs.id, id)).returning())[0];
  }
  async deleteIcpConfig(id: number) { await db.delete(icpConfigs).where(eq(icpConfigs.id, id)); }

  async getScoringConfig() {
    let cfg = (await db.select().from(scoringConfigs).limit(1))[0];
    if (!cfg) cfg = (await db.insert(scoringConfigs).values({}).returning())[0];
    return cfg;
  }
  async updateScoringConfig(patch: Partial<InsertScoringConfig>) {
    const cfg = await this.getScoringConfig();
    return (await db.update(scoringConfigs).set(patch).where(eq(scoringConfigs.id, cfg.id)).returning())[0];
  }

  async listIntegrations() { return db.select().from(integrations); }
  async updateIntegration(key: string, patch: Partial<InsertIntegration>) {
    return (await db.update(integrations).set(patch).where(eq(integrations.key, key)).returning())[0];
  }

  async listProviders() { return db.select().from(providers); }
  async createProvider(p: InsertProvider) {
    return (await db.insert(providers).values(p).returning())[0];
  }
  async updateProvider(key: string, patch: Partial<InsertProvider>) {
    return (await db.update(providers).set(patch).where(eq(providers.key, key)).returning())[0];
  }
  async deleteProvider(key: string) { await db.delete(providers).where(eq(providers.key, key)); }
  async setActiveProvider(category: string, key: string) {
    // deactivate all in category, then activate the chosen one
    await db.update(providers).set({ active: false }).where(eq(providers.category, category));
    await db.update(providers).set({ active: true, connected: true }).where(eq(providers.key, key));
  }

  async listIntakeSources() { return db.select().from(intakeSources); }
  async createIntakeSource(s: InsertIntakeSource) {
    return (await db.insert(intakeSources).values(s).returning())[0];
  }
  async updateIntakeSource(key: string, patch: Partial<InsertIntakeSource>) {
    return (await db.update(intakeSources).set(patch).where(eq(intakeSources.key, key)).returning())[0];
  }
  async deleteIntakeSource(key: string) { await db.delete(intakeSources).where(eq(intakeSources.key, key)); }
}

export const storage = new DatabaseStorage();
