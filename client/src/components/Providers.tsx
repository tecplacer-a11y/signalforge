import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Trash2, KeyRound, Plug, Database, ShieldCheck, Search, Bell, Sparkles, Lock,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PROVIDER_CATEGORIES, type Provider, type ProvidersResponse, type CatalogEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const CATEGORY_META: Record<string, { title: string; desc: string; icon: any; swappable?: boolean }> = {
  enrichment: { title: "Enrichment", desc: "Find & enrich contacts. Swap Hunter for Apollo, Clearbit, or ZoomInfo.", icon: Sparkles, swappable: true },
  verification: { title: "Email Verification", desc: "Validate deliverability before outreach.", icon: ShieldCheck },
  tracking: { title: "Lead Tracking / CRM", desc: "Where leads sync. Swap Airtable for HubSpot, Salesforce, Pipedrive, Notion, Sheets, or the built-in DB.", icon: Database, swappable: true },
  discovery: { title: "Discovery", desc: "Source net-new accounts matching your ICP.", icon: Search },
  alerts: { title: "Alerts", desc: "Where hot/warm leads get announced.", icon: Bell },
};

const FIELD_META: Record<string, { label: string; secret?: boolean; placeholder?: string }> = {
  api_key: { label: "API key", secret: true },
  base_id: { label: "Base ID", placeholder: "appXXXXXXXX" },
  table_name: { label: "Table name", placeholder: "Leads" },
  base_url: { label: "Base URL", placeholder: "https://api.example.com" },
  instance_url: { label: "Instance URL", placeholder: "https://your.my.salesforce.com" },
  database_id: { label: "Database ID" },
  spreadsheet_id: { label: "Spreadsheet ID" },
  sheet_name: { label: "Sheet name", placeholder: "Leads" },
  webhook_url: { label: "Webhook URL", placeholder: "https://hooks.slack.com/…" },
  hot_channel: { label: "Hot channel", placeholder: "#bd-hot-leads" },
  warm_channel: { label: "Warm channel", placeholder: "#bd-warm-leads" },
  chat_id: { label: "Chat ID" },
  to_address: { label: "Recipient email" },
};

