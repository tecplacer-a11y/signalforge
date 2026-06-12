import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  Mail,
  Phone,
  Linkedin,
  Save,
  Clock,
  Plus,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import { PageHeader, formatDateTime, relativeTime } from "@/components/common";
import { TierBadge, ChannelBadge, StatusBadge, VerifierBadge, RoleBadge } from "@/components/badges";
import { RationaleCard } from "@/components/RationaleCard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { STATUSES, type Lead, type LeadEvent, type Enrollment, type Sequence, type Status, type Tier } from "@/lib/types";

interface DetailResponse {
  lead: Lead;
  events: LeadEvent[];
  enrollments: Enrollment[];
}

export default function LeadDetail() {
  const params = useParams();
  const leadId = decodeURIComponent(params.leadId as string);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<DetailResponse>({
    queryKey: ["/api/leads", leadId],
  });
  const { data: sequences } = useQuery<Sequence[]>({ queryKey: ["/api/sequences"] });

  const [form, setForm] = useState<Partial<Lead>>({});
  useEffect(() => {
    if (data?.lead) {
      const l = data.lead;
      setForm({ title: l.title, email: l.email, phone: l.phone, status: l.status, tier: l.tier, linkedinUrl: l.linkedinUrl });
    }
  }, [data?.lead]);

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<Lead>) => {
      const res = await apiRequest("PATCH", `/api/leads/${encodeURIComponent(leadId)}`, patch);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Lead saved" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !data) {
    return (
      <div>
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const lead = data.lead;

  return (
    <div>
      <Link href="/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3" data-testid="link-back-leads">
        <ArrowLeft className="h-4 w-4" /> Back to leads
      </Link>

      <PageHeader
        title={`${lead.firstName} ${lead.lastName}`}
        description={`${lead.title || "—"} · ${lead.companyName}`}
        actions={
          <div className="flex items-center gap-2">
            <TierBadge tier={lead.tier} />
            <StatusBadge status={lead.status} />
          </div>
        }
      />

      {lead.enrichmentNeeded && (
        <Card className="mb-4 border-amber-500/40 bg-amber-500/10 p-3" data-testid="banner-review">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Review Required</p>
              <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                {lead.reviewReason || "This lead needs manual enrichment."}
                {lead.missingFields && <> · Missing: {lead.missingFields}</>}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: edit form + contact/company + scoring */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Edit lead</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Title">
                <Input value={form.title ?? ""} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} data-testid="input-title" />
              </Field>
              <Field label="Email">
                <Input value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} data-testid="input-email" />
              </Field>
              <Field label="Phone">
                <Input value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} data-testid="input-phone" />
              </Field>
              <Field label="LinkedIn URL">
                <Input value={form.linkedinUrl ?? ""} onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))} data-testid="input-linkedin" />
              </Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as Status }))}>
                  <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Tier">
                <Select value={form.tier} onValueChange={(v) => setForm((f) => ({ ...f, tier: v as Tier }))}>
                  <SelectTrigger data-testid="select-tier"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["A", "B", "C"] as Tier[]).map((t) => <SelectItem key={t} value={t}>Tier {t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="gap-1.5" data-testid="button-save-lead">
                <Save className="h-4 w-4" /> {saveMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-3">Contact & company</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
              <Info icon={Building2} label="Company" value={`${lead.companyName} · ${lead.companyDomain}`} />
              <Info icon={Mail} label="Email" value={lead.email || "—"} />
              <Info icon={Phone} label="Phone" value={lead.phone || "—"} />
              <Info icon={Linkedin} label="LinkedIn" value={lead.linkedinUrl ? <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">Profile</a> : "—"} />
              <Detail label="ICP slice" value={lead.icpSlice || "—"} />
              <Detail label="Workstream" value={lead.workstream || "—"} />
              <Detail label="Role class" value={<RoleBadge role={lead.roleClass} />} />
              <Detail label="Verifier" value={<VerifierBadge status={lead.verifierStatus} />} />
              <Detail label="Channel" value={<ChannelBadge channel={lead.channel} />} />
              <Detail label="Source" value={lead.sourceTag || "—"} />
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-sm font-semibold mb-1">Trigger event</h2>
            <p className="text-sm text-muted-foreground mb-3">{lead.triggerEvent || "—"}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <ScoreStat label="MEDDPICC" value={lead.meddpiccScore} />
              <ScoreStat label="ICP Fit" value={lead.icpFit} />
              <ScoreStat label="Confidence" value={lead.contactConfidence} />
              <ScoreStat label="Signal age" value={`${lead.signalAgeDays}d`} />
            </div>
          </Card>

          <NotesAndTimeline leadId={leadId} events={data.events} />
        </div>

        {/* Right: rationale + enrollments */}
        <div className="space-y-4">
          <RationaleCard lead={lead} />
          <Enrollments
            leadId={leadId}
            enrollments={data.enrollments}
            sequences={sequences ?? []}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate">{value}</p>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function ScoreStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-center">
      <p className="text-lg font-bold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function NotesAndTimeline({ leadId, events }: { leadId: string; events: LeadEvent[] }) {
  const { toast } = useToast();
  const [note, setNote] = useState("");

  const addNote = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leads/${encodeURIComponent(leadId)}/events`, {
        type: "note", detail: note, actor: "you",
      });
      return await res.json();
    },
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      toast({ title: "Note added" });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
        <Clock className="h-4 w-4 text-muted-foreground" /> Activity timeline
      </h2>

      <div className="flex gap-2 mb-4">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note…"
          rows={2}
          className="resize-none"
          data-testid="input-note"
        />
        <Button
          onClick={() => addNote.mutate()}
          disabled={!note.trim() || addNote.isPending}
          className="gap-1.5 self-end"
          data-testid="button-add-note"
        >
          <Plus className="h-4 w-4" /> Note
        </Button>
      </div>

      <div className="space-y-3">
        {events.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
        {events.map((e) => (
          <div key={e.id} className="flex gap-3" data-testid={`event-${e.id}`}>
            <div className="flex flex-col items-center">
              <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
              <div className="w-px flex-1 bg-border" />
            </div>
            <div className="pb-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium capitalize">{e.type.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground">· {e.actor}</span>
                <span className="text-xs text-muted-foreground">· {relativeTime(e.createdAt)}</span>
              </div>
              <p className="text-sm text-muted-foreground break-words">{e.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Enrollments({ leadId, enrollments, sequences }: { leadId: string; enrollments: Enrollment[]; sequences: Sequence[] }) {
  const { toast } = useToast();
  const [seqId, setSeqId] = useState<string>("");
  const [open, setOpen] = useState(false);

  const enroll = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enrollments", { leadId, sequenceId: Number(seqId) });
      return await res.json();
    },
    onSuccess: () => {
      setOpen(false);
      setSeqId("");
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] }); // enrollment flips lead status → list must refresh
      queryClient.invalidateQueries({ queryKey: ["/api/enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Enrolled in sequence" });
    },
    onError: (e: Error) => toast({ title: "Enroll failed", description: e.message, variant: "destructive" }),
  });

  const seqName = (id: number) => sequences.find((s) => s.id === id)?.name ?? `Sequence #${id}`;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-primary" /> Sequence enrollments
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1" data-testid="button-enroll">
              <Plus className="h-3.5 w-3.5" /> Enroll
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Enroll in sequence</DialogTitle></DialogHeader>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sequence</Label>
              <Select value={seqId} onValueChange={setSeqId}>
                <SelectTrigger data-testid="select-sequence"><SelectValue placeholder="Pick a sequence" /></SelectTrigger>
                <SelectContent>
                  {sequences.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
              <Button onClick={() => enroll.mutate()} disabled={!seqId || enroll.isPending} data-testid="button-confirm-enroll">
                Enroll lead
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {enrollments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not enrolled in any sequence.</p>
      ) : (
        <div className="space-y-2">
          {enrollments.map((e) => (
            <div key={e.id} className="rounded-md border border-border p-2.5" data-testid={`enrollment-${e.id}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">{seqName(e.sequenceId)}</span>
                <span className="text-xs capitalize text-muted-foreground">{e.status}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Step {e.currentStep} · next send {formatDateTime(e.nextSendAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
