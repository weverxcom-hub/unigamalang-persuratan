"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <Button size="sm" variant="outline" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Cetak / Simpan PDF
    </Button>
  );
}
