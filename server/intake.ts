// ─────────────────────────────────────────────────────────────
// Pluggable Lead Intake System
// Leads can enter the pipeline from many sources, any number of
// which can be enabled at once:
//   • email_poll     — auto-poll a chosen inbox folder (the original n8n behavior)
//   • manual_text    — paste / type a blurb ("Met Jane Doe, CTO at Acme…")
//   • voice          — dictate; client transcribes to text, server parses it
//   • webhook        — external systems POST JSON or text to an ingest URL
//   • csv_upload     — bulk import rows
//   • form           — public capture form
//   • hunter_signal  — saved Hunter signals (B-Sig)
//   • hunter_discover— weekly ICP rotation (B-Disc)
//
// Every source funnels into the SAME parse → dedup → enrich → score
// → route pipeline. The free-text parser below mirrors the Claude
// extraction node in the original workflow: it pulls name, title,
// company, domain, email, phone, and a signal/trigger out of natural
// language so a typed note or a voice memo becomes a structured lead.
// ─────────────────────────────────────────────────────────────

// Catalog of intake sources the UI can offer. "fields" tell the UI
// what to render for configuration.
export const INTAKE_CATALOG = [
  { key: "email_poll", kind: "email", label: "Inbox folder polling", channel: "A",
    fields: ["mailbox", "folder", "schedule"],
    help: "Auto-poll a specific folder/label in a connected inbox (Gmail/Outlook) on a schedule." },
  { key: "manual_text", kind: "manual", label: "Manual text / paste", channel: "C",
    fields: [],
    help: "Type or paste a freeform note about a person; we extract the structured lead." },
  { key: "voice", kind: "voice", label: "Voice dictation", channel: "C",
    fields: [],
    help: "Dictate a lead; the client transcribes to text and we parse it like a note." },
  { key: "webhook", kind: "webhook", label: "Inbound webhook", channel: "C",
    fields: ["token"],
    help: "External tools POST JSON or text to your ingest URL. Accepts structured fields or freeform text." },
  { key: "csv_upload", kind: "upload", label: "CSV / spreadsheet upload", channel: "C",
    fields: ["column_mapping"],
    help: "Bulk import rows; map columns to lead fields." },
  { key: "form", kind: "form", label: "Public capture form", channel: "C",
    fields: ["slug"],
    help: "A hosted form that creates leads on submit." },
  { key: "hunter_signal", kind: "discovery", label: "Hunter saved signals", channel: "B-Sig",
    fields: ["signal_ids"],
    help: "Pull leads from saved Hunter signals (provider-backed)." },
  { key: "hunter_discover", kind: "discovery", label: "Hunter Discover (weekly ICP)", channel: "B-Disc",
    fields: ["schedule"],
    help: "Weekly ICP rotation via Hunter Discover (provider-backed)." },
] as const;

// Default rows seeded on first run. Matches the original workflow
// (email polling + Hunter on), and turns ON manual + voice + webhook
// so the user immediately has the new freeform/voice intake the app adds.
export function defaultIntakeRows() {
  const onByDefault = new Set([
    "email_poll", "hunter_signal", "hunter_discover", "manual_text", "voice", "webhook",
  ]);
  return INTAKE_CATALOG.map((s) => ({
    key: s.key, kind: s.kind, label: s.label, channel: s.channel,
    enabled: onByDefault.has(s.key),
    config: JSON.stringify(
      s.key === "email_poll"
        ? { mailbox: "BD-Leads", folder: "INBOX/BD-Leads", schedule: "0 0 7-19/2 * * 1-5" }
        : s.key === "webhook"
        ? { token: "set-a-secret-token" }
        : { fields: s.fields },
    ),
    builtin: true,
    lastIngestAt: "",
  }));
}

