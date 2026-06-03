import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { SlidersHorizontal, Save, Beaker } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/common";
import { TierBadge } from "@/components/badges";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ScoringConfig, Channel, RoleClass, Tier } from "@/lib/types";

type NumKey = Exclude<keyof ScoringConfig, "id" | "classifierKeywords">;

const SLIDER_FIELDS: { key: NumKey; label: string; min: number; max: number; step: number; group: string }[] = [
  { key: "baselineA", label: "Channel A baseline", min: 0, max: 100, step: 1, group: "Channel baselines" },
  { key: "baselineBSig", label: "Channel B-Sig baseline", min: 0, max: 100, step: 1, group: "Channel baselines" },
  { key: "baselineBDisc", label: "Channel B-Disc baseline", min: 0, max: 100, step: 1, group: "Channel baselines" },
  { key: "baselineC", label: "Channel C baseline", min: 0, max: 100, step: 1, group: "Channel baselines" },
  { key: "bonusDecisionMaker", label: "Decision-maker bonus", min: 0, max: 50, step: 1, group: "Role bonuses" },
  { key: "bonusInfluencer", label: "Influencer bonus", min: 0, max: 50, step: 1, group: "Role bonuses" },
  { key: "confidenceWeight", label: "Contact confidence weight", min: 0, max: 50, step: 1, group: "Weighting" },
  { key: "signalDecayDays", label: "Signal decay window (days)", min: 1, max: 180, step: 1, group: "Signal decay" },
  { key: "tierAThreshold", label: "Tier A threshold", min: 0, max: 100, step: 1, group: "Tier thresholds" },
  { key: "tierBThreshold", label: "Tier B threshold", min: 0, max: 100, step: 1, group: "Tier thresholds" },
];

const GROUPS = ["Channel baselines", "Role bonuses", "Weighting", "Signal decay", "Tier thresholds"];

export default function Scoring() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<ScoringConfig>({ queryKey: ["/api/scoring"] });
  const [cfg, setCfg] = useState<ScoringConfig | null>(null);

  useEffect(() => { if (data) setCfg(data); }, [data]);

  const save = useMutation({
    mutationFn: async (c: ScoringConfig) => {
      const { id, classifierKeywords, ...rest } = c;
      return apiRequest("PATCH", "/api/scoring", rest);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/scoring"] }); toast({ title: "Scoring config saved" }); },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div>
      <PageHeader
        title="MEDDPICC Scoring"
        description="No-code tuning of how leads are scored and tiered. Adjust weights and watch the live preview."
        actions={
          <Button onClick={() => cfg && save.mutate(cfg)} disabled={!cfg || save.isPending} className="gap-1.5" data-testid="button-save-scoring">
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save config"}
          </Button>
        }
      />

      {isLoading || !cfg ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" /><Skeleton className="h-96" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {GROUPS.map((g) => (
              <Card key={g} className="p-4">
                <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" /> {g}
                </h2>
                <div className="space-y-4">
                  {SLIDER_FIELDS.filter((f) => f.group === g).map((f) => (
                    <SliderRow key={f.key} field={f} value={cfg[f.key] as number} onChange={(v) => setCfg((c) => c && { ...c, [f.key]: v })} />
                  ))}
                  {g === "Signal decay" && (
                    <div className="grid grid-cols-2 gap-3 items-center pt-1">
                      <Label className="text-sm">Signal decay floor (0–1)</Label>
                      <Input
                        type="number" min={0} max={1} step={0.05} value={cfg.signalDecayFloor}
                        onChange={(e) => setCfg((c) => c && { ...c, signalDecayFloor: Number(e.target.value) })}
                        data-testid="input-decay-floor"
                      />
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <div className="lg:sticky lg:top-2 self-start">
            <PreviewPanel cfg={cfg} />
          </div>
        </div>
      )}
    </div>
  );
}

function SliderRow({ field, value, onChange }: {
  field: { key: string; label: string; min: number; max: number; step: number };
  value: number; onChange: (v: number) => void;
}) {
  return (
    <div data-testid={`slider-row-${field.key}`}>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-sm">{field.label}</Label>
        <Input
          type="number" min={field.min} max={field.max} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-7 w-20 text-right tabular-nums" data-testid={`input-${field.key}`}
        />
      </div>
      <Slider
        value={[value]} min={field.min} max={field.max} step={field.step}
        onValueChange={([v]) => onChange(v)} data-testid={`slider-${field.key}`}
      />
    </div>
  );
}

function PreviewPanel({ cfg }: { cfg: ScoringConfig }) {
  const [channel, setChannel] = useState<Channel>("B-Sig");
  const [roleClass, setRoleClass] = useState<RoleClass>("decision_maker");
  const [confidence, setConfidence] = useState(80);
  const [age, setAge] = useState(5);
  const [result, setResult] = useState<{ score: number; tier: Tier } | null>(null);

  const preview = useMutation({
    mutationFn: async () => {
      const { id, classifierKeywords, ...overrides } = cfg;
      const res = await apiRequest("POST", "/api/scoring/preview", {
        lead: { channel, roleClass, contactConfidence: confidence, signalAgeDays: age },
        config: overrides,
      });
      return (await res.json()) as { score: number; tier: Tier };
    },
    onSuccess: (d) => setResult(d),
  });

  // recompute whenever inputs or config change
  useEffect(() => {
    preview.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, roleClass, confidence, age, cfg]);

  return (
    <Card className="p-4" data-testid="card-preview">
      <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
        <Beaker className="h-4 w-4 text-primary" /> Live preview
      </h2>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Channel</Label>
          <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <SelectTrigger data-testid="select-preview-channel"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A">A · Inbound</SelectItem>
              <SelectItem value="B-Sig">B-Sig · Signal</SelectItem>
              <SelectItem value="B-Disc">B-Disc · Discover</SelectItem>
              <SelectItem value="C">C · Nurture</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Role class</Label>
          <Select value={roleClass || "decision_maker"} onValueChange={(v) => setRoleClass(v as RoleClass)}>
            <SelectTrigger data-testid="select-preview-role"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="decision_maker">Decision-maker</SelectItem>
              <SelectItem value="influencer">Influencer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between"><Label className="text-xs">Contact confidence</Label><span className="text-xs tabular-nums text-muted-foreground">{confidence}%</span></div>
          <Slider value={[confidence]} min={0} max={100} step={1} onValueChange={([v]) => setConfidence(v)} data-testid="slider-preview-confidence" />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between"><Label className="text-xs">Signal age</Label><span className="text-xs tabular-nums text-muted-foreground">{age}d</span></div>
          <Slider value={[age]} min={0} max={120} step={1} onValueChange={([v]) => setAge(v)} data-testid="slider-preview-age" />
        </div>
      </div>

      <div className="mt-4 rounded-md border border-border bg-muted/40 p-4 text-center">
        <p className="text-xs text-muted-foreground">Resulting MEDDPICC score</p>
        <p className="text-4xl font-bold tabular-nums leading-none my-2" data-testid="text-preview-score">
          {result ? result.score : "—"}
        </p>
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-xs text-muted-foreground">Tier</span>
          {result ? <TierBadge tier={result.tier} /> : <span className="text-muted-foreground">—</span>}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground text-center">Updates live as you adjust weights.</p>
    </Card>
  );
}
