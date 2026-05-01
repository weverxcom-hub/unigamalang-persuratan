"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Tiny client-only wrapper so report pages (server components) can include
 *  a print trigger without converting the entire page to a client component. */
export function PrintButtonInner() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
    >
      <Printer className="h-4 w-4" />
      Cetak
    </Button>
  );
}
