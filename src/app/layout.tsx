import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earth-Re · SLA Monitoring Dashboard",
  description:
    "Upload health-check CSVs, clean them in a stateless cloud function, persist to Supabase, and review SLA availability on a single-screen dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
