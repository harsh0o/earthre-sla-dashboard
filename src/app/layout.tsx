import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Earth-Re · SLA Monitoring Dashboard",
  description:
    "Upload health-check CSVs, clean them in a stateless cloud function, persist to Supabase, and review SLA availability on a single-screen dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.variable} ${jetbrains.variable} min-h-full`}>{children}</body>
    </html>
  );
}
