import { Suspense } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { RouteProgress } from "@/components/app/route-progress";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sistem Manajemen Persuratan — Universitas Gajayana",
  description:
    "Platform digital unigamalang untuk penomoran surat, pengarsipan, dan pelacakan dokumen Universitas Gajayana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={inter.className}>
        {/* Mounted at the root so the slim progress bar appears on every
            navigation/form submit — including login & register where the
            user previously perceived a 5-second hang while waiting for the
            session to be created. Suspense is required because RouteProgress
            uses usePathname/useSearchParams from the App Router. */}
        <Suspense fallback={null}>
          <RouteProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
