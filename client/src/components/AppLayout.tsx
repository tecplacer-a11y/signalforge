import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Send,
  Crosshair,
  SlidersHorizontal,
  PlayCircle,
  Settings,
  Moon,
  Sun,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoWordmark } from "@/components/Logo";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { RunPipelineButton } from "@/components/RunPipelineButton";
import { AddLeadButton } from "@/components/AddLeadDialog";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/outreach", label: "Outreach", icon: Send },
  { href: "/targeting", label: "Targeting", icon: Crosshair },
  { href: "/scoring", label: "Scoring", icon: SlidersHorizontal },
  { href: "/runs", label: "Pipeline Runs", icon: PlayCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  return (
    <nav className="flex-1 space-y-0.5 px-3 py-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? location === "/" : location.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            data-testid={`link-nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover-elevate",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:text-sidebar-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

// Workspace + sign-out footer, shown only when auth is enabled server-side.
function AccountFooter() {
  const { state, logout } = useAuth();
  if (state.status !== "authed" || !state.authEnabled) return null;
  return (
    <div className="px-1 space-y-1">
      <p className="truncate text-[11px] text-muted-foreground" title={state.user.email}>
        {state.org?.name || state.user.email}
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-muted-foreground"
        onClick={() => logout()}
        data-testid="button-logout"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { theme, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="grid h-full grid-cols-1 md:grid-cols-[256px_1fr]">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col border-r border-sidebar-border bg-sidebar overflow-y-auto [overscroll-behavior:contain]">
          <div className="flex h-14 items-center px-5 border-b border-sidebar-border">
            <LogoWordmark />
          </div>
          <NavLinks />
          <div className="px-3 pb-4 pt-2 border-t border-sidebar-border space-y-3">
            <RunPipelineButton className="w-full" />
            <AccountFooter />
            <p className="px-1 text-[11px] leading-snug text-muted-foreground">
              Icon Staff Labs · BD signal pipeline
            </p>
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setMobileOpen(false)}
              data-testid="overlay-mobile-nav"
            />
            <aside className="absolute left-0 top-0 h-full w-64 flex flex-col border-r border-sidebar-border bg-sidebar">
              <div className="flex h-14 items-center justify-between px-5 border-b border-sidebar-border">
                <LogoWordmark />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                  data-testid="button-close-nav"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <NavLinks onNavigate={() => setMobileOpen(false)} />
              <div className="px-3 pb-4 pt-2 border-t border-sidebar-border space-y-3">
                <RunPipelineButton className="w-full" />
                <AccountFooter />
              </div>
            </aside>
          </div>
        )}

        {/* Main column */}
        <div className="flex flex-col h-full overflow-hidden">
          <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sticky top-0 z-10">
            <div className="flex items-center gap-2 md:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(true)}
                data-testid="button-open-nav"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <LogoWordmark />
            </div>
            <div className="hidden md:block text-sm text-muted-foreground">
              Lead-signal intelligence
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:block">
                <AddLeadButton variant="outline" label="Add Lead" />
              </div>
              <div className="md:hidden">
                <AddLeadButton size="sm" variant="outline" label="Add" />
              </div>
              <div className="md:hidden">
                <RunPipelineButton size="sm" />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                aria-label="Toggle theme"
                data-testid="button-theme-toggle"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto [overscroll-behavior:contain] p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
