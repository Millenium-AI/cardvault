import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Upload, Package, Tag, RefreshCcw,
  Tent, Settings, ChevronRight, Menu
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/uploads", label: "Uploads", icon: Upload },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/new-labels", label: "New Labels", icon: Tag },
  { href: "/repricing", label: "Repricing", icon: RefreshCcw },
  { href: "/shows", label: "Shows", icon: Tent },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(href: string, location: string) {
  return href === "/" ? location === "/" : location.startsWith(href);
}

// ── Desktop sidebar nav item ──────────────────────────────────────────────────
function SideNavItem({ href, label, icon: Icon, collapsed }: { href: string; label: string; icon: any; collapsed: boolean }) {
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

// ── Mobile bottom nav item ────────────────────────────────────────────────────
function BottomNavItem({ href, label, icon: Icon }: { href: string; label: string; icon: any }) {
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
        <span className={cn("text-[10px] font-medium leading-none truncate w-full text-center", active ? "text-primary" : "text-muted-foreground")}>
          {label}
        </span>
      </a>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Desktop sidebar (hidden on mobile) ─────────────────────────────── */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 transition-all duration-200 border-r",
          "border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-bg))]",
          collapsed ? "w-14" : "w-56"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center gap-2.5 px-4 py-4 border-b border-[hsl(var(--sidebar-border))]",
          collapsed && "justify-center px-2"
        )}>
          <svg viewBox="0 0 28 28" fill="none" className="shrink-0 w-7 h-7" aria-label="CardVault">
            <rect width="28" height="28" rx="6" fill="hsl(142 71% 45%)" />
            <rect x="5" y="7" width="12" height="16" rx="2" fill="hsl(224 20% 8%)" />
            <rect x="5" y="7" width="12" height="16" rx="2" stroke="hsl(142 71% 45% / 0.3)" strokeWidth="1" />
            <rect x="10" y="5" width="12" height="16" rx="2" fill="hsl(0 0% 10%)" stroke="hsl(142 71% 45% / 0.5)" strokeWidth="1" />
            <line x1="12" y1="10" x2="19" y2="10" stroke="hsl(142 71% 45%)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="13" x2="17" y2="13" stroke="hsl(142 71% 45% / 0.6)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {!collapsed && <span className="font-semibold text-foreground text-sm tracking-tight">CardVault</span>}
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {nav.map(item => (
            <SideNavItem key={item.href} {...item} collapsed={collapsed} />
          ))}
        </nav>

        {/* Collapse toggle */}
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

      {/* ── Main content area ───────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-[hsl(var(--sidebar-bg))] shrink-0">
          <svg viewBox="0 0 28 28" fill="none" className="w-6 h-6 shrink-0" aria-label="CardVault">
            <rect width="28" height="28" rx="6" fill="hsl(142 71% 45%)" />
            <rect x="10" y="5" width="12" height="16" rx="2" fill="hsl(0 0% 10%)" stroke="hsl(142 71% 45% / 0.5)" strokeWidth="1" />
            <line x1="12" y1="10" x2="19" y2="10" stroke="hsl(142 71% 45%)" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="12" y1="13" x2="17" y2="13" stroke="hsl(142 71% 45% / 0.6)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="font-semibold text-foreground text-sm">CardVault</span>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>

        {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t border-border bg-[hsl(var(--sidebar-bg))]" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {nav.map(item => (
            <BottomNavItem key={item.href} {...item} />
          ))}
        </nav>
      </div>
    </div>
  );
}
