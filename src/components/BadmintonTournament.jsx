import { useState, useEffect, useRef } from "react";
import LiveScoringScreen from "./LiveScoringScreen";

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
// Palette: #0a0a0f (void), #111118 (surface), #1a1a2e (card), #16213e (elevated)
// Accent: #00ff88 (neon green), #00cc6a (green dark), #ff6b35 (orange alert)
// Type: "Orbitron" display/numerals, "Open Sans" body, "JetBrains Mono" data
// Signature: stacked card depth treatment on live matches,
//   animated shuttle trail on live scores
// Single fixed dark theme — no light/dark toggle.
// ─────────────────────────────────────────────────────────────────────────────

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Open+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
`;

// ─── INITIAL DATA ─────────────────────────────────────────────────────────────
// Hoisted to module scope (not recreated every render) — fixes
// tab buttons feeling unstable since the array reference is now stable.
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "🏠" },
  { id: "matches", label: "Matches", icon: "🏸" },
  { id: "bracket", label: "Bracket", icon: "🏆" },
  { id: "teams", label: "Teams", icon: "👥" },
  { id: "notify", label: "Notify", icon: "🔔", adminOnly: true },
  { id: "admin", label: "Admin", icon: "⚙️", adminOnly: true },
];

const INITIAL_TEAMS = [
  { id: 1, name: "Storm Eagles", players: ["Arjun K", "Manu R"], logo: "🦅", color: "#ff6b35" },
  { id: 2, name: "Thunder Hawks", players: ["Vikram S", "Rahul M"], logo: "🦅", color: "#737373" },
  { id: 3, name: "Neon Vipers", players: ["Suresh P", "Kiran T"], logo: "🐍", color: "#a855f7" },
  { id: 4, name: "Iron Smash", players: ["Dev A", "Ravi B"], logo: "⚡", color: "#3b82f6" },
  { id: 5, name: "Blaze Rackets", players: ["Sam J", "Alex W"], logo: "🔥", color: "#ef4444" },
  { id: 6, name: "Cosmic Aces", players: ["Leo P", "Max K"], logo: "🌟", color: "#f59e0b" },
  { id: 7, name: "Shadow Nets", players: ["Rony D", "Shiv M"], logo: "🕶️", color: "#6366f1" },
  { id: 8, name: "Gold Smashers", players: ["Tian C", "Wei L"], logo: "🥇", color: "#eab308" },
];

function generateGroups(teams) {
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  const groupSize = Math.ceil(shuffled.length / 2);
  return {
    A: shuffled.slice(0, groupSize),
    B: shuffled.slice(groupSize),
  };
}

// ── GLOBAL UNIQUE ID COUNTER ──────────────────────────────
// Date.now() alone caused duplicate IDs when two groups generated
// fixtures in the same millisecond, which made starting one match
// also mark a same-ID match in the other group as "live".
let __idCounter = 1;
function nextId() {
  return `m-${Date.now()}-${__idCounter++}`;
}

// ════════════════════════════════════════════════════════════
//  SLOT-BASED FIXTURE SCHEDULER
// ════════════════════════════════════════════════════════════
//  FIXTURE SCHEDULER (simplified — no courts, no slots)
// ════════════════════════════════════════════════════════════
// Produces a single ordered queue of matches. There is no court
// assignment and no "slot" concept exposed anywhere in the UI —
// matches are just shown one after another in play order.
//
// Internally, every match still carries a numeric `order` field
// purely so the rest-gap rule can be enforced (a team must sit
// out at least REST_GAP matches before playing again) and so the
// queue always renders in a stable, predictable sequence. This
// number is never displayed to the user as "Slot N" or anything
// resembling scheduling UI — it's an implementation detail.
//
// Validation guaranteed by this scheduler:
//   - a team is never the team1/team2 of two matches that could
//     run at the same time (no court concept means "at the same
//     time" reduces to: a team can't be in back-to-back order
//     positions with no gap)
//   - every team gets a minimum rest gap before reappearing
//   - matches are produced in a balanced order automatically
// ════════════════════════════════════════════════════════════

const REST_GAP = 2; // order_n - lastPlayedOrder must be >= this before a team can play again

/**
 * Builds every unique pairing for a group (round-robin pairs).
 */
function buildPairings(groupTeams, group) {
  const pairings = [];
  for (let i = 0; i < groupTeams.length; i++) {
    for (let j = i + 1; j < groupTeams.length; j++) {
      pairings.push({ team1: groupTeams[i], team2: groupTeams[j], group });
    }
  }
  return pairings;
}

/**
 * Orders a flat list of pending pairings (across all groups) into
 * a single match queue, respecting the rest-gap rule and avoiding
 * placing a team into two matches that would be "live" back to back
 * with no breathing room.
 *
 * Algorithm (greedy):
 *   1. Track lastPlayedOrder per team (seeded from already-completed
 *      matches so the rest gap carries over correctly on regeneration).
 *   2. Walk the remaining pairing queue. A pairing can take the next
 *      order position if both teams currently satisfy the rest gap.
 *   3. If nothing in the queue currently satisfies the gap, advance
 *      the order counter anyway (treat it as an implicit "breather"
 *      position) and try again — this can never infinite-loop because
 *      the safety counter bounds total iterations.
 */
function scheduleMatches(pairings, startOrder = 0, lastPlayedOrderByTeam = {}) {
  const scheduled = [];
  const lastPlayed = { ...lastPlayedOrderByTeam };
  const queue = [...pairings];
  let order = startOrder;
  let safetyCounter = 0;
  const maxSafetyLoops = (pairings.length + 1) * 6 + 50;

  while (queue.length > 0 && safetyCounter < maxSafetyLoops) {
    safetyCounter++;
    let placed = false;

    for (let qi = 0; qi < queue.length; qi++) {
      const pairing = queue[qi];
      const { team1, team2 } = pairing;

      const t1Last = lastPlayed[team1.id];
      const t2Last = lastPlayed[team2.id];
      const t1RestOk = t1Last === undefined || order - t1Last >= REST_GAP;
      const t2RestOk = t2Last === undefined || order - t2Last >= REST_GAP;

      if (t1RestOk && t2RestOk) {
        scheduled.push({ ...pairing, order });
        lastPlayed[team1.id] = order;
        lastPlayed[team2.id] = order;
        queue.splice(qi, 1);
        placed = true;
        break; // one match per order position — keeps the queue simple and sequential
      }
    }

    order++; // always advance, whether or not we placed a match this round
    if (!placed && safetyCounter > pairings.length * 4) {
      // Nothing fits even with breathing room — relax the gap so we
      // never get stuck with leftover pairings that can't be scheduled.
      const pairing = queue.shift();
      if (pairing) {
        scheduled.push({ ...pairing, order });
        lastPlayed[pairing.team1.id] = order;
        lastPlayed[pairing.team2.id] = order;
      }
    }
  }

  return { matches: scheduled, lastPlayedOrderByTeam: lastPlayed, nextOrder: order };
}

function calcStandings(teams, matches) {
  const map = {};
  teams.forEach((t) => {
    map[t.id] = { team: t, W: 0, L: 0, PF: 0, PA: 0, PD: 0, pts: 0 };
  });
  matches.forEach((m) => {
    if (m.status !== "completed") return;
    const s1 = m.score1 ?? 0, s2 = m.score2 ?? 0;
    if (map[m.team1.id]) {
      map[m.team1.id].PF += s1; map[m.team1.id].PA += s2; map[m.team1.id].PD += s1 - s2;
      if (s1 > s2) { map[m.team1.id].W++; map[m.team1.id].pts += 2; } else { map[m.team1.id].L++; }
    }
    if (map[m.team2.id]) {
      map[m.team2.id].PF += s2; map[m.team2.id].PA += s1; map[m.team2.id].PD += s2 - s1;
      if (s2 > s1) { map[m.team2.id].W++; map[m.team2.id].pts += 2; } else { map[m.team2.id].L++; }
    }
  });
  return Object.values(map).sort((a, b) => b.pts - a.pts || b.PD - a.PD);
}

// ─── ICONS ───────────────────────────────────────────────────────────────────
const Icon = {
  shuttle: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L8 8l-6 2 6 2 4 6 4-6 6-2-6-2z" />
    </svg>
  ),
  trophy: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4" />
      <path d="M4 5h16v4a8 8 0 0 1-8 8 8 8 0 0 1-8-8V5z" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  ),
  users: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  calendar: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  settings: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M4.93 19.07l1.41-1.41M19.07 19.07l-1.41-1.41M2 12h2M20 12h2M12 2v2M12 20v2" />
    </svg>
  ),
  play: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
  share: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  plus: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  x: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = `
${FONTS}
/* ════════════════════════════════════════════════════════════
   THEME — single fixed dark palette (no light/dark toggle).
   Kept as CSS custom properties for easy tweaking later, but
   there is only one value per token now — no [data-theme]
   override block.
   ════════════════════════════════════════════════════════════ */
:root {
  --bg: #0a0a0f;
  --surface: #111118;
  --card-bg: rgba(26,26,46,0.8);
  --card-bg-solid: rgba(17,17,24,0.9);
  --card-border: rgba(255,255,255,0.06);
  --card-border-hover: rgba(0,255,136,0.2);
  --elevated: #16213e;

  --text-primary: #e2e8f0;
  --text-strong: #ffffff;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --text-faint: #475569;
  --text-ghost: #334155;

  --nav-bg: rgba(17,17,24,0.95);
  --input-bg: rgba(17,17,24,0.9);
  --overlay-bg: rgba(0,0,0,0.8);
  --code-bg: rgba(0,0,0,0.4);
  --hover-tint: rgba(255,255,255,0.05);
  --hover-tint-strong: rgba(255,255,255,0.1);
  --divider: rgba(255,255,255,0.06);
  --divider-strong: rgba(255,255,255,0.1);
  --skeleton: rgba(255,255,255,0.04);

  --accent: #00ff88;
  --accent-dark: #00cc6a;
  --accent-text-on: #0a0a0f;
  --shadow-color: rgba(0,0,0,0.4);

  color-scheme: dark;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text-primary); font-family: 'Open Sans', sans-serif; }

.app { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); }

/* NAV */
.nav { display: flex; align-items: center; justify-content: space-between; padding: 0 24px; height: 64px;
  background: var(--nav-bg); border-bottom: 1px solid rgba(0,255,136,0.15);
  position: sticky; top: 0; z-index: 100; backdrop-filter: blur(12px); }
.nav-brand { display: flex; align-items: center; gap: 10px; }
.nav-logo { font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 900; color: var(--accent);
  letter-spacing: 2px; text-transform: uppercase; }
.nav-sub { font-size: 11px; color: rgba(0,255,136,0.5); letter-spacing: 3px; font-weight: 500; }
.nav-tabs { display: flex; gap: 2px; }
.nav-tab { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: none;
  background: transparent; color: var(--text-secondary); cursor: pointer; font-family: 'Open Sans', sans-serif;
  font-size: 14px; font-weight: 600; letter-spacing: 0.5px; transition: all 0.2s; }
