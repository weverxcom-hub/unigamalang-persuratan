import Image from "next/image";
import { cn } from "@/lib/utils";

interface UnigaLoaderProps {
  /** Diameter of the spinning ring + logo, in px. Default 64. */
  size?: number;
  /** Optional caption shown beneath the logo. */
  caption?: string;
  /** Stretch container to fill its parent and centre the loader. */
  fullPage?: boolean;
  className?: string;
}

/**
 * Branded loading indicator: UNIGA crest with a soft rotating ring around it.
 * Used for route transitions, dialog reloads, and any operation lasting more
 * than ~150ms so users immediately see the system is processing.
 */
export function UnigaLoader({
  size = 64,
  caption = "Memproses…",
  fullPage = false,
  className,
}: UnigaLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={caption}
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-muted-foreground",
        fullPage && "min-h-[40vh] w-full",
        className
      )}
    >
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <span
          aria-hidden
          className="absolute inset-0 animate-spin rounded-full border-[3px] border-primary/15 border-t-primary"
        />
        <span
          aria-hidden
          className="absolute inset-1 animate-pulse rounded-full bg-background"
        />
        <Image
          src="/logo-uniga.png"
          alt=""
          width={size}
          height={size}
          priority
          className="absolute inset-0 m-auto animate-pulse object-contain"
          style={{ width: size * 0.7, height: size * 0.7 }}
        />
      </div>
      {caption && (
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  );
}

/**
 * Compact inline spinner without caption — for buttons & small overlays.
 */
export function UnigaSpinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Memuat"
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-current/20 border-t-current align-[-2px]",
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}
