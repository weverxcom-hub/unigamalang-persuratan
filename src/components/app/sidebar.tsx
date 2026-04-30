"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileStack,
  Hash,
  BookOpen,
  Building2,
  FileType,
  History,
  Users,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Settings,
  UserCog,
  Send,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionPayload } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/archives", label: "Pengarsipan", icon: FileStack },
  { href: "/dashboard/generate", label: "Nomor Surat", icon: Hash },
  { href: "/dashboard/dispositions", label: "Disposisi", icon: Send },
  { href: "/dashboard/panduan", label: "Panduan", icon: BookOpen },
];

const ACCOUNT_NAV: NavItem[] = [
  { href: "/dashboard/profile", label: "Profil Saya", icon: UserCog },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard/users", label: "Akun Pengguna", icon: Users },
  { href: "/dashboard/units", label: "Unit", icon: Building2 },
  { href: "/dashboard/letter-types", label: "Jenis Surat", icon: FileType },
  { href: "/dashboard/audit", label: "Audit Log", icon: History },
];

const COLLAPSED_KEY = "uniga.sidebar.collapsed";

function roleLabel(role: SessionPayload["role"]) {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "ADMIN_UNIT":
      return "Admin Unit";
    case "USER":
      return "Pengguna";
  }
}

function isItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export function DashboardShell({
  session,
  children,
}: {
  session: SessionPayload;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const canManage = session.role === "SUPER_ADMIN";

  // Load persisted collapsed state once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_KEY);
      if (raw === "1") setCollapsed(true);
    } catch {
      // ignore — non-critical
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const sidebarWidth = collapsed ? "lg:w-[68px]" : "lg:w-64";

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-background transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:transition-[width]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          sidebarWidth
        )}
        aria-label="Navigasi utama"
      >
        <SidebarHeader collapsed={collapsed} onClose={() => setMobileOpen(false)} />
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <SidebarSection collapsed={collapsed} items={PRIMARY_NAV} onNavigate={() => setMobileOpen(false)} />
          <SidebarSection
            title="Akun"
            icon={UserCog}
            collapsed={collapsed}
            items={ACCOUNT_NAV}
            onNavigate={() => setMobileOpen(false)}
          />
          {canManage && (
            <SidebarSection
              title="Pengaturan"
              icon={Settings}
              collapsed={collapsed}
              items={ADMIN_NAV}
              onNavigate={() => setMobileOpen(false)}
            />
          )}
        </nav>
        <SidebarFooter
          session={session}
          collapsed={collapsed}
          onLogout={handleLogout}
          onToggleCollapse={toggleCollapsed}
        />
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label="Buka menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden text-sm text-muted-foreground lg:block">
            {/* breadcrumb placeholder; pages can render their own headings */}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight">{session.name}</p>
              <p className="text-xs text-muted-foreground leading-tight">
                {roleLabel(session.role)}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              aria-label="Keluar"
              className="hidden sm:inline-flex"
            >
              <LogOut className="h-4 w-4" />
              Keluar
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleLogout}
              aria-label="Keluar"
              className="sm:hidden"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarHeader({ collapsed, onClose }: { collapsed: boolean; onClose: () => void }) {
  return (
    <div className="flex h-14 items-center gap-2 border-b px-3">
      <Link
        href="/dashboard"
        className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
        aria-label="Beranda Sistem Persuratan Universitas Gajayana"
      >
        <Logo size={32} showWordmark={false} />
        {!collapsed && (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold tracking-tight">
              Universitas Gajayana
            </span>
            <span className="truncate text-[11px] uppercase tracking-widest text-muted-foreground">
              Sistem Persuratan
            </span>
          </span>
        )}
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Tutup menu"
        onClick={onClose}
      >
        <X className="h-5 w-5" />
      </Button>
    </div>
  );
}

function SidebarSection({
  title,
  icon: SectionIcon,
  collapsed,
  items,
  onNavigate,
}: {
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
  collapsed: boolean;
  items: NavItem[];
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="mb-2">
      {title && !collapsed && (
        <div className="mt-3 flex items-center gap-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {SectionIcon && <SectionIcon className="h-3.5 w-3.5" />}
          {title}
        </div>
      )}
      {title && collapsed && (
        <div className="my-2 mx-2 border-t" aria-hidden />
      )}
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-2",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SidebarFooter({
  session,
  collapsed,
  onLogout,
  onToggleCollapse,
}: {
  session: SessionPayload;
  collapsed: boolean;
  onLogout: () => void;
  onToggleCollapse: () => void;
}) {
  return (
    <div className="mt-auto border-t">
      {!collapsed && (
        <div className="px-3 py-3">
          <p className="truncate text-sm font-semibold leading-tight">{session.name}</p>
          <p className="truncate text-xs text-muted-foreground">{session.email}</p>
          <p className="text-xs text-muted-foreground">{roleLabel(session.role)}</p>
        </div>
      )}
      <div className={cn("flex items-center gap-2 p-2", collapsed && "flex-col")}>
        {!collapsed && (
          <Button variant="outline" size="sm" className="flex-1" onClick={onLogout}>
            <LogOut className="h-4 w-4" />
            Keluar
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Lebarkan menu" : "Ciutkan menu"}
          className="hidden lg:inline-flex"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
