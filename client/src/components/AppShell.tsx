import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Upload, Package, Tag, RefreshCcw,
  Tent, Settings, ChevronRight, Menu, ShieldCheck, LogOut,
  MoreHorizontal, X
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

const ADMIN_EMAIL = "bonsaicollects@gmail.com";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/uploads", label: "Uploads", icon: Upload },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/new-labels", label: "New Labels", icon: Tag },
  { href: "/repricing", label: "Repricing", icon: RefreshCcw },
  { href: "/shows", label: "Shows", icon: Tent },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Primary tabs shown in the mobile bottom bar (always visible)
const mobileNavPrimary = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/new-labels", label: "Labels", icon: Tag },
  { href: "/repricing", label: "Repricing", icon: RefreshCcw },
];

// Secondary items shown inside the "More" drawer
const mobileNavSecondary = [
  { href: "/uploads", label: "Uploads", icon: Upload },
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
function BottomNavItem({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: any; onClick?: () => void }) {
  const [location] = useLocation();
  const active = isActive(href, location);
  return (
    <Link href={href}>
      <a
        data-testid={`mobile-nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
        onClick={onClick}
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
  const [moreOpen, setMoreOpen] = useState(false);
  const { signOut, user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL;

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
          {isAdmin && (
            <SideNavItem href="/admin" label="Admin" icon={ShieldCheck} collapsed={collapsed} />
          )}
        </nav>

        {/* Sign out + user info */}
        <div className={cn(
          "border-t border-[hsl(var(--sidebar-border))] px-2 py-2",
        )}>
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

        {/* ── Mobile bottom nav (4 primary + More) ────────────────────────── */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t border-border bg-[hsl(var(--sidebar-bg))]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {mobileNavPrimary.map(item => (
            <BottomNavItem key={item.href} {...item} />
          ))}
          {/* More button */}
          <button
            data-testid="mobile-nav-more"
            onClick={() => setMoreOpen(o => !o)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2 px-1 flex-1 min-w-0 transition-colors",
              moreOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MoreHorizontal size={20} className="shrink-0" />
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </nav>

        {/* ── Mobile "More" drawer ─────────────────────────────────────────── */}
        {moreOpen && (
          <div
            className="md:hidden fixed inset-0 z-40"
            onClick={() => setMoreOpen(false)}
          >
            <div
              className="absolute bottom-[57px] left-0 right-0 bg-[hsl(var(--sidebar-bg))] border-t border-border shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">More</span>
                <button onClick={() => setMoreOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              </div>

              {/* Secondary nav items */}
              <div className="px-2 py-2 space-y-0.5">
                {mobileNavSecondary.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href}>
                      <a
                        data-testid={`mobile-more-nav-${item.label.toLowerCase()}`}
                        onClick={() => setMoreOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <Icon size={18} className="shrink-0" />
                        <span>{item.label}</span>
                      </a>
                    </Link>
                  );
                })}

                {/* Admin — only for admin user */}
                {isAdmin && (
                  <Link href="/admin">
                    <a
                      data-testid="mobile-more-nav-admin"
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <ShieldCheck size={18} className="shrink-0" />
                      <span>Admin</span>
                    </a>
                  </Link>
                )}
              </div>

              {/* Sign out at the bottom of the drawer */}
              <div className="px-2 pb-3 pt-1 border-t border-border mt-1">
                {user && (
                  <p className="text-[10px] text-muted-foreground px-3 pt-2 pb-1 truncate">{user.email}</p>
                )}
                <button
                  data-testid="mobile-button-sign-out"
                  onClick={() => { signOut(); setMoreOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <LogOut size={18} className="shrink-0" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
