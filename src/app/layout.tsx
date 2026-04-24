import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
      <body className={inter.className}>{children}</body>
    </html>
  );
}
