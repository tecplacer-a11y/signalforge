import {
  users, leads, pipelineRuns, events, sequences, enrollments,
  icpConfigs, scoringConfigs, integrations, providers, intakeSources,
  organizations, orgMembers,
} from "@shared/schema";
import type {
  User, InsertUser, Lead, InsertLead, PipelineRun, InsertPipelineRun,
  Event, InsertEvent, Sequence, InsertSequence, Enrollment, InsertEnrollment,
  IcpConfig, InsertIcpConfig, ScoringConfig, InsertScoringConfig,
  Integration, InsertIntegration, Provider, InsertProvider,
  IntakeSource, InsertIntakeSource,
  Organization, InsertOrganization, OrgMember, InsertOrgMember,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, desc, and } from "drizzle-orm";

// Managed Postgres (e.g. AWS RDS) requires TLS. RDS presents a cert chain
// that isn't in the default trust store, so enable SSL but don't verify the
// chain. A local dev Postgres (DATABASE_URL host = localhost/127.0.0.1) does
// not use SSL, so disable it there. Override-able via PGSSL=disable|require.
const dbUrl = process.env.DATABASE_URL || "";
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
const sslSetting =
  process.env.PGSSL === "disable" || (isLocal && process.env.PGSSL !== "require")
    ? false
    : { rejectUnauthorized: false };
const pool = new Pool({ connectionString: dbUrl, ssl: sslSetting });
export const db = drizzle(pool);

// Schema is managed by Drizzle Kit migrations (drizzle/migrations/).
// Generate:  npm run db:generate   Apply:  npm run db:migrate
// In production, migrations run before the server starts (see Dockerfile CMD).

// Slug of the org that pre-multi-tenancy data is assigned to (see migration
// 0002). Used as the request org until JWT auth supplies org_id (Task 1.4).
export const DEFAULT_ORG_SLUG = "default";

// Every tenant-scoped method takes orgId as its first parameter and filters
// every query by it. No method may touch rows belonging to another org.
export interface IStorage {
  // organizations
  getOrganization(id: string): Promise<Organization | undefined>;
  getOrganizationBySlug(slug: string): Promise<Organization | undefined>;
  createOrganization(o: InsertOrganization): Promise<Organization>;
  getOrCreateDefaultOrg(): Promise<Organization>;
  // org members
  listOrgMembers(orgId: string): Promise<OrgMember[]>;
  listMembershipsByUser(userId: string): Promise<OrgMember[]>;
  addOrgMember(m: InsertOrgMember): Promise<OrgMember>;
  // users
  listUsers(orgId: string): Promise<User[]>;
  createUser(orgId: string, u: InsertUser): Promise<User>;
  // leads
  listLeads(orgId: string): Promise<Lead[]>;
  getLead(orgId: string, leadId: string): Promise<Lead | undefined>;
  upsertLead(orgId: string, l: InsertLead): Promise<Lead>;
  updateLead(orgId: string, leadId: string, patch: Partial<InsertLead>): Promise<Lead | undefined>;
  // runs
  listRuns(orgId: string): Promise<PipelineRun[]>;
  createRun(orgId: string, r: InsertPipelineRun): Promise<PipelineRun>;
  updateRun(orgId: string, id: number, patch: Partial<InsertPipelineRun>): Promise<PipelineRun | undefined>;
  // events
  listEvents(orgId: string, leadId: string): Promise<Event[]>;
  createEvent(orgId: string, e: InsertEvent): Promise<Event>;
  // sequences
  listSequences(orgId: string): Promise<Sequence[]>;
  createSequence(orgId: string, s: InsertSequence): Promise<Sequence>;
  updateSequence(orgId: string, id: number, patch: Partial<InsertSequence>): Promise<Sequence | undefined>;
  deleteSequence(orgId: string, id: number): Promise<void>;
  // enrollments
  listEnrollments(orgId: string): Promise<Enrollment[]>;
  createEnrollment(orgId: string, e: InsertEnrollment): Promise<Enrollment>;
  updateEnrollment(orgId: string, id: number, patch: Partial<InsertEnrollment>): Promise<Enrollment | undefined>;
  // icp
  listIcpConfigs(orgId: string): Promise<IcpConfig[]>;
  createIcpConfig(orgId: string, c: InsertIcpConfig): Promise<IcpConfig>;
  updateIcpConfig(orgId: string, id: number, patch: Partial<InsertIcpConfig>): Promise<IcpConfig | undefined>;
  deleteIcpConfig(orgId: string, id: number): Promise<void>;
  // scoring
  getScoringConfig(orgId: string): Promise<ScoringConfig>;
  updateScoringConfig(orgId: string, patch: Partial<InsertScoringConfig>): Promise<ScoringConfig>;
  // integrations
  listIntegrations(orgId: string): Promise<Integration[]>;
  updateIntegration(orgId: string, key: string, patch: Partial<InsertIntegration>): Promise<Integration | undefined>;
  // providers (pluggable enrichment / tracking)
  listProviders(orgId: string): Promise<Provider[]>;
  createProvider(orgId: string, p: InsertProvider): Promise<Provider>;
  updateProvider(orgId: string, key: string, patch: Partial<InsertProvider>): Promise<Provider | undefined>;
  deleteProvider(orgId: string, key: string): Promise<void>;
  setActiveProvider(orgId: string, category: string, key: string): Promise<void>;
  // intake sources (pluggable lead ingestion)
  listIntakeSources(orgId: string): Promise<IntakeSource[]>;
  createIntakeSource(orgId: string, s: InsertIntakeSource): Promise<IntakeSource>;
  updateIntakeSource(orgId: string, key: string, patch: Partial<InsertIntakeSource>): Promise<IntakeSource | undefined>;
  deleteIntakeSource(orgId: string, key: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // ── organizations ──
  async getOrganization(id: string) {
    return (await db.select().from(organizations).where(eq(organizations.id, id)).limit(1))[0];
  }
  async getOrganizationBySlug(slug: string) {
    return (await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1))[0];
  }
  async createOrganization(o: InsertOrganization) {
    return (await db.insert(organizations).values(o).returning())[0];
  }
  async getOrCreateDefaultOrg() {
    const existing = await this.getOrganizationBySlug(DEFAULT_ORG_SLUG);
    if (existing) return existing;
    return this.createOrganization({ name: "Default Organization", slug: DEFAULT_ORG_SLUG });
  }

