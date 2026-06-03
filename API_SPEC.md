# SignalForge API (backend is DONE & TESTED — build the React frontend against it)

Base: relative `/api/...` via `apiRequest` from `@/lib/queryClient`. Server runs on port 5000 (template handles proxy).

## Endpoints

### Dashboard
GET `/api/dashboard` → `{ totals:{leads,tierA,reviewQueue,meetings,activeOutreach,avgScore}, byTier:{A,B,C}, byChannel, byStatus, bySlice, recentRuns:[run], hotLeads:[lead] }`

### Leads
- GET `/api/leads` → `Lead[]`
- GET `/api/leads/:leadId` → `{ lead, events:[Event], enrollments:[Enrollment] }`
- PATCH `/api/leads/:leadId` body=partial lead (e.g. `{status,tier,title,email,...}`) → updated lead. Pass `status` to log a status_change event.
- POST `/api/leads/:leadId/events` body=`{type,detail,actor}` → Event (use for notes)

Lead fields: leadId, email, firstName, lastName, title, companyName, companyDomain, channel (A|B-Sig|B-Disc|C), tier (A|B|C), roleClass (decision_maker|influencer), icpSlice, meddpiccScore, icpFit, contactConfidence, signalAgeDays, verifierStatus (valid|accept_all|webmail|risky|invalid|disposable), status, sourceTag, signalName, triggerEvent, linkedinUrl, phone, enrichmentNeeded (0/1), reviewReason, missingFields, workstream, capturedDate, lastSeen, lastUpdated.

Status stages (kanban columns, in order): Captured, Validated, Enriching, Scored, Narrative Ready, Review Required, Outreach Active, Responded, Meeting Booked, Disqualified, Nurture.

### Pipeline Runs
- GET `/api/runs` → `PipelineRun[]` (channel, trigger, status running|success|error, ingested, deduped, enriched, scored, routed, tierA, tierB, tierC, errorMessage, startedAt, finishedAt)
- POST `/api/runs` body=`{channel}` (A|B-Sig|B-Disc) → `{run, created:[lead w/ optional slack string]}` — runs the live pipeline engine and creates new scored leads. THIS IS THE "Run Pipeline" BUTTON.

### Sequences (outreach)
- GET `/api/sequences` → `Sequence[]` (name, description, channel email|linkedin|mixed, active, autoEnrollTier, steps=JSON string of `[{order,delayDays,channel,subject,body}]`)
- POST `/api/sequences` body=`{name,description,channel,active,autoEnrollTier,steps(JSON string)}`
- PATCH `/api/sequences/:id`, DELETE `/api/sequences/:id`

### Enrollments
- GET `/api/enrollments` → `Enrollment[]` (leadId, sequenceId, currentStep, status active|paused|replied|bounced|completed, nextSendAt, enrolledAt)
- POST `/api/enrollments` body=`{leadId,sequenceId}` → enrolls lead, sets lead status to Outreach Active
- PATCH `/api/enrollments/:id` body=`{status,currentStep,...}`

### Config — ICP / Target areas (ADD/EDIT/DELETE any vertical)
- GET `/api/icp` → `{configs:[IcpConfig], currentSlice}` — currentSlice = this week's rotation pick
- POST `/api/icp` body=`{slice,active,rotationOrder,country,industries(JSON str),technologies(JSON str),headcount(JSON str),fundingStages(JSON str)}`
- PATCH `/api/icp/:id`, DELETE `/api/icp/:id`
IcpConfig: id, slice, active(0/1), industries, technologies, headcount, fundingStages, country, rotationOrder. industries/technologies/headcount/fundingStages are JSON-string arrays — parse with JSON.parse for display, stringify on save.

### Config — Scoring + Classifier keywords (no-code targeting)
- GET `/api/scoring` → ScoringConfig: baselineA, baselineBSig, baselineBDisc, baselineC, bonusDecisionMaker, bonusInfluencer, confidenceWeight, signalDecayDays, signalDecayFloor, tierAThreshold, tierBThreshold, classifierKeywords (JSON string).
- PATCH `/api/scoring` body=partial config (numbers, and classifierKeywords as JSON string)
- POST `/api/scoring/preview` body=`{lead:{channel,roleClass,contactConfidence,signalAgeDays}, config:{...overrides}}` → `{score,tier}` (live what-if)
- GET `/api/classifier-defaults` → `{decisionMaker:[],influencer:[],targetFunction:[],cLevel:[]}` (default keyword lists)
- POST `/api/classifier/test` body=`{title, keywords:{targetFunction:[],...}}` → `{role: decision_maker|influencer|drop}` (test a job title)

classifierKeywords JSON shape: `{"decisionMaker":[...], "influencer":[...], "targetFunction":[...], "cLevel":[...]}`. Empty/missing lists fall back to defaults. The targetFunction list is the KEY control for "target any type of lead" — editing it retargets the whole pipeline to any vertical.

