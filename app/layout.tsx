import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rheo — Metered Security Firewall for AI Agents",
  description: "A metered security firewall for autonomous AI agents. Every web fetch is evaluated for prompt injection, priced dynamically, and settled via USDC nanopayments on Arc testnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>{children}</body>
    </html>
  );
}
