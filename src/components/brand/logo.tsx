import { cn } from "@/lib/utils";

interface LogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
}

/**
 * Placeholder logo for Universitas Gajayana (Unigamalang).
 * Designed as an inline SVG so it renders without external assets.
 */
export function Logo({ size = 40, className, showWordmark = true }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className="relative flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <svg
          viewBox="0 0 40 40"
          width={size * 0.7}
          height={size * 0.7}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M8 14l12-6 12 6-12 6-12-6z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            className="text-primary-foreground"
          />
          <path
            d="M12 18v6c0 2 3.5 4 8 4s8-2 8-4v-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            className="text-primary-foreground"
          />
          <circle cx="32" cy="14.5" r="1.2" fill="currentColor" className="text-primary-foreground" />
          <path
            d="M32 15v6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="text-primary-foreground"
          />
        </svg>
      </div>
      {showWordmark && (
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-wide text-foreground">UNIVERSITAS GAJAYANA</span>
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Sistem Persuratan &middot; unigamalang
          </span>
        </div>
      )}
    </div>
  );
}