.nav-tab:hover { background: rgba(0,255,136,0.08); color: var(--accent); }
.nav-tab.active { background: rgba(0,255,136,0.12); color: var(--accent); }
.nav-tab svg { opacity: 0.8; }
.live-pill { display: flex; align-items: center; gap: 6px; background: rgba(255,107,53,0.15);
  border: 1px solid rgba(255,107,53,0.4); border-radius: 20px; padding: 4px 10px; font-size: 11px;
  color: #ff6b35; font-weight: 700; letter-spacing: 1px; font-family: 'Orbitron', sans-serif; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: #ff6b35; animation: pulse 1.2s infinite; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

/* HERO */
.hero { padding: 48px 24px 36px; position: relative; overflow: hidden; }
.hero::before { content: ''; position: absolute; inset: 0;
  background-image: url('/images/hero-smash.jpg');
  background-size: cover; background-position: 78% 8%; background-repeat: no-repeat; }
.hero::after { content: ''; position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,255,136,0.1) 0%, transparent 70%),
    linear-gradient(180deg, rgba(10,10,15,0.55) 0%, rgba(10,10,15,0.88) 55%, var(--bg) 100%); }
.hero > *{ position: relative; z-index: 1; }
.hero-label { font-size: 11px; letter-spacing: 4px; color: var(--accent); font-weight: 600;
  text-transform: uppercase; margin-bottom: 10px; font-family: 'Orbitron', sans-serif; }
.hero-title { font-family: 'Orbitron', sans-serif; font-size: clamp(28px,5vw,52px); font-weight: 900;
  color: var(--text-strong); line-height: 1.1; margin-bottom: 8px; }
.hero-title span { color: var(--accent); }
.hero-sub { color: var(--text-muted); font-size: 16px; font-weight: 400; margin-bottom: 28px; }
.hero-stats { display: flex; gap: 32px; flex-wrap: wrap; }
.hero-stat { text-align: center; }
.hero-stat-val { font-family: 'Orbitron', sans-serif; font-size: 28px; font-weight: 700; color: var(--accent); }
.hero-stat-lbl { font-size: 11px; color: var(--text-faint); letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }

/* CONTENT */
.content { padding: 0 24px 48px; max-width: 1280px; margin: 0 auto; width: 100%; }

/* SECTION */
.section-title { font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 700; color: var(--accent);
  letter-spacing: 3px; text-transform: uppercase; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
.section-title::after { content: ''; flex: 1; height: 1px; background: rgba(0,255,136,0.15); }

/* CARDS */
.card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 16px;
  padding: 20px; backdrop-filter: blur(8px); transition: border-color 0.2s, background-color 0.35s; min-width: 0; overflow-x: auto;
  box-shadow: 0 1px 2px var(--shadow-color); }
.card:hover { border-color: var(--card-border-hover); }
.card-grid { display: grid; gap: 16px; min-width: 0; }
.card-grid-2 { grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr)); }
.card-grid-3 { grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); }

/* MATCH CARD */
.match-card { background: var(--card-bg-solid); border: 1px solid var(--card-border); border-radius: 16px;
  padding: 20px; position: relative; overflow: hidden; transition: all 0.25s; cursor: pointer;
  box-shadow: 0 1px 2px var(--shadow-color); }
.match-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, #00ff88, transparent); opacity: 0; transition: opacity 0.2s; }
.match-card:hover::before { opacity: 1; }
.match-card:hover { border-color: rgba(0,255,136,0.25); transform: translateY(-1px); }
/* Signature: live matches get a stacked-card depth treatment —
   descending-transparency layers in the brand accent peeking out
   behind the card, echoing the source color palette rather than
   a generic glow. */
