import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Play, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Lead, PipelineRun } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHANNELS: { value: "A" | "B-Sig" | "B-Disc"; label: string; hint: string }[] = [
  { value: "A", label: "Channel A", hint: "Inbound intros" },
  { value: "B-Sig", label: "Channel B-Sig", hint: "Buying signals" },
  { value: "B-Disc", label: "Channel B-Disc", hint: "ICP discovery" },
];

interface RunResult {
  run: PipelineRun;
  created: (Lead & { slack?: string })[];
}

export function RunPipelineButton({
  className,
  size = "default",
}: {
  className?: string;
  size?: "default" | "sm";
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: async (channel: string) => {
      const res = await apiRequest("POST", "/api/runs", { channel });
      return (await res.json()) as RunResult;
    },
    onSuccess: (data) => {
      const created = data.created ?? [];
      const tierCounts = created.reduce(
        (acc, l) => {
          acc[l.tier] = (acc[l.tier] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
      const tierSummary =
        Object.entries(tierCounts)
          .map(([t, n]) => `${n}× Tier ${t}`)
          .join(", ") || "no new leads";

      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });

      toast({
        title:
          created.length > 0
            ? `Pipeline complete — ${created.length} new lead${created.length === 1 ? "" : "s"}`
            : "Pipeline complete — no new leads",
        description: (
          <div className="mt-1 space-y-1.5">
            <div className="text-xs font-medium">{tierSummary}</div>
            {created.slice(0, 5).map((l) => (
              <div key={l.leadId} className="text-xs leading-snug">
                <span className="font-semibold">{l.firstName} {l.lastName}</span>{" "}
                <span className="text-muted-foreground">
                  · {l.companyName} · Tier {l.tier} ({l.meddpiccScore})
                </span>
                {l.rationale && (
                  <div className="text-[11px] text-muted-foreground">{l.rationale}</div>
                )}
              </div>
            ))}
            {created.length > 5 && (
              <div className="text-[11px] text-muted-foreground">
                +{created.length - 5} more
              </div>
            )}
          </div>
        ),
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Pipeline run failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const running = mutation.isPending;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size={size}
          className={cn("gap-2", className)}
          disabled={running}
          data-testid="button-run-pipeline"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {running ? "Running…" : "Run Pipeline"}
          {!running && <ChevronDown className="h-3.5 w-3.5 opacity-70" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Pick a channel</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CHANNELS.map((c) => (
          <DropdownMenuItem
            key={c.value}
            onClick={() => mutation.mutate(c.value)}
            data-testid={`menu-run-${c.value}`}
            className="flex-col items-start gap-0.5"
          >
            <span className="font-medium">{c.label}</span>
            <span className="text-xs text-muted-foreground">{c.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
