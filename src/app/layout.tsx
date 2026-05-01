import { Suspense } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { RouteProgress } from "@/components/app/route-progress";
import { ThemeProvider, themeInitScript } from "@/components/app/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sistem Manajemen Persuratan — Universitas Gajayana",
  description:
    "Platform digital unigamalang untuk penomoran surat, pengarsipan, dan pelacakan dokumen Universitas Gajayana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* Inline script runs sync before first paint to set the right theme
            class on <html> based on localStorage / system preference. Without
            this the page flashes light-mode for one frame before React
            hydrates and applies the user's saved preference. */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          {/* Mounted at the root so the slim progress bar appears on every
              navigation/form submit — including login & register where the
              user previously perceived a 5-second hang while waiting for the
              session to be created. Suspense is required because RouteProgress
              uses usePathname/useSearchParams from the App Router. */}
          <Suspense fallback={null}>
            <RouteProgress />
          </Suspense>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
