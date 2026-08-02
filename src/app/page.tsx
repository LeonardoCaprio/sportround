import Link from "next/link";
import { ArrowRight, Check, Radio, Shuffle, Trophy } from "lucide-react";

import { Brand } from "@/components/brand";
import { RecentSessions } from "@/components/recent-sessions";

export default function Home() {
  return (
    <div className="site-shell">
      <header className="topbar">
        <div className="container topbar-inner">
          <Brand />
          <Link className="button primary compact" href="/sessions/new">
            New session <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </header>

      <main>
        <section className="hero container">
          <div className="hero-copy">
            <p className="eyebrow">Badminton session workspace</p>
            <h1>Fair rounds.<br />Clear scores.</h1>
            <p className="hero-lead">
              Generate balanced lineups, run multiple courts, share live results, and make sure
              everybody gets a fair turn.
            </p>
            <div className="hero-actions">
              <Link className="button primary" href="/sessions/new">
                Create a session <ArrowRight size={18} aria-hidden />
              </Link>
              <span className="free-note"><Check size={16} aria-hidden /> Free local setup · no account required</span>
            </div>
          </div>
          <div className="hero-board" aria-label="SportRound capability overview">
            <div className="hero-board-head"><span>SESSION CONTROL</span><span className="live-dot">LIVE READY</span></div>
            <div className="feature-grid">
              <article><Shuffle aria-hidden /><strong>Balanced lineups</strong><span>Level, rest, and play count</span></article>
              <article><Radio aria-hidden /><strong>Shared live scores</strong><span>Host controls, viewers score</span></article>
              <article><Trophy aria-hidden /><strong>Useful standings</strong><span>3 points per win</span></article>
            </div>
          </div>
        </section>

        <section className="container recent-section">
          <div className="section-heading">
            <div><p className="eyebrow">Your browser</p><h2>Recent sessions</h2></div>
            <Link className="text-link" href="/sessions/new">Create another</Link>
          </div>
          <RecentSessions />
        </section>
      </main>

      <footer className="site-footer"><div className="container footer-inner"><Brand compact /><span>Built for fair office badminton.</span></div></footer>
    </div>
  );
}