.match-card.live {
  border-color: rgba(255,107,53,0.35);
  box-shadow:
    0 1px 2px var(--shadow-color),
    0 6px 0 -4px rgba(0,255,136,0.2),
    0 11px 0 -8px rgba(0,255,136,0.12);
}
.match-card.live::before { opacity: 1; background: linear-gradient(90deg, transparent, #ff6b35, transparent); }
.match-card.paused { border-color: rgba(234,179,8,0.3); }
.match-card.paused::before { opacity: 1; background: linear-gradient(90deg, transparent, #facc15, transparent); }
.match-card.completed { border-color: rgba(100,116,139,0.3); opacity: 0.8; }
.match-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.match-stage { font-size: 10px; letter-spacing: 2px; color: var(--text-faint); font-weight: 600; text-transform: uppercase; font-family: 'Orbitron', sans-serif; }
.match-teams { display: flex; align-items: center; gap: 12px; }
.team-info { flex: 1; }
.team-name { font-size: 15px; font-weight: 700; color: var(--text-primary); letter-spacing: 0.3px; }
.team-players { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
.score-block { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 64px; }
.score-display { font-family: 'Orbitron', sans-serif; font-size: 22px; font-weight: 700; color: var(--text-strong); text-align: center; letter-spacing: 1px; }
.score-sep { width: 1px; height: 28px; background: var(--divider-strong); }
.vs-badge { font-family: 'Orbitron', sans-serif; font-size: 10px; color: var(--text-ghost); font-weight: 700; }
.match-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 14px;
  padding-top: 14px; border-top: 1px solid var(--divider); flex-wrap: wrap; gap: 10px; }
.status-badge { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; padding: 3px 10px; border-radius: 20px; font-family: 'Orbitron', sans-serif; }
.status-live { background: rgba(255,107,53,0.15); color: #ff6b35; border: 1px solid rgba(255,107,53,0.3); animation: pulse 1.5s infinite; }
.status-paused { background: rgba(234,179,8,0.12); color: #b8860b; border: 1px solid rgba(234,179,8,0.3); }
.status-upcoming { background: rgba(59,130,246,0.1); color: #3b82f6; border: 1px solid rgba(59,130,246,0.25); }
.status-done { background: rgba(100,116,139,0.12); color: var(--text-muted); border: 1px solid rgba(100,116,139,0.25); }
.status-semifinal { background: rgba(168,85,247,0.12); color: #a855f7; border: 1px solid rgba(168,85,247,0.3); }
.status-final { background: rgba(234,179,8,0.12); color: #b8860b; border: 1px solid rgba(234,179,8,0.3); }

/* STANDINGS TABLE */
.standings-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.standings-table th { padding: 10px 12px; text-align: left; font-family: 'Orbitron', sans-serif;
  font-size: 9px; letter-spacing: 2px; color: var(--text-faint); font-weight: 600; border-bottom: 1px solid var(--divider-strong); }
.standings-table td { padding: 12px; border-bottom: 1px solid var(--divider); }
.standings-table tr:hover td { background: rgba(0,255,136,0.05); }
.rank-cell { font-family: 'Orbitron', sans-serif; font-size: 11px; color: var(--text-faint); width: 32px; }
.rank-1 { color: #b8860b; }
.rank-2 { color: var(--text-secondary); }
.rank-q { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 8px; }
.team-cell { display: flex; align-items: center; gap: 10px; }
.team-emoji { font-size: 18px; }
.team-cell-name { font-weight: 600; color: var(--text-primary); font-size: 14px; }
.team-cell-subs { font-size: 11px; color: var(--text-faint); }
.stat-cell { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-secondary); text-align: center; }
.pts-cell { font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 700; color: var(--accent); text-align: center; }
.pd-pos { color: var(--accent); }
.pd-neg { color: #ef4444; }

/* BRACKET */
.bracket-container { display: flex; gap: 32px; overflow-x: auto; padding-bottom: 12px; }
.bracket-col { display: flex; flex-direction: column; gap: 16px; min-width: 220px; }
.bracket-label { font-family: 'Orbitron', sans-serif; font-size: 10px; letter-spacing: 2px; color: var(--text-faint);
  text-align: center; margin-bottom: 8px; text-transform: uppercase; }
.bracket-match { background: var(--card-bg-solid); border: 1px solid var(--card-border); border-radius: 12px; overflow: hidden; }
.bracket-team { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px;
  font-size: 13px; font-weight: 600; border-bottom: 1px solid var(--divider); transition: background 0.2s; color: var(--text-primary); }
.bracket-team:last-child { border-bottom: none; }
.bracket-team.winner { background: rgba(0,255,136,0.08); color: var(--accent); }
.bracket-team.tbd { color: var(--text-ghost); font-style: italic; }
.bracket-score { font-family: 'Orbitron', sans-serif; font-size: 14px; font-weight: 700; }

/* ADMIN PANEL */
.admin-grid { display: grid; grid-template-columns: 240px 1fr; gap: 24px; }
.admin-sidebar { background: var(--card-bg-solid); border: 1px solid var(--card-border); border-radius: 16px; padding: 16px; height: fit-content; }
.admin-menu-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; cursor: pointer;
  font-size: 14px; font-weight: 600; color: var(--text-muted); transition: all 0.2s; margin-bottom: 4px; }
.admin-menu-item:hover { background: rgba(0,255,136,0.06); color: var(--text-primary); }
.admin-menu-item.active { background: rgba(0,255,136,0.1); color: var(--accent); }
.admin-content { }
.btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 10px; border: none;
  cursor: pointer; font-family: 'Open Sans', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.3px; transition: all 0.2s; }
.btn-primary { background: var(--accent); color: var(--accent-text-on); }
.btn-primary:hover { background: var(--accent-dark); transform: translateY(-1px); }
.btn-secondary { background: rgba(0,255,136,0.1); color: var(--accent); border: 1px solid rgba(0,255,136,0.3); }
.btn-secondary:hover { background: rgba(0,255,136,0.18); }
.btn-danger { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
.btn-danger:hover { background: rgba(239,68,68,0.2); }
.btn-orange { background: rgba(255,107,53,0.12); color: #ff6b35; border: 1px solid rgba(255,107,53,0.3); }
.btn-orange:hover { background: rgba(255,107,53,0.2); }
.btn-sm { padding: 6px 12px; font-size: 12px; border-radius: 8px; }
.btn-row { display: flex; gap: 8px; flex-wrap: wrap; }

.input-group { margin-bottom: 16px; }
.input-label { display: block; font-size: 11px; letter-spacing: 1.5px; color: var(--text-faint); font-weight: 600; text-transform: uppercase; margin-bottom: 6px; font-family: 'Orbitron', sans-serif; }
.input { width: 100%; padding: 10px 14px; background: var(--input-bg); border: 1px solid var(--card-border);
  border-radius: 10px; color: var(--text-primary); font-family: 'Open Sans', sans-serif; font-size: 14px; font-weight: 500; transition: border-color 0.2s, background-color 0.35s; outline: none; }
.input:focus { border-color: rgba(0,255,136,0.4); }
.input::placeholder { color: var(--text-ghost); }

/* TEAM CARDS */
.team-card { background: var(--card-bg-solid); border: 1px solid var(--card-border); border-radius: 16px; padding: 20px;
  display: flex; align-items: center; gap: 16px; transition: all 0.2s; cursor: pointer; }
.team-card:hover { border-color: var(--card-border-hover); transform: translateY(-1px); }
.team-icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center;
  justify-content: center; font-size: 24px; background: var(--hover-tint); border: 1px solid var(--card-border); }
.team-info-block { flex: 1; }
.team-card-name { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.team-card-players { font-size: 13px; color: var(--text-faint); }
.team-card-badge { display: flex; align-items: center; gap: 6px; }

/* TEAM CARD WRAPPER + DETAIL PANEL (Next Opponent / Match History) */
.team-card-wrap { display: flex; flex-direction: column; min-width: 0; }
.team-detail-panel { background: var(--code-bg); border: 1px solid rgba(0,255,136,0.15); border-top: none;
  border-radius: 0 0 16px 16px; margin-top: -1px; padding: 16px 20px; animation: expandDown 0.2s ease; }
@keyframes expandDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.team-detail-section { margin-bottom: 14px; }
.team-detail-section:last-child { margin-bottom: 0; }
.team-detail-label { font-family: 'Orbitron', sans-serif; font-size: 10px; letter-spacing: 1.5px; color: var(--text-faint);
  text-transform: uppercase; margin-bottom: 8px; }
.team-detail-next { display: flex; justify-content: space-between; align-items: center; background: rgba(0,255,136,0.06);
  border: 1px solid rgba(0,255,136,0.15); border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 700; color: var(--text-primary); flex-wrap: wrap; gap: 6px; }
.team-detail-meta { font-size: 11px; color: var(--text-faint); font-weight: 500; }
.team-detail-history-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--divider); font-size: 13px; }
.team-detail-history-row:last-child { border-bottom: none; }
.history-result { width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
  font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.history-result.win { background: rgba(0,255,136,0.15); color: var(--accent); }
.history-result.loss { background: rgba(239,68,68,0.12); color: #ef4444; }
.history-opp { flex: 1; color: var(--text-secondary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-score { font-family: 'JetBrains Mono', monospace; color: var(--text-primary); font-weight: 600; flex-shrink: 0; }

/* NOTIFICATIONS */
.notif-list { display: flex; flex-direction: column; gap: 10px; }
.notif-item { display: flex; align-items: flex-start; gap: 12px; padding: 14px; background: var(--card-bg-solid);
  border: 1px solid var(--card-border); border-radius: 12px; }
.notif-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
.notif-text { flex: 1; }
.notif-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.notif-time { font-size: 11px; color: var(--text-faint); }

/* WINNER SCREEN */
.winner-overlay { position: fixed; inset: 0; background: var(--overlay-bg); z-index: 200; display: flex; align-items: center; justify-content: center; }
.winner-card { background: var(--card-bg-solid);
  border: 1px solid rgba(234,179,8,0.4); border-radius: 24px; padding: 48px; text-align: center; max-width: 480px; width: 90%; position: relative; overflow: hidden;
  box-shadow: 0 8px 32px var(--shadow-color); }
.winner-card::before { content: ''; position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, rgba(234,179,8,0.08), transparent 70%); }
.winner-trophy { font-size: 64px; margin-bottom: 16px; animation: bounce 1s ease-in-out infinite; }
@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
.winner-label { font-family: 'Orbitron', sans-serif; font-size: 11px; letter-spacing: 3px; color: #b8860b; margin-bottom: 12px; }
.winner-name { font-family: 'Orbitron', sans-serif; font-size: 32px; font-weight: 900; color: var(--text-strong); margin-bottom: 8px; }
.winner-sub { font-size: 15px; color: var(--text-muted); margin-bottom: 32px; }
.confetti { position: absolute; top: 0; left: 0; right: 0; height: 4px;
  background: linear-gradient(90deg, #ff6b35, #00ff88, #facc15, #a855f7, #3b82f6); }

/* SCORE ENTRY */
.score-entry { display: flex; align-items: center; gap: 12px; }
.score-input { width: 56px; padding: 8px; text-align: center; background: var(--input-bg);
  border: 1px solid rgba(0,255,136,0.3); border-radius: 8px; color: var(--accent);
  font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 700; outline: none; }

/* SHUTTLE ANIMATION */
.shuttle-trail { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); opacity: 0.06; font-size: 32px;
  animation: shuttleFly 3s ease-in-out infinite; pointer-events: none; }
@keyframes shuttleFly { 0%,100%{transform:translateY(-50%) rotate(-20deg)} 50%{transform:translateY(calc(-50% - 6px)) rotate(10deg)} }

/* SEARCH */
.search-bar { position: relative; margin-bottom: 20px; }
.search-input { width: 100%; padding: 12px 16px 12px 44px; background: var(--input-bg);
  border: 1px solid var(--card-border); border-radius: 12px; color: var(--text-primary);
  font-family: 'Open Sans', sans-serif; font-size: 14px; outline: none; transition: border-color 0.2s, background-color 0.35s; }
.search-input:focus { border-color: rgba(0,255,136,0.35); }
.search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-faint); font-size: 16px; }

/* TABS */
.tabs { display: flex; gap: 4px; background: var(--card-bg-solid); border-radius: 12px; padding: 4px; margin-bottom: 20px; width: fit-content; }
.tab { padding: 8px 18px; border-radius: 9px; border: none; background: transparent;
  color: var(--text-faint); cursor: pointer; font-family: 'Open Sans', sans-serif; font-size: 14px; font-weight: 600; transition: all 0.2s; }
.tab.active { background: rgba(0,255,136,0.12); color: var(--accent); }
.tab:hover:not(.active) { color: var(--text-secondary); }

/* WHATSAPP */
.wa-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: rgba(37,211,102,0.12);
  border: 1px solid rgba(37,211,102,0.3); border-radius: 8px; color: #25d166; font-size: 12px; font-weight: 700;
  cursor: pointer; transition: all 0.2s; letter-spacing: 0.5px; }
.wa-btn:hover { background: rgba(37,211,102,0.2); }

/* TOOLTIP */
.group-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700;
  letter-spacing: 1px; font-family: 'Orbitron', sans-serif; }
.group-a { background: rgba(0,255,136,0.1); color: var(--accent); border: 1px solid rgba(0,255,136,0.2); }
.group-b { background: rgba(168,85,247,0.1); color: #a855f7; border: 1px solid rgba(168,85,247,0.2); }

/* MISC */
.divider { height: 1px; background: var(--divider); margin: 24px 0; }
.row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.mb-8 { margin-bottom: 8px; }
.mb-16 { margin-bottom: 16px; }
.mb-24 { margin-bottom: 24px; }
.mt-8 { margin-top: 8px; }
.mt-16 { margin-top: 16px; }
.gap-16 { gap: 16px; }
.flex { display: flex; }
.flex-1 { flex: 1; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.text-muted { color: var(--text-faint); font-size: 13px; }
.text-green { color: var(--accent); }
/* SPLIT-2 — used for any side-by-side panel pair (Group A/B standings,
   bracket previews, etc). Unlike inline gridTemplateColumns:"1fr 1fr",
   this collapses cleanly to a single stacked column on tablets and
   phones, which is what was causing the dashboard "collapse" bug. */
.split-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; min-width: 0; }
.split-2 > * { min-width: 0; } /* prevents content from forcing overflow */
@media (max-width: 860px) {
  .split-2 { grid-template-columns: 1fr; gap: 20px; }
}

.text-orange { color: #ff6b35; }
.text-gold { color: #b8860b; }
.font-mono { font-family: 'JetBrains Mono', monospace; }

@media (max-width: 768px) {
  .nav-tabs { display: none; }
  .admin-grid { grid-template-columns: 1fr; }
  .admin-sidebar { display: none; }
  .hero-stats { gap: 16px 24px; }
  .bracket-container { flex-direction: column; }
  .card-grid-2 { grid-template-columns: 1fr; }
  .card-grid-3 { grid-template-columns: 1fr; }
  .content { padding-left: 16px; padding-right: 16px; }
  .hero { padding: 36px 16px 28px; }
}

@media (max-width: 480px) {
  .standings-table { font-size: 12px; }
  .standings-table th, .standings-table td { padding: 8px 6px; }
  .team-cell-subs { display: none; } /* hide player names on very small screens to prevent squeeze */
}

.mobile-nav { display: none; }
@media (max-width: 768px) {
  .mobile-nav { display: flex; position: fixed; bottom: 0; left: 0; right: 0; background: var(--nav-bg);
    border-top: 1px solid rgba(0,255,136,0.1); padding: 8px 0 16px; z-index: 100; justify-content: space-around;
    overflow-x: auto; }
  .mobile-nav-btn { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 10px;
    background: transparent; border: none; color: var(--text-faint); cursor: pointer; font-family: 'Open Sans', sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.5px; transition: color 0.2s; flex-shrink: 0; }
  .mobile-nav-btn.active { color: var(--accent); }
  .content { padding-bottom: 84px; }
}

/* Global overflow guard — prevents any single wide element from
   blowing out the page width on small screens */
html, body { overflow-x: hidden; }
.app { overflow-x: hidden; }
`;


// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dashboard");

  // ════════════════════════════════════════════════════════════
  //  ROLE-BASED ACCESS CONTROL
  // ════════════════════════════════════════════════════════════
  // isAdmin gates every control surface in the app: start/end/pause
  // match buttons, score entry, team add/remove, fixture
  // generation, and notification sending. A regular visitor only
  // ever sees read-only views (matches, scores, standings, MVP
  // leaderboard, notifications, WhatsApp share, and the rules
  // info icon).
  //
  // This is a lightweight client-side gate suitable for the demo;
  // when wired to Supabase, swap isAdmin for the real
  // `profile.role === 'admin'` check from useAuth() (see
  // src/hooks/useTournament.ts) so it's enforced server-side via
  // Row Level Security too, not just hidden in the UI.
  const ADMIN_PASSCODE = "admin123"; // demo-only — replace with real auth before going live
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPasscodeInput, setAdminPasscodeInput] = useState("");
  const [adminLoginError, setAdminLoginError] = useState("");

  function attemptAdminLogin() {
    if (adminPasscodeInput === ADMIN_PASSCODE) {
      setIsAdmin(true);
      setShowAdminLogin(false);
      setAdminPasscodeInput("");
      setAdminLoginError("");
    } else {
      setAdminLoginError("Incorrect passcode");
    }
  }

  function logoutAdmin() {
    setIsAdmin(false);
    if (tab === "admin" || tab === "notify") setTab("dashboard");
  }

  // If a non-admin somehow has tab="admin" (e.g. logged out while
  // on that tab), bounce them back to the dashboard — this is the
  // actual route-protection fix: admin-only tabs are unreachable
  // by state, not just visually hidden.
  useEffect(() => {
    if (!isAdmin && (tab === "admin" || tab === "notify")) {
      setTab("dashboard");
    }
  }, [isAdmin, tab]);

  // ════════════════════════════════════════════════════════════
  //  RULES / INFO MODAL
  // ════════════════════════════════════════════════════════════
  const [showRules, setShowRules] = useState(false);

  const [teams, setTeams] = useState(INITIAL_TEAMS);
  const [groups, setGroups] = useState(() => generateGroups(INITIAL_TEAMS));
  const [matches, setMatches] = useState([]);
  const [notifications, setNotifications] = useState([
    { id: 1, text: "Tournament brackets have been generated!", time: "2 min ago", icon: "🏸", type: "info" },
    { id: 2, text: "Storm Eagles vs Thunder Hawks starts soon", time: "5 min ago", icon: "⚡", type: "alert" },
  ]);
  const [winner, setWinner] = useState(null);
  const [tournamentPhase, setTournamentPhase] = useState("group"); // group | semifinal | final | done
  const [adminSection, setAdminSection] = useState("matches");
  const [searchQ, setSearchQ] = useState("");
  const [scoreModal, setScoreModal] = useState(null); // match object
  const [addTeamForm, setAddTeamForm] = useState(false);
  const [removeConfirmId, setRemoveConfirmId] = useState(null);
  const [expandedTeamId, setExpandedTeamId] = useState(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newP1, setNewP1] = useState("");
  const [newP2, setNewP2] = useState("");

  // ── PUSH NOTIFICATIONS STATE ──────────────────────────────
  // pushPermission mirrors what Notification.permission would be
  // in a real browser ("default" | "granted" | "denied").
  // In production, swap addNotif()'s body for a call to
  // adminPush.send(...) from src/lib/push.ts — see comments below.
  const [pushPermission, setPushPermission] = useState("default");
  const [pushPrefs, setPushPrefs] = useState({
    match_starting: true,
    match_live: true,
    match_result: true,
    semifinal: true,
    final: true,
    schedule_change: true,
  });
  const [registeredDevices, setRegisteredDevices] = useState([]);

  // ── REGENERATE GROUP-STAGE FIXTURES ───────────────────────
  // Re-runs whenever teams are added/removed. Important: any match
  // that's already LIVE or COMPLETED is preserved untouched (so
  // match history / live games never get wiped out) — only PENDING
  // group-stage matches are recomputed from the current team list.
  //
  // There is no court or slot concept here — this just produces a
  // single ordered queue of matches, with the rest-gap rule and
  // same-team-conflict avoidance handled internally by the scheduler.
  function regenerateGroupFixtures(currentGroups, prevMatches) {
    const keep = prevMatches.filter(
      (m) => m.stage !== "group" || m.status !== "pending"
    );

    // Pairings already played, live, paused, or otherwise locked in
    // should never be regenerated/duplicated.
    const lockedPairKeys = new Set(
      keep.filter((m) => m.stage === "group").map((m) => [m.team1.id, m.team2.id].sort().join("-"))
    );

    const allPairings = [
      ...buildPairings(currentGroups.A, "A"),
      ...buildPairings(currentGroups.B, "B"),
    ].filter((p) => !lockedPairKeys.has([p.team1.id, p.team2.id].sort().join("-")));

    // Seed rest-gap memory from matches already locked in, so a
    // team that just played recently still needs to wait its turn
    // even after regeneration (adding/removing a team).
    const lastPlayedOrderByTeam = {};
    keep.forEach((m) => {
      if (typeof m.order !== "number") return;
      lastPlayedOrderByTeam[m.team1.id] = Math.max(lastPlayedOrderByTeam[m.team1.id] ?? -Infinity, m.order);
      lastPlayedOrderByTeam[m.team2.id] = Math.max(lastPlayedOrderByTeam[m.team2.id] ?? -Infinity, m.order);
    });
    const startOrder = keep.reduce((max, m) => (typeof m.order === "number" ? Math.max(max, m.order + 1) : max), 0);

    const { matches: freshMatches } = scheduleMatches(allPairings, startOrder, lastPlayedOrderByTeam);

    const withIds = freshMatches.map((m) => ({
      id: nextId(),
      team1: m.team1,
      team2: m.team2,
      score1: null,
      score2: null,
      status: "pending",
      group: m.group,
      order: m.order,
      stage: "group",
    }));

    return [...keep, ...withIds];
  }

  // Generate initial matches on mount
  useEffect(() => {
    setMatches((prev) => regenerateGroupFixtures(groups, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-generate fixtures whenever the team roster changes
  useEffect(() => {
    setMatches((prev) => regenerateGroupFixtures(groups, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  // NOTE: the per-second "live timer" no longer lives here.
  // It used to be a single piece of App-level state ticking every
  // second, which forced the ENTIRE app to re-render every second
  // while any match was live (this was the root cause of the UI
  // feeling sluggish and tabs occasionally "not responding").
  // Each MatchCard now ticks its own elapsed time independently
  // from match.startedAt — see the MatchCard component below.

  const liveMatches = matches.filter((m) => m.status === "live");
  const upcomingMatches = matches.filter((m) => m.status === "pending");
  const completedMatches = matches.filter((m) => m.status === "completed");
  const standingsA = calcStandings(groups.A, matches.filter((m) => m.group === "A"));
  const standingsB = calcStandings(groups.B, matches.filter((m) => m.group === "B"));
  const semifinalMatches = matches.filter((m) => m.stage === "semifinal");
  const finalMatch = matches.find((m) => m.stage === "final");

  // ── START MATCH (guarded) ─────────────────────────────────
  // Only transitions a match that is currently "pending". This
  // prevents a double-click (or a stray re-render) from re-arming
  // startedAt on an already-live match, and makes it impossible
  // for this action to ever touch more than the single matched id.
  function startMatch(id) {
    setMatches((prev) =>
      prev.map((m) => (m.id === id && m.status === "pending")
        ? { ...m, status: "live", score1: 0, score2: 0, startedAt: Date.now(), serverTeam: "team1", serverIndex: 0 }
        : m)
    );
    const m = matches.find((x) => x.id === id);
    if (m && m.status === "pending") {
      addNotif(`${m.team1.name} vs ${m.team2.name} is now LIVE! 🔴`, "⚡");
    }
  }

  function openScoreModal(match) {
    setScoreModal(match);
  }

  // ── LIVE TAP-TO-SCORE (used by LiveScoringScreen) ─────────
  // Increments whichever team's point it is and rotates the serve
  // between the two partners on that side, or hands serve to the
  // other team on a side-out — same logic the scoring screen used
  // to manage locally, now living here so it's part of the same
  // `matches` state as everything else (survives tab switches,
  // feeds standings/PF/PA immediately).
  function scorePoint(id, teamKey) {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== id || m.status !== "live") return m;
        const otherKey = teamKey === "team1" ? "team2" : "team1";
        const scoreField = teamKey === "team1" ? "score1" : "score2";
        const wasServer = (m.serverTeam ?? "team1") === teamKey;
        const newScore = (m[scoreField] ?? 0) + 1;
        let serverTeam = m.serverTeam ?? "team1";
        let serverIndex = m.serverIndex ?? 0;
        if (wasServer) {
          serverIndex = serverIndex === 0 ? 1 : 0;
        } else {
          serverTeam = teamKey;
          serverIndex = newScore % 2 === 0 ? 0 : 1;
        }
        return { ...m, [scoreField]: newScore, serverTeam, serverIndex };
      })
    );
  }

  // Restores score1/score2/serverTeam/serverIndex to a prior
  // snapshot — backs the Undo/Redo buttons on the scoring screen.
  function restoreMatchFields(id, fields) {
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));
  }

  // ── COMPLETE MATCH (guarded) ──────────────────────────────
  // Only transitions a match that is currently "live" or "paused",
  // and only fires the win/champion notifications once per match.
  function completeMatch(id) {
    const m = matches.find((x) => x.id === id);
    if (!m || (m.status !== "live" && m.status !== "paused")) return; // no-op otherwise

    setMatches((prev) => prev.map((x) => (x.id === id && (x.status === "live" || x.status === "paused")) ? { ...x, status: "completed" } : x));
    const winnerTeam = (m.score1 ?? 0) >= (m.score2 ?? 0) ? m.team1 : m.team2;
    addNotif(`${winnerTeam.name} wins! ${m.score1}-${m.score2} ✅`, "🏆");

    // Check if final is done
    if (m.stage === "final") {
      setWinner(winnerTeam);
      setTournamentPhase("done");
      addNotif(`🎉 ${winnerTeam.name} are the CHAMPIONS!`, "🥇");
    }
  }

  // ── PAUSE / RESUME MATCH ──────────────────────────────────
  // Only a "live" match can be paused, and only a "paused" match
  // can be resumed back to live — guarded the same way as start/
  // complete so this can never bleed into another match.
  function pauseMatch(id) {
    setMatches((prev) => prev.map((m) => (m.id === id && m.status === "live") ? { ...m, status: "paused" } : m));
  }
  function resumeMatch(id) {
    setMatches((prev) => prev.map((m) => (m.id === id && m.status === "paused") ? { ...m, status: "live" } : m));
  }

  function generateSemifinals() {
    const topA = standingsA[0]?.team;
    const runnerA = standingsA[1]?.team;
    const topB = standingsB[0]?.team;
    const runnerB = standingsB[1]?.team;
    if (!topA || !runnerA || !topB || !runnerB) return;
    const baseOrder = matches.reduce((max, m) => (typeof m.order === "number" ? Math.max(max, m.order + 1) : max), 0);
    // Both semis involve 4 distinct teams (group toppers vs.
    // opposite-group runners-up), so there's no team conflict
    // even though they share the same order position.
    const sf1 = { id: nextId(), team1: topA, team2: runnerB, score1: null, score2: null, status: "pending", group: "SF", order: baseOrder, stage: "semifinal" };
    const sf2 = { id: nextId(), team1: topB, team2: runnerA, score1: null, score2: null, status: "pending", group: "SF", order: baseOrder, stage: "semifinal" };
    setMatches((prev) => [...prev, sf1, sf2]);
    setTournamentPhase("semifinal");
    addNotif("🏸 Semi-final fixtures have been announced!", "📢");
  }

  function generateFinal() {
    const sfs = matches.filter((m) => m.stage === "semifinal" && m.status === "completed");
    if (sfs.length < 2) return;
    const f1 = sfs[0].score1 >= sfs[0].score2 ? sfs[0].team1 : sfs[0].team2;
    const f2 = sfs[1].score1 >= sfs[1].score2 ? sfs[1].team1 : sfs[1].team2;
    const baseOrder = matches.reduce((max, m) => (typeof m.order === "number" ? Math.max(max, m.order + 1) : max), 0);
    const fin = { id: nextId(), team1: f1, team2: f2, score1: null, score2: null, status: "pending", group: "FINAL", order: baseOrder, stage: "final" };
    setMatches((prev) => [...prev, fin]);
    setTournamentPhase("final");
    addNotif("🏆 THE FINAL is set! Get ready!", "🌟");
  }

  function addNotif(text, icon = "🏸") {
    setNotifications((prev) => [{ id: Date.now(), text, time: "Just now", icon }, ...prev.slice(0, 9)]);

    // ── REAL PUSH DISPATCH ──────────────────────────────────
    // If the browser has granted permission, fire an actual
    // OS-level notification (works even if the tab isn't focused).
    // In production with Firebase wired in, replace this block with:
    //   adminPush.send({ tournamentId, title: "ShuttlePro", body: text, icon });
    if (pushPermission === "granted" && typeof Notification !== "undefined") {
      try {
        new Notification("ShuttlePro", { body: text, icon: undefined, tag: "shuttlepro" });
      } catch (e) { /* no-op if blocked */ }
    }
  }

  function requestPushPermission() {
    if (typeof Notification === "undefined") {
      setPushPermission("denied");
      addNotif("Push notifications aren't supported in this browser", "⚠️");
      return;
    }
    Notification.requestPermission().then((result) => {
      setPushPermission(result);
      if (result === "granted") {
        setRegisteredDevices((prev) => [
          ...prev,
          { id: Date.now(), name: navigator.platform || "This device", platform: /android/i.test(navigator.userAgent) ? "Android" : /iphone|ipad/i.test(navigator.userAgent) ? "iOS" : "Web", time: "Just now" },
        ]);
        addNotif("Push notifications enabled on this device! 🔔", "✅");
      }
    });
  }

  function togglePushPref(key) {
    setPushPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  function addTeam() {
    if (!newTeamName.trim()) return;
    const emojis = ["🦅", "⚡", "🔥", "🌟", "🐍", "💫", "🎯", "🛡️"];
    const colors = ["#737373", "#ff6b35", "#a855f7", "#3b82f6", "#ef4444", "#f59e0b", "#6366f1", "#eab308"];
    const nt = { id: nextId(), name: newTeamName, players: [newP1 || "Player 1", newP2 || "Player 2"],
      logo: emojis[teams.length % emojis.length], color: colors[teams.length % colors.length] };
    const newTeams = [...teams, nt];
    setTeams(newTeams);
    setGroups(generateGroups(newTeams));
    setAddTeamForm(false); setNewTeamName(""); setNewP1(""); setNewP2("");
    addNotif(`${nt.name} has joined the tournament! 🏸`, "👥");
  }

  // ── REMOVE TEAM (Feature #2) ──────────────────────────────
  // Refuses to remove a team that's currently in a LIVE match,
  // since pulling the team mid-match would corrupt live state.
  // Otherwise: drops the team, regenerates groups, and immediately
  // strips any of its upcoming fixtures so the UI never shows a
  // stale match for a team that no longer exists. Completed
  // matches stay in history untouched, and standings recompute
  // automatically since calcStandings derives purely from the
  // remaining matches + team list.
  function removeTeam(teamId) {
    const hasLiveMatch = matches.some(
      (m) => m.status === "live" && (m.team1.id === teamId || m.team2.id === teamId)
    );
    if (hasLiveMatch) {
      addNotif("Can't remove a team with a match currently live ⚠️", "🚫");
      return;
    }

    const removedTeam = teams.find((t) => t.id === teamId);
    const newTeams = teams.filter((t) => t.id !== teamId);

    setTeams(newTeams);
    setGroups(generateGroups(newTeams));
    setMatches((prev) =>
      prev.filter(
        (m) => !(m.status === "pending" && (m.team1.id === teamId || m.team2.id === teamId))
      )
    );

    if (removedTeam) addNotif(`${removedTeam.name} has been removed from the tournament`, "🗑️");
  }

  function shareWhatsApp(text) {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }


  const filteredTeams = teams.filter((t) =>
    t.name.toLowerCase().includes(searchQ.toLowerCase()) ||
    t.players.some((p) => p.toLowerCase().includes(searchQ.toLowerCase()))
  );

  function formatTimer(s) {
    const m = Math.floor(s / 60), sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        {/* NAV */}
        <nav className="nav">
          <div className="nav-brand">
            <div>
              <div className="nav-logo">🏸 ShuttlePro</div>
              <div className="nav-sub">Tournament Platform</div>
            </div>
          </div>
          <div className="nav-tabs">
            {TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => (
              <button key={t.id} className={`nav-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
          <div className="row">
            {pushPermission === "granted" && (
              <span title="Push notifications enabled" style={{ fontSize: "14px" }}>🔔</span>
            )}
            {liveMatches.length > 0 && (
              <div className="live-pill">
                <div className="live-dot" />
                {liveMatches.length} LIVE
              </div>
            )}
            {isAdmin ? (
              <button className="btn btn-secondary btn-sm" onClick={logoutAdmin} title="Exit admin mode">👤 Admin · Logout</button>
            ) : (
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAdminLogin(true)} title="Admin login">🔒 Admin</button>
            )}
          </div>
        </nav>

        {/* HERO */}
        <div className="hero">
          <div className="hero-label">GameNova Invitational 2026</div>
          <div className="hero-title">Badminton <span>Championship</span></div>
          <div className="hero-sub">Premium tournament management & live scoring</div>
          <div className="hero-stats">
            <div className="hero-stat"><div className="hero-stat-val">{teams.length}</div><div className="hero-stat-lbl">Teams</div></div>
            <div className="hero-stat"><div className="hero-stat-val">{matches.length}</div><div className="hero-stat-lbl">Fixtures</div></div>
            <div className="hero-stat"><div className="hero-stat-val">{liveMatches.length}</div><div className="hero-stat-lbl">Live Now</div></div>
            <div className="hero-stat"><div className="hero-stat-val">{completedMatches.length}</div><div className="hero-stat-lbl">Completed</div></div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="content">
          {/* DASHBOARD TAB — per requirement #5: Live Matches, Group
              Standings, MVP Leaderboard, and Notifications only.
              There is no separate Standings tab anymore. */}
          {tab === "dashboard" && (
            <div>
              <div className="flex justify-between items-center mb-16">
                <div className="text-muted" style={{ fontSize: "13px" }}>Tournament overview</div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowRules(true)}
                  title="Rules & points guide"
                  aria-label="Rules and points guide"
                >
                  ℹ️ Rules
                </button>
              </div>

              {liveMatches.length > 0 && (
                <>
                  <div className="section-title">🔴 Live Matches</div>
                  <div className="card-grid card-grid-2 mb-24">
                    {liveMatches.map((m) => (
                      <MatchCard key={m.id} match={m}
                        onScore={isAdmin ? () => openScoreModal(m) : undefined}
                        onComplete={isAdmin ? () => completeMatch(m.id) : undefined}
                        onPause={isAdmin ? () => pauseMatch(m.id) : undefined}
                        onShare={() => shareWhatsApp(`🏸 LIVE NOW\n${m.team1.name} ${m.score1}-${m.score2} ${m.team2.name}\nShuttlePro`)}
                      />
                    ))}
                  </div>
                </>
              )}

              <div className="split-2">
                <div>
                  <div className="section-title">Group A Standings</div>
                  <div className="card"><StandingsTable standings={standingsA} showQualification /></div>
                </div>
                <div>
                  <div className="section-title">Group B Standings</div>
                  <div className="card"><StandingsTable standings={standingsB} showQualification /></div>
                </div>
              </div>

              <div className="divider" />
              <div className="section-title">🏆 MVP Leaderboard</div>
              <div className="card mb-24">
                <table className="standings-table">
                  <thead><tr>
                    <th>#</th><th>Team</th><th>PTS</th><th>PF</th><th>PA</th><th>PD</th><th>W</th><th>L</th>
                  </tr></thead>
                  <tbody>
                    {[...standingsA, ...standingsB].sort((a, b) => b.pts - a.pts || b.PD - a.PD).map((s, i) => (
                      <tr key={s.team.id}>
                        <td className={`rank-cell ${i === 0 ? "rank-1" : i === 1 ? "rank-2" : ""}`}>{i + 1}</td>
                        <td><div className="team-cell"><span className="team-emoji">{s.team.logo}</span><div><div className="team-cell-name">{s.team.name}</div><div className="team-cell-subs">{s.team.players.join(" & ")}</div></div></div></td>
                        <td className="pts-cell">{s.pts}</td>
                        <td className="stat-cell">{s.PF}</td>
                        <td className="stat-cell">{s.PA}</td>
                        <td className={`stat-cell ${s.PD > 0 ? "pd-pos" : s.PD < 0 ? "pd-neg" : ""}`}>{s.PD > 0 ? "+" : ""}{s.PD}</td>
                        <td className="stat-cell" style={{ color: "var(--accent)" }}>{s.W}</td>
                        <td className="stat-cell" style={{ color: "#ef4444" }}>{s.L}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divider" />
              <div className="section-title">🔔 Notifications</div>
              <div className="notif-list">
                {notifications.slice(0, 5).map((n) => (
                  <div key={n.id} className="notif-item">
                    <div className="notif-icon" style={{ background: "rgba(0,255,136,0.06)" }}>{n.icon}</div>
                    <div className="notif-text">
                      <div className="notif-title">{n.text}</div>
                      <div className="notif-time">{n.time}</div>
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && <div className="text-muted" style={{ padding: "12px 0" }}>No notifications yet</div>}
              </div>
            </div>
          )}

          {/* MATCHES TAB — simple sequential list, no slot/court grouping.
              Matches are just shown one after another in play order with
              a clear status badge, exactly like:
                Team A vs Team B   [LIVE]
                Team C vs Team D   [UPCOMING]
                Team E vs Team F   [COMPLETED] */}
          {tab === "matches" && (
            <div>
              <div className="tabs">
                {["all", "live", "upcoming", "paused", "completed"].map((s) => (
                  <button key={s} className={`tab ${adminSection === s || (s === "all" && !["live", "upcoming", "paused", "completed"].includes(adminSection)) ? "active" : ""}`}
                    style={{ textTransform: "capitalize" }}
                    onClick={() => setAdminSection(s)}>
                    {s} {s === "live" && liveMatches.length > 0 ? `(${liveMatches.length})` : ""}
                  </button>
                ))}
              </div>

              <div className="card-grid card-grid-2">
                {matches
                  .filter((m) => {
                    if (adminSection === "live") return m.status === "live";
                    if (adminSection === "upcoming") return m.status === "pending";
                    if (adminSection === "paused") return m.status === "paused";
                    if (adminSection === "completed") return m.status === "completed";
                    return true;
                  })
                  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                  .map((m) => (
                    <MatchCard key={m.id} match={m}
                      onStart={isAdmin ? () => startMatch(m.id) : undefined}
                      onScore={isAdmin ? () => openScoreModal(m) : undefined}
                      onComplete={isAdmin ? () => completeMatch(m.id) : undefined}
                      onPause={isAdmin ? () => pauseMatch(m.id) : undefined}
                      onResume={isAdmin ? () => resumeMatch(m.id) : undefined}
                      onShare={() => shareWhatsApp(`🏸 Match Update\n${m.team1.name} ${m.score1 ?? "-"} vs ${m.score2 ?? "-"} ${m.team2.name}\nShuttlePro`)}
                    />
                  ))}
                {matches.length === 0 && <div className="text-muted" style={{ padding: "20px 0" }}>No matches yet</div>}
              </div>
            </div>
          )}

          {/* BRACKET TAB */}
          {tab === "bracket" && (
            <div>
              <div className="section-title">🏆 Tournament Bracket</div>
              <div className="bracket-container">
                {/* Group Stage */}
                <div className="bracket-col">
                  <div className="bracket-label">Group Stage</div>
                  {["A", "B"].map((g) => {
                    const st = g === "A" ? standingsA : standingsB;
                    return st.slice(0, 2).map((s, i) => (
                      <div key={s.team.id} className="bracket-match">
                        <div className={`bracket-team ${i === 0 ? "winner" : ""}`}>
                          <span>{s.team.logo} {s.team.name}</span>
                          <span className="bracket-score" style={{ color: i === 0 ? "var(--accent)" : "var(--text-secondary)" }}>{s.pts}pts</span>
                        </div>
                      </div>
                    ));
                  })}
                </div>
                {/* Semis */}
                <div className="bracket-col">
                  <div className="bracket-label">Semi Finals</div>
                  {semifinalMatches.length > 0 ? semifinalMatches.map((m) => (
                    <BracketMatch key={m.id} match={m} />
                  )) : (
                    <div style={{ padding: "24px", textAlign: "center", color: "var(--text-ghost)", fontSize: "13px" }}>
                      Complete group stage to unlock
                    </div>
                  )}
                </div>
                {/* Final */}
                <div className="bracket-col">
                  <div className="bracket-label">Final</div>
                  {finalMatch ? <BracketMatch match={finalMatch} /> : (
                    <div style={{ padding: "24px", textAlign: "center", color: "var(--text-ghost)", fontSize: "13px" }}>
                      Pending semi-finals
                    </div>
                  )}
                </div>
                {/* Winner */}
                <div className="bracket-col">
                  <div className="bracket-label">Champion</div>
                  {winner ? (
                    <div className="bracket-match" style={{ border: "1px solid rgba(234,179,8,0.4)", background: "rgba(234,179,8,0.05)" }}>
                      <div className="bracket-team winner" style={{ color: "#b8860b", justifyContent: "center", gap: "10px" }}>
                        <span>🏆</span><span>{winner.name}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "24px", textAlign: "center", color: "var(--text-ghost)", fontSize: "13px" }}>
                      TBD
                    </div>
                  )}
                </div>
              </div>
              {/* Phase controls — admin only; spectators can see the
                  phase label but not the controls to advance it. */}
              <div className="divider" />
              <div className="row">
                <span className="text-muted">Phase:</span>
                <span style={{ color: "var(--accent)", fontFamily: "Orbitron, sans-serif", fontSize: "12px", letterSpacing: "1px", textTransform: "uppercase" }}>{tournamentPhase}</span>
                {isAdmin && tournamentPhase === "group" && (
                  <button className="btn btn-secondary btn-sm" onClick={generateSemifinals}>Generate Semis →</button>
                )}
                {isAdmin && tournamentPhase === "semifinal" && semifinalMatches.every(m => m.status === "completed") && (
                  <button className="btn btn-secondary btn-sm" onClick={generateFinal}>Generate Final →</button>
                )}
              </div>
            </div>
          )}

          {/* TEAMS TAB */}
          {tab === "teams" && (
            <div>
              <div className="flex justify-between items-center mb-16">
                <div className="section-title" style={{ margin: 0 }}>Teams ({teams.length})</div>
                {isAdmin && (
                  <button className="btn btn-primary btn-sm" onClick={() => setAddTeamForm(true)}>
                    <Icon.plus /> Add Team
                  </button>
                )}
              </div>
              {isAdmin && addTeamForm && (
                <div className="card mb-24">
                  <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: "12px", color: "var(--accent)", marginBottom: "16px", letterSpacing: "2px" }}>NEW TEAM</div>
                  <div className="input-group">
                    <label className="input-label">Team Name</label>
                    <input className="input" placeholder="e.g. Thunder Ravens" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div className="input-group">
                      <label className="input-label">Player 1</label>
                      <input className="input" placeholder="Name" value={newP1} onChange={(e) => setNewP1(e.target.value)} />
                    </div>
                    <div className="input-group">
                      <label className="input-label">Player 2</label>
                      <input className="input" placeholder="Name" value={newP2} onChange={(e) => setNewP2(e.target.value)} />
                    </div>
                  </div>
                  <div className="btn-row">
                    <button className="btn btn-primary" onClick={addTeam}>Add Team</button>
                    <button className="btn btn-secondary" onClick={() => setAddTeamForm(false)}>Cancel</button>
                  </div>
                </div>
              )}
              <div className="search-bar">
                <span className="search-icon">🔍</span>
                <input className="search-input" placeholder="Search teams or players..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
              </div>
              <div className="card-grid card-grid-2">
                {filteredTeams.map((t) => {
                  const inA = groups.A.some((g) => g.id === t.id);
                  const standing = (inA ? standingsA : standingsB).find((s) => s.team.id === t.id);
                  const isLive = matches.some((m) => m.status === "live" && (m.team1.id === t.id || m.team2.id === t.id));
                  const confirming = removeConfirmId === t.id;
                  const expanded = expandedTeamId === t.id;

                  // ── NEXT OPPONENT ────────────────────────────────
                  // Sorted by order (the actual chronological order of
                  // play), not by id — id is just a unique key now,
                  // not a play-order indicator.
                  const nextMatch = matches
                    .filter((m) => m.status === "pending" && (m.team1.id === t.id || m.team2.id === t.id))
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
                  const nextOpponent = nextMatch
                    ? (nextMatch.team1.id === t.id ? nextMatch.team2 : nextMatch.team1)
                    : null;

                  // ── MATCH HISTORY ────────────────────────────────
                  const teamHistory = matches
                    .filter((m) => m.status === "completed" && (m.team1.id === t.id || m.team2.id === t.id))
                    .slice()
                    .reverse();

                  return (
                    <div key={t.id} className="team-card-wrap">
                      <div className="team-card" onClick={() => setExpandedTeamId(expanded ? null : t.id)} style={{ cursor: "pointer" }}>
                        <div className="team-icon">{t.logo}</div>
                        <div className="team-info-block">
                          <div className="team-card-name">{t.name}</div>
                          <div className="team-card-players">{t.players.join(" & ")}</div>
                          <div className="team-card-badge mt-8">
                            <span className={`group-tag group-${inA ? "a" : "b"}`}>Group {inA ? "A" : "B"}</span>
                            {standing && <span style={{ fontSize: "12px", color: "var(--accent)", marginLeft: "8px" }}>{standing.pts}pts • {standing.W}W-{standing.L}L</span>}
                            {isLive && <span style={{ fontSize: "11px", color: "#ff6b35", marginLeft: "8px" }}>● LIVE NOW</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-8" onClick={(e) => e.stopPropagation()}>
                          <button className="wa-btn" onClick={() => shareWhatsApp(`🏸 ${t.name}\n👥 ${t.players.join(" & ")}\nGroup ${inA ? "A" : "B"} | ShuttlePro`)}>
                            <span>📤</span>
                          </button>
                          {isAdmin && (!confirming ? (
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={isLive}
                              style={isLive ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                              title={isLive ? "Can't remove a team that's currently live" : "Remove team"}
                              onClick={() => setRemoveConfirmId(t.id)}
                            >
                              <Icon.x />
                            </button>
                          ) : (
                            <div className="flex gap-8">
                              <button className="btn btn-danger btn-sm" onClick={() => { removeTeam(t.id); setRemoveConfirmId(null); }}>Confirm</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setRemoveConfirmId(null)}>Cancel</button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {expanded && (
                        <div className="team-detail-panel">
                          <div className="team-detail-section">
                            <div className="team-detail-label">🎯 Next Opponent</div>
                            {nextOpponent ? (
                              <div className="team-detail-next">
                                <span>{nextOpponent.logo} {nextOpponent.name}</span>
                                <span className="team-detail-meta">Upcoming</span>
                              </div>
                            ) : (
                              <div className="text-muted">No upcoming match scheduled</div>
                            )}
                          </div>
                          <div className="team-detail-section">
                            <div className="team-detail-label">📋 Match History ({teamHistory.length})</div>
                            {teamHistory.length === 0 && <div className="text-muted">No completed matches yet</div>}
                            {teamHistory.map((m) => {
                              const isTeam1 = m.team1.id === t.id;
                              const opp = isTeam1 ? m.team2 : m.team1;
                              const myScore = isTeam1 ? m.score1 : m.score2;
                              const oppScore = isTeam1 ? m.score2 : m.score1;
                              const won = (myScore ?? 0) >= (oppScore ?? 0);
                              return (
                                <div key={m.id} className="team-detail-history-row">
                                  <span className={`history-result ${won ? "win" : "loss"}`}>{won ? "W" : "L"}</span>
                                  <span className="history-opp">vs {opp.name}</span>
                                  <span className="history-score">{myScore}–{oppScore}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* NOTIFY TAB — Push Notifications (admin only).
              Route-protected: even if tab state were somehow forced
              to "notify" by a non-admin, this renders a lock screen
              instead of the actual controls — the useEffect above
              also bounces tab back to "dashboard" automatically. */}
          {tab === "notify" && (
            isAdmin ? (
            <div>
              {pushPermission === "default" && (
                <div className="card mb-24" style={{ display: "flex", alignItems: "center", gap: "16px", border: "1px solid rgba(96,165,250,0.3)", background: "rgba(96,165,250,0.06)" }}>
                  <div style={{ fontSize: "28px" }}>🔔</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "2px" }}>Enable push notifications</div>
                    <div className="text-muted">Get alerted the moment a match starts, ends, or the bracket updates — even with the app closed.</div>
                  </div>
                  <button className="btn btn-primary" onClick={requestPushPermission}>Enable</button>
                </div>
              )}
              {pushPermission === "granted" && (
                <div className="card mb-24" style={{ display: "flex", alignItems: "center", gap: "16px", border: "1px solid rgba(0,255,136,0.3)", background: "rgba(0,255,136,0.06)" }}>
                  <div style={{ fontSize: "28px" }}>✅</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "2px", color: "var(--accent)" }}>Notifications enabled on this device</div>
                    <div className="text-muted">You'll receive real OS-level alerts based on your preferences below.</div>
                  </div>
                </div>
              )}
              {pushPermission === "denied" && (
                <div className="card mb-24" style={{ display: "flex", alignItems: "center", gap: "16px", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)" }}>
                  <div style={{ fontSize: "28px" }}>🚫</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "2px", color: "#ef4444" }}>Notifications blocked</div>
                    <div className="text-muted">Enable notifications for this site in your browser settings to receive alerts.</div>
                  </div>
                </div>
              )}

              <div className="section-title">Notification Preferences</div>
              <div className="card mb-24">
                {[
                  { id: "match_starting", label: "Match Starting Soon", desc: "Just before your match begins", icon: "⏰" },
                  { id: "match_live", label: "Match Went Live", desc: "When your match starts", icon: "🔴" },
                  { id: "match_result", label: "Match Results", desc: "Final score when a match ends", icon: "✅" },
                  { id: "semifinal", label: "Semi-Final Draw", desc: "When semi-final fixtures are announced", icon: "🏆" },
                  { id: "final", label: "Final Announcement", desc: "When the championship match is set", icon: "🌟" },
                  { id: "schedule_change", label: "Schedule Delays", desc: "If a match is delayed", icon: "📅" },
                ].map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ width: 38, height: 38, borderRadius: "10px", background: "rgba(0,255,136,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>{t.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", fontWeight: 700 }}>{t.label}</div>
                      <div className="text-muted">{t.desc}</div>
                    </div>
                    <div
                      onClick={() => togglePushPref(t.id)}
                      style={{
                        position: "relative", width: 44, height: 24, borderRadius: "16px", cursor: "pointer", flexShrink: 0,
                        background: pushPrefs[t.id] ? "rgba(0,255,136,0.3)" : "rgba(255,255,255,0.1)",
                        border: `1px solid ${pushPrefs[t.id] ? "rgba(0,255,136,0.5)" : "rgba(255,255,255,0.1)"}`,
                        transition: "all 0.2s",
                      }}
                    >
                      <div style={{
                        position: "absolute", top: 2, left: pushPrefs[t.id] ? 21 : 2, width: 18, height: 18, borderRadius: "50%",
                        background: pushPrefs[t.id] ? "var(--accent)" : "var(--text-faint)", transition: "all 0.2s",
                        boxShadow: pushPrefs[t.id] ? "0 0 8px rgba(0,255,136,0.6)" : "none",
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="section-title">Send a Test Notification (Admin)</div>
              <div className="card mb-24">
                <div className="btn-row">
                  <button className="btn btn-secondary btn-sm" onClick={() => addNotif("Storm Eagles vs Thunder Hawks starts soon", "⏰")}>⏰ Match Starting</button>
                  <button className="btn btn-orange btn-sm" onClick={() => addNotif("Neon Vipers vs Iron Smash is now LIVE", "🔴")}>🔴 Match Live</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => addNotif("Storm Eagles won 21-18 against Thunder Hawks", "✅")}>✅ Match Result</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => addNotif("Semi-final fixtures are live — check the bracket!", "🏆")}>🏆 Semi-Final</button>
                </div>
              </div>

              <div className="section-title">Registered Devices ({registeredDevices.length})</div>
              <div className="card">
                {registeredDevices.length === 0 && (
                  <div className="text-muted" style={{ padding: "12px 0" }}>No devices registered yet. Enable notifications above to register this device.</div>
                )}
                {registeredDevices.map((d) => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "10px", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", border: "1px solid rgba(255,255,255,0.07)" }}>
                      {d.platform === "Android" ? "📱" : d.platform === "iOS" ? "📱" : "💻"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 700 }}>{d.name}</div>
                      <div className="text-muted">{d.platform} · Registered {d.time}</div>
                    </div>
                    <span className="status-badge" style={{ background: "rgba(0,255,136,0.1)", color: "var(--accent)", border: "1px solid rgba(0,255,136,0.3)" }}>ACTIVE</span>
                  </div>
                ))}
              </div>
            </div>
            ) : (
              <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔒</div>
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>Admin access required</div>
                <div className="text-muted">This page is only available to tournament admins.</div>
              </div>
            )
          )}

          {/* ADMIN TAB */}
          {tab === "admin" && (
            isAdmin ? (
            <div className="admin-grid">
              <div className="admin-sidebar">
                <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: "10px", letterSpacing: "2px", color: "var(--text-ghost)", marginBottom: "12px" }}>ADMIN PANEL</div>
                {[
                  { id: "matches", label: "Match Control", icon: "🏸" },
                  { id: "teams", label: "Team Mgmt", icon: "👥" },
                  { id: "notifs", label: "Notifications", icon: "🔔" },
                  { id: "phase", label: "Phase Control", icon: "⚡" },
                ].map((item) => (
                  <div key={item.id} className={`admin-menu-item ${adminSection === item.id ? "active" : ""}`} onClick={() => setAdminSection(item.id)}>
                    <span>{item.icon}</span> {item.label}
                  </div>
                ))}
              </div>
              <div className="admin-content">
                {adminSection === "matches" && (
                  <div>
                    <div className="section-title">Match Control</div>
                    {matches.filter(m => m.status !== "completed").map((m) => (
                      <div key={m.id} className="card mb-16" style={{ position: "relative" }}>
                        <div className="shuttle-trail">🏸</div>
                        <div className="flex justify-between items-center mb-8">
                          <span className={`group-tag group-${m.group === "A" ? "a" : "b"}`}>{m.group} • {m.stage}</span>
                          <span className={`status-badge status-${m.status === "live" ? "live" : m.status === "paused" ? "paused" : "upcoming"}`}>{m.status.toUpperCase()}</span>
                        </div>
                        <div className="flex items-center gap-16 mb-16">
                          <div style={{ flex: 1, fontWeight: 700, fontSize: "15px" }}>{m.team1.logo} {m.team1.name}</div>
                          <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: "18px", color: "var(--accent)" }}>
                            {m.score1 ?? "-"} : {m.score2 ?? "-"}
                          </div>
                          <div style={{ flex: 1, fontWeight: 700, fontSize: "15px", textAlign: "right" }}>{m.team2.name} {m.team2.logo}</div>
                        </div>
                        <div className="btn-row">
                          {m.status === "pending" && <button className="btn btn-secondary btn-sm" onClick={() => startMatch(m.id)}><Icon.play /> Start</button>}
                          {m.status === "live" && <button className="btn btn-orange btn-sm" onClick={() => openScoreModal(m)}>📝 Enter Score</button>}
                          {m.status === "live" && <button className="btn btn-secondary btn-sm" onClick={() => pauseMatch(m.id)}>⏸ Pause</button>}
                          {m.status === "paused" && <button className="btn btn-secondary btn-sm" onClick={() => resumeMatch(m.id)}><Icon.play /> Resume</button>}
                          {(m.status === "live" || m.status === "paused") && <button className="btn btn-danger btn-sm" onClick={() => completeMatch(m.id)}>✅ Complete</button>}
                          <button className="wa-btn" onClick={() => shareWhatsApp(`🏸 ${m.team1.name} vs ${m.team2.name}\nShuttlePro`)}>📱 Share</button>
                        </div>
                      </div>
                    ))}
                    {matches.filter(m => m.status !== "completed").length === 0 && (
                      <div className="card" style={{ textAlign: "center", color: "var(--text-faint)", padding: "48px" }}>All matches complete! 🏆</div>
                    )}
                  </div>
                )}

                {adminSection === "notifs" && (
                  <div>
                    <div className="section-title">Notification Center</div>
                    <div className="btn-row mb-24">
                      <button className="btn btn-secondary btn-sm" onClick={() => addNotif("🏸 Match starting soon!", "⏰")}>Send Match Alert</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => addNotif("📢 Semi-finals draw is live!", "🏆")}>Semi-final Alert</button>
                      <button className="btn btn-orange btn-sm" onClick={() => addNotif("🔴 FINAL MATCH IS ABOUT TO BEGIN!", "🚨")}>Final Alert</button>
                    </div>
                    <div className="notif-list">
                      {notifications.map((n) => (
                        <div key={n.id} className="notif-item">
                          <div className="notif-icon" style={{ background: "rgba(0,255,136,0.06)" }}>{n.icon}</div>
                          <div className="notif-text">
                            <div className="notif-title">{n.text}</div>
                            <div className="notif-time">{n.time}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {adminSection === "phase" && (
                  <div>
                    <div className="section-title">Phase Control</div>
                    <div className="card mb-16">
                      <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: "12px", color: "var(--text-faint)", marginBottom: "8px" }}>CURRENT PHASE</div>
                      <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: "24px", color: "var(--accent)", textTransform: "uppercase", marginBottom: "16px" }}>{tournamentPhase}</div>
                      <div className="btn-row">
                        <button className="btn btn-secondary" onClick={generateSemifinals} disabled={tournamentPhase !== "group"}>
                          → Generate Semi-Finals
                        </button>
                        <button className="btn btn-secondary" onClick={generateFinal}
                          disabled={tournamentPhase !== "semifinal" || !semifinalMatches.every(m => m.status === "completed")}>
                          → Generate Final
                        </button>
                      </div>
                    </div>
                    <div className="card">
                      <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: "11px", color: "var(--text-faint)", letterSpacing: "2px", marginBottom: "12px" }}>QUALIFICATION STATUS</div>
                      <div style={{ fontSize: "13px", color: "var(--text-muted)", lineHeight: "1.8" }}>
                        <div>✅ Group A Topper: <span style={{ color: "var(--accent)" }}>{standingsA[0]?.team.name ?? "TBD"}</span></div>
                        <div>✅ Group A Runner-Up: <span style={{ color: "#3b82f6" }}>{standingsA[1]?.team.name ?? "TBD"}</span></div>
                        <div>✅ Group B Topper: <span style={{ color: "var(--accent)" }}>{standingsB[0]?.team.name ?? "TBD"}</span></div>
                        <div>✅ Group B Runner-Up: <span style={{ color: "#3b82f6" }}>{standingsB[1]?.team.name ?? "TBD"}</span></div>
                      </div>
                    </div>
                  </div>
                )}
                {adminSection === "teams" && (
                  <div>
                    <div className="flex justify-between items-center mb-16">
                      <div className="section-title" style={{ margin: 0 }}>Team Management</div>
                      <button className="btn btn-primary btn-sm" onClick={() => setAddTeamForm(true)}><Icon.plus /> Add</button>
                    </div>
                    {addTeamForm && (
                      <div className="card mb-16">
                        <div className="input-group"><label className="input-label">Team Name</label><input className="input" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Team name" /></div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                          <div className="input-group"><label className="input-label">Player 1</label><input className="input" value={newP1} onChange={(e) => setNewP1(e.target.value)} placeholder="Player 1" /></div>
                          <div className="input-group"><label className="input-label">Player 2</label><input className="input" value={newP2} onChange={(e) => setNewP2(e.target.value)} placeholder="Player 2" /></div>
                        </div>
                        <div className="btn-row">
                          <button className="btn btn-primary btn-sm" onClick={addTeam}>Save</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setAddTeamForm(false)}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {teams.map((t) => {
                      const isLive = matches.some((m) => m.status === "live" && (m.team1.id === t.id || m.team2.id === t.id));
                      const confirming = removeConfirmId === t.id;
                      return (
                        <div key={t.id} className="team-card mb-16">
                          <div className="team-icon">{t.logo}</div>
                          <div className="team-info-block">
                            <div className="team-card-name">{t.name}</div>
                            <div className="team-card-players">{t.players.join(" & ")}</div>
                          </div>
                          {!confirming ? (
                            <button className="btn btn-danger btn-sm" disabled={isLive}
                              style={isLive ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                              title={isLive ? "Can't remove a team that's currently live" : "Remove team"}
                              onClick={() => setRemoveConfirmId(t.id)}>
                              <Icon.x />
                            </button>
                          ) : (
                            <div className="flex gap-8">
                              <button className="btn btn-danger btn-sm" onClick={() => { removeTeam(t.id); setRemoveConfirmId(null); }}>Confirm</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setRemoveConfirmId(null)}>Cancel</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            ) : (
              <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔒</div>
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>Admin access required</div>
                <div className="text-muted">This page is only available to tournament admins.</div>
              </div>
            )
          )}
        </div>

        {/* MOBILE NAV */}
        <div className="mobile-nav">
          {TABS.filter((t) => !t.adminOnly || isAdmin).map((t) => (
            <button key={t.id} className={`mobile-nav-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* LIVE SCORING SCREEN */}
        {scoreModal && (
          <LiveScoringScreen
            match={matches.find((m) => m.id === scoreModal.id) || scoreModal}
            onScore={(teamKey) => scorePoint(scoreModal.id, teamKey)}
            onRestore={(fields) => restoreMatchFields(scoreModal.id, fields)}
            onPause={() => pauseMatch(scoreModal.id)}
            onResume={() => resumeMatch(scoreModal.id)}
            onComplete={() => { completeMatch(scoreModal.id); setScoreModal(null); }}
            onExit={() => setScoreModal(null)}
          />
        )}

        {/* ADMIN LOGIN MODAL */}
        {showAdminLogin && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => { setShowAdminLogin(false); setAdminLoginError(""); setAdminPasscodeInput(""); }}>
            <div className="card" style={{ width: "90%", maxWidth: "380px", background: "rgba(17,17,24,0.98)", border: "1px solid rgba(0,255,136,0.2)" }}
              onClick={(e) => e.stopPropagation()}>
              <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: "13px", color: "var(--accent)", letterSpacing: "2px", marginBottom: "16px" }}>🔒 ADMIN LOGIN</div>
              <div className="input-group">
                <label className="input-label">Passcode</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Enter admin passcode"
                  value={adminPasscodeInput}
                  onChange={(e) => { setAdminPasscodeInput(e.target.value); setAdminLoginError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && attemptAdminLogin()}
                  autoFocus
                />
                {adminLoginError && <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "8px" }}>{adminLoginError}</div>}
              </div>
              <div className="btn-row">
                <button className="btn btn-primary flex-1" onClick={attemptAdminLogin}>Login</button>
                <button className="btn btn-secondary" onClick={() => { setShowAdminLogin(false); setAdminLoginError(""); setAdminPasscodeInput(""); }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* RULES / INFO MODAL — requirement #7. Triggered from a small
            icon placed on the Dashboard/Matches page content itself,
            not from the navbar, so it doesn't add another nav item. */}
        {showRules && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
            onClick={() => setShowRules(false)}>
            <div className="card" style={{ width: "100%", maxWidth: "520px", maxHeight: "80vh", overflowY: "auto", background: "rgba(17,17,24,0.98)", border: "1px solid rgba(0,255,136,0.2)" }}
              onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-16">
                <div style={{ fontFamily: "Orbitron, sans-serif", fontSize: "14px", color: "var(--accent)", letterSpacing: "1.5px" }}>📖 RULES & POINTS GUIDE</div>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowRules(false)}><Icon.x /></button>
              </div>

              <div className="mb-16">
                <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "6px" }}>🏸 How matches work</div>
                <div className="text-muted" style={{ fontSize: "13px", lineHeight: "1.7" }}>
                  Every team plays every other team in their group once (this is the "group stage"). The top 2 teams from each group then move on to the semi-finals, and the two semi-final winners play in the Final.
                </div>
              </div>

              <div className="mb-16">
                <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "6px" }}>🏆 Win / Loss & points</div>
                <div className="text-muted" style={{ fontSize: "13px", lineHeight: "1.7" }}>
                  Whichever team scores more points in a match wins it. A win is worth <b style={{ color: "var(--accent)" }}>2 points</b> in the standings table. A loss is worth 0 points.
                </div>
              </div>

              <div className="mb-16">
                <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "6px" }}>📊 How standings are calculated</div>
                <div className="text-muted" style={{ fontSize: "13px", lineHeight: "1.7" }}>
                  Teams are ranked by total <b>points (PTS)</b> first. <b>PF</b> is total points the team has scored across all matches, <b>PA</b> is total points scored against them, and <b>PD</b> is the difference between the two (PF − PA) — a bigger PD generally means a more dominant run.
                </div>
              </div>

              <div className="mb-16">
                <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "6px" }}>🥇 MVP Leaderboard</div>
                <div className="text-muted" style={{ fontSize: "13px", lineHeight: "1.7" }}>
                  The MVP leaderboard simply combines both groups into one ranked list using the same PTS → PD ordering, so you can see how every team in the tournament stacks up against each other, not just within their own group.
                </div>
              </div>

              <div className="mb-16">
                <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "6px" }}>⚖️ Tie-breakers</div>
                <div className="text-muted" style={{ fontSize: "13px", lineHeight: "1.7" }}>
                  If two teams finish with the same number of points, the tie is broken in this order:
                  <br/>1. Higher point difference (PD)
                  <br/>2. Result of the head-to-head match between the tied teams
                  <br/>3. Higher total points scored (PF)
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", marginBottom: "6px" }}>🔁 Match scheduling</div>
                <div className="text-muted" style={{ fontSize: "13px", lineHeight: "1.7" }}>
                  Matches are queued up automatically in a simple, fair order — no team is scheduled twice in a row, and everyone gets a breather between their matches. You don't need to worry about courts or time-slots; just check the Matches page to see what's live, what's next, and what's done.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* WINNER CELEBRATION */}
        {winner && (
          <div className="winner-overlay" onClick={() => setWinner(null)}>
            <div className="winner-card" onClick={(e) => e.stopPropagation()}>
              <div className="confetti" />
              <div className="winner-trophy">🏆</div>
              <div className="winner-label">🏸 Tournament Champion</div>
              <div className="winner-name">{winner.name}</div>
              <div className="winner-sub">{winner.players?.join(" & ")}</div>
              <div className="btn-row" style={{ justifyContent: "center" }}>
                <button className="btn btn-primary" onClick={() => shareWhatsApp(`🏆 CHAMPIONS!\n${winner.name} wins the GameNova Badminton Invitational 2026! 🏸🎉`)}>📱 Share Victory</button>
                <button className="btn btn-secondary" onClick={() => setWinner(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── MATCH CARD COMPONENT ─────────────────────────────────────────────────────
function MatchCard({ match: m, onStart, onScore, onComplete, onPause, onResume, onShare }) {
  const statusClass = m.status === "live" ? "live" : m.status === "paused" ? "paused" : m.status === "completed" ? "completed" : "";
  const stageLabel = m.stage === "semifinal" ? "SF" : m.stage === "final" ? "FINAL" : `Group ${m.group}`;

  // ── SELF-CONTAINED TIMER ───────────────────────────────────
  // Previously this ticked from a single liveTimer value owned by
  // the top-level App component, which meant the ENTIRE app
  // re-rendered every second while any match was live (this was
  // a major cause of the UI feeling sluggish / tabs "not responding").
  // Now each card ticks independently — only this small component
  // re-renders each second, only while it's actually live.
  // While "paused" the timer simply stops advancing (frozen at
  // whatever elapsed value it last reached) rather than resetting.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (m.status !== "live" || !m.startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - m.startedAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [m.status, m.startedAt]);

  function fmt(s) { if (s === null) return "-"; return String(s); }

  return (
    <div className={`match-card ${statusClass}`}>
      {m.status === "live" && <div className="shuttle-trail">🏸</div>}
      <div className="match-meta">
        <span className="match-stage">{stageLabel}</span>
      </div>
      <div className="match-teams">
        <div className="team-info">
          <div className="team-name">{m.team1.logo} {m.team1.name}</div>
          <div className="team-players">{m.team1.players?.join(" & ")}</div>
        </div>
        <div className="score-block">
          {m.status === "live" && (
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", color: "#ff6b35", marginBottom: "4px" }}>
              {elapsed > 0 ? `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}` : "LIVE"}
            </div>
          )}
          <div className="score-display">
            <span style={{ color: m.status === "completed" && (m.score1 ?? 0) > (m.score2 ?? 0) ? "var(--accent)" : "var(--text-strong)" }}>{fmt(m.score1)}</span>
            <span style={{ color: "var(--text-ghost)" }}> – </span>
            <span style={{ color: m.status === "completed" && (m.score2 ?? 0) > (m.score1 ?? 0) ? "var(--accent)" : "var(--text-strong)" }}>{fmt(m.score2)}</span>
          </div>
          {m.status !== "live" && <div className="vs-badge">VS</div>}
        </div>
        <div className="team-info" style={{ textAlign: "right" }}>
          <div className="team-name">{m.team2.name} {m.team2.logo}</div>
          <div className="team-players">{m.team2.players?.join(" & ")}</div>
        </div>
      </div>
      <div className="match-footer">
        <div className="row" style={{ gap: "6px" }}>
          {m.status === "completed" && <span className="status-badge status-done">COMPLETED</span>}
          {m.status === "live" && <span className="status-badge status-live">LIVE</span>}
          {m.status === "paused" && <span className="status-badge status-paused">PAUSED</span>}
          {m.status === "pending" && m.stage === "semifinal" && <span className="status-badge status-semifinal">SEMI-FINAL</span>}
          {m.status === "pending" && m.stage === "final" && <span className="status-badge status-final">FINAL</span>}
          {m.status === "pending" && m.stage === "group" && <span className="status-badge status-upcoming">UPCOMING</span>}
        </div>
        <div className="row" style={{ gap: "8px" }}>
          {m.status === "pending" && onStart && <button className="btn btn-secondary btn-sm" onClick={onStart}><Icon.play /> Start</button>}
          {m.status === "live" && onScore && <button className="btn btn-orange btn-sm" onClick={onScore}>📝 Score</button>}
          {m.status === "live" && onPause && <button className="btn btn-secondary btn-sm" onClick={onPause}>⏸</button>}
          {m.status === "paused" && onResume && <button className="btn btn-secondary btn-sm" onClick={onResume}><Icon.play /> Resume</button>}
          {m.status === "paused" && onScore && <button className="btn btn-orange btn-sm" onClick={onScore}>📝 Score</button>}
          {(m.status === "live" || m.status === "paused") && onComplete && <button className="btn btn-danger btn-sm" onClick={onComplete}>✅ End</button>}
          {onShare && <button className="wa-btn" onClick={onShare}><Icon.share /> WA</button>}
        </div>
      </div>
    </div>
  );
}

// ─── STANDINGS TABLE COMPONENT ────────────────────────────────────────────────
function StandingsTable({ standings, showQualification }) {
  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th>#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th><th>PD</th><th>PTS</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((s, i) => (
          <tr key={s.team.id}>
            <td><span className={`rank-cell ${i === 0 ? "rank-1" : i === 1 ? "rank-2" : ""}`}>{i + 1}</span></td>
            <td>
              <div className="team-cell">
                {showQualification && <span className="rank-q" style={{ background: i < 2 ? "var(--accent)" : "var(--text-ghost)" }} />}
                <span className="team-emoji">{s.team.logo}</span>
                <div>
                  <div className="team-cell-name">{s.team.name}</div>
                  <div className="team-cell-subs">{s.team.players?.join(" & ")}</div>
                </div>
              </div>
            </td>
            <td className="stat-cell" style={{ color: "var(--accent)" }}>{s.W}</td>
            <td className="stat-cell" style={{ color: "#ef4444" }}>{s.L}</td>
            <td className="stat-cell">{s.PF}</td>
            <td className="stat-cell">{s.PA}</td>
            <td className={`stat-cell ${s.PD > 0 ? "pd-pos" : s.PD < 0 ? "pd-neg" : ""}`}>{s.PD > 0 ? "+" : ""}{s.PD}</td>
            <td className="pts-cell">{s.pts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── BRACKET MATCH COMPONENT ──────────────────────────────────────────────────
function BracketMatch({ match: m }) {
  const w1 = m.status === "completed" && (m.score1 ?? 0) >= (m.score2 ?? 0);
  const w2 = m.status === "completed" && (m.score2 ?? 0) > (m.score1 ?? 0);
  return (
    <div className="bracket-match">
      <div className={`bracket-team ${w1 ? "winner" : m.team1 ? "" : "tbd"}`}>
        <span>{m.team1 ? `${m.team1.logo} ${m.team1.name}` : "TBD"}</span>
        {m.score1 !== null && <span className="bracket-score">{m.score1}</span>}
      </div>
      <div className={`bracket-team ${w2 ? "winner" : m.team2 ? "" : "tbd"}`}>
        <span>{m.team2 ? `${m.team2.logo} ${m.team2.name}` : "TBD"}</span>
        {m.score2 !== null && <span className="bracket-score">{m.score2}</span>}
      </div>
    </div>
  );
}
