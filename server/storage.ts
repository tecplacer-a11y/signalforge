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
import { eq, desc, and, sql } from "drizzle-orm";

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

// ── Row-Level Security context (Task 1.5) ──
// Every org-scoped query runs inside a transaction that sets the
// transaction-local app.org_id setting; the tenant_isolation RLS policies
// (migration 0002) only expose rows whose org_id matches it. A connection
// that hasn't set the context sees and writes NOTHING on tenant tables —
// so even a query that forgot its WHERE clause cannot leak across orgs.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(..., true) = transaction-local; reverts on commit/rollback
    await tx.execute(sql`SELECT set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

// Every tenant-scoped method takes orgId as its first parameter; queries are
// filtered by org_id in SQL AND constrained by RLS via withOrg.
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
  createIntegration(orgId: string, i: InsertIntegration): Promise<Integration>;
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
  // ── organizations (no RLS — not org_id-scoped; used to bootstrap context) ──
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

  // ── org members (no RLS — membership lookup happens before org context exists) ──
  async listOrgMembers(orgId: string) {
    return db.select().from(orgMembers).where(eq(orgMembers.orgId, orgId));
  }
  async listMembershipsByUser(userId: string) {
    return db.select().from(orgMembers).where(eq(orgMembers.userId, userId)).orderBy(orgMembers.joinedAt);
  }
  async addOrgMember(m: InsertOrgMember) {
    return (await db.insert(orgMembers).values(m).returning())[0];
  }

  // ── users (filtered by org; RLS not applied — org_id is nullable here) ──
  async listUsers(orgId: string) {
    return db.select().from(users).where(eq(users.orgId, orgId));
  }
  async createUser(orgId: string, u: InsertUser) {
    return (await db.insert(users).values({ ...u, orgId, createdAt: new Date().toISOString() }).returning())[0];
  }

  // ── leads ──
  listLeads(orgId: string) {
    return withOrg(orgId, (tx) =>
      tx.select().from(leads).where(eq(leads.orgId, orgId)).orderBy(desc(leads.lastUpdated)));
  }
  getLead(orgId: string, leadId: string) {
    return withOrg(orgId, async (tx) =>
      (await tx.select().from(leads)
        .where(and(eq(leads.orgId, orgId), eq(leads.leadId, leadId))).limit(1))[0]);
  }
  upsertLead(orgId: string, l: InsertLead) {
    return withOrg(orgId, async (tx) => {
      const existing = (await tx.select().from(leads)
        .where(and(eq(leads.orgId, orgId), eq(leads.leadId, l.leadId))).limit(1))[0];
      if (existing) {
        return (await tx.update(leads).set(l)
          .where(and(eq(leads.orgId, orgId), eq(leads.leadId, l.leadId))).returning())[0];
      }
      return (await tx.insert(leads).values({ ...l, orgId }).returning())[0];
    });
  }
  updateLead(orgId: string, leadId: string, patch: Partial<InsertLead>) {
    return withOrg(orgId, async (tx) =>
      (await tx.update(leads).set(patch)
        .where(and(eq(leads.orgId, orgId), eq(leads.leadId, leadId))).returning())[0]);
  }

  // ── runs ──
  listRuns(orgId: string) {
    return withOrg(orgId, (tx) =>
      tx.select().from(pipelineRuns).where(eq(pipelineRuns.orgId, orgId)).orderBy(desc(pipelineRuns.startedAt)));
  }
  createRun(orgId: string, r: InsertPipelineRun) {
    return withOrg(orgId, async (tx) =>
      (await tx.insert(pipelineRuns).values({ ...r, orgId }).returning())[0]);
  }
  updateRun(orgId: string, id: number, patch: Partial<InsertPipelineRun>) {
    return withOrg(orgId, async (tx) =>
      (await tx.update(pipelineRuns).set(patch)
        .where(and(eq(pipelineRuns.orgId, orgId), eq(pipelineRuns.id, id))).returning())[0]);
  }

  // ── events ──
  listEvents(orgId: string, leadId: string) {
    return withOrg(orgId, (tx) =>
      tx.select().from(events)
        .where(and(eq(events.orgId, orgId), eq(events.leadId, leadId))).orderBy(desc(events.createdAt)));
  }
  createEvent(orgId: string, e: InsertEvent) {
    return withOrg(orgId, async (tx) =>
      (await tx.insert(events).values({ ...e, orgId }).returning())[0]);
  }

  // ── sequences ──
  listSequences(orgId: string) {
    return withOrg(orgId, (tx) =>
      tx.select().from(sequences).where(eq(sequences.orgId, orgId)).orderBy(desc(sequences.createdAt)));
  }
  createSequence(orgId: string, s: InsertSequence) {
    return withOrg(orgId, async (tx) =>
      (await tx.insert(sequences).values({ ...s, orgId }).returning())[0]);
  }
  updateSequence(orgId: string, id: number, patch: Partial<InsertSequence>) {
    return withOrg(orgId, async (tx) =>
      (await tx.update(sequences).set(patch)
        .where(and(eq(sequences.orgId, orgId), eq(sequences.id, id))).returning())[0]);
  }
  deleteSequence(orgId: string, id: number) {
    return withOrg(orgId, async (tx) => {
      await tx.delete(sequences).where(and(eq(sequences.orgId, orgId), eq(sequences.id, id)));
    });
  }

  // ── enrollments ──
  listEnrollments(orgId: string) {
    return withOrg(orgId, (tx) =>
      tx.select().from(enrollments).where(eq(enrollments.orgId, orgId)).orderBy(desc(enrollments.enrolledAt)));
  }
  createEnrollment(orgId: string, e: InsertEnrollment) {
    return withOrg(orgId, async (tx) =>
      (await tx.insert(enrollments).values({ ...e, orgId }).returning())[0]);
  }
  updateEnrollment(orgId: string, id: number, patch: Partial<InsertEnrollment>) {
    return withOrg(orgId, async (tx) =>
      (await tx.update(enrollments).set(patch)
        .where(and(eq(enrollments.orgId, orgId), eq(enrollments.id, id))).returning())[0]);
  }

  // ── icp configs ──
  listIcpConfigs(orgId: string) {
    return withOrg(orgId, (tx) =>
      tx.select().from(icpConfigs).where(eq(icpConfigs.orgId, orgId)).orderBy(icpConfigs.rotationOrder));
  }
  createIcpConfig(orgId: string, c: InsertIcpConfig) {
    return withOrg(orgId, async (tx) =>
      (await tx.insert(icpConfigs).values({ ...c, orgId }).returning())[0]);
  }
  updateIcpConfig(orgId: string, id: number, patch: Partial<InsertIcpConfig>) {
    return withOrg(orgId, async (tx) =>
      (await tx.update(icpConfigs).set(patch)
        .where(and(eq(icpConfigs.orgId, orgId), eq(icpConfigs.id, id))).returning())[0]);
  }
  deleteIcpConfig(orgId: string, id: number) {
    return withOrg(orgId, async (tx) => {
      await tx.delete(icpConfigs).where(and(eq(icpConfigs.orgId, orgId), eq(icpConfigs.id, id)));
    });
  }

  // ── scoring config (one row per org) ──
  getScoringConfig(orgId: string) {
    return withOrg(orgId, async (tx) => {
      let cfg = (await tx.select().from(scoringConfigs).where(eq(scoringConfigs.orgId, orgId)).limit(1))[0];
      if (!cfg) cfg = (await tx.insert(scoringConfigs).values({ orgId }).returning())[0];
      return cfg;
    });
  }
  updateScoringConfig(orgId: string, patch: Partial<InsertScoringConfig>) {
    return withOrg(orgId, async (tx) => {
      let cfg = (await tx.select().from(scoringConfigs).where(eq(scoringConfigs.orgId, orgId)).limit(1))[0];
      if (!cfg) cfg = (await tx.insert(scoringConfigs).values({ orgId }).returning())[0];
      return (await tx.update(scoringConfigs).set(patch)
        .where(and(eq(scoringConfigs.orgId, orgId), eq(scoringConfigs.id, cfg.id))).returning())[0];
    });
  }

  // ── integrations ──
  listIntegrations(orgId: string) {
    return withOrg(orgId, (tx) =>
      tx.select().from(integrations).where(eq(integrations.orgId, orgId)));
  }
  createIntegration(orgId: string, i: InsertIntegration) {
    return withOrg(orgId, async (tx) =>
      (await tx.insert(integrations).values({ ...i, orgId }).returning())[0]);
  }
  updateIntegration(orgId: string, key: string, patch: Partial<InsertIntegration>) {
    return withOrg(orgId, async (tx) =>
      (await tx.update(integrations).set(patch)
        .where(and(eq(integrations.orgId, orgId), eq(integrations.key, key))).returning())[0]);
  }

  // ── providers ──
  listProviders(orgId: string) {
    return withOrg(orgId, (tx) =>
      tx.select().from(providers).where(eq(providers.orgId, orgId)));
  }
  createProvider(orgId: string, p: InsertProvider) {
    return withOrg(orgId, async (tx) =>
      (await tx.insert(providers).values({ ...p, orgId }).returning())[0]);
  }
  updateProvider(orgId: string, key: string, patch: Partial<InsertProvider>) {
    return withOrg(orgId, async (tx) =>
      (await tx.update(providers).set(patch)
        .where(and(eq(providers.orgId, orgId), eq(providers.key, key))).returning())[0]);
  }
  deleteProvider(orgId: string, key: string) {
    return withOrg(orgId, async (tx) => {
      await tx.delete(providers).where(and(eq(providers.orgId, orgId), eq(providers.key, key)));
    });
  }
  setActiveProvider(orgId: string, category: string, key: string) {
    // deactivate all in category, then activate the chosen one — atomically
    return withOrg(orgId, async (tx) => {
      await tx.update(providers).set({ active: false })
        .where(and(eq(providers.orgId, orgId), eq(providers.category, category)));
      await tx.update(providers).set({ active: true, connected: true })
        .where(and(eq(providers.orgId, orgId), eq(providers.key, key)));
    });
  }

  // ── intake sources ──
  listIntakeSources(orgId: string) {
    return withOrg(orgId, (tx) =>
      tx.select().from(intakeSources).where(eq(intakeSources.orgId, orgId)));
  }
  createIntakeSource(orgId: string, s: InsertIntakeSource) {
    return withOrg(orgId, async (tx) =>
      (await tx.insert(intakeSources).values({ ...s, orgId }).returning())[0]);
  }
  updateIntakeSource(orgId: string, key: string, patch: Partial<InsertIntakeSource>) {
    return withOrg(orgId, async (tx) =>
      (await tx.update(intakeSources).set(patch)
        .where(and(eq(intakeSources.orgId, orgId), eq(intakeSources.key, key))).returning())[0]);
  }
  deleteIntakeSource(orgId: string, key: string) {
    return withOrg(orgId, async (tx) => {
      await tx.delete(intakeSources).where(and(eq(intakeSources.orgId, orgId), eq(intakeSources.key, key)));
    });
  }
}

export const storage = new DatabaseStorage();
