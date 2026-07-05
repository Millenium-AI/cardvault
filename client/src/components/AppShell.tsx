import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Upload, Package,
  Tent, Settings, ChevronRight, Menu, ShieldCheck, LogOut,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

const nav = [
  { href: "/",          label: "Dashboard", icon: LayoutDashboard },
  { href: "/uploads",   label: "Uploads",   icon: Upload          },
  { href: "/inventory", label: "Inventory", icon: Package         },
  { href: "/shows",     label: "Shows",     icon: Tent            },
  { href: "/settings",  label: "Settings",  icon: Settings        },
];

const PAGE_TITLES: Record<string, string> = {
  "/":          "Dashboard",
  "/uploads":   "Uploads",
  "/inventory": "Inventory",
  "/shows":     "Shows",
  "/settings":  "Settings",
  "/admin":     "Admin",
};

const isStandalone =
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true);

function isActive(href: string, location: string) {
  return href === "/" ? location === "/" : location.startsWith(href);
}

// ── Sidebar nav item (desktop) ───────────────────────────────────────────────
function SideNavItem({ href, label, icon: Icon, collapsed }: {
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

// ── Logo SVG ─────────────────────────────────────────────────────────────────
function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" style={{ width: size, height: size }} aria-label="CardVault">
      <rect width="28" height="28" rx="6" fill="hsl(142 71% 45%)" />
      <rect x="5" y="7" width="12" height="16" rx="2" fill="hsl(224 20% 8%)" />
      <rect x="5" y="7" width="12" height="16" rx="2" stroke="hsl(142 71% 45% / 0.3)" strokeWidth="1" />
      <rect x="10" y="5" width="12" height="16" rx="2" fill="hsl(0 0% 10%)" stroke="hsl(142 71% 45% / 0.5)" strokeWidth="1" />
      <line x1="12" y1="10" x2="19" y2="10" stroke="hsl(142 71% 45%)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="13" x2="17" y2="13" stroke="hsl(142 71% 45% / 0.6)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Mobile floating bottom nav item ──────────────────────────────────────────
function BottomNavItem({ href, label, icon: Icon }: { href: string; label: string; icon: any }) {
  const [location] = useLocation();
  const active = isActive(href, location);
  return (
    <Link href={href}>
      <a
        data-testid={`mobile-nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
        className="relative flex flex-col items-center justify-center flex-1 min-w-0 py-2 px-1 group"
      >
        {/* Active glow blob */}
        {active && (
          <span className="absolute inset-x-1 top-1 bottom-1 rounded-xl bg-primary/12 transition-all duration-300" />
        )}
        {/* Icon */}
        <span className={cn(
          "relative flex items-center justify-center w-7 h-7 rounded-xl transition-all duration-200",
          active
            ? "text-primary"
            : "text-muted-foreground group-active:text-foreground"
        )}>
          <Icon size={active ? 21 : 19} strokeWidth={active ? 2.2 : 1.8} className="transition-all duration-200" />
        </span>
        {/* Label */}
        <span className={cn(
          "relative text-[9.5px] font-semibold tracking-wide leading-none mt-0.5 transition-all duration-200",
          active ? "text-primary" : "text-muted-foreground/70"
        )}>
          {label}
        </span>
      </a>
    </Link>
  );
}

// ── AppShell ─────────────────────────────────────────────────────────────────
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
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <aside className={cn(
        "hidden md:flex flex-col shrink-0 transition-all duration-200 border-r",
        "border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-bg))]",
        collapsed ? "w-14" : "w-56"
      )}>
        <div className={cn(
          "flex items-center gap-2.5 px-4 py-4 border-b border-[hsl(var(--sidebar-border))]",
          collapsed && "justify-center px-2"
        )}>
          <Logo size={28} />
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
          {collapsed ? <ChevronRight size={16} /> : <><Menu size={16} /><span>Collapse</span></>}
        </button>
      </aside>

      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* ── Mobile header ────────────────────────────────────────────────
            Glass-morphism bar: blurred bg, subtle border, logo + wordmark    */}
        <header
          className="md:hidden shrink-0 flex items-center gap-3 px-4 border-b border-white/[0.06] bg-[hsl(var(--sidebar-bg))]/80 backdrop-blur-xl"
          style={{
            paddingTop: isStandalone ? "8px" : "max(env(safe-area-inset-top), 12px)",
            paddingBottom: "12px",
          }}
        >
          {/* Logo + wordmark */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Logo size={26} />
            <div className="flex flex-col leading-none min-w-0">
              <span className="text-[13px] font-bold tracking-tight text-foreground truncate">
                {pageTitle}
              </span>
              {pageTitle !== "CardVault" && (
                <span className="text-[9px] font-semibold tracking-widest uppercase text-primary/70 mt-px">
                  CardVault
                </span>
              )}
            </div>
          </div>

          {/* Avatar + dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setAvatarOpen(o => !o)}
              className="w-8 h-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center text-primary text-xs font-bold transition-all hover:bg-primary/25 hover:border-primary/40 active:scale-95"
              aria-label="User menu"
            >
              {userInitial}
            </button>
            {avatarOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAvatarOpen(false)} />
                <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/40 py-1 animate-in fade-in-0 slide-in-from-top-2 duration-150">
                  {user && (
                    <p className="text-[11px] text-muted-foreground px-3 py-2 border-b border-border/50 truncate">
                      {user.email}
                    </p>
                  )}
                  <Link href="/settings">
                    <a onClick={() => setAvatarOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-accent/60 transition-colors rounded-lg mx-1 mt-0.5">
                      <Settings size={14} className="text-muted-foreground" />
                      Settings
                    </a>
                  </Link>
                  <button
                    data-testid="mobile-button-sign-out"
                    onClick={() => { signOut(); setAvatarOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-accent/60 transition-colors rounded-lg mx-1 mb-0.5"
                  >
                    <LogOut size={14} className="text-muted-foreground" />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Scrollable content */}
        <main
          className="flex-1 overflow-y-auto"
          style={{
            WebkitOverflowScrolling: "touch",
            paddingBottom: "calc(76px + env(safe-area-inset-bottom))",
          }}
        >
          <div className="p-4 md:p-6 max-w-screen-2xl mx-auto md:pb-0">
            {children}
          </div>
        </main>

        {/* ── Floating pill bottom nav (mobile only) ───────────────────────
            Floats above content on a glassy pill, clear separation from edge */}
        <div
          className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
        >
          <nav
            className="pointer-events-auto flex items-stretch gap-1 px-3 rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/50"
            style={{
              background: "hsl(var(--sidebar-bg) / 0.88)",
              backdropFilter: "blur(24px) saturate(180%)",
              WebkitBackdropFilter: "blur(24px) saturate(180%)",
              height: 62,
            }}
          >
            {nav.map(item => (
              <BottomNavItem key={item.href} {...item} />
            ))}
          </nav>
        </div>

      </div>
    </div>
  );
}
