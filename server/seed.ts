import { storage, db, ensureSchema } from "./storage";
import { integrations, providers, intakeSources } from "@shared/schema";
import { defaultProviderRows } from "./providers";
import { defaultIntakeRows } from "./intake";
import { makeLeadId, classifyRole, scoreLead, isDirectEmail } from "./pipeline";
import type { InsertLead } from "@shared/schema";

const now = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

// Realistic demo leads across the 3 ICP slices + 3 channels
const RAW = [
  // ── AI/ML ──
  { first: "Maya", last: "Krishnan", title: "VP of AI Engineering", company: "Vellum Labs", domain: "vellumlabs.ai", channel: "B-Disc", icp: "AI/ML", conf: 91, age: 0, signal: "Series B raise", email: "maya@vellumlabs.ai" },
  { first: "Daniel", last: "Osei", title: "Chief Technology Officer", company: "Synapse Compute", domain: "synapsecompute.com", channel: "A", icp: "AI/ML", conf: 95, age: 0, signal: "Inbound intro", email: "daniel.osei@synapsecompute.com" },
  { first: "Priya", last: "Raman", title: "Head of Machine Learning", company: "Cortexa", domain: "cortexa.io", channel: "B-Sig", icp: "AI/ML", conf: 84, age: 4, signal: "Hiring ML engineers", email: "praman@cortexa.io" },
  { first: "Lucas", last: "Meyer", title: "Director of Data Platform", company: "Northwind AI", domain: "northwind.ai", channel: "B-Disc", icp: "AI/ML", conf: 72, age: 0, signal: "ICP discover", email: "lucas.meyer@northwind.ai" },
  { first: "Sofia", last: "Reyes", title: "Co-Founder & CEO", company: "Tensorways", domain: "tensorways.com", channel: "A", icp: "AI/ML", conf: 88, age: 0, signal: "Referral", email: "sofia@tensorways.com" },
  // ── Robotics ──
  { first: "Arjun", last: "Patel", title: "VP Robotics Engineering", company: "Kinetix Robotics", domain: "kinetixrobotics.com", channel: "B-Disc", icp: "Robotics", conf: 90, age: 0, signal: "Series A raise", email: "arjun@kinetixrobotics.com" },
  { first: "Hana", last: "Sato", title: "Head of Autonomy", company: "Orbital Motion", domain: "orbitalmotion.io", channel: "B-Sig", icp: "Robotics", conf: 81, age: 12, signal: "Expanding team", email: "hsato@orbitalmotion.io" },
  { first: "Marcus", last: "Webb", title: "Principal Robotics Architect", company: "Forge Automation", domain: "forgeauto.com", channel: "B-Disc", icp: "Robotics", conf: 69, age: 0, signal: "ICP discover", email: "marcus.webb@forgeauto.com" },
  { first: "Elena", last: "Costa", title: "CEO & Founder", company: "Helix Dynamics", domain: "helixdynamics.com", channel: "A", icp: "Robotics", conf: 93, age: 0, signal: "Inbound demo request", email: "elena@helixdynamics.com" },
  // ── Hardware ──
  { first: "Tomas", last: "Nilsson", title: "VP Hardware Engineering", company: "SiliconRidge", domain: "siliconridge.com", channel: "B-Disc", icp: "Hardware", conf: 86, age: 0, signal: "Series C+ raise", email: "tomas@siliconridge.com" },
  { first: "Grace", last: "Lin", title: "Director of Platform Infrastructure", company: "Cobalt Systems", domain: "cobaltsystems.io", channel: "B-Sig", icp: "Hardware", conf: 78, age: 21, signal: "Hiring hardware leads", email: "glin@cobaltsystems.io" },
  { first: "Omar", last: "Haddad", title: "Chief Hardware Officer", company: "Nimbus Semiconductors", domain: "nimbussemi.com", channel: "A", icp: "Hardware", conf: 94, age: 0, signal: "Intro from partner", email: "omar.haddad@nimbussemi.com" },
  // ── lower-quality / review cases ──
  { first: "Jess", last: "", title: "Sales Manager", company: "Brightline Devices", domain: "brightlinedevices.com", channel: "B-Disc", icp: "Hardware", conf: 41, age: 0, signal: "ICP discover", email: "" },
  { first: "Ravi", last: "Anand", title: "Engineering Manager", company: "Pulse Robotics", domain: "pulserobotics.com", channel: "B-Sig", icp: "Robotics", conf: 63, age: 35, signal: "Stale signal", email: "ravi@pulserobotics.com" },
  { first: "Nina", last: "Berg", title: "Staff ML Engineer", company: "Quantia", domain: "quantia.ai", channel: "B-Disc", icp: "AI/ML", conf: 70, age: 0, signal: "ICP discover", email: "nina.berg@quantia.ai" },
];

