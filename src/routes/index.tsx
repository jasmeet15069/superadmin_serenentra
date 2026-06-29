import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  Building2,
  Users2,
  Activity,
  HardDrive,
  Database,
  Gauge,
  Lock,
  GitBranch,
  Plus,
  Loader2,
  ArrowUpRight,
  CircleDot,
  Server,
  Cpu,
  Zap,
  RefreshCw,
} from "lucide-react";

import { PageHeader, Stat } from "@/components/AppShell";
import {
  usePlatformTenants,
  usePlatformPlans,
  useUpdateTenantPlan,
  useCreatePlatformTenant,
  usePlatformTenantFeatureMatrix,
  useUpdatePlatformTenantFeatureMatrix,
  usePlatformMonitoring,
  usePlatformTenantBackupConfig,
  useUpdatePlatformTenantBackupConfig,
  usePlatformSecurity,
} from "@/lib/api/hooks";
import type { PlatformTenant } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Serenentra Superadmin" }] }),
  component: Dashboard,
});

// Plan tier display metadata. Mirrors plan_catalog.go (basic/pro/premium).
const PLAN_META: Record<string, { label: string; tone: string }> = {
  basic: { label: "Basic", tone: "bg-muted text-muted-foreground" },
  pro: { label: "Pro", tone: "bg-info/15 text-info" },
  premium: { label: "Premium", tone: "bg-primary/15 text-primary" },
};

// The existing live hmsadmin deployment runs on the demo/default tenant. It is
// the platform's founding tenant, so it is pinned and surfaced as "Client 1".
const PRIMARY_TENANT_ID = "00000000-0000-0000-0000-000000000001";

