// Frontend types mirroring the SignalForge API contract.

export type Channel = "A" | "B-Sig" | "B-Disc" | "C";
export type Tier = "A" | "B" | "C";
export type RoleClass = "decision_maker" | "influencer" | "";
export type VerifierStatus =
  | "valid"
  | "accept_all"
  | "webmail"
  | "risky"
  | "invalid"
  | "disposable"
  | "";

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
export type Status = (typeof STATUSES)[number];

export interface Lead {
  id: number;
  leadId: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string;
  companyName: string;
  companyDomain: string;
  channel: Channel;
  tier: Tier;
  roleClass: RoleClass;
  icpSlice: string;
  meddpiccScore: number;
  icpFit: number;
  contactConfidence: number;
  signalAgeDays: number;
  verifierStatus: VerifierStatus;
  status: Status;
  sourceTag: string;
  signalName: string;
  triggerEvent: string;
  linkedinUrl: string;
  phone: string;
  enrichmentNeeded: boolean;
  reviewReason: string;
  missingFields: string;
  workstream: string;
  capturedDate: string;
  lastSeen: string;
  lastUpdated: string;
  // Added by backend: human-readable scoring explanation.
  rationale?: string;
  rationaleFactors?: RationaleFactor[];
}

export interface RationaleFactor {
  label: string;
  points: number;
}

export interface LeadEvent {
  id: number;
  leadId: string;
  type: string;
  detail: string;
  actor: string;
  createdAt: string;
}

export interface Enrollment {
  id: number;
  leadId: string;
  sequenceId: number;
  currentStep: number;
  status: "active" | "paused" | "replied" | "bounced" | "completed";
  nextSendAt: string;
  enrolledAt: string;
}

export interface PipelineRun {
  id: number;
  channel: string;
  trigger: string;
  status: "running" | "success" | "error";
  ingested: number;
  deduped: number;
  enriched: number;
  scored: number;
  routed: number;
  tierA: number;
  tierB: number;
  tierC: number;
  errorMessage: string;
  startedAt: string;
  finishedAt: string;
}

export interface DashboardData {
  totals: {
    leads: number;
    tierA: number;
    reviewQueue: number;
    meetings: number;
    activeOutreach: number;
    avgScore: number;
  };
  byTier: Record<string, number>;
  byChannel: Record<string, number>;
  byStatus: Record<string, number>;
  bySlice: Record<string, number>;
  recentRuns: PipelineRun[];
  hotLeads: Lead[];
}

export interface SequenceStep {
  order: number;
  delayDays: number;
  channel: "email" | "linkedin";
  subject: string;
  body: string;
}

export interface Sequence {
  id: number;
  name: string;
  description: string;
  channel: "email" | "linkedin" | "mixed";
  active: boolean;
  autoEnrollTier: "none" | "A" | "B" | "C";
  steps: string; // JSON string of SequenceStep[]
  createdAt: string;
}

export interface IcpConfig {
  id: number;
  slice: string;
  active: boolean;
  industries: string; // JSON string array
  technologies: string;
  headcount: string;
  fundingStages: string;
  country: string;
  rotationOrder: number;
}

export interface IcpResponse {
  configs: IcpConfig[];
  currentSlice: string;
}

export interface ScoringConfig {
  id: number;
  baselineA: number;
  baselineBSig: number;
  baselineBDisc: number;
  baselineC: number;
  bonusDecisionMaker: number;
  bonusInfluencer: number;
  confidenceWeight: number;
  signalDecayDays: number;
  signalDecayFloor: number;
  tierAThreshold: number;
  tierBThreshold: number;
  classifierKeywords: string; // JSON string
}

export interface ClassifierKeywords {
  decisionMaker: string[];
  influencer: string[];
  targetFunction: string[];
  cLevel: string[];
}

export interface Integration {
  id: number;
  key: string;
  label: string;
  connected: boolean;
  envVar: string;
  meta: string; // JSON string
}

export interface Provider {
  id: number;
  category: string;
  key: string;
  label: string;
  active: boolean;
  connected: boolean;
  envVar: string;
  baseUrl: string;
  config: string; // JSON string
  builtin: boolean;
}

export interface CatalogEntry {
  key: string;
  label: string;
  envVar: string;
  fields: string[];
}

export type ProviderCatalog = Record<string, CatalogEntry[]>;

export interface ProvidersResponse {
  providers: Provider[];
  byCategory: Record<string, Provider[]>;
  catalog: ProviderCatalog;
}

export const PROVIDER_CATEGORIES = [
  "enrichment",
  "verification",
  "tracking",
  "discovery",
  "alerts",
] as const;

// ---- Lead Intake (pluggable, multi-source) ----

export interface IntakeCatalogEntry {
  key: string;
  kind: string;
  label: string;
  channel: Channel;
  fields: string[];
  help: string;
}

export interface IntakeSource {
  id: number;
  key: string;
  kind: string;
  label: string;
  enabled: boolean;
  channel: Channel;
  config: string; // JSON string
  builtin: boolean;
  lastIngestAt: string;
}

// Preview parse of a freeform note / voice transcript (no lead created).
export interface IntakeParse {
  firstName: string;
  lastName: string;
  title: string;
  companyName: string;
  companyDomain: string;
  email: string;
  phone: string;
  signalName: string;
  raw: string;
}

export interface IntakeResult {
  lead: Lead;
  deduped: boolean;
  enrichmentNeeded: boolean;
  missing: string[];
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "member" | "viewer";
  createdAt: string;
}

// safe JSON array parse helper
export function parseJsonArray(s: string | undefined | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
