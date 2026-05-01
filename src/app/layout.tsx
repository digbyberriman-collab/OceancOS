import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OceancOS",
  description: "Operational command centre for superyacht refit and new build projects.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
