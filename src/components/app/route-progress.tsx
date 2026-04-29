"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Slim top progress bar that animates whenever the user navigates between
 * App-Router pages. We can't directly observe Next's internal navigation
 * events, so we trigger the bar from any anchor / form submit click and
 * dismiss it the moment the new pathname or search params resolve.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);

  // Stop the bar as soon as the route key changes (page rendered).
  useEffect(() => {
    setProgress((p) => (p > 0 ? 100 : p));
    const t = window.setTimeout(() => setProgress(0), 220);
    return () => window.clearTimeout(t);
  }, [pathname, search]);

  // Listen for clicks/submits and start the animation. We auto-cap at 90%
  // so the bar never reaches 100 before the route actually resolves.
  useEffect(() => {
    function start() {
      if (timerRef.current) window.clearInterval(timerRef.current);
      setProgress(8);
      timerRef.current = window.setInterval(() => {
        setProgress((p) => {
          if (p >= 90) return p;
          // Ease-out: bigger jumps early, smaller jumps near the end.
          return Math.min(90, p + (90 - p) * 0.08 + 1);
        });
      }, 120);
    }
    function onClick(e: MouseEvent) {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      // External links / new-tab don't trigger client-side nav.
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return;
        }
      } catch {
        return;
      }
      start();
    }
    function onSubmit() {
      start();
    }
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit, true);
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  // Cleanup interval whenever progress hits 100 / resets to 0.
  useEffect(() => {
    if (progress === 0 || progress === 100) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [progress]);

  if (progress <= 0) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_var(--tw-shadow-color)] shadow-primary/60 transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
