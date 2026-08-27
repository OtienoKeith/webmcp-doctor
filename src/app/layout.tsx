import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebMCP Doctor — Agent Experience Diagnostics",
  description: "Audit, trace, repair, and compare the agent experience of WebMCP-enabled websites.",
  keywords: ["WebMCP", "MCP", "agent experience", "AI agents", "developer tools"],
  applicationName: "WebMCP Doctor",
  openGraph: {
    title: "WebMCP Doctor",
    description: "The agent-experience diagnostic lab for the web.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
