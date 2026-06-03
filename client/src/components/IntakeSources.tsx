import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Trash2, Inbox, FileText, Mic, Webhook, Upload, FormInput, Radar, Clock, Plug,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/components/common";
import type { IntakeSource, IntakeCatalogEntry } from "@/lib/types";

const KIND_ICON: Record<string, any> = {
  email: Inbox,
  manual: FileText,
  voice: Mic,
  webhook: Webhook,
  upload: Upload,
  form: FormInput,
  discovery: Radar,
};

const FIELD_META: Record<string, { label: string; placeholder?: string; secret?: boolean }> = {
  mailbox: { label: "Mailbox", placeholder: "BD-Leads" },
  folder: { label: "Folder / label", placeholder: "INBOX/BD-Leads" },
  schedule: { label: "Schedule (cron)", placeholder: "0 0 7-19/2 * * 1-5" },
  token: { label: "Webhook token", secret: true },
  column_mapping: { label: "Column mapping", placeholder: "email=Email,company=Company" },
  slug: { label: "Form slug", placeholder: "partner-intake" },
  signal_ids: { label: "Signal IDs", placeholder: "sig_123, sig_456" },
};

function parseConfig(s: string): Record<string, any> {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

function fieldsFor(src: IntakeSource, catalog: IntakeCatalogEntry[]): string[] {
  const c = catalog.find((e) => e.key === src.key);
  if (c) return c.fields;
  const cfg = parseConfig(src.config);
  return Array.isArray(cfg.fields) ? cfg.fields : [];
}

export function IntakeSources() {
  const sourcesQ = useQuery<IntakeSource[]>({ queryKey: ["/api/intake-sources"] });
  const catalogQ = useQuery<IntakeCatalogEntry[]>({ queryKey: ["/api/intake-catalog"] });
  const [addOpen, setAddOpen] = useState(false);

  if (sourcesQ.isLoading || !sourcesQ.data) {
    return <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  }

  const sources = sourcesQ.data;
  const catalog = catalogQ.data ?? [];

  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Intake is no longer limited to email polling + Hunter. Capture leads from inbox folders, manual notes,
          voice dictation, inbound webhooks, CSV uploads, public forms, and Hunter signals — any number enabled at once.
        </p>
        <Button size="sm" variant="ghost" className="gap-1 shrink-0" onClick={() => setAddOpen(true)} data-testid="button-add-intake-source">
          <Plus className="h-3.5 w-3.5" /> Add custom source
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {sources.map((src) => (
          <SourceCard key={src.key} source={src} catalog={catalog} />
        ))}
      </div>

      <AddSourceDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function SourceCard({ source, catalog }: { source: IntakeSource; catalog: IntakeCatalogEntry[] }) {
  const { toast } = useToast();
  const [showConfig, setShowConfig] = useState(false);
  const Icon = KIND_ICON[source.kind] ?? Plug;
  const fields = fieldsFor(source, catalog);
  const help = catalog.find((c) => c.key === source.key)?.help;

  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => apiRequest("PATCH", `/api/intake-sources/${source.key}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/intake-sources"] }),
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/intake-sources/${source.key}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/intake-sources"] }); toast({ title: "Source removed" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className={cn("p-3.5 flex flex-col", source.enabled ? "border-border" : "border-border opacity-80")} data-testid={`card-intake-${source.key}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className={cn("rounded-md p-2", source.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="text-sm font-semibold truncate">{source.label}</h4>
              <Badge variant="outline" className="text-[10px]">{source.channel}</Badge>
              {!source.builtin && <Badge variant="secondary" className="text-[10px]">custom</Badge>}
            </div>
            {help && <p className="text-[11px] text-muted-foreground mt-0.5">{help}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn("text-[11px]", source.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
            {source.enabled ? "on" : "off"}
          </span>
          <Switch checked={source.enabled} onCheckedChange={(v) => toggle.mutate(v)} data-testid={`switch-intake-${source.key}`} />
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {source.lastIngestAt
            ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Last ingest {relativeTime(source.lastIngestAt)}</span>
            : <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> No ingests yet</span>}
        </div>
        {fields.length > 0 && (
          <button
            type="button"
            className="text-[11px] text-primary hover:underline"
            onClick={() => setShowConfig((o) => !o)}
            data-testid={`button-config-intake-${source.key}`}
          >
            {showConfig ? "Hide config" : `Configure (${fields.length} field${fields.length === 1 ? "" : "s"})`}
          </button>
        )}
      </div>

      {showConfig && fields.length > 0 && <SourceConfigForm source={source} fields={fields} />}

      {!source.builtin && (
        <div className="mt-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-destructive text-[11px] gap-1" data-testid={`button-delete-intake-${source.key}`}>
                <Trash2 className="h-3 w-3" /> Remove
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove "{source.label}"?</AlertDialogTitle>
                <AlertDialogDescription>This custom intake source will be deleted.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => del.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </Card>
  );
}

function SourceConfigForm({ source, fields }: { source: IntakeSource; fields: string[] }) {
  const { toast } = useToast();
  const existing = parseConfig(source.config);
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
      const safe: Record<string, any> = { fields };
      for (const f of fields) if (!FIELD_META[f]?.secret) safe[f] = values[f] ?? "";
      return apiRequest("PATCH", `/api/intake-sources/${source.key}`, { config: JSON.stringify(safe) });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/intake-sources"] }); toast({ title: "Config saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-muted/30 p-2.5">
      {fields.map((f) => {
        const m = FIELD_META[f] ?? { label: f };
        if (m.secret) {
          return (
            <div key={f} className="space-y-1">
              <Label className="text-[11px]">{m.label}</Label>
              <Input type="password" placeholder="••••••••" disabled value="" data-testid={`input-intake-config-${source.key}-${f}`} />
              <p className="text-[10px] text-muted-foreground">Stored as an env var, never in plaintext.</p>
            </div>
          );
        }
        return (
          <div key={f} className="space-y-1">
            <Label className="text-[11px]">{m.label}</Label>
            <Input
              value={values[f] ?? ""} placeholder={m.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
              data-testid={`input-intake-config-${source.key}-${f}`}
            />
          </div>
        );
      })}
      <Button size="sm" className="h-7 w-full" onClick={() => save.mutate()} disabled={save.isPending} data-testid={`button-save-intake-config-${source.key}`}>
        {save.isPending ? "Saving…" : "Save config"}
      </Button>
    </div>
  );
}

const KIND_OPTIONS = [
  { value: "webhook", label: "Inbound webhook" },
  { value: "manual", label: "Manual / paste" },
  { value: "upload", label: "CSV / upload" },
  { value: "form", label: "Public form" },
  { value: "email", label: "Inbox polling" },
  { value: "discovery", label: "Discovery" },
];

function AddSourceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [kind, setKind] = useState("webhook");
  const [channel, setChannel] = useState("C");

  const add = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/intake-sources", {
      key: key.trim() || label.toLowerCase().replace(/\s+/g, "_"),
      kind, label, channel, enabled: true,
      config: JSON.stringify({ fields: kind === "webhook" ? ["token"] : [] }),
    }),
    onSuccess: () => {
      onOpenChange(false); setLabel(""); setKey("");
      queryClient.invalidateQueries({ queryKey: ["/api/intake-sources"] });
      toast({ title: "Custom intake source added" });
    },
    onError: (e: Error) => toast({ title: "Add failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5"><Plug className="h-4 w-4" /> Add custom intake source</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Partner referral webhook" data-testid="input-intake-label" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger data-testid="select-intake-kind"><SelectValue /></SelectTrigger>
                <SelectContent>{KIND_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger data-testid="select-intake-channel"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["A", "B-Sig", "B-Disc", "C"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Key (optional)</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="auto from label" data-testid="input-intake-key" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => add.mutate()} disabled={!label.trim() || add.isPending} data-testid="button-confirm-add-intake">
            {add.isPending ? "Adding…" : "Add source"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
