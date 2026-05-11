"use client";

import { Button } from "@/components/ui/button";

export function SSOButton({ ssoUrl }: { ssoUrl: string }) {
  return (
    <a href={ssoUrl} className="block">
      <Button type="button" variant="outline" className="w-full">
        Masuk dengan UNIGA SSO
      </Button>
    </a>
  );
}
