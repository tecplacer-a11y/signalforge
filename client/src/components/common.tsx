import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight" data-testid="text-page-title">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  hint,
  testId,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  accent?: "default" | "destructive" | "primary";
  hint?: string;
  testId?: string;
}) {
  const iconCls =
    accent === "destructive"
      ? "text-destructive bg-destructive/10"
      : accent === "primary"
        ? "text-primary bg-primary/10"
        : "text-muted-foreground bg-muted";
  return (
    <Card className="p-4" data-testid={testId}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-tight">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums leading-none">{value}</p>
          {hint && <p className="mt-1.5 text-xs text-muted-foreground truncate">{hint}</p>}
        </div>
        <div className={cn("rounded-md p-2 shrink-0", iconCls)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

export function Chip({
  children,
  onRemove,
  className,
  testId,
}: {
  children: ReactNode;
  onRemove?: () => void;
  className?: string;
  testId?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
      data-testid={testId}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Remove"
          data-testid="button-remove-chip"
        >
          ×
        </button>
      )}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-14 px-6 text-center">
      <div className="rounded-full bg-muted p-3 text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CardSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}

export function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (isNaN(d)) return "—";
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
