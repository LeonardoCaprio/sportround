import Link from "next/link";
import { Zap } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`brand ${compact ? "brand-compact" : ""}`} href="/" aria-label="SportRound home">
      <span className="brand-mark"><Zap size={compact ? 13 : 17} aria-hidden /></span>
      <span>SportRound</span>
    </Link>
  );
}
