import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Plus, Mic, MicOff, FileText, FormInput, Sparkles, UserPlus, Loader2, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { IntakeParse, IntakeResult, Channel } from "@/lib/types";

// ---- Web Speech API detection ----
function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

function invalidateLeadQueries() {
  queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
  queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
}

/** Builds the success/review toast from an ingest result. */
function useIngestToast() {
  const { toast } = useToast();
  return (res: IntakeResult) => {
    const l = res.lead;
    const who = [l.firstName, l.lastName].filter(Boolean).join(" ") || l.companyName || "Lead";
    const ratSnippet = l.rationale ? l.rationale.slice(0, 140) : "";
    if (res.enrichmentNeeded || res.missing?.length) {
      toast({
        title: `${who} saved for review`,
        description: `Missing: ${res.missing.join(", ") || "contact data"}. ${ratSnippet}`,
      });
    } else {
      toast({
        title: `${who} captured — Tier ${l.tier}`,
        description: ratSnippet,
      });
    }
  };
}

export function AddLeadDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const speechSupported = !!getSpeechRecognition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> Capture a lead
          </DialogTitle>
          <DialogDescription>
            Add a lead from a freeform note, voice dictation, or structured fields. Everything funnels into the same parse → dedup → enrich → score → route pipeline.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="note">
          <TabsList className={cn("grid w-full", speechSupported ? "grid-cols-3" : "grid-cols-2")}>
            <TabsTrigger value="note" data-testid="tab-intake-note">
              <FileText className="h-3.5 w-3.5 mr-1.5" /> Note
            </TabsTrigger>
            {speechSupported && (
              <TabsTrigger value="voice" data-testid="tab-intake-voice">
                <Mic className="h-3.5 w-3.5 mr-1.5" /> Voice
              </TabsTrigger>
            )}
            <TabsTrigger value="form" data-testid="tab-intake-form">
              <FormInput className="h-3.5 w-3.5 mr-1.5" /> Form
            </TabsTrigger>
          </TabsList>

          <TabsContent value="note">
            <TextIntakePanel source="manual_text" voice={false} onDone={() => onOpenChange(false)} />
          </TabsContent>
          {speechSupported && (
            <TabsContent value="voice">
              <TextIntakePanel source="voice" voice={true} onDone={() => onOpenChange(false)} />
            </TabsContent>
          )}
          <TabsContent value="form">
            <FormIntakePanel onDone={() => onOpenChange(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ---- Note / Voice panel (shared) ----
function TextIntakePanel({
  source, voice, onDone,
}: { source: "manual_text" | "voice"; voice: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const ingestToast = useIngestToast();
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<IntakeParse | null>(null);
  const [parsing, setParsing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Voice recognition state
  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);
  const baseTextRef = useRef("");

  // Debounced live parse
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const t = text.trim();
    if (t.length < 4) { setParsed(null); return; }
    debounceRef.current = setTimeout(async () => {
      setParsing(true);
      try {
        const res = await apiRequest("POST", "/api/intake/parse", { text: t });
        const data = (await res.json()) as IntakeParse;
        setParsed(data);
      } catch {
        setParsed(null);
      } finally {
        setParsing(false);
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [text]);

  const startVoice = useCallback(() => {
    const SR = getSpeechRecognition();
    if (!SR) return;
    const recog = new SR();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = "en-US";
    baseTextRef.current = text ? text.trim() + " " : "";
    recog.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += tr;
        else interim += tr;
      }
      if (final) baseTextRef.current += final;
      setText((baseTextRef.current + interim).trim());
    };
    recog.onerror = () => { setListening(false); };
    recog.onend = () => { setListening(false); };
    recogRef.current = recog;
    recog.start();
    setListening(true);
  }, [text]);

  const stopVoice = useCallback(() => {
    try { recogRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  useEffect(() => () => { try { recogRef.current?.stop(); } catch { /* noop */ } }, []);

  const submit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/intake", { source, text: text.trim() });
      return (await res.json()) as IntakeResult;
    },
    onSuccess: (res) => {
      invalidateLeadQueries();
      ingestToast(res);
      setText(""); setParsed(null);
      onDone();
    },
    onError: (e: Error) => {
      // Backend returns 400 {error, parsed} when it can't extract a lead.
      const msg = e.message.includes("could not extract")
        ? "Couldn't extract a lead — add a name, company, or email."
        : e.message;
      toast({ title: "Capture failed", description: msg, variant: "destructive" });
    },
  });

  const hasSomething = parsed && (parsed.firstName || parsed.companyName || parsed.email || parsed.title);

  return (
    <div className="space-y-3 pt-2">
      {voice && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={listening ? "destructive" : "default"}
            onClick={listening ? stopVoice : startVoice}
            className="gap-1.5"
            data-testid="button-voice-toggle"
          >
            {listening ? <><MicOff className="h-4 w-4" /> Stop</> : <><Mic className="h-4 w-4" /> Start dictation</>}
          </Button>
          {listening && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" /> Listening…
            </span>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs">
          {voice ? "Transcript (editable)" : "Note"}
        </Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={voice
            ? "Press Start dictation and describe the lead…"
            : "e.g. Met Sarah Lindqvist, VP of Engineering at Northstar Robotics, sarah@northstar.io, raised Series B"}
          rows={4}
          data-testid="input-intake-text"
        />
      </div>

      <ParsePreview parsed={parsed} parsing={parsing} hasSomething={!!hasSomething} />

      <Button
        className="w-full gap-1.5"
        onClick={() => submit.mutate()}
        disabled={text.trim().length < 4 || submit.isPending}
        data-testid="button-submit-intake-text"
      >
        {submit.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Capturing…</> : <><Sparkles className="h-4 w-4" /> Capture lead</>}
      </Button>
    </div>
  );
}

function ParsePreview({ parsed, parsing, hasSomething }: { parsed: IntakeParse | null; parsing: boolean; hasSomething: boolean }) {
  if (!parsed && !parsing) return null;
  const rows: { label: string; value: string }[] = parsed ? [
    { label: "Name", value: [parsed.firstName, parsed.lastName].filter(Boolean).join(" ") },
    { label: "Title", value: parsed.title },
    { label: "Company", value: parsed.companyName },
    { label: "Domain", value: parsed.companyDomain },
    { label: "Email", value: parsed.email },
    { label: "Phone", value: parsed.phone },
    { label: "Signal", value: parsed.signalName },
  ].filter((r) => r.value) : [];

  const missing = parsed
    ? ["email", "companyDomain", "title"].filter((k) => !(parsed as any)[k === "companyDomain" ? "companyDomain" : k])
    : [];

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="preview-intake-parse">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">Extracted lead preview</span>
        {parsing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      {hasSomething ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{r.label}</p>
              <p className="text-xs truncate" data-testid={`preview-field-${r.label.toLowerCase()}`}>{r.value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{parsing ? "Parsing…" : "Nothing detected yet — keep typing."}</p>
      )}
      {hasSomething && missing.length > 0 && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" /> Missing {missing.map((m) => m === "companyDomain" ? "domain" : m).join(", ")} → will route to Review Required.
        </p>
      )}
      {hasSomething && missing.length === 0 && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" /> Complete contact — ready to score.
        </p>
      )}
    </div>
  );
}

// ---- Structured form panel ----
const CHANNELS: Channel[] = ["A", "B-Sig", "B-Disc", "C"];
const SLICES = ["AI/ML", "Robotics", "Hardware"];

function FormIntakePanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const ingestToast = useIngestToast();
  const [f, setF] = useState({
    firstName: "", lastName: "", title: "", companyName: "", companyDomain: "",
    email: "", phone: "", channel: "C" as Channel, icpSlice: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = useMutation({
    mutationFn: async () => {
      const lead: Record<string, string> = {};
      for (const [k, v] of Object.entries(f)) if (v) lead[k] = v;
      const res = await apiRequest("POST", "/api/intake", { source: "webhook", lead });
      return (await res.json()) as IntakeResult;
    },
    onSuccess: (res) => {
      invalidateLeadQueries();
      ingestToast(res);
      onDone();
    },
    onError: (e: Error) => toast({ title: "Capture failed", description: e.message, variant: "destructive" }),
  });

  const canSubmit = f.firstName.trim() || f.email.trim() || f.companyName.trim();

  return (
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-2.5">
        <FormField label="First name"><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} data-testid="input-form-firstname" /></FormField>
        <FormField label="Last name"><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} data-testid="input-form-lastname" /></FormField>
        <FormField label="Title"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="VP of Engineering" data-testid="input-form-title" /></FormField>
        <FormField label="Company"><Input value={f.companyName} onChange={(e) => set("companyName", e.target.value)} data-testid="input-form-company" /></FormField>
        <FormField label="Domain"><Input value={f.companyDomain} onChange={(e) => set("companyDomain", e.target.value)} placeholder="acme.com" data-testid="input-form-domain" /></FormField>
        <FormField label="Email"><Input value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="name@acme.com" data-testid="input-form-email" /></FormField>
        <FormField label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} data-testid="input-form-phone" /></FormField>
        <FormField label="Channel">
          <Select value={f.channel} onValueChange={(v) => set("channel", v)}>
            <SelectTrigger data-testid="select-form-channel"><SelectValue /></SelectTrigger>
            <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label="ICP slice" className="col-span-2">
          <Select value={f.icpSlice || "none"} onValueChange={(v) => set("icpSlice", v === "none" ? "" : v)}>
            <SelectTrigger data-testid="select-form-slice"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {SLICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <DialogFooter>
        <Button
          className="w-full gap-1.5"
          onClick={() => submit.mutate()}
          disabled={!canSubmit || submit.isPending}
          data-testid="button-submit-intake-form"
        >
          {submit.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Capturing…</> : <><Plus className="h-4 w-4" /> Add lead</>}
        </Button>
      </DialogFooter>
    </div>
  );
}

function FormField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// Convenience trigger button used in the header & Leads page.
export function AddLeadButton({ size = "default", variant = "default", label = "Add Lead" }: {
  size?: "default" | "sm"; variant?: "default" | "outline"; label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} className="gap-1.5" data-testid="button-add-lead">
        <UserPlus className="h-4 w-4" /> {label}
      </Button>
      <AddLeadDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
