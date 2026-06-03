import { useQuery } from "@tanstack/react-query";
import { PlayCircle, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader, EmptyState, TableSkeleton, formatDateTime } from "@/components/common";
import { RunStatusBadge, ChannelBadge } from "@/components/badges";
import { RunPipelineButton } from "@/components/RunPipelineButton";
import type { PipelineRun } from "@/lib/types";

export default function Runs() {
  const { data: runs, isLoading } = useQuery<PipelineRun[]>({ queryKey: ["/api/runs"] });

  return (
    <div>
      <PageHeader
        title="Pipeline Runs"
        description="Full execution history — what every run ingested, deduped, enriched, scored, and routed."
        actions={<RunPipelineButton />}
      />

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : (runs ?? []).length === 0 ? (
        <EmptyState icon={PlayCircle} title="No runs yet" description="Trigger the pipeline to capture and score new leads." action={<RunPipelineButton />} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-2 px-3 font-medium">Run</th>
                  <th className="py-2 px-3 font-medium">Channel</th>
                  <th className="py-2 px-3 font-medium">Trigger</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 px-3 font-medium text-right">Ingested</th>
                  <th className="py-2 px-3 font-medium text-right">Deduped</th>
                  <th className="py-2 px-3 font-medium text-right">Enriched</th>
                  <th className="py-2 px-3 font-medium text-right">Scored</th>
                  <th className="py-2 px-3 font-medium text-right">Routed</th>
                  <th className="py-2 px-3 font-medium text-center">A / B / C</th>
                  <th className="py-2 px-3 font-medium whitespace-nowrap">Started</th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => (
                  <RunRow key={r.id} run={r} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function RunRow({ run: r }: { run: PipelineRun }) {
  return (
    <>
      <tr className="border-b border-border/60 hover-elevate" data-testid={`row-run-${r.id}`}>
        <td className="py-2 px-3 font-medium tabular-nums">#{r.id}</td>
        <td className="py-2 px-3"><ChannelBadge channel={r.channel as any} /></td>
        <td className="py-2 px-3 text-muted-foreground capitalize">{r.trigger}</td>
        <td className="py-2 px-3"><RunStatusBadge status={r.status} /></td>
        <td className="py-2 px-3 text-right tabular-nums">{r.ingested}</td>
        <td className="py-2 px-3 text-right tabular-nums">{r.deduped}</td>
        <td className="py-2 px-3 text-right tabular-nums">{r.enriched}</td>
        <td className="py-2 px-3 text-right tabular-nums">{r.scored}</td>
        <td className="py-2 px-3 text-right tabular-nums font-semibold">{r.routed}</td>
        <td className="py-2 px-3 text-center tabular-nums text-xs">
          <span className="text-destructive">{r.tierA}</span>
          {" / "}
          <span className="text-primary">{r.tierB}</span>
          {" / "}
          <span className="text-muted-foreground">{r.tierC}</span>
        </td>
        <td className="py-2 px-3 text-muted-foreground whitespace-nowrap text-xs">{formatDateTime(r.startedAt)}</td>
      </tr>
      {r.status === "error" && r.errorMessage && (
        <tr className="bg-destructive/5" data-testid={`row-run-error-${r.id}`}>
          <td colSpan={11} className="py-1.5 px-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> {r.errorMessage}
            </span>
          </td>
        </tr>
      )}
    </>
  );
}
