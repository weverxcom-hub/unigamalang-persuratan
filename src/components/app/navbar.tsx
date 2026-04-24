"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SessionPayload } from "@/lib/types";
import {
  LogOut,
  LayoutDashboard,
  FileStack,
  Hash,
  Building2,
  FileType,
  BookOpen,
  Menu,
  X,
} from "lucide-react";

interface NavbarProps {
  session: SessionPayload;
}

const BASE_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/archives", label: "Pengarsipan", icon: FileStack },
  { href: "/dashboard/generate", label: "Nomor Surat", icon: Hash },
  { href: "/dashboard/panduan", label: "Panduan", icon: BookOpen },
];

const ADMIN_NAV = [
  { href: "/dashboard/units", label: "Unit", icon: Building2 },
  { href: "/dashboard/letter-types", label: "Jenis Surat", icon: FileType },
];

export function Navbar({ session }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const canManage = session.role === "SUPER_ADMIN";
  const nav = canManage ? [...BASE_NAV, ...ADMIN_NAV] : BASE_NAV;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" aria-label="Beranda unigamalang">
            <Logo size={36} />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
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
        <div className="flex items-center gap-2">
          <div className="hidden text-right md:block">
            <div className="text-sm font-semibold leading-tight">{session.name}</div>
            <div className="text-xs text-muted-foreground leading-tight">
              {session.email} &middot; {roleLabel(session.role)}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="hidden sm:inline-flex">
            <LogOut className="h-4 w-4" />
            Keluar
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t bg-background lg:hidden">
          <div className="mx-auto max-w-7xl px-3 py-3 sm:px-6">
            <div className="mb-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-semibold leading-tight">{session.name}</p>
              <p className="text-xs text-muted-foreground">
                {session.email} · {roleLabel(session.role)}
              </p>
            </div>
            <nav className="flex flex-col gap-1">
              {nav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
                className="mt-2 w-full justify-center sm:hidden"
              >
                <LogOut className="h-4 w-4" />
                Keluar
              </Button>
            </nav>
          </div>
        </div>
      )}
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
