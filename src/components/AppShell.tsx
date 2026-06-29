// Minimal app chrome for the standalone Serenentra Superadmin console.
//
// Unlike the tenant portal, this app has a single surface (the superadmin
// dashboard), so there is no module sidebar — just a top bar, an auth guard
// that funnels everyone through /login, and the shared PageHeader / Stat
// primitives the dashboard renders.

import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ShieldCheck, LogOut } from "lucide-react";

import { useAuth, isAuthenticated } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";

export default function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);

  // Client-only mount flag so the auth redirect never runs during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Auth guard: unauthenticated users go to /login; authenticated users are
  // pushed off /login. Only platform admins belong here — non-admins are
  // bounced back to login (they have no tenant surface in this app).
  useEffect(() => {
    if (!mounted) return;
    if (!isAuthenticated() && path !== "/login") {
      navigate({ to: "/login" });
    } else if (isAuthenticated() && path === "/login") {
      navigate({ to: "/" });
    } else if (isAuthenticated() && user && !user.platform_admin) {
      // Not a superadmin — sign out and return to login.
      void signOut().then(() => navigate({ to: "/login" }));
    }
  }, [mounted, path, user, navigate, signOut]);

  // The login route renders its own full-screen layout — no app chrome.
  if (path === "/login") {
    return <Outlet />;
  }

  // Avoid flashing the shell before the client-side auth check resolves.
  if (!mounted || !isAuthenticated()) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="size-7 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <ShieldCheck className="size-4" />
            </span>
            Serenentra <span className="text-muted-foreground font-normal">Superadmin</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            {user && (
              <span className="hidden sm:inline text-sm text-muted-foreground">{user.email}</span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void signOut().then(() => navigate({ to: "/login" }))}
            >
              <LogOut className="size-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}

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
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "success" | "warning" | "info" | "destructive";
}) {
  const toneCls =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning-foreground"
        : tone === "destructive"
          ? "text-destructive"
          : tone === "info"
            ? "text-info"
            : "";
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold font-display mt-1 ${toneCls}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
