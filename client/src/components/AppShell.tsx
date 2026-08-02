import { useLocation, Link } from "wouter";
import {
  LayoutDashboard, Package, Search,
  Tent, Settings, ChevronRight, Menu, ShieldCheck, LogOut, Sun, Moon, ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { useUserPrefs } from "@/lib/useUserPrefs";


const bottomNav = [
  { href: "/",             label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory",    label: "Inventory", icon: Package         },
  { href: "/transactions", label: "Txns",      icon: ArrowLeftRight  },
  { href: "/shows",        label: "Shows",     icon: Tent            },
  { href: "/search",       label: "Search",    icon: Search          },
];


const sideNav = [
  { href: "/",             label: "Dashboard",    icon: LayoutDashboard },
  { href: "/search",       label: "Search",       icon: Search          },
  { href: "/inventory",    label: "Inventory",    icon: Package         },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight  },
  { href: "/shows",        label: "Shows",        icon: Tent            },
  { href: "/settings",     label: "Settings",     icon: Settings        },
];


const PAGE_TITLES: Record<string, string> = {
  "/":             "Dashboard",
  "/search":       "Search",
  "/inventory":    "Inventory",
  "/transactions": "Transactions",
  "/shows":        "Shows",
  "/settings":     "Settings",
  "/admin":        "Admin",
};


const PAGE_SUBTITLES: Record<string, string> = {
  "/":             "Overview & analytics",
  "/search":       "Look up any card",
  "/inventory":    "Manage your collection",
  "/transactions": "Sales & trades",
  "/shows":        "Track card show events",
  "/settings":     "Account & preferences",
  "/admin":        "Admin controls",
};


function isActive(href: string, location: string) {
  return href === "/" ? location === "/" : location.startsWith(href);
}


function Logo({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/favicon.png"
      alt="CardVault"
      style={{ width: size, height: size }}
      className="object-contain rounded-md"
    />
  );
}


function SideNavItem({ href, label, icon: Icon, collapsed }: {
  href: string; label: string; icon: LucideIcon; collapsed: boolean;
}) {
  const [location] = useLocation();
  const active = isActive(href, location);
  return (
    <Link
      href={href}
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
    </Link>
  );
}


function BottomNavItem({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  const [location] = useLocation();
  const active = isActive(href, location);
  return (
    <Link
      href={href}
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
    </Link>
  );
}


function AvatarMenu({
  user, isAdmin, avatarRef, onClose, onSignOut,
}: {
  user: any; isAdmin: boolean; avatarRef: RefObject<HTMLButtonElement>; onClose: () => void; onSignOut: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const { theme, setTheme } = useUserPrefs();

  const recalcPos = useCallback(() => {
    if (!avatarRef.current) return;
    const r = avatarRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
  }, [avatarRef]);

  useEffect(() => {
    recalcPos();
    window.addEventListener("resize", recalcPos);
    return () => window.removeEventListener("resize", recalcPos);
  }, [recalcPos]);

  useEffect(() => {
    function handler(e: PointerEvent) {
      if (avatarRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    }

    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [avatarRef, onClose]);

  function goSettings() {
    onClose();
    navigate("/settings");
  }

  function goAdmin() {
    onClose();
    navigate("/admin");
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    onClose();
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] w-60 rounded-2xl border border-border/50 bg-card/95 backdrop-blur-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-150"
      style={{ top: pos.top, right: pos.right }}
    >
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

      <div className="py-1.5 px-1.5 space-y-0.5">
        <button
          onClick={goSettings}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-accent/60 active:bg-accent transition-colors w-full text-left"
        >
          <Settings size={14} className="text-muted-foreground shrink-0" />
          <span>Settings</span>
        </button>

        {isAdmin && (
          <button
            onClick={goAdmin}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-accent/60 active:bg-accent transition-colors w-full text-left"
          >
            <ShieldCheck size={14} className="text-muted-foreground shrink-0" />
            <span>Admin</span>
          </button>
        )}

        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-foreground hover:bg-accent/60 active:bg-accent transition-colors text-left"
        >
          {theme === "dark"
            ? <Sun size={14} className="text-muted-foreground shrink-0" />
            : <Moon size={14} className="text-muted-foreground shrink-0" />}
          <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">
            {theme === "dark" ? "OFF" : "ON"}
          </span>
        </button>
      </div>

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


export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const [location] = useLocation();
  const { signOut, user, isAdmin } = useAuth();
  const { theme, setTheme } = useUserPrefs();

  useEffect(() => {
    const body = document.body;
    if (!body) return;

    const observer = new MutationObserver(() => {
      setModalOpen(body.classList.contains("modal-open"));
    });

    observer.observe(body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const pageTitle    = PAGE_TITLES[location]    ?? "CardVault";
  const pageSubtitle = PAGE_SUBTITLES[location] ?? "";
  const userInitial  = user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="flex h-app overflow-hidden bg-background">
      {/* ── Desktop sidebar ───────────────────────────────────────────── */}
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
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors mb-1",
              "text-muted-foreground hover:text-foreground hover:bg-accent",
              collapsed && "justify-center px-2"
            )}
          >
            {theme === "dark"
              ? <Sun size={15} className="shrink-0" />
              : <Moon size={15} className="shrink-0" />}
            {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
          </button>
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


      {/* ── Main column ────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">


        {/* Mobile header */}
        <header
          className="md:hidden shrink-0 flex items-center px-4 gap-3 border-b border-white/[0.06]"
          style={{
            background: "hsl(var(--sidebar-bg))",
            paddingTop:    "calc(env(safe-area-inset-top) + 12px)",
            paddingBottom: "12px",
          }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center overflow-hidden">
              <Logo size={24} />
            </div>
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


        {/* Avatar dropdown — rendered inside the flex column so z-index stacks correctly */}
        {avatarOpen && (
          <AvatarMenu
            user={user}
            isAdmin={isAdmin}
            avatarRef={avatarRef}
            onClose={() => setAvatarOpen(false)}
            onSignOut={() => { signOut(); setAvatarOpen(false); }}
          />
        )}


        {/* Scrollable page content */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>


        {/* Bottom nav */}
        <nav
          className={cn(
            "md:hidden shrink-0 flex items-stretch",
            "border-t border-white/[0.08]",
            "transition-all duration-300",
            modalOpen ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
          style={{
            background: "hsl(var(--sidebar-bg))",
            paddingBottom: "env(safe-area-inset-bottom)",
            minHeight: "calc(62px + env(safe-area-inset-bottom))",
          }}
        >
          {bottomNav.map(item => (
            <BottomNavItem key={item.href} {...item} />
          ))}
        </nav>


      </div>
    </div>
  );
}
