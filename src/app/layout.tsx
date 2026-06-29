import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShuttlePro — Badminton Tournament Platform",
  description: "Premium real-time badminton tournament management",
  manifest: "/manifest.json",
  themeColor: "#00ff88",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
