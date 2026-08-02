import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SportRound — Fair games, clear scores",
    template: "%s | SportRound",
  },
  description:
    "Plan balanced badminton rounds, run multiple courts, share live scores, and keep a fair leaderboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