function orderTenants(tenants: PlatformTenant[]): PlatformTenant[] {
  return [...tenants].sort((a, b) => {
    if (a.id === PRIMARY_TENANT_ID) return -1;
    if (b.id === PRIMARY_TENANT_ID) return 1;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
}

function Dashboard() {
  const tenantsQ = usePlatformTenants();
  const tenants = tenantsQ.data ?? [];
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Superadmin Control Center"
        description="Platform operations — fleet health, client lifecycle, plans, access, backups, monitoring & security across every tenant."
        actions={
          <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New Client
          </Button>
        }
      />

      <FleetStats tenants={tenants} loading={tenantsQ.isLoading} />

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview" className="gap-1.5"><Activity className="size-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="clients" className="gap-1.5"><Building2 className="size-3.5" /> Clients</TabsTrigger>
          <TabsTrigger value="access" className="gap-1.5"><Users2 className="size-3.5" /> Role-Feature Matrix</TabsTrigger>
          <TabsTrigger value="backups" className="gap-1.5"><HardDrive className="size-3.5" /> Backups</TabsTrigger>
          <TabsTrigger value="monitoring" className="gap-1.5"><Gauge className="size-3.5" /> Monitoring</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5"><Lock className="size-3.5" /> Security</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab tenants={tenants} loading={tenantsQ.isLoading} /></TabsContent>
        <TabsContent value="clients" className="mt-4"><ClientsTab tenants={tenants} loading={tenantsQ.isLoading} /></TabsContent>
        <TabsContent value="access" className="mt-4"><FeatureMatrixTab tenants={tenants} /></TabsContent>
        <TabsContent value="backups" className="mt-4"><BackupsTab tenants={tenants} /></TabsContent>
        <TabsContent value="monitoring" className="mt-4"><MonitoringTab /></TabsContent>
        <TabsContent value="security" className="mt-4"><SecurityTab /></TabsContent>
      </Tabs>

      <CreateClientDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function FleetStats({ tenants, loading }: { tenants: PlatformTenant[]; loading: boolean }) {
  const s = useMemo(() => {
    const active = tenants.filter((t) => t.is_active).length;
    const rooms = tenants.reduce((n, t) => n + (t.rooms_used || 0), 0);
    const users = tenants.reduce((n, t) => n + (t.users_used || 0), 0);
    const premium = tenants.filter((t) => t.plan_tier === "premium").length;
    return { total: tenants.length, active, suspended: tenants.length - active, rooms, users, premium };
  }, [tenants]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
      <Stat label="Clients" value={loading ? "—" : s.total} hint={`${s.active} active · ${s.suspended} suspended`} />
      <Stat label="Active" value={loading ? "—" : s.active} tone="success" />
      <Stat label="Suspended" value={loading ? "—" : s.suspended} tone={s.suspended ? "warning" : undefined} />
      <Stat label="Rooms Managed" value={loading ? "—" : s.rooms} />
      <Stat label="Staff Seats" value={loading ? "—" : s.users} />
      <Stat label="Premium Clients" value={loading ? "—" : s.premium} tone="info" />
    </div>
  );
}

function OverviewTab({ tenants, loading }: { tenants: PlatformTenant[]; loading: boolean }) {
  const dist = useMemo(() => {
    const d: Record<string, number> = { basic: 0, pro: 0, premium: 0 };
    for (const t of tenants) d[t.plan_tier] = (d[t.plan_tier] ?? 0) + 1;
    return d;
  }, [tenants]);
  const max = Math.max(1, ...Object.values(dist));

  const nearLimit = useMemo(
    () =>
      tenants.filter((t) => {
        const r = t.rooms_max ? t.rooms_used / t.rooms_max : 0;
        const u = t.users_max ? t.users_used / t.users_max : 0;
        return Math.max(r, u) >= 0.8;
      }),
    [tenants],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Plan Distribution" icon={<GitBranch className="size-4 text-primary" />}>
        {loading ? <Spinner /> : (
          <div className="space-y-3">
            {(["basic", "pro", "premium"] as const).map((p) => (
              <div key={p}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${PLAN_META[p].tone}`}>{PLAN_META[p].label}</span>
                  <span className="text-muted-foreground">{dist[p] ?? 0} clients</span>
                </div>
                <Progress value={((dist[p] ?? 0) / max) * 100} className="h-2" />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Approaching Plan Limits" icon={<Gauge className="size-4 text-warning-foreground" />}>
        {loading ? <Spinner /> : nearLimit.length === 0 ? (
          <Empty text="All clients comfortably within their plan limits." />
        ) : (
          <div className="space-y-2.5">
            {nearLimit.map((t) => {
              const rPct = t.rooms_max ? Math.round((t.rooms_used / t.rooms_max) * 100) : 0;
              const uPct = t.users_max ? Math.round((t.users_used / t.users_max) * 100) : 0;
              const pct = Math.max(rPct, uPct);
              return (
                <div key={t.id} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-32 truncate">{t.name}</span>
                  <Progress value={pct} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Infrastructure Snapshot" icon={<Database className="size-4 text-info" />} className="lg:col-span-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <MiniStat label="Isolated Databases" value={loading ? "—" : tenants.filter((t) => t.database_name).length} />
          <MiniStat label="Shared-mode Tenants" value={loading ? "—" : tenants.filter((t) => !t.database_name).length} />
          <MiniStat label="Redis Namespaces" value={loading ? "—" : tenants.length} hint="t:{id}:*" />
          <MiniStat label="Console" value="superadminhms" hint="172.105.41.151" />
        </div>
      </Panel>
    </div>
  );
}

function ClientsTab({ tenants, loading }: { tenants: PlatformTenant[]; loading: boolean }) {
  const plansQ = usePlatformPlans();
  const updatePlanM = useUpdateTenantPlan();
  const plans = plansQ.data ?? [];
  const ordered = useMemo(() => orderTenants(tenants), [tenants]);

  const changePlan = async (t: PlatformTenant, plan_tier: string) => {
    try {
      await updatePlanM.mutateAsync({ id: t.id, plan_tier });
      toast.success(`${t.name} moved to ${plan_tier}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update plan");
    }
  };
  const toggleActive = async (t: PlatformTenant, is_active: boolean) => {
    try {
      await updatePlanM.mutateAsync({ id: t.id, plan_tier: t.plan_tier, is_active });
      toast.success(`${t.name} ${is_active ? "activated" : "suspended"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    }
  };

  return (
    <Panel title="Client Tenants" icon={<ShieldCheck className="size-4 text-primary" />}>
      <div className="overflow-x-auto -mx-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">#</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Rooms</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Database</TableHead>
              <TableHead className="text-right">Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={7} className="text-center py-8"><Spinner /></TableCell></TableRow>}
            {!loading && ordered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-sm">No clients yet.</TableCell></TableRow>
            )}
            {ordered.map((t, i) => {
              const isPrimary = t.id === PRIMARY_TENANT_ID;
              return (
                <TableRow key={t.id} className={isPrimary ? "bg-primary/5" : undefined}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium tabular-nums">Client {i + 1}</span>
                      {isPrimary && <Badge variant="secondary" className="text-[10px] w-fit">Primary · hmsadmin</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-muted-foreground">{t.slug} · {t.currency ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={t.plan_tier} onValueChange={(v) => changePlan(t, v)}>
                      <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm">{t.rooms_used}{t.rooms_max ? ` / ${t.rooms_max}` : ""}</TableCell>
                  <TableCell className="text-sm">{t.users_used}{t.users_max ? ` / ${t.users_max}` : ""}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{t.database_name ?? "shared"}</TableCell>
                  <TableCell className="text-right">
                    <Switch checked={t.is_active} onCheckedChange={(v) => toggleActive(t, v)} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

// Live role × feature matrix editor. Pick a client + role, toggle which modules
// that role can access on that client, and save. Plan sets the ceiling; this
// sets what each role actually sees. Default-on: everything enabled until turned
// off. Enforced live by featureMatrixGate.
function FeatureMatrixTab({ tenants }: { tenants: PlatformTenant[] }) {
  const ordered = useMemo(() => orderTenants(tenants), [tenants]);
  const [clientId, setClientId] = useState<string>("");
  const [role, setRole] = useState<string>("receptionist");

  // Default the client selector to the primary tenant once tenants load.
  useEffect(() => {
    if (!clientId && ordered.length) setClientId(ordered[0].id);
  }, [ordered, clientId]);

  const matrixQ = usePlatformTenantFeatureMatrix(clientId || null);
  const updateM = useUpdatePlatformTenantFeatureMatrix();

  // Local editable copy of the selected role's feature flags.
  const [local, setLocal] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    if (matrixQ.data?.matrix?.[role]) setLocal({ ...matrixQ.data.matrix[role] });
    else setLocal(null);
  }, [matrixQ.data, role]);

  const registry = matrixQ.data?.registry ?? [];
  const roles = matrixQ.data?.roles ?? [];
  const groups = useMemo(() => {
    const g: Record<string, typeof registry> = {};
    for (const m of registry) (g[m.group] ??= []).push(m);
    return g;
  }, [registry]);

  const dirty = useMemo(() => {
    const base = matrixQ.data?.matrix?.[role];
    if (!base || !local) return false;
    return Object.keys(local).some((k) => local[k] !== base[k]);
  }, [local, matrixQ.data, role]);

  const clientName = ordered.find((t) => t.id === clientId)?.name ?? "client";

  const save = async () => {
    if (!local || !clientId) return;
    try {
      await updateM.mutateAsync({ id: clientId, matrix: { [role]: local } });
      toast.success(`Saved ${role} access for ${clientName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save matrix");
    }
  };

  return (
    <Panel
      title="Role-Feature Matrix"
      icon={<Users2 className="size-4 text-primary" />}
      action={
        <Button size="sm" className="gap-1.5" disabled={!dirty || updateM.isPending} onClick={save}>
          {updateM.isPending && <Loader2 className="size-3.5 animate-spin" />} Save
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground mb-4">
        Pick a client and role, then choose which modules that role can access — fully independent per client. Plan
        sets the ceiling; this sets what each role actually sees. Off = the API blocks it (403) for that role.
      </p>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Client</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent>
              {ordered.map((t, i) => (
                <SelectItem key={t.id} value={t.id}>Client {i + 1} · {t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {roles.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {matrixQ.isLoading || !local ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([group, mods]) => (
            <div key={group}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{group}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {mods.map((m) => (
                  <label key={m.key} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-accent/50">
                    <span className="truncate">{m.label}</span>
                    <Switch
                      checked={local[m.key] !== false}
                      onCheckedChange={(v) => setLocal((p) => ({ ...(p ?? {}), [m.key]: v }))}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <Badge variant="secondary">
              {Object.values(local).filter((v) => v !== false).length}/{registry.length} enabled
            </Badge>
            <span>for <span className="font-medium text-foreground">{role.replace(/_/g, " ")}</span> on {clientName}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

// Live per-client backup configuration. The policy (enable, cadence, destination,
// retention, encryption) persists via the backup-config API. The dump/upload
// execution engine is a later slice, so "Run now" is intentionally disabled.
const DEST_LABELS: Record<string, string> = {
  local: "Local / NAS", gdrive: "Google Drive", supabase: "Supabase Storage",
  s3: "AWS S3", r2: "Cloudflare R2", azure: "Azure Blob", dropbox: "Dropbox",
  mega: "Mega", b2: "Backblaze B2", ftp: "FTP", sftp: "SFTP", nas: "NAS", minio: "MinIO",
};

function BackupsTab({ tenants }: { tenants: PlatformTenant[] }) {
  const ordered = useMemo(() => orderTenants(tenants), [tenants]);
  const [clientId, setClientId] = useState<string>("");
  useEffect(() => { if (!clientId && ordered.length) setClientId(ordered[0].id); }, [ordered, clientId]);

  const cfgQ = usePlatformTenantBackupConfig(clientId || null);
  const updateM = useUpdatePlatformTenantBackupConfig();
  const destinations = cfgQ.data?.destinations ?? [];

  const [local, setLocal] = useState<Record<string, any> | null>(null);
  useEffect(() => { if (cfgQ.data?.config) setLocal({ ...cfgQ.data.config }); }, [cfgQ.data]);

  const clientName = ordered.find((t) => t.id === clientId)?.name ?? "client";
  const set = (k: string, v: unknown) => setLocal((p: Record<string, unknown>) => ({ ...(p ?? {}), [k]: v }));

  const dirty = useMemo(() => {
    const base = cfgQ.data?.config;
    if (!base || !local) return false;
    return ["enabled", "cron_expr", "destination", "retention_days", "encrypt", "notify_email"].some((k) => local[k] !== (base as unknown as Record<string, unknown>)[k]);
  }, [local, cfgQ.data]);

  const save = async () => {
    if (!local || !clientId) return;
    try {
      await updateM.mutateAsync({ id: clientId, config: {
        enabled: local.enabled, cron_expr: local.cron_expr, destination: local.destination,
        retention_days: Number(local.retention_days), encrypt: local.encrypt, notify_email: local.notify_email ?? "",
      } });
      toast.success(`Backup policy saved for ${clientName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save backup config");
    }
  };

  return (
    <Panel
      title="Backup Center"
      icon={<HardDrive className="size-4 text-success" />}
      action={
        <Button size="sm" className="gap-1.5" disabled={!dirty || updateM.isPending} onClick={save}>
          {updateM.isPending && <Loader2 className="size-3.5 animate-spin" />} Save policy
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground mb-4">
        Per-client backup policy — cadence, destination, retention &amp; encryption. Nothing hardcoded; each client
        configures its own. The dump → encrypt → upload <span className="font-medium text-foreground">execution engine</span> is the next slice.
      </p>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="space-y-1.5">
          <Label className="text-xs">Client</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="h-9 w-[240px]"><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent>
              {ordered.map((t, i) => <SelectItem key={t.id} value={t.id}>Client {i + 1} · {t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {cfgQ.isLoading || !local ? <Spinner /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl">
          <label className="flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-sm sm:col-span-2">
            <span><span className="font-medium">Automated backups</span><span className="block text-xs text-muted-foreground">enable scheduled backups for this client</span></span>
            <Switch checked={!!local.enabled} onCheckedChange={(v) => set("enabled", v)} />
          </label>

          <div className="space-y-1.5">
            <Label className="text-xs">Destination</Label>
            <Select value={local.destination} onValueChange={(v) => set("destination", v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {destinations.map((d) => <SelectItem key={d} value={d}>{DEST_LABELS[d] ?? d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Schedule (cron)</Label>
            <Input value={local.cron_expr} onChange={(e) => set("cron_expr", e.target.value)} placeholder="0 3 * * *" className="font-mono" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Retention (days)</Label>
            <Input type="number" min={1} value={local.retention_days} onChange={(e) => set("retention_days", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notify email (optional)</Label>
            <Input type="email" value={local.notify_email ?? ""} onChange={(e) => set("notify_email", e.target.value)} placeholder="ops@client.com" />
          </div>

          <label className="flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-sm sm:col-span-2">
            <span><span className="font-medium">Encrypt backups</span><span className="block text-xs text-muted-foreground">AES encryption before upload</span></span>
            <Switch checked={!!local.encrypt} onCheckedChange={(v) => set("encrypt", v)} />
          </label>

          <div className="sm:col-span-2 flex items-center gap-2">
            <Button variant="outline" size="sm" disabled className="gap-1.5">
              <HardDrive className="size-3.5" /> Run backup now
            </Button>
            <span className="text-xs text-muted-foreground">execution engine ships next slice</span>
          </div>
        </div>
      )}
      <NextStep text="Next: backup_jobs table + pg_dump→gzip→encrypt→upload runner + cron scheduler + history & restore." />
    </Panel>
  );
}

// Live monitoring — polls GET /api/platform/monitoring every 10s and renders a
// real platform-health snapshot (Postgres, Redis, worker pool, Go runtime).
function MonitoringTab() {
  const q = usePlatformMonitoring();
  const d = q.data;

  const fmtUptime = (s?: number) => {
    if (!s && s !== 0) return "—";
    const dd = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (dd > 0) return `${dd}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };
  const mb = (v?: number) => (v == null ? "—" : `${v.toFixed(1)} MB`);

  if (q.isLoading || !d) {
    return <Panel title="Live Monitoring" icon={<Gauge className="size-4 text-info" />}><Spinner /></Panel>;
  }

  return (
    <div className="space-y-4">
      {/* Service status strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ServiceCard label="API" icon={<Server className="size-4" />} up status="up"
          detail={`v${d.app.version} · up ${fmtUptime(d.app.uptime_seconds)}`} />
        <ServiceCard label="PostgreSQL" icon={<Database className="size-4" />} status={d.postgres.status}
          detail={d.postgres.status === "up" ? `v${d.postgres.version ?? "?"} · ${d.postgres.ping_ms ?? 0}ms` : "unreachable"} />
        <ServiceCard label="Redis" icon={<Zap className="size-4" />} status={d.redis.status}
          detail={d.redis.status === "up" ? `${d.redis.ping_ms ?? 0}ms · ${d.redis.connected_clients ?? 0} clients` : "unreachable"} />
        <ServiceCard label="Worker Pool" icon={<Cpu className="size-4" />} status={d.workers.status}
          detail={`${d.workers.queued ?? 0} queued · ${d.workers.completed ?? 0} done`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="PostgreSQL" icon={<Database className="size-4 text-info" />}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MiniStat label="DB Size" value={mb(d.postgres.db_size_mb)} />
            <MiniStat label="Active Conns" value={d.postgres.active_connections ?? "—"} />
            <MiniStat label="Ping" value={`${d.postgres.ping_ms ?? 0} ms`} />
            <MiniStat label="Pool Acquired" value={`${d.postgres.pool?.acquired ?? 0}/${d.postgres.pool?.max ?? 0}`} />
            <MiniStat label="Pool Idle" value={d.postgres.pool?.idle ?? "—"} />
            <MiniStat label="Acquired Total" value={d.postgres.pool?.acquired_total ?? "—"} />
          </div>
        </Panel>

        <Panel title="Redis" icon={<Zap className="size-4 text-warning-foreground" />}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MiniStat label="Memory" value={mb(d.redis.used_memory_mb)} />
            <MiniStat label="Clients" value={d.redis.connected_clients ?? "—"} />
            <MiniStat label="Hit Rate" value={d.redis.hit_rate_pct != null ? `${d.redis.hit_rate_pct}%` : "—"} />
            <MiniStat label="Ops/sec" value={d.redis.ops_per_sec ?? "—"} />
            <MiniStat label="Uptime" value={fmtUptime(d.redis.uptime_seconds)} />
            <MiniStat label="Ping" value={`${d.redis.ping_ms ?? 0} ms`} />
          </div>
        </Panel>

        <Panel title="Go Runtime" icon={<Cpu className="size-4 text-primary" />}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MiniStat label="Goroutines" value={d.runtime.goroutines} />
            <MiniStat label="CPUs" value={d.runtime.num_cpu} />
            <MiniStat label="Mem Alloc" value={mb(d.runtime.mem_alloc_mb)} />
            <MiniStat label="Mem Sys" value={mb(d.runtime.mem_sys_mb)} />
            <MiniStat label="GC Runs" value={d.runtime.gc_runs} />
            <MiniStat label="Go" value={d.runtime.go_version.replace("go", "")} />
          </div>
        </Panel>

        <Panel title="Worker Pool" icon={<Server className="size-4 text-success" />}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <MiniStat label="Queued" value={d.workers.queued ?? "—"} />
            <MiniStat label="Submitted" value={d.workers.submitted ?? "—"} />
            <MiniStat label="Completed" value={d.workers.completed ?? "—"} />
            <MiniStat label="Failed" value={d.workers.failed ?? "—"} />
            <MiniStat label="Dropped" value={d.workers.dropped ?? "—"} />
          </div>
        </Panel>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw className={`size-3 ${q.isFetching ? "animate-spin" : ""}`} />
        Auto-refreshing every 10s · last updated {new Date(d.generated_at).toLocaleTimeString()}
      </div>
    </div>
  );
}

function ServiceCard({ label, icon, status, detail }: { label: string; icon: React.ReactNode; status: "up" | "down" | string; up?: boolean; detail: string }) {
  const ok = status === "up";
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">{icon}{label}</div>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${ok ? "text-success" : "text-destructive"}`}>
          <span className={`size-2 rounded-full ${ok ? "bg-success" : "bg-destructive"}`} />
          {ok ? "Operational" : "Down"}
        </span>
      </div>
      <div className="text-xs text-muted-foreground mt-2">{detail}</div>
    </div>
  );
}

// Live security overview — real platform operators + configured controls from
// GET /api/platform/security, plus the hardening roadmap for not-yet-enabled items.
function SecurityTab() {
  const q = usePlatformSecurity();
  const d = q.data;

  if (q.isLoading || !d) {
    return <Panel title="Security" icon={<ShieldCheck className="size-4 text-success" />}><Spinner /></Panel>;
  }

  const c = d.controls;
  const live = [
    `JWT — access ${c.access_token_ttl_minutes}m / refresh ${c.refresh_token_ttl_hours}h`,
    `bcrypt cost ${c.bcrypt_cost}`,
    `Per-client rate limit — ${c.rate_limit_per_min.basic}/${c.rate_limit_per_min.pro}/${c.rate_limit_per_min.premium} per min`,
    `Per-IP DoS guard — ${c.global_ip_limit_per_min}/min`,
    c.tls ? "TLS (HTTPS) enforced" : null,
    c.cors_allowlist ? "CORS allow-list" : null,
  ].filter(Boolean) as string[];

  const planned: [string, boolean][] = [
    ["2FA / MFA (TOTP)", c.mfa_enabled],
    ["Refresh-token rotation", c.refresh_rotation_enabled],
    ["IP allow-list (per client)", c.ip_allowlist_enabled],
    ["Password policy", false],
    ["Session & device management", false],
    ["CAPTCHA on auth", false],
    ["Secret rotation / Vault", false],
    ["Threat detection", false],
    ["Audit log (all admin actions)", false],
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Platform Operators" value={d.operators.length} tone="info" />
        <Stat label="Total Accounts" value={d.user_count} />
        <Stat label="MFA" value={c.mfa_enabled ? "On" : "Off"} tone={c.mfa_enabled ? "success" : "warning"} />
        <Stat label="TLS" value={c.tls ? "Enforced" : "Off"} tone={c.tls ? "success" : "destructive"} />
      </div>

      <Panel title="Platform Operators" icon={<Users2 className="size-4 text-primary" />}>
        <p className="text-sm text-muted-foreground mb-3">Accounts that can sign in to this superadmin console.</p>
        <Table>
          <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Roles</TableHead><TableHead>Since</TableHead></TableRow></TableHeader>
          <TableBody>
            {d.operators.map((o) => (
              <TableRow key={o.email}>
                <TableCell className="font-medium">{o.email}</TableCell>
                <TableCell className="text-sm">{o.full_name || "—"}</TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{o.roles.map((r) => <Badge key={r} variant="secondary" className="text-[10px]">{r.replace(/_/g, " ")}</Badge>)}</div></TableCell>
                <TableCell className="text-sm text-muted-foreground">{o.created_at}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Active Controls" icon={<ShieldCheck className="size-4 text-success" />}>
          <div className="space-y-2">
            {live.map((s) => <div key={s} className="flex items-center gap-2 text-sm"><CircleDot className="size-3 text-success" /> {s}</div>)}
          </div>
        </Panel>
        <Panel title="Hardening Roadmap" icon={<Lock className="size-4 text-warning-foreground" />} action={<PhaseBadge phase="6" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {planned.map(([s, on]) => (
              <div key={s} className={`flex items-center gap-2 text-sm ${on ? "" : "text-muted-foreground"}`}>
                <CircleDot className={`size-3 ${on ? "text-success" : ""}`} /> {s}{on ? "" : ""}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create-client dialog — provisions an isolated tenant via /api/platform.
// ---------------------------------------------------------------------------
const blankCreate = { name: "", slug: "", plan_tier: "basic", country: "", currency: "USD" };

function CreateClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const plansQ = usePlatformPlans();
  const createM = useCreatePlatformTenant();
  const plans = plansQ.data ?? [];
  const [form, setForm] = useState(blankCreate);
  const set = (k: keyof typeof blankCreate, v: string) => setForm({ ...form, [k]: v });

  useEffect(() => { if (!open) setForm(blankCreate); }, [open]);

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Client name is required");
    try {
      await createM.mutateAsync({
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        plan_tier: form.plan_tier,
        country: form.country.trim() || undefined,
        currency: form.currency.trim() || undefined,
      } as never);
      toast.success(`Client "${form.name.trim()}" provisioned`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create client");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="size-4" /> Provision New Client</DialogTitle>
          <DialogDescription>Creates an isolated hotel tenant on the platform.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Client / Hotel name *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Seaside Resort" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto from name" />
            </div>
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <Select value={form.plan_tier} onValueChange={(v) => set("plan_tier", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="IN" />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={3} placeholder="USD" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createM.isPending} className="gap-1.5">
            {createM.isPending && <Loader2 className="size-4 animate-spin" />} Provision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Presentational helpers.
// ---------------------------------------------------------------------------
function Panel({
  title, icon, action, children, className = "",
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-card border rounded-lg ${className}`}>
      <div className="px-4 py-3 border-b flex items-center gap-2">
        {icon}
        <span className="font-medium text-sm">{title}</span>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold font-display mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{hint}</div>}
    </div>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  return (
    <Badge variant="outline" className="gap-1 text-[11px]">
      <ArrowUpRight className="size-3" /> Build plan · Phase {phase}
    </Badge>
  );
}

function Spinner() {
  return <div className="py-6 flex justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
}
function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-4 text-center">{text}</p>;
}
function NextStep({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-md bg-muted/40 border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Next:</span> {text}
    </div>
  );
}