### Integrations / Settings
- GET `/api/integrations` → `Integration[]` (key, label, connected(0/1), envVar, meta JSON str)
- PATCH `/api/integrations/:key` body=`{connected,...}`

### Providers (pluggable enrichment + lead-tracking/CRM — KEY for "swap Hunter/Airtable for others")
Providers are grouped into 5 categories: `enrichment`, `verification`, `tracking`, `discovery`, `alerts`. Exactly one provider is ACTIVE per category and is what the pipeline uses. Users can switch (e.g. Hunter→Apollo/Clearbit/ZoomInfo for enrichment; Airtable→HubSpot/Salesforce/Pipedrive/Notion/Google Sheets/built-in DB for tracking), toggle connected, edit config fields, add a custom provider, or delete a custom one.
- GET `/api/provider-catalog` → `{ enrichment:[{key,label,envVar,fields:[]}], verification:[...], tracking:[...], discovery:[...], alerts:[...] }` (selectable vendors per category + which config `fields` each needs, e.g. api_key, base_id, table_name, webhook_url)
- GET `/api/providers` → `{ providers: Provider[], byCategory: {category: Provider[]}, catalog }`. Provider = `{id, category, key, label, active(0/1), connected(0/1), envVar, baseUrl, config(JSON str), builtin(0/1)}`
- POST `/api/providers` body=`{category, key, label, baseUrl?, envVar?, config?}` → adds a CUSTOM provider (builtin=false)
- PATCH `/api/providers/:key` body=`{connected?, label?, baseUrl?, envVar?, config?}` → update a provider
- DELETE `/api/providers/:key` → remove a custom provider
- POST `/api/providers/:category/activate` body=`{key}` → make that provider the active one for its category (deactivates the rest) → `{ok, providers: Provider[]}`

UI guidance: On Settings, add an "Integrations & Providers" area. For each category show a labeled card with a single-select control (radio/dropdown) to pick the ACTIVE provider, a connected toggle, and a small form rendering the config `fields` from the catalog (api_key shown as masked/secret note — never store raw secrets, just env var names). Make it visually clear that enrichment and tracking are swappable. Include an "Add custom provider" action and allow deleting non-builtin providers.

### Lead Intake (pluggable, multi-source — NOT just email polling + Hunter)
Leads can enter from many sources, any number ENABLED at once: `email_poll` (auto-poll an inbox folder), `manual_text` (paste/type a note), `voice` (dictate — client transcribes to text, server parses), `webhook` (external POST), `csv_upload`, `form`, `hunter_signal`, `hunter_discover`. Every source funnels into the SAME parse→dedup→enrich→score→route pipeline. Manual/voice leads missing email/domain/title route to "Review Required".
- GET `/api/intake-catalog` → array of `{key, kind, label, channel, fields:[], help}` (selectable source types + config fields each needs)
- GET `/api/intake-sources` → `IntakeSource[]` `{id, key, kind, label, enabled(0/1), channel, config(JSON str), builtin(0/1), lastIngestAt}`
- POST `/api/intake-sources` body=`{key, kind, label, channel?, enabled?, config?}` → add a custom source
- PATCH `/api/intake-sources/:key` body=`{enabled?, channel?, config?, label?}` → toggle/configure a source
- DELETE `/api/intake-sources/:key` → remove a custom source
- POST `/api/intake/parse` body=`{text}` → PREVIEW parse a freeform note/voice transcript WITHOUT creating a lead → `{firstName,lastName,title,companyName,companyDomain,email,phone,signalName,raw}`
- POST `/api/intake` body=`{source?, channel?, text?, lead?:{…fields}}` → INGEST one lead from any source. Provide `text` (freeform/voice) OR a structured `lead` object (or both; structured wins). Returns `{lead:{…,rationale,rationaleFactors}, deduped, enrichmentNeeded, missing:[]}`.

UI guidance: Add an "Add Lead" / "Capture" affordance (button in the header or on the Leads page) opening a dialog with tabs: (1) Type/paste a note — textarea, live-call `/api/intake/parse` to show extracted fields, then submit to `/api/intake` with source=manual_text; (2) Voice — use the browser Web Speech API (webkitSpeechRecognition) to transcribe to the same textarea, then submit with source=voice (gracefully hide if unsupported); (3) Structured form — explicit fields submitting `lead`. On Settings, add an "Intake Sources" section listing all sources from `/api/intake-sources` with an enable toggle each, a config form from the catalog `fields`, an "Add custom source" action, and delete for non-builtin. Make clear intake is no longer limited to email polling.

### Users / Sharing
- GET `/api/users` → `User[]` (name, email, role admin|member|viewer)
- POST `/api/users` body=`{name,email,role}`
