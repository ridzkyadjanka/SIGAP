import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/client/toaster";

export const metadata: Metadata = {
  title: { default: "SIGAP — Sistem Informasi Gerak dan Penugasan", template: "%s · SIGAP" },
  description:
    "Sistem manajemen operasional & tenaga kerja pertambangan: manpower, roster, penugasan unit, cuti periodik, dan laporan.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#14213D", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
