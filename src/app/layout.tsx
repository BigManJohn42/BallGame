import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BallGame — Serie A top 7 draw",
  description:
    "Draw a club from the Serie A top seven and climb the leaderboard on their real results across Serie A, the Champions League, Europa League, Conference League, Coppa Italia and the Supercoppa.",
};

export const viewport: Viewport = {
  themeColor: "#070b16",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
