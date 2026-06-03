import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShieldAlert, Plus, UserPlus, KeyRound, Plug2, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader, TableSkeleton } from "@/components/common";
import { Providers } from "@/components/Providers";
import { IntakeSources } from "@/components/IntakeSources";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Integration, User } from "@/lib/types";

function parseMeta(s: string): Record<string, any> {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

export default function Settings() {
  return (
    <div>
      <PageHeader title="Settings" description="Integrations, pluggable providers, and team access." />

      <SecurityNote />

      <section className="mt-6">
        <h2 className="text-base font-semibold mb-1">Integrations</h2>
        <p className="text-sm text-muted-foreground mb-3">Connected accounts powering the pipeline.</p>
        <IntegrationsList />
      </section>

      <section className="mt-8">
        <div className="flex items-center gap-1.5 mb-1">
          <Plug2 className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Pluggable Providers</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
          Swap vendors per category. One provider is active per category and is what the pipeline uses.
          Enrichment and CRM/tracking are fully swappable.
        </p>
        <Providers />
      </section>

      <section className="mt-8">
        <div className="flex items-center gap-1.5 mb-1">
          <Inbox className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Intake Sources</h2>
        </div>
        <IntakeSources />
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold mb-1">Team & Sharing</h2>
        <p className="text-sm text-muted-foreground mb-3">Invite partners and colleagues. Roles control access.</p>
        <TeamList />
      </section>
    </div>
  );
}

function SecurityNote() {
  return (
    <Card className="border-amber-500/40 bg-amber-500/10 p-3.5" data-testid="note-security">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Security</p>
          <p className="text-xs text-amber-700/90 dark:text-amber-300/90 mt-0.5">
            Secrets are stored as environment variables, never in code.{" "}
            <span className="font-semibold">Rotate the Hunter key that was exposed in the original n8n export.</span>
          </p>
        </div>
      </div>
    </Card>
  );
}

function IntegrationsList() {
  const { toast } = useToast();
  const { data: integrations, isLoading } = useQuery<Integration[]>({ queryKey: ["/api/integrations"] });

  const toggle = useMutation({
    mutationFn: async ({ key, connected }: { key: string; connected: boolean }) =>
      apiRequest("PATCH", `/api/integrations/${key}`, { connected }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/integrations"] }); },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <TableSkeleton rows={4} />;

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {(integrations ?? []).map((it) => {
        const meta = parseMeta(it.meta);
        const metaPairs = Object.entries(meta);
        return (
          <Card key={it.key} className="p-4" data-testid={`card-integration-${it.key}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate">{it.label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <KeyRound className="h-3 w-3" /> <code className="font-mono">{it.envVar}</code>
                </p>
              </div>
              <Switch
                checked={it.connected}
                onCheckedChange={(v) => toggle.mutate({ key: it.key, connected: v })}
                data-testid={`switch-integration-${it.key}`}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium",
                it.connected ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", it.connected ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                {it.connected ? "Connected" : "Disconnected"}
              </span>
            </div>
            {metaPairs.length > 0 && (
              <div className="mt-2 space-y-0.5 border-t border-border pt-2">
                {metaPairs.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                    <span className="font-mono truncate max-w-[60%] text-right">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function TeamList() {
  const { toast } = useToast();
  const { data: users, isLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");

  const invite = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/users", { name, email, role }),
    onSuccess: () => {
      setOpen(false); setName(""); setEmail(""); setRole("member");
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Invitation sent" });
    },
    onError: (e: Error) => toast({ title: "Invite failed", description: e.message, variant: "destructive" }),
  });

  const roleColor: Record<string, string> = {
    admin: "bg-destructive/15 text-destructive border-destructive/30",
    member: "bg-primary/15 text-primary border-primary/30",
    viewer: "bg-muted text-muted-foreground border-border",
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-sm font-medium">{(users ?? []).length} members</span>
        <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)} data-testid="button-invite">
          <UserPlus className="h-4 w-4" /> Invite
        </Button>
      </div>
      {isLoading ? (
        <div className="p-3"><TableSkeleton rows={3} /></div>
      ) : (
        <div className="divide-y divide-border">
          {(users ?? []).map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 p-3" data-testid={`row-user-${u.id}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                  {u.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
              </div>
              <Badge variant="outline" className={cn("capitalize shrink-0", roleColor[u.role])}>{u.role}</Badge>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-1.5"><Plus className="h-4 w-4" /> Invite a teammate</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" data-testid="input-invite-name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" data-testid="input-invite-email" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger data-testid="select-invite-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin — full control</SelectItem>
                  <SelectItem value="member">Member — can edit</SelectItem>
                  <SelectItem value="viewer">Viewer — read only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => invite.mutate()} disabled={!name.trim() || !email.trim() || invite.isPending} data-testid="button-confirm-invite">
              {invite.isPending ? "Inviting…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
