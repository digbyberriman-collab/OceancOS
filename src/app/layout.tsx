import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: {
    default: "OceancOS — Superyacht Refit & New Build Command Centre",
    template: "%s · OceancOS",
  },
  description:
    "The operational command centre for superyacht refit, new build and conversion projects. Change orders, approvals, budgets, schedule and crew — in one calm, auditable workspace.",
  keywords: [
    "superyacht refit software",
    "yacht project management",
    "new build command centre",
    "change order management",
    "shipyard project controls",
  ],
  openGraph: {
    title: "OceancOS — Superyacht Refit & New Build Command Centre",
    description:
      "One auditable workspace for change orders, approvals, budgets, schedule and crew across every vessel and project.",
    type: "website",
    siteName: "OceancOS",
  },
};

export const viewport: Viewport = {
  themeColor: "#060912",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