  // ── org members ──
  async listOrgMembers(orgId: string) {
    return db.select().from(orgMembers).where(eq(orgMembers.orgId, orgId));
  }
  async listMembershipsByUser(userId: string) {
    return db.select().from(orgMembers).where(eq(orgMembers.userId, userId)).orderBy(orgMembers.joinedAt);
  }
  async addOrgMember(m: InsertOrgMember) {
    return (await db.insert(orgMembers).values(m).returning())[0];
  }

  // ── users ──
  async listUsers(orgId: string) {
    return db.select().from(users).where(eq(users.orgId, orgId));
  }
  async createUser(orgId: string, u: InsertUser) {
    return (await db.insert(users).values({ ...u, orgId, createdAt: new Date().toISOString() }).returning())[0];
  }

  // ── leads ──
  async listLeads(orgId: string) {
    return db.select().from(leads).where(eq(leads.orgId, orgId)).orderBy(desc(leads.lastUpdated));
  }
  async getLead(orgId: string, leadId: string) {
    return (await db.select().from(leads)
      .where(and(eq(leads.orgId, orgId), eq(leads.leadId, leadId))).limit(1))[0];
  }
  async upsertLead(orgId: string, l: InsertLead) {
    const existing = await this.getLead(orgId, l.leadId);
    if (existing) {
      return (await db.update(leads).set(l)
        .where(and(eq(leads.orgId, orgId), eq(leads.leadId, l.leadId))).returning())[0];
    }
    return (await db.insert(leads).values({ ...l, orgId }).returning())[0];
  }
  async updateLead(orgId: string, leadId: string, patch: Partial<InsertLead>) {
    return (await db.update(leads).set(patch)
      .where(and(eq(leads.orgId, orgId), eq(leads.leadId, leadId))).returning())[0];
  }

  // ── runs ──
  async listRuns(orgId: string) {
    return db.select().from(pipelineRuns).where(eq(pipelineRuns.orgId, orgId)).orderBy(desc(pipelineRuns.startedAt));
  }
  async createRun(orgId: string, r: InsertPipelineRun) {
    return (await db.insert(pipelineRuns).values({ ...r, orgId }).returning())[0];
  }
  async updateRun(orgId: string, id: number, patch: Partial<InsertPipelineRun>) {
    return (await db.update(pipelineRuns).set(patch)
      .where(and(eq(pipelineRuns.orgId, orgId), eq(pipelineRuns.id, id))).returning())[0];
  }

  // ── events ──
  async listEvents(orgId: string, leadId: string) {
    return db.select().from(events)
      .where(and(eq(events.orgId, orgId), eq(events.leadId, leadId))).orderBy(desc(events.createdAt));
  }
  async createEvent(orgId: string, e: InsertEvent) {
    return (await db.insert(events).values({ ...e, orgId }).returning())[0];
  }

  // ── sequences ──
  async listSequences(orgId: string) {
    return db.select().from(sequences).where(eq(sequences.orgId, orgId)).orderBy(desc(sequences.createdAt));
  }
  async createSequence(orgId: string, s: InsertSequence) {
    return (await db.insert(sequences).values({ ...s, orgId }).returning())[0];
  }
  async updateSequence(orgId: string, id: number, patch: Partial<InsertSequence>) {
    return (await db.update(sequences).set(patch)
      .where(and(eq(sequences.orgId, orgId), eq(sequences.id, id))).returning())[0];
  }
  async deleteSequence(orgId: string, id: number) {
    await db.delete(sequences).where(and(eq(sequences.orgId, orgId), eq(sequences.id, id)));
  }

