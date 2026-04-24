"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionPayload } from "@/lib/types";
import { LogOut, LayoutDashboard, FileStack, Hash, Building2, FileType } from "lucide-react";

interface NavbarProps {
  session: SessionPayload;
}

const BASE_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/archives", label: "Pengarsipan", icon: FileStack },
  { href: "/dashboard/generate", label: "Nomor Surat", icon: Hash },
];

const ADMIN_NAV = [
  { href: "/dashboard/units", label: "Unit", icon: Building2 },
  { href: "/dashboard/letter-types", label: "Jenis Surat", icon: FileType },
];

export function Navbar({ session }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const canManage = session.role === "SUPER_ADMIN";
  const nav = canManage ? [...BASE_NAV, ...ADMIN_NAV] : BASE_NAV;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" aria-label="Beranda unigamalang">
            <Logo size={36} />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-sm font-semibold leading-tight">{session.name}</div>
            <div className="text-xs text-muted-foreground leading-tight">
              {session.email} &middot; {roleLabel(session.role)}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Keluar
          </Button>
        </div>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto border-t px-2 py-2 md:hidden">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

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
