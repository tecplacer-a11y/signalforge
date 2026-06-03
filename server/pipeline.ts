// ─────────────────────────────────────────────────────────────
// SignalForge Pipeline Engine
// Faithful TypeScript port of the "Phase 1 — BD Signal Pipeline v4"
// n8n code-node logic. Pure, testable functions — one per stage.
// ─────────────────────────────────────────────────────────────
import type { ScoringConfig, IcpConfig } from "@shared/schema";

export const INTERNAL_DOMAINS = ["iconstaff.com", "iconstafflabs.com", "iconicstaffing.com"];
const JUNK_DOMAINS = [
  "bizjournals.com", "mailchimp.com", "constantcontact.com", "sendgrid.net",
  "linkedin.com", "twitter.com", "x.com", "facebook.com", "youtube.com",
  "medium.com", "substack.com", "github.com", "crunchbase.com", "techcrunch.com", "finservices.com",
];
const ROLE_PREFIXES = [
  "info", "admin", "support", "sales", "contact", "hello", "hi", "team",
  "office", "hr", "press", "marketing", "billing", "accounts", "careers", "jobs", "noreply", "no-reply",
];

// ── helpers ──────────────────────────────────────────────────
export const slugify = (s: string) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");

export function isDirectEmail(email: string): boolean {
  if (!email || !email.includes("@")) return false;
  const local = email.split("@")[0].toLowerCase();
  return !ROLE_PREFIXES.some(
    (p) => local === p || local.startsWith(p + ".") || local.startsWith(p + "-") || local.startsWith(p + "_")
  );
}

export function isValidLead(domain: string, name: string): boolean {
  domain = (domain || "").toLowerCase();
  name = (name || "").toLowerCase();
  if (domain.includes("@") || domain.startsWith("outlook_") || domain.startsWith("unknown")) return false;
  if (domain.length < 3 || !domain.includes(".")) return false;
  if (INTERNAL_DOMAINS.some((d) => domain.includes(d))) return false;
  if (JUNK_DOMAINS.some((d) => domain.includes(d))) return false;
  if (name && (name.includes("@") || name.includes(".com") || /^[a-f0-9]{10,}/.test(name))) return false;
  return true;
}

// ── Deterministic lead_id (Schema Normalizer v2 logic) ───────
export function makeLeadId(opts: {
  companyDomain?: string; firstName?: string; lastName?: string;
  email?: string; channel?: string; signalName?: string; companyName?: string;
}): string {
  const domain = (opts.companyDomain || "").trim().toLowerCase();
  const email = (opts.email || "").trim().toLowerCase();
  const first = (opts.firstName || "").trim();
  const last = (opts.lastName || "").trim();
  if (domain && (first || last)) return `${slugify(domain)}:${slugify(first)}_${slugify(last)}`;
  if (email) return `email:${slugify(email)}`;
  if (domain) return `domain:${slugify(domain)}_noid`;
  const sig = slugify((opts.signalName || "") + (opts.companyName || ""));
  return `${slugify(opts.channel || "A")}:${sig || "unknown"}`;
}

// ── Role Classifier (config-driven — keywords are fully editable) ──
// Defaults preserve the exact v4 behavior, but every keyword list can be
// overridden via the Targeting config so the user can target ANY vertical
// (healthcare, fintech, biotech, climate, etc.) without code changes.
export const DEFAULT_KEYWORDS = {
  decisionMaker: ["CEO", "CTO", "CIO", "CISO", "Chief", "VP", "Vice President", "Head of", "Founder", "Co-Founder", "Co Founder", "President", "EVP", "SVP"],
  influencer: ["Director", "Principal", "Staff", "Lead", "Manager", "Architect"],
  // Target FUNCTIONS — the domains/departments you care about. Edit freely.
  targetFunction: ["Engineering", "AI", "ML", "Machine Learning", "Robotics", "Hardware", "Platform", "Infrastructure", "Research", "Data", "Product"],
  cLevel: ["Chief", "CEO", "CTO", "Founder", "CISO", "CIO"],
};
export type ClassifierKeywords = typeof DEFAULT_KEYWORDS;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
const toRegex = (words: string[]) =>
  words && words.length ? new RegExp(`\\b(${words.map(esc).join("|")})\\b`, "i") : /$^/;

