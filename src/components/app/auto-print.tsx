"use client";
import { useEffect } from "react";

/**
 * Triggers the browser print dialog once on mount. Used inside report/print
 * pages so users land directly in the print flow.
 */
export function AutoPrint() {
  useEffect(() => {
    const id = window.setTimeout(() => window.print(), 200);
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
