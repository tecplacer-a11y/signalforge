// ─────────────────────────────────────────────────────────────
// Pluggable Provider System
// Enrichment, verification, lead-tracking (CRM), discovery, and
// alerts are swappable. Hunter + Airtable + Slack are the defaults,
// but any deployment can switch to Apollo, Clearbit, ZoomInfo,
// HubSpot, Salesforce, Pipedrive, Notion, Google Sheets, etc.,
// or register a fully custom HTTP endpoint.
//
// Each provider implements a small adapter interface per category.
// Adapters are normalized so the pipeline engine never cares which
// vendor is behind a category — it just calls enrich()/track()/etc.
// ─────────────────────────────────────────────────────────────
import type { Provider } from "@shared/schema";

// Normalized shapes the pipeline understands (vendor-agnostic)
export interface EnrichedContact {
  email: string; firstName: string; lastName: string; title: string;
  confidence: number; linkedinUrl?: string; phone?: string;
}
export interface EnrichmentAdapter {
  // domain → list of contacts (Hunter domain-search equivalent)
  enrichDomain(domain: string): Promise<EnrichedContact[]>;
}
export interface VerificationAdapter {
  // email → deliverability status
  verifyEmail(email: string): Promise<{ status: string; score: number }>;
}
export interface TrackingAdapter {
  // upsert a lead record into the external CRM / tracker
  upsertLead(lead: Record<string, any>): Promise<{ externalId: string }>;
}
export interface DiscoveryAdapter {
  // ICP search → companies (Hunter Discover equivalent)
  discover(query: Record<string, any>): Promise<Array<{ name: string; domain: string }>>;
}
export interface AlertAdapter {
  notify(channel: string, text: string): Promise<void>;
}

// Catalog of selectable providers per category (what the UI offers).
// "fields" describe what config/secret each needs so the UI can render a form.
export const PROVIDER_CATALOG = {
  enrichment: [
    { key: "hunter", label: "Hunter.io", envVar: "HUNTER_API_KEY", fields: ["api_key"] },
    { key: "apollo", label: "Apollo.io", envVar: "APOLLO_API_KEY", fields: ["api_key"] },
    { key: "clearbit", label: "Clearbit", envVar: "CLEARBIT_API_KEY", fields: ["api_key"] },
    { key: "zoominfo", label: "ZoomInfo", envVar: "ZOOMINFO_API_KEY", fields: ["api_key"] },
    { key: "custom_enrichment", label: "Custom endpoint", envVar: "CUSTOM_ENRICH_KEY", fields: ["base_url", "api_key"] },
  ],
  verification: [
    { key: "hunter_verify", label: "Hunter Verifier", envVar: "HUNTER_API_KEY", fields: ["api_key"] },
    { key: "neverbounce", label: "NeverBounce", envVar: "NEVERBOUNCE_API_KEY", fields: ["api_key"] },
    { key: "zerobounce", label: "ZeroBounce", envVar: "ZEROBOUNCE_API_KEY", fields: ["api_key"] },
    { key: "custom_verify", label: "Custom endpoint", envVar: "CUSTOM_VERIFY_KEY", fields: ["base_url", "api_key"] },
  ],
  tracking: [
    { key: "airtable", label: "Airtable", envVar: "AIRTABLE_API_KEY", fields: ["api_key", "base_id", "table_name"] },
    { key: "hubspot", label: "HubSpot", envVar: "HUBSPOT_TOKEN", fields: ["api_key"] },
    { key: "salesforce", label: "Salesforce", envVar: "SALESFORCE_TOKEN", fields: ["api_key", "instance_url"] },
    { key: "pipedrive", label: "Pipedrive", envVar: "PIPEDRIVE_TOKEN", fields: ["api_key"] },
    { key: "notion", label: "Notion", envVar: "NOTION_TOKEN", fields: ["api_key", "database_id"] },
    { key: "sheets", label: "Google Sheets", envVar: "GOOGLE_SA_JSON", fields: ["spreadsheet_id", "sheet_name"] },
    { key: "native", label: "SignalForge (built-in DB)", envVar: "", fields: [] },
    { key: "custom_tracking", label: "Custom webhook", envVar: "CUSTOM_CRM_KEY", fields: ["base_url", "api_key"] },
  ],
  discovery: [
    { key: "hunter_discover", label: "Hunter Discover", envVar: "HUNTER_API_KEY", fields: ["api_key"] },
    { key: "apollo_search", label: "Apollo Search", envVar: "APOLLO_API_KEY", fields: ["api_key"] },
    { key: "custom_discovery", label: "Custom endpoint", envVar: "CUSTOM_DISCOVERY_KEY", fields: ["base_url", "api_key"] },
  ],
  alerts: [
    { key: "slack", label: "Slack", envVar: "SLACK_BOT_TOKEN", fields: ["webhook_url", "hot_channel", "warm_channel"] },
    { key: "teams", label: "Microsoft Teams", envVar: "TEAMS_WEBHOOK", fields: ["webhook_url"] },
    { key: "telegram", label: "Telegram", envVar: "TELEGRAM_BOT_TOKEN", fields: ["chat_id"] },
    { key: "email_alert", label: "Email", envVar: "SMTP_URL", fields: ["to_address"] },
    { key: "webhook", label: "Generic webhook", envVar: "ALERT_WEBHOOK_KEY", fields: ["base_url"] },
  ],
} as const;

// Default provider rows seeded on first run (Hunter + Airtable + Slack active,
// matching the original n8n workflow; everything else available but inactive).
export function defaultProviderRows() {
  const rows: any[] = [];
  for (const [category, opts] of Object.entries(PROVIDER_CATALOG)) {
    for (const o of opts) {
      const isDefaultActive =
        o.key === "hunter" || o.key === "hunter_verify" || o.key === "airtable" ||
        o.key === "hunter_discover" || o.key === "slack";
      rows.push({
        category, key: o.key, label: o.label, active: isDefaultActive,
        connected: isDefaultActive, envVar: o.envVar || "", baseUrl: "",
        config: JSON.stringify({ fields: o.fields }), builtin: true,
      });
    }
  }
  return rows;
}

// ── Adapter factory ──────────────────────────────────────────
// Returns a normalized adapter for whichever provider is active in a
// category. For the prototype, vendors that aren't wired to live keys
// fall through to a simulated adapter so the pipeline always runs.
// In production each case calls the real vendor SDK/HTTP API.
export function getEnrichmentAdapter(active?: Provider): EnrichmentAdapter {
  return {
    async enrichDomain(domain: string) {
      // Production: switch(active?.key) → call Hunter/Apollo/Clearbit/ZoomInfo/custom.
      // Prototype: deterministic simulated contact derived from the domain.
      void active;
      const base = domain.split(".")[0];
      return [{
        email: `contact@${domain}`, firstName: base.charAt(0).toUpperCase() + base.slice(1),
        lastName: "Lead", title: "VP of Engineering", confidence: 80,
      }];
    },
  };
}
export function getVerificationAdapter(active?: Provider): VerificationAdapter {
  return {
    async verifyEmail(email: string) {
      void active;
      return { status: email.includes("@") ? "valid" : "invalid", score: 90 };
    },
  };
}
export function getTrackingAdapter(active?: Provider): TrackingAdapter {
  return {
    async upsertLead(lead: Record<string, any>) {
      // Production: push to Airtable/HubSpot/Salesforce/Pipedrive/Notion/Sheets/custom
      // using active.config field mappings. Prototype: native DB already persists it.
      void active;
      return { externalId: lead.leadId || "" };
    },
  };
}