export function classifyRole(title: string, keywords: ClassifierKeywords = DEFAULT_KEYWORDS): "decision_maker" | "influencer" | "drop" {
  title = (title || "").trim();
  const DM = toRegex(keywords.decisionMaker);
  const INFLUENCER = toRegex(keywords.influencer);
  const TARGET_FN = toRegex(keywords.targetFunction);
  const CLEVEL = toRegex(keywords.cLevel);
  if (DM.test(title) && (TARGET_FN.test(title) || CLEVEL.test(title))) return "decision_maker";
  if (INFLUENCER.test(title) && TARGET_FN.test(title)) return "influencer";
  return "drop";
}

// ── MEDDPICC Score + Tier (exact formula from v4) ────────────
export function scoreLead(
  lead: { channel: string; roleClass: string; contactConfidence?: number | null; signalAgeDays?: number | null },
  cfg: Partial<ScoringConfig>
): { score: number; tier: "A" | "B" | "C" } {
  const n = (v: number | null | undefined, d: number) => (v == null ? d : v);
  const baselines: Record<string, number> = {
    A: n(cfg.baselineA, 60), "B-Sig": n(cfg.baselineBSig, 45),
    "B-Disc": n(cfg.baselineBDisc, 30), C: n(cfg.baselineC, 35),
  };
  let score = baselines[lead.channel] ?? n(cfg.baselineBDisc, 30);
  if (lead.roleClass === "decision_maker") score += n(cfg.bonusDecisionMaker, 20);
  else if (lead.roleClass === "influencer") score += n(cfg.bonusInfluencer, 10);
  score += Math.round(((lead.contactConfidence || 0) / 100) * n(cfg.confidenceWeight, 10));
  if (lead.channel === "B-Sig" && typeof lead.signalAgeDays === "number") {
    score = Math.round(score * Math.max(n(cfg.signalDecayFloor, 0.2), 1 - lead.signalAgeDays / n(cfg.signalDecayDays, 60)));
  }
  const tier: "A" | "B" | "C" =
    score >= n(cfg.tierAThreshold, 80) ? "A" : score >= n(cfg.tierBThreshold, 60) ? "B" : "C";
  return { score, tier };
}

// ── Scoring rationale (faithful to scoreLead math) ───────────
// Produces a human-readable explanation + factor breakdown so users
// understand WHY a lead got its score and tier.
export type RationaleFactor = { label: string; points: number };

