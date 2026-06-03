import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Send, Mail, Linkedin, Trash2, Pencil, GripVertical, Layers,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { PageHeader, EmptyState, TableSkeleton } from "@/components/common";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Sequence, SequenceStep, Enrollment } from "@/lib/types";

const emptyStep = (order: number): SequenceStep => ({ order, delayDays: order === 1 ? 0 : 3, channel: "email", subject: "", body: "" });

interface Draft {
  id?: number;
  name: string;
  description: string;
  channel: "email" | "linkedin" | "mixed";
  active: boolean;
  autoEnrollTier: "none" | "A" | "B" | "C";
  steps: SequenceStep[];
}

const blankDraft: Draft = {
  name: "", description: "", channel: "email", active: true, autoEnrollTier: "none",
  steps: [emptyStep(1)],
};

function parseSteps(s: string): SequenceStep[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}

export default function Outreach() {
  const { toast } = useToast();
  const { data: sequences, isLoading } = useQuery<Sequence[]>({ queryKey: ["/api/sequences"] });
  const { data: enrollments } = useQuery<Enrollment[]>({ queryKey: ["/api/enrollments"] });

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft);

  const enrollCount = (seqId: number) =>
    (enrollments ?? []).filter((e) => e.sequenceId === seqId && e.status === "active").length;

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        name: d.name, description: d.description, channel: d.channel,
        active: d.active, autoEnrollTier: d.autoEnrollTier,
        steps: JSON.stringify(d.steps.map((s, i) => ({ ...s, order: i + 1 }))),
      };
      const res = d.id
        ? await apiRequest("PATCH", `/api/sequences/${d.id}`, payload)
        : await apiRequest("POST", "/api/sequences", payload);
      return await res.json();
    },
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: draft.id ? "Sequence updated" : "Sequence created" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/sequences/${id}`, { active });
      return await res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/sequences"] }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/sequences/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sequences"] });
      toast({ title: "Sequence deleted" });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const openNew = () => { setDraft(blankDraft); setOpen(true); };
  const openEdit = (s: Sequence) => {
    setDraft({
      id: s.id, name: s.name, description: s.description, channel: s.channel,
      active: s.active, autoEnrollTier: s.autoEnrollTier, steps: parseSteps(s.steps),
    });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Outreach Sequences"
        description="Multi-step email & LinkedIn cadences. Auto-enroll by tier."
        actions={<Button onClick={openNew} className="gap-1.5" data-testid="button-new-sequence"><Plus className="h-4 w-4" /> New sequence</Button>}
      />

      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : (sequences ?? []).length === 0 ? (
        <EmptyState icon={Send} title="No sequences yet" description="Build a cadence to start automated outreach."
          action={<Button onClick={openNew} className="gap-1.5"><Plus className="h-4 w-4" /> New sequence</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(sequences ?? []).map((s) => {
            const steps = parseSteps(s.steps);
            return (
              <Card key={s.id} className="p-4" data-testid={`card-sequence-${s.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate">{s.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{s.description}</p>
                  </div>
                  <Switch
                    checked={s.active}
                    onCheckedChange={(v) => toggleActive.mutate({ id: s.id, active: v })}
                    data-testid={`switch-active-${s.id}`}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="gap-1 capitalize">
                    {s.channel === "linkedin" ? <Linkedin className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                    {s.channel}
                  </Badge>
                  <Badge variant="outline" className="gap-1"><Layers className="h-3 w-3" />{steps.length} steps</Badge>
                  <Badge variant="outline">
                    {s.autoEnrollTier === "none" ? "Manual enroll" : `Auto-enroll Tier ${s.autoEnrollTier}`}
                  </Badge>
                  <Badge variant="secondary" className="tabular-nums" data-testid={`text-enrollments-${s.id}`}>
                    {enrollCount(s.id)} active
                  </Badge>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1 flex-1" onClick={() => openEdit(s)} data-testid={`button-edit-${s.id}`}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive" data-testid={`button-delete-${s.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{s.name}"?</AlertDialogTitle>
                        <AlertDialogDescription>This removes the sequence. Enrollments are unaffected.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => del.mutate(s.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SequenceDialog open={open} onOpenChange={setOpen} draft={draft} setDraft={setDraft} onSave={() => save.mutate(draft)} saving={save.isPending} />
    </div>
  );
}

function SequenceDialog({ open, onOpenChange, draft, setDraft, onSave, saving }: {
  open: boolean; onOpenChange: (v: boolean) => void; draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>; onSave: () => void; saving: boolean;
}) {
  const setStep = (i: number, patch: Partial<SequenceStep>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const addStep = () => setDraft((d) => ({ ...d, steps: [...d.steps, emptyStep(d.steps.length + 1)] }));
  const removeStep = (i: number) => setDraft((d) => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{draft.id ? "Edit sequence" : "New sequence"}</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} data-testid="input-seq-name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Channel</Label>
              <Select value={draft.channel} onValueChange={(v) => setDraft((d) => ({ ...d, channel: v as any }))}>
                <SelectTrigger data-testid="select-seq-channel"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea value={draft.description} rows={2} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} className="resize-none" data-testid="input-seq-desc" />
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Auto-enroll tier</Label>
              <Select value={draft.autoEnrollTier} onValueChange={(v) => setDraft((d) => ({ ...d, autoEnrollTier: v as any }))}>
                <SelectTrigger data-testid="select-seq-tier"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (manual)</SelectItem>
                  <SelectItem value="A">Tier A</SelectItem>
                  <SelectItem value="B">Tier B</SelectItem>
                  <SelectItem value="C">Tier C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 pb-2">
              <Switch checked={draft.active} onCheckedChange={(v) => setDraft((d) => ({ ...d, active: v }))} data-testid="switch-seq-active" />
              <span className="text-sm">Active</span>
            </label>
          </div>

          {/* Step builder */}
          <div className="rounded-md border border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold">Steps</Label>
              <span className="text-[11px] text-muted-foreground">Merge tags: {"{{first}} {{company}} {{title}}"}</span>
            </div>
            <div className="space-y-3">
              {draft.steps.map((step, i) => (
                <div key={i} className="rounded-md border border-border bg-muted/30 p-3" data-testid={`step-${i}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <GripVertical className="h-3.5 w-3.5" /> Step {i + 1}
                    </span>
                    {draft.steps.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => removeStep(i)} data-testid={`button-remove-step-${i}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Delay (days)</Label>
                      <Input type="number" min={0} value={step.delayDays} onChange={(e) => setStep(i, { delayDays: Number(e.target.value) })} data-testid={`input-delay-${i}`} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Channel</Label>
                      <Select value={step.channel} onValueChange={(v) => setStep(i, { channel: v as any })}>
                        <SelectTrigger data-testid={`select-step-channel-${i}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="linkedin">LinkedIn</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Input className="mb-2" placeholder="Subject" value={step.subject} onChange={(e) => setStep(i, { subject: e.target.value })} data-testid={`input-subject-${i}`} />
                  <Textarea rows={3} placeholder="Body — use {{first}}, {{company}}, {{title}}" value={step.body} onChange={(e) => setStep(i, { body: e.target.value })} className="resize-none" data-testid={`input-body-${i}`} />
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="mt-3 gap-1 w-full" onClick={addStep} data-testid="button-add-step">
              <Plus className="h-3.5 w-3.5" /> Add step
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={!draft.name.trim() || saving} data-testid="button-save-sequence">
            {saving ? "Saving…" : "Save sequence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
