import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Search,
  Table2,
  Columns3,
  ArrowUpDown,
  Users,
  ChevronRight,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader, EmptyState, TableSkeleton } from "@/components/common";
import { AddLeadButton } from "@/components/AddLeadDialog";
import { TierBadge, ChannelBadge, StatusBadge, VerifierBadge } from "@/components/badges";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { STATUSES, type Lead, type Status } from "@/lib/types";
import { cn } from "@/lib/utils";

type SortKey = "meddpiccScore" | "name" | "company" | "tier";

export default function Leads() {
  const { data: leads, isLoading } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const [view, setView] = useState<"table" | "kanban">("table");

  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("all");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");
  const [slice, setSlice] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("meddpiccScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const slices = useMemo(
    () => Array.from(new Set((leads ?? []).map((l) => l.icpSlice).filter(Boolean))),
    [leads],
  );

  const filtered = useMemo(() => {
    let out = (leads ?? []).filter((l) => {
      if (tier !== "all" && l.tier !== tier) return false;
      if (channel !== "all" && l.channel !== channel) return false;
      if (status !== "all" && l.status !== status) return false;
      if (slice !== "all" && l.icpSlice !== slice) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${l.firstName} ${l.lastName} ${l.companyName} ${l.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "meddpiccScore") cmp = a.meddpiccScore - b.meddpiccScore;
      else if (sortKey === "name") cmp = `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`);
      else if (sortKey === "company") cmp = a.companyName.localeCompare(b.companyName);
      else if (sortKey === "tier") cmp = a.tier.localeCompare(b.tier);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [leads, tier, channel, status, slice, search, sortKey, sortDir]);

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Every lead the pipeline has captured, scored, and routed."
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border p-0.5">
              <Button
                variant={view === "table" ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
                onClick={() => setView("table")}
                data-testid="button-view-table"
              >
                <Table2 className="h-4 w-4" /> Table
              </Button>
              <Button
                variant={view === "kanban" ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
                onClick={() => setView("kanban")}
                data-testid="button-view-kanban"
              >
                <Columns3 className="h-4 w-4" /> Kanban
              </Button>
            </div>
            <AddLeadButton size="sm" />
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or company"
            className="pl-8"
            data-testid="input-search-leads"
          />
        </div>
        <FilterSelect value={tier} onChange={setTier} label="Tier" testId="filter-tier" options={["A", "B", "C"]} />
        <FilterSelect value={channel} onChange={setChannel} label="Channel" testId="filter-channel" options={["A", "B-Sig", "B-Disc", "C"]} />
        <FilterSelect value={status} onChange={setStatus} label="Status" testId="filter-status" options={[...STATUSES]} />
        <FilterSelect value={slice} onChange={setSlice} label="ICP Slice" testId="filter-slice" options={slices} />
        <span className="ml-auto text-xs text-muted-foreground tabular-nums" data-testid="text-lead-count">
          {filtered.length} {filtered.length === 1 ? "lead" : "leads"}
        </span>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No matching leads" description="Adjust filters or run the pipeline to capture new leads." />
      ) : view === "table" ? (
        <LeadTable
          leads={filtered}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(k) => {
            if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
            else { setSortKey(k); setSortDir("desc"); }
          }}
        />
      ) : (
        <Kanban leads={filtered} />
      )}
    </div>
  );
}

function FilterSelect({
  value, onChange, label, options, testId,
}: { value: string; onChange: (v: string) => void; label: string; options: string[]; testId: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[110px] gap-1" data-testid={testId}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SortHeader({ label, active, dir, onClick, className }: { label: string; active: boolean; dir: string; onClick: () => void; className?: string }) {
  return (
    <th className={cn("py-2 px-3 font-medium", className)}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={onClick}>
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active ? "text-foreground" : "text-muted-foreground/50")} />
      </button>
    </th>
  );
}

