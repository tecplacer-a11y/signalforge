import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus, Crosshair, Pencil, Trash2, Star, Target, RotateCcw, FlaskConical, Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PageHeader, Chip, EmptyState, CardSkeletonGrid } from "@/components/common";
import { ChipInput } from "@/components/ChipInput";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  parseJsonArray, type IcpConfig, type IcpResponse, type ScoringConfig, type ClassifierKeywords,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface IcpDraft {
  id?: number;
  slice: string;
  active: boolean;
  rotationOrder: number;
  country: string;
  industries: string[];
  technologies: string[];
  headcount: string[];
  fundingStages: string[];
}

const blankIcp: IcpDraft = {
  slice: "", active: true, rotationOrder: 0, country: "US",
  industries: [], technologies: [], headcount: [], fundingStages: [],
};

export default function Targeting() {
  return (
    <div>
      <PageHeader
        title="Targeting"
        description="Define who the pipeline hunts. Target ANY vertical — augment, add, or delete target areas freely."
      />
      <IcpSection />
      <div className="my-8 border-t border-border" />
      <ClassifierSection />
    </div>
  );
}

/* ───────────────────────── ICP TARGET AREAS ───────────────────────── */

function IcpSection() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<IcpResponse>({ queryKey: ["/api/icp"] });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<IcpDraft>(blankIcp);

  const save = useMutation({
    mutationFn: async (d: IcpDraft) => {
      const payload = {
        slice: d.slice, active: d.active, rotationOrder: d.rotationOrder, country: d.country,
        industries: JSON.stringify(d.industries),
        technologies: JSON.stringify(d.technologies),
        headcount: JSON.stringify(d.headcount),
        fundingStages: JSON.stringify(d.fundingStages),
      };
      const res = d.id
        ? await apiRequest("PATCH", `/api/icp/${d.id}`, payload)
        : await apiRequest("POST", "/api/icp", payload);
      return await res.json();
    },
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/icp"] });
      toast({ title: draft.id ? "Target area updated" : "Target area added" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) =>
      apiRequest("PATCH", `/api/icp/${id}`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/icp"] }),
  });

  const del = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/icp/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/icp"] }); toast({ title: "Target area deleted" }); },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const openNew = () => { setDraft({ ...blankIcp, rotationOrder: (data?.configs.length ?? 0) }); setOpen(true); };
  const openEdit = (c: IcpConfig) => {
    setDraft({
      id: c.id, slice: c.slice, active: c.active, rotationOrder: c.rotationOrder, country: c.country,
      industries: parseJsonArray(c.industries), technologies: parseJsonArray(c.technologies),
      headcount: parseJsonArray(c.headcount), fundingStages: parseJsonArray(c.fundingStages),
    });
    setOpen(true);
  };

  return (
    <section>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-1.5">
            <Target className="h-4 w-4 text-primary" /> ICP Target Areas
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            Each card is a vertical the pipeline rotates through. Not limited to AI/ML, Robotics, or Hardware —
            add fintech, biotech, climate, logistics, or any market you want to pursue.
          </p>
        </div>
        <Button onClick={openNew} className="gap-1.5 shrink-0" data-testid="button-add-icp"><Plus className="h-4 w-4" /> Add target area</Button>
      </div>

      {isLoading ? (
        <CardSkeletonGrid count={3} />
      ) : (data?.configs ?? []).length === 0 ? (
        <EmptyState icon={Crosshair} title="No target areas" description="Add your first ICP vertical to start targeting." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data!.configs.map((c) => {
            const focus = c.slice === data!.currentSlice;
            return (
              <Card key={c.id} className={cn("p-4", focus && "ring-2 ring-primary")} data-testid={`card-icp-${c.id}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold truncate">{c.slice}</h3>
                      {focus && (
                        <Badge className="gap-1 bg-primary/15 text-primary border-primary/30 text-[10px]" variant="outline">
                          <Star className="h-3 w-3" /> This week's focus
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{c.country} · rotation #{c.rotationOrder}</p>
                  </div>
                  <Switch checked={c.active} onCheckedChange={(v) => toggle.mutate({ id: c.id, active: v })} data-testid={`switch-icp-${c.id}`} />
                </div>

                <ChipGroup label="Industries" items={parseJsonArray(c.industries)} />
                <ChipGroup label="Technologies" items={parseJsonArray(c.technologies)} />
                <ChipGroup label="Headcount" items={parseJsonArray(c.headcount)} />
                <ChipGroup label="Funding" items={parseJsonArray(c.fundingStages)} />

                <div className="mt-3 flex items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1 flex-1" onClick={() => openEdit(c)} data-testid={`button-edit-icp-${c.id}`}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive" data-testid={`button-delete-icp-${c.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{c.slice}" target area?</AlertDialogTitle>
                        <AlertDialogDescription>The pipeline will stop targeting this vertical.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => del.mutate(c.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <IcpDialog open={open} onOpenChange={setOpen} draft={draft} setDraft={setDraft} onSave={() => save.mutate(draft)} saving={save.isPending} />
    </section>
  );
}

function ChipGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mb-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      {items.length === 0 ? (
        <span className="text-xs text-muted-foreground/70">Any</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((it, i) => <Chip key={i} className="text-[11px] py-0">{it}</Chip>)}
        </div>
      )}
    </div>
  );
}

function IcpDialog({ open, onOpenChange, draft, setDraft, onSave, saving }: {
  open: boolean; onOpenChange: (v: boolean) => void; draft: IcpDraft;
  setDraft: React.Dispatch<React.SetStateAction<IcpDraft>>; onSave: () => void; saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{draft.id ? "Edit target area" : "Add target area"}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Target any vertical. Leave a list empty to match anything in that dimension.
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Slice name</Label>
              <Input value={draft.slice} placeholder="e.g. Fintech" onChange={(e) => setDraft((d) => ({ ...d, slice: e.target.value }))} data-testid="input-icp-slice" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Country</Label>
              <Input value={draft.country} onChange={(e) => setDraft((d) => ({ ...d, country: e.target.value }))} data-testid="input-icp-country" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Industries</Label>
            <ChipInput values={draft.industries} onChange={(v) => setDraft((d) => ({ ...d, industries: v }))} placeholder="Add industry, press Enter" testId="icp-industries" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Technologies</Label>
            <ChipInput values={draft.technologies} onChange={(v) => setDraft((d) => ({ ...d, technologies: v }))} placeholder="Add technology" testId="icp-technologies" />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Headcount bands</Label>
              <ChipInput values={draft.headcount} onChange={(v) => setDraft((d) => ({ ...d, headcount: v }))} placeholder="e.g. 11-50" testId="icp-headcount" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Funding stages</Label>
              <ChipInput values={draft.fundingStages} onChange={(v) => setDraft((d) => ({ ...d, fundingStages: v }))} placeholder="e.g. series_a" testId="icp-funding" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Rotation order</Label>
              <Input type="number" min={0} value={draft.rotationOrder} onChange={(e) => setDraft((d) => ({ ...d, rotationOrder: Number(e.target.value) }))} data-testid="input-icp-rotation" />
            </div>
            <label className="flex items-center gap-2 pb-2">
              <Switch checked={draft.active} onCheckedChange={(v) => setDraft((d) => ({ ...d, active: v }))} data-testid="switch-icp-draft-active" />
              <span className="text-sm">Active</span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={!draft.slice.trim() || saving} data-testid="button-save-icp">{saving ? "Saving…" : "Save target area"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── CLASSIFIER KEYWORDS ───────────────────────── */

const KEY_LABELS: { key: keyof ClassifierKeywords; label: string; hint: string }[] = [
  { key: "decisionMaker", label: "Decision-maker titles", hint: "Titles that mark a lead as a decision-maker" },
  { key: "influencer", label: "Influencer titles", hint: "Titles that mark a lead as an influencer" },
  { key: "targetFunction", label: "Target functions", hint: "THE key control — which verticals/functions the pipeline targets" },
  { key: "cLevel", label: "C-level keywords", hint: "Executive markers for top-tier routing" },
];

function ClassifierSection() {
  const { toast } = useToast();
  const { data: scoring } = useQuery<ScoringConfig>({ queryKey: ["/api/scoring"] });
  const { data: defaults } = useQuery<ClassifierKeywords>({ queryKey: ["/api/classifier-defaults"] });

  const [kw, setKw] = useState<ClassifierKeywords>({ decisionMaker: [], influencer: [], targetFunction: [], cLevel: [] });
  const [testTitle, setTestTitle] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (!scoring || !defaults) return;
    let parsed: Partial<ClassifierKeywords> = {};
    try { parsed = JSON.parse(scoring.classifierKeywords || "{}"); } catch { /* noop */ }
    setKw({
      decisionMaker: parsed.decisionMaker?.length ? parsed.decisionMaker : defaults.decisionMaker,
      influencer: parsed.influencer?.length ? parsed.influencer : defaults.influencer,
      targetFunction: parsed.targetFunction?.length ? parsed.targetFunction : defaults.targetFunction,
      cLevel: parsed.cLevel?.length ? parsed.cLevel : defaults.cLevel,
    });
  }, [scoring, defaults]);

  const save = useMutation({
    mutationFn: async () => apiRequest("PATCH", "/api/scoring", { classifierKeywords: JSON.stringify(kw) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/scoring"] }); toast({ title: "Classifier keywords saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const test = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/classifier/test", { title: testTitle, keywords: kw });
      return (await res.json()) as { role: string };
    },
    onSuccess: (d) => setTestResult(d.role),
    onError: (e: Error) => toast({ title: "Test failed", description: e.message, variant: "destructive" }),
  });

  const resetDefaults = () => { if (defaults) setKw({ ...defaults }); };

  return (
    <section>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" /> Classifier Keywords
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            How the pipeline classifies titles. <span className="font-medium text-foreground">Target functions</span> retarget
            the whole pipeline — add keywords like "Finance", "Healthcare", or "Climate" to pursue any vertical.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" className="gap-1.5" onClick={resetDefaults} data-testid="button-reset-classifier">
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-classifier">
            {save.isPending ? "Saving…" : "Save keywords"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {KEY_LABELS.map(({ key, label, hint }) => (
          <Card key={key} className={cn("p-4", key === "targetFunction" && "ring-1 ring-primary/40")} data-testid={`card-keywords-${key}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <h3 className="text-sm font-semibold">{label}</h3>
              {key === "targetFunction" && <Badge variant="outline" className="text-[10px] text-primary border-primary/30">retargets pipeline</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mb-2">{hint}</p>
            <ChipInput values={kw[key]} onChange={(v) => setKw((s) => ({ ...s, [key]: v }))} placeholder="Add keyword" testId={`kw-${key}`} />
          </Card>
        ))}
      </div>

      <Card className="mt-4 p-4">
        <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
          <FlaskConical className="h-4 w-4 text-primary" /> Test a job title
        </h3>
        <p className="text-xs text-muted-foreground mb-3">See how a title classifies against the current keywords.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={testTitle}
            onChange={(e) => setTestTitle(e.target.value)}
            placeholder="e.g. VP of Machine Learning"
            className="flex-1 min-w-[200px]"
            onKeyDown={(e) => { if (e.key === "Enter" && testTitle.trim()) test.mutate(); }}
            data-testid="input-test-title"
          />
          <Button onClick={() => test.mutate()} disabled={!testTitle.trim() || test.isPending} data-testid="button-test-title">
            {test.isPending ? "Testing…" : "Classify"}
          </Button>
          {testResult && (
            <Badge
              className={cn(
                "text-sm px-3 py-1 capitalize",
                testResult === "decision_maker" ? "bg-destructive/15 text-destructive border-destructive/30"
                  : testResult === "influencer" ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-border",
              )}
              variant="outline"
              data-testid="text-test-result"
            >
              {testResult === "drop" ? "Drop (not targeted)" : testResult.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </Card>
    </section>
  );
}
