import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Upload, Package,
  Tent, Settings, ChevronRight, Menu, ShieldCheck, LogOut,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/uploads", label: "Uploads", icon: Upload },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/shows", label: "Shows", icon: Tent },
  { href: "/settings", label: "Settings", icon: Settings },
];

const PAGE_TITLES: Record<string, string> = {
  "/":          "Dashboard",
  "/uploads":   "Uploads",
  "/inventory": "Inventory",
  "/shows":     "Shows",
  "/settings":  "Settings",
  "/admin":     "Admin",
};

/** True when running as an installed PWA (Add to Home Screen) */
const isStandalone =
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true);

function isActive(href: string, location: string) {
  return href === "/" ? location === "/" : location.startsWith(href);
}

function SideNavItem({
  href, label, icon: Icon, collapsed,
}: {
  href: string; label: string; icon: any; collapsed: boolean;
}) {
  const [location] = useLocation();
  const active = isActive(href, location);
  return (
    <Link href={href}>
      <a
        data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all",
          active
            ? "bg-primary/15 text-primary border border-primary/20"
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
          collapsed && "justify-center px-2"
        )}
      >
        <Icon size={18} className="shrink-0" />
        {!collapsed && <span>{label}</span>}
      </a>
    </Link>
  );
}

function BottomNavItem({
  href, label, icon: Icon,
}: {
  href: string; label: string; icon: any;
}) {
  const [location] = useLocation();
  const active = isActive(href, location);
  return (
    <Link href={href}>
      <a
        data-testid={`mobile-nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 py-2 px-1 flex-1 min-w-0 transition-colors",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Icon size={20} className="shrink-0" />
        <span
          className={cn(
            "text-[10px] font-medium leading-none truncate w-full text-center",
            active ? "text-primary" : "text-muted-foreground"
          )}
        >
          {label}
        </span>
      </a>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 1024
  );
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [location] = useLocation();
  const { signOut, user, isAdmin } = useAuth();

  const pageTitle = PAGE_TITLES[location] ?? "CardVault";
  const userInitial = user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <div
      className="flex h-dvh overflow-hidden bg-background"
      style={{ paddingTop: isStandalone ? "env(safe-area-inset-top)" : "0px" }}
    >
      {/* ── Sidebar (tablet+) ────────────────────────────────────────────── */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 transition-all duration-200 border-r",
          "border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-bg))]",
          collapsed ? "w-14" : "w-56"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2.5 px-4 py-4 border-b border-[hsl(var(--sidebar-border))]",
            collapsed && "justify-center px-2"
          )}
        >
          <svg viewBox="0 0 28 28" fill="none" className="shrink-0 w-7 h-7" aria-label="CardVault">
            <rect width="28" height="28" rx="6" fill="hsl(142 71% 45%)" />
            <rect x="5" y="7" width="12" height="16" rx="2" fill="hsl(224 20% 8%)" />
            <rect x="5" y="7" width="12" height="16" rx="2" stroke="hsl(142 71% 45% / 0.3)" strokeWidth="1" />
            <rect x="10" y="5" width="12" height="16" rx="2" fill="hsl(0 0% 10%)" stroke="hsl(142 71% 45% / 0.5)" strokeWidth="1" />
            <line x1="12" y1="10" x2="19" y2="10" stroke="hsl(142 71% 45%)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="13" x2="17" y2="13" stroke="hsl(142 71% 45% / 0.6)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {!collapsed && (
            <span className="font-semibold text-foreground text-sm tracking-tight">CardVault</span>
          )}
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {nav.map(item => (
            <SideNavItem key={item.href} {...item} collapsed={collapsed} />
          ))}
          {isAdmin && (
            <SideNavItem href="/admin" label="Admin" icon={ShieldCheck} collapsed={collapsed} />
          )}
        </nav>

        <div className="border-t border-[hsl(var(--sidebar-border))] px-2 py-2">
          {!collapsed && user && (
            <p className="text-[10px] text-muted-foreground truncate px-2 pb-1.5">{user.email}</p>
          )}
          <button
            data-testid="button-sign-out"
            onClick={() => signOut()}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors",
              "text-muted-foreground hover:text-foreground hover:bg-accent",
              collapsed && "justify-center px-2"
            )}
          >
            <LogOut size={15} className="shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>

        <button
          data-testid="sidebar-toggle"
          onClick={() => setCollapsed(c => !c)}
          className={cn(
            "flex items-center gap-2 px-3 py-3 border-t border-[hsl(var(--sidebar-border))]",
            "text-muted-foreground hover:text-foreground text-xs transition-colors",
            collapsed && "justify-center"
          )}
        >
          {collapsed ? (
            <ChevronRight size={16} />
          ) : (
            <><Menu size={16} /><span>Collapse</span></>
          )}
        </button>
      </aside>

      {/* ── Main column ───────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header
          className="md:hidden flex items-center gap-3 px-4 border-b border-border bg-[hsl(var(--sidebar-bg))] shrink-0"
          style={{
            paddingTop: isStandalone ? "8px" : "max(env(safe-area-inset-top), 12px)",
            paddingBottom: "12px",
          }}
        >
          <svg viewBox="0 0 28 28" fill="none" className="w-6 h-6 shrink-0" aria-label="CardVault">
            <rect width="28" height="28" rx="6" fill="hsl(142 71% 45%)" />
            <rect x="10" y="5" width="12" height="16" rx="2" fill="hsl(0 0% 10%)" stroke="hsl(142 71% 45% / 0.5)" strokeWidth="1" />
            <line x1="12" y1="10" x2="19" y2="10" stroke="hsl(142 71% 45%)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="13" x2="17" y2="13" stroke="hsl(142 71% 45% / 0.6)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="font-semibold text-foreground text-sm flex-1 truncate">{pageTitle}</span>

          {/* Avatar bubble */}
          <div className="relative">
            <button
              onClick={() => setAvatarOpen(o => !o)}
              className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-xs font-bold transition-colors hover:bg-primary/30"
              aria-label="User menu"
            >
              {userInitial}
            </button>
            {avatarOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAvatarOpen(false)} />
                <div className="absolute right-0 top-10 z-50 w-52 rounded-lg border border-border bg-card shadow-xl py-1">
                  {user && (
                    <p className="text-[11px] text-muted-foreground px-3 py-2 border-b border-border truncate">
                      {user.email}
                    </p>
                  )}
                  <Link href="/settings">
                    <a
                      onClick={() => setAvatarOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
                    >
                      <Settings size={14} />
                      Settings
                    </a>
                  </Link>
                  <button
                    data-testid="mobile-button-sign-out"
                    onClick={() => { signOut(); setAvatarOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
                  >
                    <LogOut size={14} />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Scrollable content — inner overflow-y triggers Chrome iOS toolbar auto-hide */}
        <main
          className="flex-1 overflow-y-auto md:pb-0"
          style={{
            WebkitOverflowScrolling: "touch",
            paddingBottom: "calc(56px + env(safe-area-inset-bottom) + 8px)",
          }}
        >
          <div className="p-4 md:p-6 max-w-screen-2xl mx-auto md:pb-0">
            {children}
          </div>
        </main>

        {/* ── Bottom nav (mobile only) ────────────────────────────────────── */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-[hsl(var(--sidebar-bg))]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Inner row: fixed 56px touch-target height, grows safe-area via nav padding */}
          <div className="flex items-stretch w-full min-h-[56px]">
            {nav.map(item => (
              <BottomNavItem key={item.href} {...item} />
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