export function explainScore(
  lead: { channel: string; roleClass: string; contactConfidence?: number | null; signalAgeDays?: number | null; tier?: string | null; meddpiccScore?: number | null;
          firstName?: string | null; companyName?: string | null; verifierStatus?: string | null; signalName?: string | null; icpSlice?: string | null; enrichmentNeeded?: boolean | null },
  cfg: Partial<ScoringConfig>
): { rationale: string; rationaleFactors: RationaleFactor[] } {
  const n = (v: number | null | undefined, d: number) => (v == null ? d : v);
  const factors: RationaleFactor[] = [];
  const baselines: Record<string, number> = {
    A: n(cfg.baselineA, 60), "B-Sig": n(cfg.baselineBSig, 45), "B-Disc": n(cfg.baselineBDisc, 30), C: n(cfg.baselineC, 35),
  };
  const chLabel: Record<string, string> = {
    A: "Inbound email (Channel A)", "B-Sig": "Hunter saved signal (B-Sig)", "B-Disc": "ICP discovery (B-Disc)", C: "Other (Channel C)",
  };
  const base = baselines[lead.channel] ?? n(cfg.baselineBDisc, 30);
  factors.push({ label: `${chLabel[lead.channel] || lead.channel} baseline`, points: base });

  if (lead.roleClass === "decision_maker") factors.push({ label: "Decision-maker title", points: n(cfg.bonusDecisionMaker, 20) });
  else if (lead.roleClass === "influencer") factors.push({ label: "Influencer title", points: n(cfg.bonusInfluencer, 10) });

  const confPts = Math.round(((lead.contactConfidence || 0) / 100) * n(cfg.confidenceWeight, 10));
  if (confPts) factors.push({ label: `Email confidence ${lead.contactConfidence || 0}%`, points: confPts });

  let decayNote = "";
  if (lead.channel === "B-Sig" && typeof lead.signalAgeDays === "number") {
    const factor = Math.max(n(cfg.signalDecayFloor, 0.2), 1 - lead.signalAgeDays / n(cfg.signalDecayDays, 60));
    const pct = Math.round((1 - factor) * 100);
    if (pct > 0) {
      const subtotal = factors.reduce((s, f) => s + f.points, 0);
      const lost = Math.round(subtotal * (1 - factor));
      factors.push({ label: `Signal age ${lead.signalAgeDays}d decay (−${pct}%)`, points: -lost });
      decayNote = ` Score was reduced ${pct}% because the signal is ${lead.signalAgeDays} days old.`;
    }
  }

  const score = n(lead.meddpiccScore, factors.reduce((s, f) => s + f.points, 0));
  const tier = lead.tier || (score >= n(cfg.tierAThreshold, 80) ? "A" : score >= n(cfg.tierBThreshold, 60) ? "B" : "C");
  const tierWord = tier === "A" ? "hot (Tier A)" : tier === "B" ? "warm (Tier B)" : "low-priority (Tier C)";
  const who = [lead.firstName, lead.companyName].filter(Boolean).join(" at ") || "This lead";
  const roleWord = lead.roleClass === "decision_maker" ? "a decision-maker" : lead.roleClass === "influencer" ? "an influencer" : "an unclassified contact";
  const sliceWord = lead.icpSlice ? ` in the ${lead.icpSlice} target area` : "";
  const verWord = lead.verifierStatus ? ` Email verification: ${lead.verifierStatus}.` : "";
  const sigWord = lead.signalName ? ` Triggered by: ${lead.signalName}.` : "";

  let rationale: string;
  if (lead.enrichmentNeeded) {
    rationale = `${who} needs review — incomplete contact data before scoring can be trusted.${sigWord}`;
  } else {
    rationale = `${who} is ${roleWord}${sliceWord}, sourced via ${chLabel[lead.channel] || lead.channel}. ` +
      `Scored ${score} → ${tierWord}.${decayNote}${verWord}${sigWord}`;
  }
  return { rationale, rationaleFactors: factors };
}

// ── Weekly ICP slice rotation (week % 3) ─────────────────────
export function pickWeeklySlice(configs: IcpConfig[], date = new Date()): IcpConfig | undefined {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  );
  const active = configs.filter((c) => c.active).sort((a, b) => (a.rotationOrder ?? 0) - (b.rotationOrder ?? 0));
  if (!active.length) return undefined;
  return active[weekNum % active.length] || active[0];
}

// ── Slack message builder (Prep Hot/Warm Lead Slack) ─────────
export function buildSlackMessage(lead: {
  tier?: string | null; firstName?: string | null; lastName?: string | null; companyName?: string | null;
  title?: string | null; email?: string | null; meddpiccScore?: number | null; channel?: string | null;
  icpFit?: number | null; roleClass?: string | null; signalName?: string | null; icpSlice?: string | null;
}): string {
  const tierEmoji = lead.tier === "A" ? ":rotating_light:" : ":large_blue_circle:";
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unknown";
  const company = lead.companyName || "Unknown";
  const signal = lead.signalName ? `\nSignal: ${lead.signalName}` : "";
  const slice = lead.icpSlice ? ` [${lead.icpSlice}]` : "";
  return (
    `${tierEmoji} *Tier ${lead.tier} Lead — BD Signal Pipeline*\n` +
    `*${name}* — ${lead.title || ""}\n` +
    `Company: *${company}*${slice}\n` +
    `Email: ${lead.email || "N/A"}\n` +
    `Channel: ${lead.channel || ""} | MEDDPICC: ${lead.meddpiccScore || 0} | ICP Fit: ${lead.icpFit || 0} | Role: ${lead.roleClass || ""}` +
    signal
  );
}
