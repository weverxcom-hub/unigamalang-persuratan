import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
}

export function Logo({ size = 40, className, showWordmark = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2 sm:gap-3", className)}>
      <Image
        src="/logo-uniga.png"
        alt="Lambang Universitas Gajayana Malang"
        width={size}
        height={size}
        priority
        className="shrink-0"
        style={{ width: size, height: size, objectFit: "contain" }}
      />
      {showWordmark && (
        <div className="flex flex-col leading-tight">
          <span className="text-xs sm:text-sm font-bold tracking-wide text-foreground">
            UNIVERSITAS GAJAYANA
          </span>
          <span className="hidden sm:block text-[11px] uppercase tracking-widest text-muted-foreground">
            Sistem Persuratan &middot; unigamalang
          </span>
        </div>
      )}
    </div>
  );
}
