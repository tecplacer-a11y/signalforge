import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { TierBadge } from "@/components/badges";
import type { Lead } from "@/lib/types";

export function RationaleCard({ lead }: { lead: Lead }) {
  const factors = lead.rationaleFactors ?? [];
  const maxAbs = Math.max(1, ...factors.map((f) => Math.abs(f.points)));

  return (
    <Card className="p-4" data-testid="card-rationale">
      <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
        <Sparkles className="h-4 w-4 text-primary" /> Scoring Rationale
      </h2>
      {lead.rationale ? (
        <p className="text-sm text-muted-foreground mb-4">{lead.rationale}</p>
      ) : (
        <p className="text-sm text-muted-foreground mb-4">
          Tiered {lead.tier} from a MEDDPICC score of {lead.meddpiccScore}.
        </p>
      )}

      {factors.length > 0 && (
        <div className="space-y-2 mb-4">
          {factors.map((f, i) => {
            const positive = f.points >= 0;
            const widthPct = (Math.abs(f.points) / maxAbs) * 100;
            return (
              <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-3" data-testid={`factor-${i}`}>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className={cn("font-semibold tabular-nums", positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                      {positive ? "+" : ""}{f.points}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", positive ? "bg-emerald-500" : "bg-rose-500")}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2.5">
        <div>
          <p className="text-xs text-muted-foreground">Final MEDDPICC score</p>
          <p className="text-2xl font-bold tabular-nums leading-none mt-0.5">{lead.meddpiccScore}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-1">Tier</p>
          <TierBadge tier={lead.tier} />
        </div>
      </div>
    </Card>
  );
}