const SEQUENCES = [
  {
    name: "Tier A — Founder Outreach", description: "High-touch sequence for hot decision-maker leads.",
    channel: "email", active: true, autoEnrollTier: "A",
    steps: JSON.stringify([
      { order: 1, delayDays: 0, channel: "email", subject: "Quick question on {{company}}'s eng hiring", body: "Hi {{first}}, saw {{company}} is scaling — we help AI/robotics teams hire senior engineers fast. Worth a 15-min chat?" },
      { order: 2, delayDays: 3, channel: "email", subject: "Re: {{company}} hiring", body: "Hi {{first}}, following up — happy to share how we placed 3 staff engineers at a Series B robotics co in 5 weeks." },
      { order: 3, delayDays: 5, channel: "linkedin", subject: "", body: "Connecting re: senior eng hiring at {{company}}." },
    ]),
  },
  {
    name: "Tier B — Warm Nurture", description: "Lighter cadence for influencers and warm leads.",
    channel: "mixed", active: true, autoEnrollTier: "B",
    steps: JSON.stringify([
      { order: 1, delayDays: 0, channel: "email", subject: "Helping {{company}} with technical hiring", body: "Hi {{first}}, we specialize in placing senior {{title}}-level talent. Open to learning your roadmap?" },
      { order: 2, delayDays: 7, channel: "email", subject: "Resources for {{company}}", body: "Sharing a short guide on retention for hardware/AI teams — useful as you grow." },
    ]),
  },
];