function LeadTable({ leads, sortKey, sortDir, onSort }: { leads: Lead[]; sortKey: SortKey; sortDir: string; onSort: (k: SortKey) => void }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground border-b border-border">
            <tr>
              <SortHeader label="Name" active={sortKey === "name"} dir={sortDir} onClick={() => onSort("name")} />
              <th className="py-2 px-3 font-medium">Title</th>
              <SortHeader label="Company" active={sortKey === "company"} dir={sortDir} onClick={() => onSort("company")} />
              <th className="py-2 px-3 font-medium">Channel</th>
              <SortHeader label="Tier" active={sortKey === "tier"} dir={sortDir} onClick={() => onSort("tier")} className="text-center" />
              <SortHeader label="Score" active={sortKey === "meddpiccScore"} dir={sortDir} onClick={() => onSort("meddpiccScore")} className="text-right" />
              <th className="py-2 px-3 font-medium">Status</th>
              <th className="py-2 px-3 font-medium">Verifier</th>
              <th className="py-2 px-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.leadId} className="border-b border-border/60 last:border-0 hover-elevate" data-testid={`row-lead-${l.leadId}`}>
                <td className="py-2 px-3">
                  <Link href={`/leads/${encodeURIComponent(l.leadId)}`} className="font-medium hover:text-primary" data-testid={`link-lead-${l.leadId}`}>
                    {l.firstName} {l.lastName}
                  </Link>
                  <div className="text-xs text-muted-foreground">{l.email || "—"}</div>
                </td>
                <td className="py-2 px-3 text-muted-foreground max-w-[180px] truncate">{l.title || "—"}</td>
                <td className="py-2 px-3">
                  <div className="font-medium">{l.companyName}</div>
                  <div className="text-xs text-muted-foreground">{l.icpSlice}</div>
                </td>
                <td className="py-2 px-3"><ChannelBadge channel={l.channel} /></td>
                <td className="py-2 px-3 text-center"><TierBadge tier={l.tier} /></td>
                <td className="py-2 px-3 text-right">
                  {l.rationale ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-semibold tabular-nums cursor-help underline decoration-dotted decoration-muted-foreground/40" data-testid={`score-${l.leadId}`}>
                          {l.meddpiccScore}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs">{l.rationale}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="font-semibold tabular-nums" data-testid={`score-${l.leadId}`}>{l.meddpiccScore}</span>
                  )}
                </td>
                <td className="py-2 px-3"><StatusBadge status={l.status} /></td>
                <td className="py-2 px-3"><VerifierBadge status={l.verifierStatus} /></td>
                <td className="py-2 px-3">
                  <Link href={`/leads/${encodeURIComponent(l.leadId)}`}>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Kanban({ leads }: { leads: Lead[] }) {
  const { toast } = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: Status }) => {
      const res = await apiRequest("PATCH", `/api/leads/${encodeURIComponent(leadId)}`, { status });
      return await res.json();
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Status updated", description: `Moved to ${vars.status}` });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const byStatus = useMemo(() => {
    const m: Record<string, Lead[]> = {};
    for (const s of STATUSES) m[s] = [];
    for (const l of leads) (m[l.status] ??= []).push(l);
    return m;
  }, [leads]);

  return (
    <div className="overflow-x-auto pb-3 [overscroll-behavior:contain]">
      <div className="flex gap-3 min-w-max">
        {STATUSES.map((s) => (
          <div
            key={s}
            className={cn(
              "w-64 shrink-0 rounded-lg border bg-muted/30 p-2 transition-colors",
              overCol === s ? "border-primary bg-primary/5" : "border-border",
            )}
            onDragOver={(e) => { e.preventDefault(); setOverCol(s); }}
            onDragLeave={() => setOverCol((c) => (c === s ? null : c))}
            onDrop={() => {
              setOverCol(null);
              if (dragId) {
                const lead = leads.find((l) => l.leadId === dragId);
                if (lead && lead.status !== s) mutation.mutate({ leadId: dragId, status: s });
              }
              setDragId(null);
            }}
            data-testid={`kanban-col-${s}`}
          >
            <div className="flex items-center justify-between px-1.5 pb-2">
              <span className="text-xs font-semibold">{s}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{byStatus[s].length}</span>
            </div>
            <div className="space-y-2">
              {byStatus[s].map((l) => (
                <div
                  key={l.leadId}
                  draggable
                  onDragStart={() => setDragId(l.leadId)}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  className={cn(
                    "rounded-md border border-border bg-card p-2.5 cursor-grab active:cursor-grabbing hover-elevate",
                    dragId === l.leadId && "opacity-50",
                  )}
                  data-testid={`kanban-card-${l.leadId}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/leads/${encodeURIComponent(l.leadId)}`} className="text-sm font-medium hover:text-primary truncate">
                      {l.firstName} {l.lastName}
                    </Link>
                    <TierBadge tier={l.tier} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{l.title}</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate">{l.companyName}</span>
                    <span className="text-xs font-semibold tabular-nums text-primary">{l.meddpiccScore}</span>
                  </div>
                </div>
              ))}
              {byStatus[s].length === 0 && (
                <div className="rounded-md border border-dashed border-border/60 py-4 text-center text-[11px] text-muted-foreground">
                  Drop here
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
