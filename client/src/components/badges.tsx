import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Tier, Channel, Status, VerifierStatus } from "@/lib/types";

export function TierBadge({ tier }: { tier: Tier }) {
  const map: Record<Tier, string> = {
    A: "bg-destructive/15 text-destructive border-destructive/30",
    B: "bg-primary/15 text-primary border-primary/30",
    C: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        map[tier],
      )}
      data-testid={`badge-tier-${tier}`}
    >
      {tier}
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: Channel }) {
  const labels: Record<string, string> = {
    A: "A · Inbound",
    "B-Sig": "B · Signal",
    "B-Disc": "B · Discover",
    C: "C · Nurture",
  };
  return (
    <Badge variant="outline" className="font-medium text-xs whitespace-nowrap">
      {labels[channel] ?? channel}
    </Badge>
  );
}

const STATUS_COLORS: Record<string, string> = {
  Captured: "bg-slate-500/15 text-slate-500 dark:text-slate-300 border-slate-500/30",
  Validated: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/30",
  Enriching: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/30",
  Scored: "bg-primary/15 text-primary border-primary/30",
  "Narrative Ready": "bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30",
  "Review Required": "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
  "Outreach Active": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  Responded: "bg-teal-500/15 text-teal-600 dark:text-teal-300 border-teal-500/30",
  "Meeting Booked": "bg-green-500/20 text-green-600 dark:text-green-300 border-green-500/40",
  Disqualified: "bg-rose-500/10 text-rose-500 dark:text-rose-300 border-rose-500/25",
  Nurture: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status }: { status: Status | string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_COLORS[status] ?? "bg-muted text-muted-foreground border-border",
      )}
      data-testid={`badge-status-${status}`}
    >
      {status}
    </span>
  );
}

export function VerifierBadge({ status }: { status: VerifierStatus | string }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const good = status === "valid";
  const warn = status === "accept_all" || status === "webmail";
  const bad = status === "invalid" || status === "disposable" || status === "risky";
  const cls = good
    ? "text-emerald-600 dark:text-emerald-400"
    : warn
      ? "text-amber-600 dark:text-amber-400"
      : bad
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";
  return (
    <span className={cn("text-xs font-medium capitalize", cls)} data-testid="text-verifier">
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    error: "bg-destructive/15 text-destructive border-destructive/30",
    running: "bg-primary/15 text-primary border-primary/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
        map[status] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {status}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  if (!role) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="text-xs text-muted-foreground capitalize">{role.replace(/_/g, " ")}</span>
  );
}
