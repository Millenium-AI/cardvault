import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Upload, Package,
  Tent, Settings, ChevronRight, Menu, ShieldCheck, LogOut, User,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

// Bottom nav excludes Settings — that lives in the avatar dropdown
const bottomNav = [
  { href: "/",          label: "Dashboard", icon: LayoutDashboard },
  { href: "/uploads",   label: "Uploads",   icon: Upload          },
  { href: "/inventory", label: "Inventory", icon: Package         },
  { href: "/shows",     label: "Shows",     icon: Tent            },
];

// Full nav for desktop sidebar
const sideNav = [
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

const PAGE_SUBTITLES: Record<string, string> = {
  "/":          "Overview & analytics",
  "/uploads":   "Import card data",
  "/inventory": "Manage your collection",
  "/shows":     "Track card show events",
  "/settings":  "Account & preferences",
  "/admin":     "Admin controls",
};

const isStandalone =
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true);

function isActive(href: string, location: string) {
  return href === "/" ? location === "/" : location.startsWith(href);
}

// ── Logo SVG ──────────────────────────────────────────────────────────────────
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

// ── Desktop sidebar nav item ──────────────────────────────────────────────────
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
        {active && (
          <span className="absolute inset-x-1 top-1 bottom-1 rounded-xl bg-primary/12 transition-all duration-300" />
        )}
        <span className={cn(
          "relative flex items-center justify-center w-7 h-7 rounded-xl transition-all duration-200",
          active ? "text-primary" : "text-muted-foreground group-active:text-foreground"
        )}>
          <Icon size={active ? 21 : 19} strokeWidth={active ? 2.2 : 1.8} className="transition-all duration-200" />
        </span>
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

// ── Avatar dropdown — fixed-positioned so it never clips under the header ────
function AvatarMenu({
  user, isAdmin, avatarRef, onClose, onSignOut,
}: {
  user: any; isAdmin: boolean; avatarRef: React.RefObject<HTMLButtonElement>;
  onClose: () => void; onSignOut: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, right: 0 });

  // Calculate position from the avatar button's bounding rect
  useEffect(() => {
    if (!avatarRef.current) return;
    const r = avatarRef.current.getBoundingClientRect();
    setPos({
      top:   r.bottom + 8,
      right: window.innerWidth - r.right,
    });
  }, [avatarRef]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (avatarRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    // slight delay so the button's own onClick doesn't immediately re-close
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 10);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [avatarRef, onClose]);

  return (
    <div
      className="fixed z-[200] w-56 rounded-2xl border border-border/50 bg-card/95 backdrop-blur-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-150"
      style={{ top: pos.top, right: pos.right }}
    >
      {/* User identity */}
      {user && (
        <div className="px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <span className="text-primary text-sm font-bold">
                {user.email?.[0]?.toUpperCase() ?? "U"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">
                {user.email?.split("@")[0]}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Menu items */}
      <div className="py-1.5 px-1.5 space-y-0.5">
        <Link href="/settings">
          <a
            onClick={onClose}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-accent/60 active:bg-accent transition-colors"
          >
            <Settings size={14} className="text-muted-foreground shrink-0" />
            <span>Settings</span>
          </a>
        </Link>
        {isAdmin && (
          <Link href="/admin">
            <a
              onClick={onClose}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-accent/60 active:bg-accent transition-colors"
            >
              <ShieldCheck size={14} className="text-muted-foreground shrink-0" />
              <span>Admin</span>
            </a>
          </Link>
        )}
      </div>

      {/* Sign out — separated with a divider */}
      <div className="border-t border-border/40 py-1.5 px-1.5">
        <button
          data-testid="mobile-button-sign-out"
          onClick={onSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 active:bg-red-500/15 transition-colors"
        >
          <LogOut size={14} className="shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

// ── AppShell ─────────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 1024
  );
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [location] = useLocation();
  const { signOut, user, isAdmin } = useAuth();

  const pageTitle    = PAGE_TITLES[location]    ?? "CardVault";
  const pageSubtitle = PAGE_SUBTITLES[location] ?? "";
  const userInitial  = user?.email?.[0]?.toUpperCase() ?? "U";

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
          {sideNav.map(item => (
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

        {/* ── Mobile header ─────────────────────────────────────────────── */}
        <header
          className="md:hidden shrink-0 flex items-center px-4 gap-3 border-b border-white/[0.06]"
          style={{
            background: "hsl(var(--sidebar-bg) / 0.85)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            paddingTop:    isStandalone ? "10px" : "max(env(safe-area-inset-top), 14px)",
            paddingBottom: "14px",
          }}
        >
          {/* Left: logo mark + page identity */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Logo badge */}
            <div className="shrink-0 w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
              <Logo size={22} />
            </div>
            {/* Page title + sub-label */}
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold tracking-tight text-foreground leading-tight truncate">
                {pageTitle}
              </div>
              {pageSubtitle && (
                <div className="text-[10px] font-medium text-muted-foreground/70 leading-tight truncate mt-px">
                  {pageSubtitle}
                </div>
              )}
            </div>
          </div>

          {/* Right: avatar button */}
          <button
            ref={avatarRef}
            onClick={() => setAvatarOpen(o => !o)}
            className={cn(
              "shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all duration-150 active:scale-90",
              avatarOpen
                ? "bg-primary/30 border-primary/60 text-primary"
                : "bg-primary/15 border-primary/25 text-primary hover:bg-primary/25 hover:border-primary/40"
            )}
            aria-label="User menu"
            aria-expanded={avatarOpen}
          >
            {userInitial}
          </button>
        </header>

        {/* Avatar dropdown — rendered outside header so it layers correctly */}
        {avatarOpen && (
          <AvatarMenu
            user={user}
            isAdmin={isAdmin}
            avatarRef={avatarRef}
            onClose={() => setAvatarOpen(false)}
            onSignOut={() => { signOut(); setAvatarOpen(false); }}
          />
        )}

        {/* ── Scrollable content ─────────────────────────────────────────────── */}
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

        {/* ── Floating pill bottom nav (mobile, 4 items) ─────────────────────── */}
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
            {bottomNav.map(item => (
              <BottomNavItem key={item.href} {...item} />
            ))}
          </nav>
        </div>

      </div>
    </div>
  );
}
