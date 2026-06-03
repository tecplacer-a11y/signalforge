import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Users,
  Flame,
  ClipboardCheck,
  CalendarCheck,
  Send,
  Gauge,
  ArrowRight,
  Activity,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { PageHeader, KpiCard, CardSkeletonGrid, formatDate, relativeTime } from "@/components/common";
import { TierBadge, RunStatusBadge, ChannelBadge } from "@/components/badges";
import { RunPipelineButton } from "@/components/RunPipelineButton";
import { cssHsl, tierColor } from "@/lib/chartColors";
import type { DashboardData } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data, isLoading } = useQuery<DashboardData>({ queryKey: ["/api/dashboard"] });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Live view of the BD lead-signal pipeline."
        actions={<div className="hidden md:block"><RunPipelineButton /></div>}
      />

      {isLoading || !data ? (
        <div className="space-y-4">
          <CardSkeletonGrid count={6} />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <DashboardBody data={data} />
      )}
    </div>
  );
}

function DashboardBody({ data }: { data: DashboardData }) {
  const { totals } = data;

  const kpis = [
    { label: "Total Leads", value: totals.leads, icon: Users, accent: "primary" as const, testId: "kpi-leads" },
    { label: "Tier A", value: totals.tierA, icon: Flame, accent: "destructive" as const, hint: "Hot leads", testId: "kpi-tiera" },
    { label: "Review Queue", value: totals.reviewQueue, icon: ClipboardCheck, accent: "default" as const, hint: "Need enrichment", testId: "kpi-review" },
    { label: "Meetings", value: totals.meetings, icon: CalendarCheck, accent: "default" as const, hint: "Booked", testId: "kpi-meetings" },
    { label: "Active Outreach", value: totals.activeOutreach, icon: Send, accent: "default" as const, testId: "kpi-outreach" },
    { label: "Avg MEDDPICC", value: totals.avgScore, icon: Gauge, accent: "primary" as const, hint: "Across all leads", testId: "kpi-score" },
  ];

  const tierData = Object.entries(data.byTier).map(([name, value]) => ({ name, value }));
  const sliceData = Object.entries(data.bySlice).map(([name, value]) => ({ name, value }));
  const channelData = Object.entries(data.byChannel).map(([name, value]) => ({ name, value }));
  const statusData = Object.entries(data.byStatus).map(([name, value]) => ({ name, value }));

  const sliceColors = [cssHsl("--chart-1"), cssHsl("--chart-2"), cssHsl("--chart-3"), cssHsl("--chart-4"), cssHsl("--chart-5")];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold mb-1">Pipeline by stage</h2>
          <p className="text-xs text-muted-foreground mb-3">Lead count across {statusData.length} active {statusData.length === 1 ? "stage" : "stages"}</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} margin={{ top: 4, right: 8, left: -16, bottom: 50 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: cssHsl("--muted-foreground") }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  height={60}
                />
                <YAxis tick={{ fontSize: 11, fill: cssHsl("--muted-foreground") }} allowDecimals={false} />
                <RTooltip
                  contentStyle={tooltipStyle()}
                  cursor={{ fill: cssHsl("--muted"), opacity: 0.4 }}
                />
                <Bar dataKey="value" fill={cssHsl("--primary")} radius={[3, 3, 0, 0]} name="Leads" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-1">Tier distribution</h2>
          <p className="text-xs text-muted-foreground mb-2">A / B / C split</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tierData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={2}
                >
                  {tierData.map((d) => (
                    <Cell key={d.name} fill={tierColor(d.name)} />
                  ))}
                </Pie>
                <RTooltip contentStyle={tooltipStyle()} />
                <Legend
                  formatter={(v) => `Tier ${v}`}
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Slice + Channel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">ICP slice breakdown</h2>
          <div className="space-y-2.5">
            {sliceData.map((s, i) => {
              const total = sliceData.reduce((a, b) => a + b.value, 0) || 1;
              const pct = Math.round((s.value / total) * 100);
              return (
                <div key={s.name} data-testid={`slice-row-${s.name}`}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground tabular-nums">{s.value} · {pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: sliceColors[i % sliceColors.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">Channel breakdown</h2>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: cssHsl("--muted-foreground") }}
                  width={64}
                />
                <RTooltip contentStyle={tooltipStyle()} cursor={{ fill: cssHsl("--muted"), opacity: 0.4 }} />
                <Bar dataKey="value" fill={cssHsl("--chart-2")} radius={[0, 3, 3, 0]} name="Leads" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Hot leads + recent runs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-destructive" /> Hot Leads
            </h2>
            <Link href="/leads" className="text-xs text-primary hover:underline flex items-center gap-0.5" data-testid="link-all-leads">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.hotLeads.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No Tier A leads yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.hotLeads.map((l) => (
                <Link
                  key={l.leadId}
                  href={`/leads/${encodeURIComponent(l.leadId)}`}
                  className="block rounded-md border border-border p-2.5 hover-elevate"
                  data-testid={`hotlead-${l.leadId}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">
                          {l.firstName} {l.lastName}
                        </span>
                        <TierBadge tier={l.tier} />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {l.title} · {l.companyName}
                      </p>
                      {l.rationale && (
                        <p className="mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">
                          {l.rationale}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-primary">
                      {l.meddpiccScore}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-muted-foreground" /> Recent Pipeline Runs
            </h2>
            <Link href="/runs" className="text-xs text-primary hover:underline flex items-center gap-0.5" data-testid="link-all-runs">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 font-medium">Channel</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">Routed</th>
                  <th className="pb-2 font-medium text-right">A/B/C</th>
                  <th className="pb-2 font-medium text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRuns.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-0" data-testid={`run-row-${r.id}`}>
                    <td className="py-2"><ChannelBadge channel={r.channel as any} /></td>
                    <td className="py-2"><RunStatusBadge status={r.status} /></td>
                    <td className="py-2 text-right tabular-nums">{r.routed}</td>
                    <td className="py-2 text-right tabular-nums text-xs text-muted-foreground">
                      {r.tierA}/{r.tierB}/{r.tierC}
                    </td>
                    <td className="py-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(r.startedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function tooltipStyle(): React.CSSProperties {
  return {
    background: cssHsl("--popover"),
    border: `1px solid ${cssHsl("--border")}`,
    borderRadius: 8,
    fontSize: 12,
    color: cssHsl("--popover-foreground"),
  };
}