export async function seedIfEmpty() {
  await ensureSchema();
  const existing = await storage.listLeads();
  if (existing.length > 0) return { seeded: false };

  // Scoring config
  const cfg = await storage.getScoringConfig();

  // ICP configs (rotation: AI/ML=0, Robotics=1, Hardware=2)
  await storage.createIcpConfig({ slice: "AI/ML", active: true, rotationOrder: 0, country: "US",
    industries: JSON.stringify(["Software Development", "IT Services and IT Consulting", "Computers and Electronics Manufacturing"]),
    technologies: JSON.stringify(["PyTorch", "CUDA", "Ray"]),
    headcount: '["11-50","51-200"]', fundingStages: '["seed","series_a","series_b","series_c"]' });
  await storage.createIcpConfig({ slice: "Robotics", active: true, rotationOrder: 1, country: "US",
    industries: JSON.stringify(["Robot Manufacturing", "Robotics Engineering", "Industrial Automation"]),
    technologies: JSON.stringify(["ROS"]),
    headcount: '["11-50","51-200"]', fundingStages: '["seed","series_a","series_b","series_c"]' });
  await storage.createIcpConfig({ slice: "Hardware", active: true, rotationOrder: 2, country: "US",
    industries: JSON.stringify(["Semiconductors", "Computer Hardware Manufacturing", "Computer Hardware"]),
    technologies: JSON.stringify([]),
    headcount: '["11-50","51-200"]', fundingStages: '["seed","series_a","series_b","series_c"]' });

  // Users (team + a partner)
  await storage.createUser({ name: "Vito Chesky", email: "vito@iconstafflabs.com", role: "admin" });
  await storage.createUser({ name: "Sam Rivera", email: "sam@iconstafflabs.com", role: "member" });
  await storage.createUser({ name: "Partner (Read-only)", email: "partner@example.com", role: "viewer" });

  // Sequences
  const seqRows = [];
  for (const s of SEQUENCES) seqRows.push(await storage.createSequence({ ...s, createdAt: now() }));

  // Leads — run them through the real pipeline logic
  const statuses = ["Scored", "Outreach Active", "Responded", "Meeting Booked", "Validated", "Review Required", "Nurture"];
  let i = 0;
  for (const r of RAW) {
    const roleClass = classifyRole(r.title);
    const effectiveRole = roleClass === "drop" ? (isDirectEmail(r.email) ? "influencer" : "") : roleClass;
    const { score, tier } = scoreLead(
      { channel: r.channel, roleClass: effectiveRole, contactConfidence: r.conf, signalAgeDays: r.age },
      cfg
    );
    const leadId = makeLeadId({ companyDomain: r.domain, firstName: r.first, lastName: r.last, email: r.email, channel: r.channel, signalName: r.signal, companyName: r.company });
    const missing: string[] = [];
    if (!r.first) missing.push("First Name");
    if (!r.last) missing.push("Last Name");
    if (!r.email) missing.push("Email");
    if (!r.title) missing.push("Title");
    const enrichmentNeeded = missing.length > 0;
    const status = enrichmentNeeded ? "Review Required" : statuses[i % statuses.length];
    const verifier = !r.email ? "invalid" : r.conf > 80 ? "valid" : r.conf > 60 ? "accept_all" : "risky";

    const lead: InsertLead = {
      leadId, email: r.email, firstName: r.first, lastName: r.last, title: r.title,
      companyName: r.company, companyDomain: r.domain, channel: r.channel, tier,
      roleClass: effectiveRole, icpSlice: r.icp, meddpiccScore: score,
      icpFit: Math.min(100, r.conf + (effectiveRole === "decision_maker" ? 8 : 0)),
      contactConfidence: r.conf, signalAgeDays: r.age, verifierStatus: verifier,
      status, sourceTag: r.channel === "A" ? "email_intro" : "linkedin_signal",
      signalName: r.signal,
      triggerEvent: `Signal: ${r.signal} | Company: ${r.company} | Title: ${r.title}`,
      linkedinUrl: r.first ? `https://linkedin.com/in/${r.first.toLowerCase()}${r.last.toLowerCase()}` : "",
      phone: "", enrichmentNeeded, reviewReason: enrichmentNeeded ? "Missing: " + missing.join(", ") : "",
      missingFields: missing.join(", "), workstream: "BD",
      capturedDate: daysAgo(14 - (i % 14)), lastSeen: daysAgo(i % 7), lastUpdated: daysAgo(i % 5),
    };
    await storage.upsertLead(lead);
    await storage.createEvent({ leadId, type: "captured", detail: `Captured via channel ${r.channel} — ${r.signal}`, actor: "system", createdAt: lead.capturedDate });
    if (!enrichmentNeeded) {
      await storage.createEvent({ leadId, type: "enriched", detail: `Hunter domain search + verify (${verifier})`, actor: "system", createdAt: lead.lastSeen });
      await storage.createEvent({ leadId, type: "scored", detail: `MEDDPICC ${score} → Tier ${tier}`, actor: "system", createdAt: lead.lastUpdated });
    }
    // enroll Tier A/B into matching sequences
    if (tier === "A" && !enrichmentNeeded) {
      await storage.createEnrollment({ leadId, sequenceId: seqRows[0].id, currentStep: i % 3, status: status === "Responded" ? "replied" : "active", nextSendAt: daysAgo(-2), enrolledAt: lead.lastSeen });
    } else if (tier === "B" && !enrichmentNeeded) {
      await storage.createEnrollment({ leadId, sequenceId: seqRows[1].id, currentStep: i % 2, status: "active", nextSendAt: daysAgo(-4), enrolledAt: lead.lastSeen });
    }
    i++;
  }

  // Pipeline run history
  for (let k = 0; k < 6; k++) {
    const ch = ["A", "B-Sig", "B-Disc", "A", "B-Sig", "all"][k];
    const ingested = 8 + (k * 3) % 12;
    const run = await storage.createRun({
      channel: ch, trigger: k % 2 === 0 ? "scheduled" : "manual", status: k === 1 ? "error" : "success",
      ingested, deduped: Math.floor(ingested * 0.7), enriched: Math.floor(ingested * 0.6),
      scored: Math.floor(ingested * 0.5), routed: Math.floor(ingested * 0.4),
      tierA: 1 + (k % 3), tierB: 2 + (k % 4), tierC: 1 + (k % 2),
      errorMessage: k === 1 ? "Hunter API rate limit (429) — retried, partial" : "",
      startedAt: daysAgo(k), finishedAt: daysAgo(k),
    });
    void run;
  }

  // Integrations (env-var backed, no raw secrets)
  const ints = [
    { key: "gmail", label: "Gmail (BD-Leads)", connected: true, envVar: "GMAIL_OAUTH_TOKEN", meta: JSON.stringify({ schedule: "0 0 7-19/2 * * 1-5" }) },
    { key: "outlook", label: "Office 365 (BD-Leads)", connected: true, envVar: "OUTLOOK_OAUTH_TOKEN", meta: JSON.stringify({ schedule: "0 0 7-19/2 * * 1-5" }) },
    { key: "hunter", label: "Hunter.io", connected: true, envVar: "HUNTER_API_KEY", meta: JSON.stringify({ note: "Rotate the key exposed in the n8n export" }) },
    { key: "anthropic", label: "Anthropic Claude", connected: true, envVar: "ANTHROPIC_API_KEY", meta: JSON.stringify({ model: "claude-sonnet-4-6" }) },
    { key: "slack", label: "Slack Alerts", connected: true, envVar: "SLACK_BOT_TOKEN", meta: JSON.stringify({ hotChannel: "#bd-hot-leads", warmChannel: "#bd-warm-leads" }) },
    { key: "quickmail", label: "QuickMail Nurture", connected: false, envVar: "QUICKMAIL_API_KEY", meta: "{}" },
  ];
  for (const it of ints) await db.insert(integrations).values(it);

  // Pluggable providers (enrichment / verification / tracking / discovery / alerts)
  // Defaults match the original n8n workflow: Hunter + Airtable + Slack active.
  for (const row of defaultProviderRows()) await db.insert(providers).values(row);

  // Pluggable intake sources (email polling + Hunter + manual/voice/webhook on by default)
  for (const row of defaultIntakeRows()) await db.insert(intakeSources).values(row);

  return { seeded: true, leads: RAW.length };
}