function parseConfig(s: string): Record<string, any> {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

export function Providers() {
  const { data, isLoading } = useQuery<ProvidersResponse>({ queryKey: ["/api/providers"] });

  if (isLoading || !data) {
    return <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {PROVIDER_CATEGORIES.map((cat) => (
        <CategoryCard
          key={cat}
          category={cat}
          providers={data.byCategory[cat] ?? []}
          catalog={data.catalog[cat] ?? []}
        />
      ))}
    </div>
  );
}

function CategoryCard({ category, providers, catalog }: { category: string; providers: Provider[]; catalog: CatalogEntry[] }) {
  const { toast } = useToast();
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  const active = providers.find((p) => p.active);
  const [addOpen, setAddOpen] = useState(false);

  const activate = useMutation({
    mutationFn: async (key: string) => apiRequest("POST", `/api/providers/${category}/activate`, { key }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/providers"] }); toast({ title: "Active provider changed" }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleConnected = useMutation({
    mutationFn: async ({ key, connected }: { key: string; connected: boolean }) =>
      apiRequest("PATCH", `/api/providers/${key}`, { connected }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/providers"] }),
  });

  return (
    <Card className={cn("p-4 flex flex-col", meta.swappable && "ring-1 ring-primary/30")} data-testid={`card-provider-${category}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-2.5">
          <div className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold">{meta.title}</h3>
              {meta.swappable && <Badge variant="outline" className="text-[10px] text-primary border-primary/30">swappable</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xs">{meta.desc}</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" className="gap-1 shrink-0" onClick={() => setAddOpen(true)} data-testid={`button-add-provider-${category}`}>
          <Plus className="h-3.5 w-3.5" /> Custom
        </Button>
      </div>

      <div className="mb-3">
        <Label className="text-xs text-muted-foreground">Active provider</Label>
        <RadioGroup
          value={active?.key}
          onValueChange={(v) => activate.mutate(v)}
          className="mt-1.5 gap-1.5"
        >
          {providers.map((p) => (
            <ProviderRow
              key={p.key}
              provider={p}
              catalogEntry={catalog.find((c) => c.key === p.key)}
              onToggleConnected={(connected) => toggleConnected.mutate({ key: p.key, connected })}
            />
          ))}
        </RadioGroup>
      </div>

      <AddProviderDialog open={addOpen} onOpenChange={setAddOpen} category={category} />
    </Card>
  );
}

function ProviderRow({ provider, catalogEntry, onToggleConnected }: {
  provider: Provider; catalogEntry?: CatalogEntry; onToggleConnected: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const fields = catalogEntry?.fields ?? parseConfig(provider.config).fields ?? [];

  const del = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/providers/${provider.key}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/providers"] }); toast({ title: "Provider removed" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div
      className={cn(
        "rounded-md border p-2.5 transition-colors",
        provider.active ? "border-primary bg-primary/5" : "border-border",
      )}
      data-testid={`provider-row-${provider.key}`}
    >
      <div className="flex items-center gap-2.5">
        <RadioGroupItem value={provider.key} id={`prov-${provider.key}`} data-testid={`radio-provider-${provider.key}`} />
        <Label htmlFor={`prov-${provider.key}`} className="flex-1 cursor-pointer">
          <span className="text-sm font-medium">{provider.label}</span>
          {provider.active && <span className="ml-1.5 text-[10px] text-primary font-semibold uppercase">active</span>}
          {!provider.builtin && <Badge variant="secondary" className="ml-1.5 text-[10px]">custom</Badge>}
        </Label>
        <span className="flex items-center gap-1.5">
          <span className={cn("text-[11px]", provider.connected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
            {provider.connected ? "connected" : "off"}
          </span>
          <Switch checked={provider.connected} onCheckedChange={onToggleConnected} data-testid={`switch-connected-${provider.key}`} />
        </span>
      </div>

      {fields.length > 0 && (
        <div className="mt-2 pl-7">
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={() => setOpen((o) => !o)}
            data-testid={`button-config-${provider.key}`}
          >
            {open ? "Hide config" : `Configure (${fields.length} field${fields.length === 1 ? "" : "s"})`}
          </button>
          {open && <ConfigForm provider={provider} fields={fields} />}
        </div>
      )}

      {!provider.builtin && (
        <div className="mt-1.5 pl-7">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive text-[11px] gap-1" data-testid={`button-delete-provider-${provider.key}`}>
                <Trash2 className="h-3 w-3" /> Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove "{provider.label}"?</AlertDialogTitle>
                <AlertDialogDescription>This custom provider will be deleted.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => del.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

function ConfigForm({ provider, fields }: { provider: Provider; fields: string[] }) {
  const { toast } = useToast();
  const existing = parseConfig(provider.config);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) {
      const m = FIELD_META[f];
      if (!m?.secret) init[f] = existing[f] ?? "";
    }
    return init;
  });

  const save = useMutation({
    mutationFn: async () => {
      // Never persist secrets — strip secret fields from the saved config.
      const safe: Record<string, string> = {};
      for (const f of fields) if (!FIELD_META[f]?.secret) safe[f] = values[f] ?? "";
      return apiRequest("PATCH", `/api/providers/${provider.key}`, { config: JSON.stringify({ fields, ...safe }) });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/providers"] }); toast({ title: "Config saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-muted/30 p-2.5">
      {fields.map((f) => {
        const m = FIELD_META[f] ?? { label: f };
        if (m.secret) {
          return (
            <div key={f} className="space-y-1">
              <Label className="text-[11px] flex items-center gap-1"><KeyRound className="h-3 w-3" /> {m.label}</Label>
              <Input type="password" placeholder="••••••••" disabled value="" data-testid={`input-config-${provider.key}-${f}`} />
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" /> Stored as env var <code className="font-mono">{provider.envVar || "—"}</code>, never in plaintext.
              </p>
            </div>
          );
        }
        return (
          <div key={f} className="space-y-1">
            <Label className="text-[11px]">{m.label}</Label>
            <Input
              value={values[f] ?? ""} placeholder={m.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
              data-testid={`input-config-${provider.key}-${f}`}
            />
          </div>
        );
      })}
      <Button size="sm" className="h-7 w-full" onClick={() => save.mutate()} disabled={save.isPending} data-testid={`button-save-config-${provider.key}`}>
        {save.isPending ? "Saving…" : "Save config"}
      </Button>
    </div>
  );
}

function AddProviderDialog({ open, onOpenChange, category }: { open: boolean; onOpenChange: (v: boolean) => void; category: string }) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const add = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/providers", {
      category, key: key.trim() || label.toLowerCase().replace(/\s+/g, "_"), label, baseUrl,
      config: JSON.stringify({ fields: ["base_url", "api_key"] }),
    }),
    onSuccess: () => {
      onOpenChange(false); setLabel(""); setKey(""); setBaseUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      toast({ title: "Custom provider added" });
    },
    onError: (e: Error) => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-1.5"><Plug className="h-4 w-4" /> Add custom {CATEGORY_META[category].title.toLowerCase()} provider</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Acme Enrich" data-testid="input-custom-label" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Key (optional)</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="auto from label" data-testid="input-custom-key" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Base URL</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" data-testid="input-custom-baseurl" />
          </div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Lock className="h-3 w-3" /> API keys are configured later as env vars — never stored in plaintext.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => add.mutate()} disabled={!label.trim() || add.isPending} data-testid="button-confirm-add-provider">
            {add.isPending ? "Adding…" : "Add provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
