import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage } from "./storage";
import { seedIfEmpty } from "./seed";
import {
  classifyRole, scoreLead, makeLeadId, isDirectEmail, buildSlackMessage, pickWeeklySlice,
  explainScore, DEFAULT_KEYWORDS, type ClassifierKeywords,
} from "./pipeline";
import { PROVIDER_CATALOG } from "./providers";
import { INTAKE_CATALOG, parseLeadText } from "./intake";
import type { InsertLead } from "@shared/schema";

const now = () => new Date().toISOString();

// Merge stored classifier keywords (JSON) with defaults; empty lists fall back.
function resolveKeywords(raw?: string | null): ClassifierKeywords {
  let parsed: any = {};
  try { parsed = JSON.parse(raw || "{}"); } catch { parsed = {}; }
  const pick = (k: keyof ClassifierKeywords) =>
    Array.isArray(parsed[k]) && parsed[k].length ? parsed[k] : DEFAULT_KEYWORDS[k];
  return {
    decisionMaker: pick("decisionMaker"),
    influencer: pick("influencer"),
    targetFunction: pick("targetFunction"),
    cLevel: pick("cLevel"),
  };
}

// Simulated source pool for "Run Pipeline" — emulates Hunter Discover / email intake
const SIM_POOL = [
  { first: "Aiden", last: "Brooks", title: "VP of Engineering", company: "Lumina AI", domain: "luminaai.com", icp: "AI/ML", conf: 89 },
  { first: "Yuki", last: "Tanaka", title: "Head of Robotics", company: "Vector Dynamics", domain: "vectordynamics.io", icp: "Robotics", conf: 85 },
  { first: "Carlos", last: "Mendez", title: "Chief Technology Officer", company: "Atlas Silicon", domain: "atlassilicon.com", icp: "Hardware", conf: 92 },
  { first: "Ingrid", last: "Larsen", title: "Director of ML Platform", company: "Neuralforge", domain: "neuralforge.ai", icp: "AI/ML", conf: 74 },
  { first: "Devon", last: "Clark", title: "Principal Hardware Engineer", company: "Quantum Edge", domain: "quantumedge.com", icp: "Hardware", conf: 68 },
  { first: "Mira", last: "Sharma", title: "Co-Founder & CTO", company: "Servo Labs", domain: "servolabs.io", icp: "Robotics", conf: 90 },
];

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Health-check for AWS load balancer / App Runner — no DB call, always fast.
  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  try { await seedIfEmpty(); } catch (e) { console.error("[seed] failed:", e); }

  // ── Dashboard summary ──
  app.get("/api/dashboard", async (_req, res) => {
    const leads = await storage.listLeads();
    const runs = await storage.listRuns();
    const scoringCfg = await storage.getScoringConfig();
    const enrollments = await storage.listEnrollments();
    const byTier = { A: 0, B: 0, C: 0 } as Record<string, number>;
    const byChannel: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const bySlice: Record<string, number> = {};
    for (const l of leads) {
      const t = l.tier || "C", ch = l.channel || "A", st = l.status || "Captured";
      byTier[t] = (byTier[t] || 0) + 1;
      byChannel[ch] = (byChannel[ch] || 0) + 1;
      byStatus[st] = (byStatus[st] || 0) + 1;
      if (l.icpSlice) bySlice[l.icpSlice] = (bySlice[l.icpSlice] || 0) + 1;
    }
    const reviewQueue = leads.filter((l) => l.enrichmentNeeded).length;
    const meetings = leads.filter((l) => l.status === "Meeting Booked").length;
    const activeOutreach = enrollments.filter((e) => e.status === "active").length;
    const avgScore = leads.length ? Math.round(leads.reduce((s, l) => s + (l.meddpiccScore || 0), 0) / leads.length) : 0;
    res.json({
      totals: { leads: leads.length, tierA: byTier.A, reviewQueue, meetings, activeOutreach, avgScore },
      byTier, byChannel, byStatus, bySlice,
      recentRuns: runs.slice(0, 6),
      hotLeads: leads.filter((l) => l.tier === "A").slice(0, 6).map((l) => ({ ...l, ...explainScore(l as any, scoringCfg) })),
    });
  });

  // ── Leads ── (each lead carries a faithful scoring rationale)
  app.get("/api/leads", async (_req, res) => {
    const cfg = await storage.getScoringConfig();
    const leads = await storage.listLeads();
    res.json(leads.map((l) => ({ ...l, ...explainScore(l as any, cfg) })));
  });
  app.get("/api/leads/:leadId", async (req, res) => {
    const lead = await storage.getLead(req.params.leadId);
    if (!lead) return res.status(404).json({ error: "not found" });
    const cfg = await storage.getScoringConfig();
    const events = await storage.listEvents(req.params.leadId);
    const enrollments = (await storage.listEnrollments()).filter((e) => e.leadId === req.params.leadId);
    res.json({ lead: { ...lead, ...explainScore(lead as any, cfg) }, events, enrollments });
  });
  app.patch("/api/leads/:leadId", async (req, res) => {
    const patch = { ...req.body, lastUpdated: now() };
    const updated = await storage.updateLead(req.params.leadId, patch);
    if (!updated) return res.status(404).json({ error: "not found" });
    if (req.body.status) {
      await storage.createEvent({ leadId: req.params.leadId, type: "status_change", detail: `→ ${req.body.status}`, actor: "user", createdAt: now() });
    }
    res.json(updated);
  });
  app.post("/api/leads/:leadId/events", async (req, res) => {
    const ev = await storage.createEvent({ leadId: req.params.leadId, type: req.body.type || "note", detail: req.body.detail || "", actor: req.body.actor || "user", createdAt: now() });
    res.json(ev);
  });

  // ── Pipeline runs ──
  app.get("/api/runs", async (_req, res) => res.json(await storage.listRuns()));

  // Run the pipeline (simulated): pull source rows → enrich → classify → score → route
  app.post("/api/runs", async (req, res) => {
    const channel = (req.body.channel as string) || "B-Disc";
    const cfg = await storage.getScoringConfig();
    const keywords = resolveKeywords(cfg.classifierKeywords);
    // Only target leads whose ICP slice matches an ACTIVE config slice.
    const icpConfigs = await storage.listIcpConfigs();
    const activeSlices = new Set(icpConfigs.filter((c) => c.active).map((c) => c.slice));
    const run = await storage.createRun({ channel, trigger: "manual", status: "running", startedAt: now() });
    const count = 2 + Math.floor(Math.random() * 3);
    const eligible = SIM_POOL.filter((p) => activeSlices.size === 0 || activeSlices.has(p.icp));
    const picks = [...eligible].sort(() => Math.random() - 0.5).slice(0, count);
    let enriched = 0, scored = 0, routed = 0, tierA = 0, tierB = 0, tierC = 0;
    const created: any[] = [];
    for (const p of picks) {
      const email = `${p.first.toLowerCase()}.${p.last.toLowerCase()}@${p.domain}`;
      const roleClass = classifyRole(p.title, keywords);
      if (roleClass === "drop" && !isDirectEmail(email)) continue;
      enriched++;
      const age = channel === "B-Sig" ? Math.floor(Math.random() * 30) : 0;
      const { score, tier } = scoreLead({ channel, roleClass: roleClass === "drop" ? "influencer" : roleClass, contactConfidence: p.conf, signalAgeDays: age }, cfg);
      scored++;
      const leadId = makeLeadId({ companyDomain: p.domain, firstName: p.first, lastName: p.last, email, channel });
      const lead: InsertLead = {
        leadId, email, firstName: p.first, lastName: p.last, title: p.title,
        companyName: p.company, companyDomain: p.domain, channel, tier,
        roleClass: roleClass === "drop" ? "influencer" : roleClass, icpSlice: p.icp,
        meddpiccScore: score, icpFit: Math.min(100, p.conf), contactConfidence: p.conf,
        signalAgeDays: age, verifierStatus: p.conf > 80 ? "valid" : "accept_all",
        status: "Scored", sourceTag: channel === "A" ? "email_intro" : "linkedin_signal",
        signalName: channel === "B-Disc" ? "ICP discover" : channel === "B-Sig" ? "Saved signal" : "Inbound",
        triggerEvent: `Signal: ${channel} | Company: ${p.company} | Title: ${p.title}`,
        linkedinUrl: `https://linkedin.com/in/${p.first.toLowerCase()}${p.last.toLowerCase()}`,
        phone: "", enrichmentNeeded: false, reviewReason: "", missingFields: "",
        workstream: "BD", capturedDate: now(), lastSeen: now(), lastUpdated: now(),
      };
      await storage.upsertLead(lead);
      await storage.createEvent({ leadId, type: "captured", detail: `Run #${run.id} — ${lead.signalName}`, actor: "system", createdAt: now() });
      await storage.createEvent({ leadId, type: "scored", detail: `MEDDPICC ${score} → Tier ${tier}`, actor: "system", createdAt: now() });
      routed++;
      if (tier === "A") tierA++; else if (tier === "B") tierB++; else tierC++;
      created.push({ ...lead, ...explainScore(lead as any, cfg), slack: tier === "A" || tier === "B" ? buildSlackMessage(lead) : null });
    }
    const finished = await storage.updateRun(run.id, {
      status: "success", ingested: picks.length, deduped: enriched, enriched, scored, routed,
      tierA, tierB, tierC, finishedAt: now(),
    });
    res.json({ run: finished, created });
  });

  // ── Sequences ──
  app.get("/api/sequences", async (_req, res) => res.json(await storage.listSequences()));
  app.post("/api/sequences", async (req, res) => res.json(await storage.createSequence({ ...req.body, createdAt: now() })));
  app.patch("/api/sequences/:id", async (req, res) => res.json(await storage.updateSequence(Number(req.params.id), req.body)));
  app.delete("/api/sequences/:id", async (req, res) => { await storage.deleteSequence(Number(req.params.id)); res.json({ ok: true }); });

  // ── Enrollments ──
  app.get("/api/enrollments", async (_req, res) => res.json(await storage.listEnrollments()));
  app.post("/api/enrollments", async (req, res) => {
    const e = await storage.createEnrollment({ leadId: req.body.leadId, sequenceId: req.body.sequenceId, currentStep: 0, status: "active", nextSendAt: now(), enrolledAt: now() });
    await storage.updateLead(req.body.leadId, { status: "Outreach Active", lastUpdated: now() });
    await storage.createEvent({ leadId: req.body.leadId, type: "outreach_sent", detail: `Enrolled in sequence #${req.body.sequenceId}`, actor: "user", createdAt: now() });
    res.json(e);
  });
  app.patch("/api/enrollments/:id", async (req, res) => res.json(await storage.updateEnrollment(Number(req.params.id), req.body)));

  // ── Config: ICP ──
  app.get("/api/icp", async (_req, res) => {
    const configs = await storage.listIcpConfigs();
    const current = pickWeeklySlice(configs);
    res.json({ configs, currentSlice: current?.slice || "" });
  });
  app.post("/api/icp", async (req, res) => res.json(await storage.createIcpConfig(req.body)));
  app.patch("/api/icp/:id", async (req, res) => res.json(await storage.updateIcpConfig(Number(req.params.id), req.body)));
  app.delete("/api/icp/:id", async (req, res) => { await storage.deleteIcpConfig(Number(req.params.id)); res.json({ ok: true }); });

  // Classifier-keyword defaults (so the UI can show/reset them)
  app.get("/api/classifier-defaults", async (_req, res) => res.json(DEFAULT_KEYWORDS));
  // Test the classifier against a sample title with live (unsaved) keywords
  app.post("/api/classifier/test", async (req, res) => {
    const kw = resolveKeywords(JSON.stringify(req.body.keywords || {}));
    res.json({ role: classifyRole(req.body.title || "", kw) });
  });

  // ── Config: Scoring ──
  app.get("/api/scoring", async (_req, res) => res.json(await storage.getScoringConfig()));
  app.patch("/api/scoring", async (req, res) => res.json(await storage.updateScoringConfig(req.body)));
  // Score preview — lets the UI show how weights affect a sample lead
  app.post("/api/scoring/preview", async (req, res) => {
    const cfg = await storage.getScoringConfig();
    const merged = { ...cfg, ...req.body.config };
    const result = scoreLead(req.body.lead, merged as any);
    res.json(result);
  });

  // ── Integrations / Settings ──
  app.get("/api/integrations", async (_req, res) => res.json(await storage.listIntegrations()));
  app.patch("/api/integrations/:key", async (req, res) => res.json(await storage.updateIntegration(req.params.key, req.body)));

  // ── Pluggable providers (enrichment / verification / tracking / discovery / alerts) ──
  // The catalog tells the UI what vendors are selectable per category and what
  // config fields each needs. Stored rows track which one is ACTIVE per category.
  app.get("/api/provider-catalog", async (_req, res) => res.json(PROVIDER_CATALOG));
  app.get("/api/providers", async (_req, res) => {
    const rows = await storage.listProviders();
    // Group by category for convenient UI rendering, plus the flat list.
    const byCategory: Record<string, any[]> = {};
    for (const r of rows) (byCategory[r.category] ||= []).push(r);
    res.json({ providers: rows, byCategory, catalog: PROVIDER_CATALOG });
  });
  app.post("/api/providers", async (req, res) => {
    // Add a custom provider (e.g. self-hosted enrichment endpoint).
    const body = req.body || {};
    if (!body.category || !body.key || !body.label) {
      return res.status(400).json({ error: "category, key and label are required" });
    }
    const created = await storage.createProvider({
      category: body.category, key: body.key, label: body.label,
      active: !!body.active, connected: !!body.connected,
      envVar: body.envVar || "", baseUrl: body.baseUrl || "",
      config: typeof body.config === "string" ? body.config : JSON.stringify(body.config || {}),
      builtin: false,
    });
    res.json(created);
  });
  app.patch("/api/providers/:key", async (req, res) => {
    const patch = { ...req.body };
    if (patch.config && typeof patch.config !== "string") patch.config = JSON.stringify(patch.config);
    const updated = await storage.updateProvider(req.params.key, patch);
    if (!updated) return res.status(404).json({ error: "not found" });
    res.json(updated);
  });
  app.delete("/api/providers/:key", async (req, res) => {
    await storage.deleteProvider(req.params.key);
    res.json({ ok: true });
  });
  // Choose the active provider for a category (deactivates the others).
  app.post("/api/providers/:category/activate", async (req, res) => {
    if (!req.body?.key) return res.status(400).json({ error: "key is required" });
    await storage.setActiveProvider(req.params.category, req.body.key);
    const rows = (await storage.listProviders()).filter((p) => p.category === req.params.category);
    res.json({ ok: true, providers: rows });
  });

  // ── Pluggable lead intake (email poll / manual text / voice / webhook / CSV / form) ──
  app.get("/api/intake-catalog", async (_req, res) => res.json(INTAKE_CATALOG));
  app.get("/api/intake-sources", async (_req, res) => res.json(await storage.listIntakeSources()));
  app.post("/api/intake-sources", async (req, res) => {
    const b = req.body || {};
    if (!b.key || !b.kind || !b.label) return res.status(400).json({ error: "key, kind and label required" });
    const created = await storage.createIntakeSource({
      key: b.key, kind: b.kind, label: b.label, enabled: !!b.enabled,
      channel: b.channel || "C",
      config: typeof b.config === "string" ? b.config : JSON.stringify(b.config || {}),
      builtin: false, lastIngestAt: "",
    });
    res.json(created);
  });
  app.patch("/api/intake-sources/:key", async (req, res) => {
    const patch = { ...req.body };
    if (patch.config && typeof patch.config !== "string") patch.config = JSON.stringify(patch.config);
    const updated = await storage.updateIntakeSource(req.params.key, patch);
    if (!updated) return res.status(404).json({ error: "not found" });
    res.json(updated);
  });
  app.delete("/api/intake-sources/:key", async (req, res) => {
    await storage.deleteIntakeSource(req.params.key);
    res.json({ ok: true });
  });

  // Live preview: parse freeform text/voice WITHOUT creating a lead (for the UI).
  app.post("/api/intake/parse", async (req, res) => {
    res.json(parseLeadText(req.body?.text || ""));
  });

  // Ingest a lead from ANY source: structured JSON, freeform text, or a voice
  // transcript. Runs the same classify → score → dedup → route pipeline as
  // automated channels. body = { source?, channel?, text?, lead?: {…fields} }
  app.post("/api/intake", async (req, res) => {
    const cfg = await storage.getScoringConfig();
    const keywords = resolveKeywords(cfg.classifierKeywords);
    const sourceKey = req.body?.source || "manual_text";
    const channel = (req.body?.channel as string) || "C";

    // 1) Resolve fields: explicit structured `lead` wins; else parse freeform text.
    const parsed = req.body?.text ? parseLeadText(req.body.text) : null;
    const f = { ...(parsed || {}), ...(req.body?.lead || {}) } as any;
    const firstName = f.firstName || "", lastName = f.lastName || "";
    const email = (f.email || "").toLowerCase();
    const domain = f.companyDomain || (email.includes("@") ? email.split("@")[1] : "");
    const title = f.title || "";
    const company = f.companyName || (domain ? domain.split(".")[0] : "");

    if (!firstName && !email && !company) {
      return res.status(422).json({ error: "could not extract a lead", parsed: f });
    }

    // 2) Classify + decide if it needs human review (missing key fields).
    const roleClass = classifyRole(title, keywords);
    const missing: string[] = [];
    if (!email) missing.push("email");
    if (!domain) missing.push("companyDomain");
    if (!title) missing.push("title");
    const enrichmentNeeded = missing.length > 0;

    // 3) Score (low-confidence for manual/freeform unless an email is present).
    const conf = email ? (isDirectEmail(email) ? 80 : 60) : 40;
    const { score, tier } = scoreLead(
      { channel, roleClass: roleClass === "drop" ? "influencer" : roleClass, contactConfidence: conf, signalAgeDays: 0 },
      cfg,
    );

    // 4) Dedup via deterministic lead_id + route. Pass companyName so
    // name-only intake (voice/manual without a domain) still gets a stable id.
    const leadId = makeLeadId({ companyDomain: domain, firstName, lastName, email, channel, companyName: company, signalName: f.signalName });
    const existing = await storage.getLead(leadId);
    const lead: InsertLead = {
      leadId, email, firstName, lastName, title,
      companyName: company, companyDomain: domain, channel,
      tier: enrichmentNeeded ? "C" : tier,
      roleClass: roleClass === "drop" ? "influencer" : roleClass,
      icpSlice: f.icpSlice || "", meddpiccScore: enrichmentNeeded ? 0 : score,
      icpFit: conf, contactConfidence: conf, signalAgeDays: 0,
      verifierStatus: email ? "unverified" : "",
      status: enrichmentNeeded ? "Review Required" : "Scored",
      sourceTag: sourceKey,
      signalName: f.signalName || "Manual intake",
      triggerEvent: parsed?.raw ? `Intake (${sourceKey}): ${parsed.raw.slice(0, 200)}` : `Intake via ${sourceKey}`,
      linkedinUrl: f.linkedinUrl || "", phone: f.phone || "",
      enrichmentNeeded, reviewReason: enrichmentNeeded ? `Missing: ${missing.join(", ")}` : "",
      missingFields: missing.join(","), workstream: "BD",
      capturedDate: now(), lastSeen: now(), lastUpdated: now(),
    };
    await storage.upsertLead(lead);
    await storage.createEvent({ leadId, type: existing ? "updated" : "captured", detail: `Intake — ${sourceKey}${existing ? " (dedup: merged)" : ""}`, actor: "user", createdAt: now() });
    if (!enrichmentNeeded) await storage.createEvent({ leadId, type: "scored", detail: `MEDDPICC ${score} → Tier ${tier}`, actor: "system", createdAt: now() });
    await storage.updateIntakeSource(sourceKey, { lastIngestAt: now() }).catch(() => {});

    res.json({
      lead: { ...lead, ...explainScore(lead as any, cfg) },
      deduped: !!existing, enrichmentNeeded, missing,
    });
  });

  // ── Users / sharing ──
  app.get("/api/users", async (_req, res) => res.json(await storage.listUsers()));
  app.post("/api/users", async (req, res) => res.json(await storage.createUser(req.body)));

  return httpServer;
}