// ── Free-text / voice parser ─────────────────────────────────
// Heuristic extractor (no LLM dependency for the prototype). In
// production this is where the Claude extraction prompt plugs in;
// the output shape is identical so the pipeline is unchanged.
export interface ParsedLead {
  firstName: string; lastName: string; title: string;
  companyName: string; companyDomain: string;
  email: string; phone: string; signalName: string; raw: string;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /\b((?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?))\b/i;

// Common titles to detect when there's no email to derive structure from.
// Stops before connectors (at/@/of-company/from) and punctuation so it
// doesn't swallow the company name ("VP of Engineering at Acme" → title only).
const TITLE_RE = new RegExp(
  "\\b(Chief\\s+[A-Za-z]+\\s+Officer" +
  "|Vice\\s+President(?:\\s+of\\s+[A-Za-z]+)?" +
  "|VP(?:\\s+of)?\\s+[A-Za-z]+(?:\\s+[A-Za-z]+)?" +
  "|Head\\s+of\\s+[A-Za-z]+(?:\\s+[A-Za-z]+)?" +
  "|Director(?:\\s+of)?\\s+[A-Za-z]+(?:\\s+[A-Za-z]+)?" +
  "|Principal\\s+[A-Za-z]+(?:\\s+[A-Za-z]+)?" +
  "|Lead\\s+[A-Za-z]+(?:\\s+[A-Za-z]+)?" +
  "|(?:Senior\\s+|Staff\\s+)?[A-Za-z]+\\s+Engineer" +
  "|Co-?Founder|Founder|President|CEO|CTO|CIO|CFO|COO|CMO|CRO)\\b",
  "i",
);

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

export function parseLeadText(text: string): ParsedLead {
  const raw = (text || "").trim();
  const out: ParsedLead = {
    firstName: "", lastName: "", title: "", companyName: "",
    companyDomain: "", email: "", phone: "", signalName: "Manual intake", raw,
  };

  const email = raw.match(EMAIL_RE)?.[0]?.toLowerCase() || "";
  if (email) {
    out.email = email;
    out.companyDomain = email.split("@")[1] || "";
    // derive name from local-part if it looks like first.last
    const local = email.split("@")[0];
    const parts = local.split(/[._-]/).filter(Boolean);
    if (parts.length >= 2) {
      out.firstName = titleCase(parts[0]);
      out.lastName = titleCase(parts[1]);
    }
  }

  out.phone = raw.match(PHONE_RE)?.[0]?.trim() || "";

  // domain / company from a URL if present and not already set
  const urlMatch = raw.match(URL_RE);
  if (urlMatch && !out.companyDomain) out.companyDomain = urlMatch[2].toLowerCase();

  // title (strip any trailing connector the greedy match may have grabbed)
  const t = raw.match(TITLE_RE);
  if (t) out.title = titleCase(t[1].replace(/\s+/g, " ").replace(/\s+(?:at|of|from|for|@)$/i, "").trim());

  // "<Title> at <Company>" — capture the company that follows the title.
  if (out.title) {
    // re-anchor after the cleaned title text within the raw string
    const tIdx = raw.toLowerCase().indexOf(out.title.toLowerCase());
    const afterTitle = tIdx >= 0 ? raw.slice(tIdx + out.title.length) : raw.slice((t?.index || 0) + (t?.[0].length || 0));
    const co = afterTitle.match(/^\s*(?:at|@|of|from|,?\s*the\s+)\s*([A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z][A-Za-z0-9&.\-]*){0,3})/);
    if (co && !out.companyName) {
      out.companyName = co[1].trim().replace(/[.,;:]$/, "").replace(/\s*\($/, "").trim();
    }
  }

  // "<Name>, <Title> at <Company>" pattern — strong signal in dictated notes
  const atPattern = raw.match(
    /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\s*,/,
  );
  if (atPattern) {
    if (!out.firstName) out.firstName = atPattern[1];
    if (!out.lastName) out.lastName = atPattern[2];
  }

  // Fallback name: first two Capitalized tokens not part of a known word
  if (!out.firstName) {
    const caps = raw.match(/\b([A-Z][a-z]{1,})\s+([A-Z][a-z]{1,})\b/);
    if (caps) { out.firstName = caps[1]; out.lastName = caps[2]; }
  }

  // Company fallback from domain
  if (!out.companyName && out.companyDomain) {
    out.companyName = titleCase(out.companyDomain.split(".")[0]);
  }

  // Signal: look for trigger phrases
  const sig = raw.match(
    /\b(raised|raise|series [a-e]|funding|hiring|launch(?:ed|ing)?|expand(?:ing)?|acqui(?:red|sition)|intro|referral|inbound|demo|met (?:at|with)[^.]*)\b/i,
  );
  if (sig) out.signalName = titleCase(sig[0]);

  return out;
}