  // ── enrollments ──
  async listEnrollments(orgId: string) {
    return db.select().from(enrollments).where(eq(enrollments.orgId, orgId)).orderBy(desc(enrollments.enrolledAt));
  }
  async createEnrollment(orgId: string, e: InsertEnrollment) {
    return (await db.insert(enrollments).values({ ...e, orgId }).returning())[0];
  }
  async updateEnrollment(orgId: string, id: number, patch: Partial<InsertEnrollment>) {
    return (await db.update(enrollments).set(patch)
      .where(and(eq(enrollments.orgId, orgId), eq(enrollments.id, id))).returning())[0];
  }

  // ── icp configs ──
  async listIcpConfigs(orgId: string) {
    return db.select().from(icpConfigs).where(eq(icpConfigs.orgId, orgId)).orderBy(icpConfigs.rotationOrder);
  }
  async createIcpConfig(orgId: string, c: InsertIcpConfig) {
    return (await db.insert(icpConfigs).values({ ...c, orgId }).returning())[0];
  }
  async updateIcpConfig(orgId: string, id: number, patch: Partial<InsertIcpConfig>) {
    return (await db.update(icpConfigs).set(patch)
      .where(and(eq(icpConfigs.orgId, orgId), eq(icpConfigs.id, id))).returning())[0];
  }
  async deleteIcpConfig(orgId: string, id: number) {
    await db.delete(icpConfigs).where(and(eq(icpConfigs.orgId, orgId), eq(icpConfigs.id, id)));
  }

  // ── scoring config (one row per org) ──
  async getScoringConfig(orgId: string) {
    let cfg = (await db.select().from(scoringConfigs).where(eq(scoringConfigs.orgId, orgId)).limit(1))[0];
    if (!cfg) cfg = (await db.insert(scoringConfigs).values({ orgId }).returning())[0];
    return cfg;
  }
  async updateScoringConfig(orgId: string, patch: Partial<InsertScoringConfig>) {
    const cfg = await this.getScoringConfig(orgId);
    return (await db.update(scoringConfigs).set(patch)
      .where(and(eq(scoringConfigs.orgId, orgId), eq(scoringConfigs.id, cfg.id))).returning())[0];
  }

  // ── integrations ──
  async listIntegrations(orgId: string) {
    return db.select().from(integrations).where(eq(integrations.orgId, orgId));
  }
  async updateIntegration(orgId: string, key: string, patch: Partial<InsertIntegration>) {
    return (await db.update(integrations).set(patch)
      .where(and(eq(integrations.orgId, orgId), eq(integrations.key, key))).returning())[0];
  }

  // ── providers ──
  async listProviders(orgId: string) {
    return db.select().from(providers).where(eq(providers.orgId, orgId));
  }
  async createProvider(orgId: string, p: InsertProvider) {
    return (await db.insert(providers).values({ ...p, orgId }).returning())[0];
  }
  async updateProvider(orgId: string, key: string, patch: Partial<InsertProvider>) {
    return (await db.update(providers).set(patch)
      .where(and(eq(providers.orgId, orgId), eq(providers.key, key))).returning())[0];
  }
  async deleteProvider(orgId: string, key: string) {
    await db.delete(providers).where(and(eq(providers.orgId, orgId), eq(providers.key, key)));
  }
  async setActiveProvider(orgId: string, category: string, key: string) {
    // deactivate all in category, then activate the chosen one — org-scoped
    await db.update(providers).set({ active: false })
      .where(and(eq(providers.orgId, orgId), eq(providers.category, category)));
    await db.update(providers).set({ active: true, connected: true })
      .where(and(eq(providers.orgId, orgId), eq(providers.key, key)));
  }

  // ── intake sources ──
  async listIntakeSources(orgId: string) {
    return db.select().from(intakeSources).where(eq(intakeSources.orgId, orgId));
  }
  async createIntakeSource(orgId: string, s: InsertIntakeSource) {
    return (await db.insert(intakeSources).values({ ...s, orgId }).returning())[0];
  }
  async updateIntakeSource(orgId: string, key: string, patch: Partial<InsertIntakeSource>) {
    return (await db.update(intakeSources).set(patch)
      .where(and(eq(intakeSources.orgId, orgId), eq(intakeSources.key, key))).returning())[0];
  }
  async deleteIntakeSource(orgId: string, key: string) {
    await db.delete(intakeSources).where(and(eq(intakeSources.orgId, orgId), eq(intakeSources.key, key)));
  }
}

export const storage = new DatabaseStorage();
