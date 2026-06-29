import { useState, useEffect } from "react";

/* ════════════════════════════════════════════════════════════
 * LiveScoringScreen
 *
 * Full-screen tap-to-score view for a single match. Renders inside
 * BadmintonTournament.jsx wherever `scoreModal` used to show the
 * old numeric "Update Score" popup — same trigger (the 📝 Enter
 * Score button), same underlying `matches` state, just a richer
 * live-scoring surface instead of two number inputs.
 *
 * This component is fully controlled — it owns no score data
 * itself. Every tap calls back up to the parent, which is the
 * same `matches` array already used everywhere else in the app
 * (standings, bracket, MVP table, etc.), so nothing new needs to
 * be persisted separately and scores survive switching tabs or
 * reopening this screen, exactly like every other piece of match
 * state in the app.
 *
 * Props:
 *   match      — the live match object { id, team1, team2, score1,
 *                score2, status, startedAt, serverTeam, serverIndex }
 *   onScore    — (teamKey: "team1" | "team2") => void
 *   onRestore  — (fields) => void   — used by local undo/redo to
 *                snap score1/score2/serverTeam/serverIndex back
 *   onPause    — () => void
 *   onResume   — () => void
 *   onComplete — () => void
 *   onExit     — () => void   — closes this screen, returns to dashboard
 * ════════════════════════════════════════════════════════════ */

const SET_CAP = 45; // hard ceiling — points normally stop being added once admin hits Complete

export default function LiveScoringScreen({
  match,
  onScore,
  onRestore,
  onPause,
  onResume,
  onComplete,
  onExit,
}) {
  const [orientation, setOrientation] = useState("landscape");
  const [justScored, setJustScored] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  // ── self-contained timer, same pattern as MatchCard: ticks from
  //    startedAt while live, freezes at its last value while paused ──
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (match.status !== "live" || !match.startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - match.startedAt) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [match.status, match.startedAt]);

  useEffect(() => {
    if (!justScored) return;
    const t = setTimeout(() => setJustScored(null), 900);
    return () => clearTimeout(t);
  }, [justScored]);

  const locked = match.status !== "live";

  const snapshot = () => ({
    score1: match.score1,
    score2: match.score2,
    serverTeam: match.serverTeam,
    serverIndex: match.serverIndex,
  });

  const handleScore = (teamKey) => {
    if (locked) return;
    const hi = Math.max(match.score1 ?? 0, match.score2 ?? 0);
    if (hi >= SET_CAP) return;
    setHistory((h) => [...h, snapshot()]);
    setFuture([]);
    setJustScored(teamKey === "team1" ? "A" : "B");
    onScore(teamKey);
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture((f) => [snapshot(), ...f]);
    setHistory((h) => h.slice(0, -1));
    onRestore(prev);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory((h) => [...h, snapshot()]);
    setFuture((f) => f.slice(1));
    onRestore(next);
  };

  const score1 = match.score1 ?? 0;
  const score2 = match.score2 ?? 0;
  const serverTeam = match.serverTeam ?? "team1";
  const serverIndex = match.serverIndex ?? 0;
  const serverTeamObj = serverTeam === "team1" ? match.team1 : match.team2;
  const serverName = serverTeamObj?.players?.[serverIndex] ?? "—";
  const serverScore = serverTeam === "team1" ? score1 : score2;
  const otherScore = serverTeam === "team1" ? score2 : score1;
  const isServing = (teamKey, idx) => serverTeam === teamKey && serverIndex === idx;
  const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--bg)",
        zIndex: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "14px",
      }}
    >
      <style>{`
        .lss-frame{
          width:100%; height:100%; max-height:680px;
          display:flex; flex-direction:column; gap:10px;
          background:var(--card-bg-solid);
          border:1px solid var(--card-border);
          border-radius:18px; padding:14px; position:relative;
        }
        .lss-portrait .lss-frame{ max-width:420px; aspect-ratio:9/18; margin:0 auto; }
        .lss-landscape .lss-frame{ max-width:1040px; aspect-ratio:19/9.4; margin:0 auto; }

        .lss-topbar{ display:flex; align-items:center; gap:10px; }
        .lss-iconbtn{
          width:38px; height:38px; min-width:38px; border-radius:10px;
          border:1px solid var(--card-border); background:var(--hover-tint);
          display:flex; align-items:center; justify-content:center;
          color:var(--text-secondary); cursor:pointer; font-size:16px;
          transition:all .15s ease;
        }
        .lss-iconbtn:hover{ color:var(--accent); border-color:var(--card-border-hover); }
        .lss-iconbtn:disabled{ opacity:.3; cursor:default; }
        .lss-icongroup{ display:flex; gap:8px; }

        .lss-scorecard{
          flex:1; display:flex; align-items:center; gap:10px;
          background:var(--hover-tint); border:1px solid var(--card-border);
          border-radius:12px; padding:8px 16px; position:relative; min-width:0;
        }
        .lss-rows{ flex:1; display:flex; flex-direction:column; gap:7px; min-width:0; }
        .lss-row{ display:flex; align-items:center; gap:10px; min-width:0; }
        .lss-dot{
          width:7px; height:7px; border-radius:50%; background:var(--accent); flex:0 0 auto;
          box-shadow:0 0 8px var(--accent); animation:lss-pulse 1.4s ease-in-out infinite;
        }
        .lss-dot.ghost{ opacity:0; }
        @keyframes lss-pulse{ 0%,100%{ transform:scale(1); opacity:1;} 50%{ transform:scale(1.4); opacity:.6;} }
        .lss-teamname{
          min-width:0; flex:1; font-weight:700; font-size:13.5px; color:var(--text-strong);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .lss-teamname small{ display:block; font-weight:500; font-size:10.5px; color:var(--text-muted); }
        .lss-livescore{
          font-family:'Orbitron',sans-serif; font-size:21px; font-weight:800; color:var(--accent);
          min-width:34px; text-align:right; flex:0 0 auto; transition:transform .25s ease;
        }
        .lss-livescore.bump{ transform:scale(1.25); }

        .lss-timer{
          flex:0 0 auto; display:flex; align-items:center; gap:6px;
          font-family:'JetBrains Mono', monospace; font-size:12px; font-weight:600; color:var(--text-secondary);
          background:var(--code-bg); border:1px solid var(--card-border); border-radius:999px;
          padding:5px 12px; position:absolute; top:-9px; left:50%; transform:translateX(-50%);
        }

        .lss-servebar{
          position:absolute; top:10px; left:50%; transform:translateX(-50%);
          display:flex; align-items:center; gap:8px;
          background:rgba(0,255,136,0.1); border:1px solid var(--card-border-hover);
          color:var(--accent); font-weight:700; font-size:12px;
          padding:6px 14px; border-radius:999px; white-space:nowrap; z-index:5;
        }
        .lss-servebar .score{
          font-family:'Orbitron',sans-serif; background:rgba(0,0,0,0.35);
          padding:2px 9px; border-radius:999px; font-size:11.5px; color:var(--text-strong);
        }

        .lss-court-wrap{ flex:1; display:flex; gap:8px; min-height:0; }
        .lss-plusrail{
          flex:0 0 42px; border-radius:10px; border:1px solid var(--card-border);
          background:var(--hover-tint); display:flex; align-items:center; justify-content:center;
          cursor:pointer; transition:background .15s ease, border-color .15s ease; user-select:none;
        }
        .lss-plusrail:hover{ background:rgba(0,255,136,0.08); border-color:var(--card-border-hover); }
        .lss-plusrail.locked{ cursor:default; opacity:.35; }
        .lss-plusrail.locked:hover{ background:var(--hover-tint); border-color:var(--card-border); }
        .lss-plusrail span{
          writing-mode:vertical-rl; transform:rotate(180deg);
          font-family:'Orbitron',sans-serif; font-weight:700; font-size:13px; letter-spacing:.08em;
          color:var(--text-secondary);
        }
        .lss-plusrail:not(.locked):hover span{ color:var(--accent); }

        .lss-court{
          flex:1; position:relative; border-radius:12px; overflow:hidden;
          border:1px solid var(--card-border);
          background:
            repeating-linear-gradient(0deg, transparent 0 39px, rgba(255,255,255,0.015) 39px 40px),
            var(--surface);
          display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr;
        }
        .lss-court::before{
          content:''; position:absolute; background:linear-gradient(180deg, transparent, rgba(0,255,136,0.35), transparent);
        }
        .lss-landscape .lss-court::before{ left:50%; top:6%; bottom:6%; width:2px; transform:translateX(-1px); }
        .lss-portrait .lss-court::before{ top:50%; left:6%; right:6%; height:2px; transform:translateY(-1px); }
        .lss-court::after{ content:''; position:absolute; background:var(--divider); }
        .lss-landscape .lss-court::after{ top:50%; left:4%; right:4%; height:1px; }
        .lss-portrait .lss-court::after{ left:50%; top:4%; bottom:4%; width:1px; }

        .lss-cell{
          position:relative; display:flex; align-items:center; gap:10px; padding:0 18px;
          transition:background .15s ease;
        }
        .lss-cell:not(.locked):hover{ background:var(--hover-tint); }
        .lss-cell.locked{ cursor:default; }
        .lss-cell.serving{ background:rgba(0,255,136,0.06); }
        .lss-avatar{
          width:30px; height:30px; border-radius:9px; flex:0 0 auto;
          display:flex; align-items:center; justify-content:center; font-size:15px;
          background:var(--hover-tint-strong); border:1px solid var(--card-border);
        }
        .lss-cell.serving .lss-avatar{ border-color:var(--card-border-hover); }
        .lss-pname{ font-size:13.5px; font-weight:700; color:var(--text-strong); }
        .lss-cell.serving .lss-pname{ color:var(--accent); }
        .lss-cell .lss-dot{ position:absolute; }
        .lss-landscape .lss-cell.side-1 .lss-dot{ right:9px; }
        .lss-landscape .lss-cell.side-2 .lss-dot{ left:9px; }
        .lss-portrait .lss-cell .lss-dot{ top:9px; right:9px; }

        .lss-controlbar{ display:flex; align-items:center; gap:8px; }
        .lss-pill{
          display:flex; align-items:center; gap:6px; height:36px; padding:0 15px;
          border-radius:999px; font-size:12.5px; font-weight:700; cursor:pointer;
          border:1px solid var(--card-border); background:var(--hover-tint); color:var(--text-secondary);
          transition:all .15s ease; white-space:nowrap;
        }
        .lss-pill:hover{ filter:brightness(1.15); }
        .lss-pill:disabled{ opacity:.4; cursor:default; filter:none; }
        .lss-pill.amber{ color:#ff6b35; border-color:rgba(255,107,53,0.35); background:rgba(255,107,53,0.1); }
        .lss-pill.green{ color:var(--accent-text-on); border-color:var(--accent); background:var(--accent); }
        .lss-pill.green.done{ color:var(--accent); background:rgba(0,255,136,0.1); cursor:default; }
        .lss-spacer{ flex:1; }
        .lss-statuspill{
          display:flex; align-items:center; gap:6px; height:36px; padding:0 14px;
          border-radius:999px; font-size:11px; font-weight:800; letter-spacing:.07em; text-transform:uppercase;
          border:1px solid var(--card-border); color:var(--text-secondary); background:var(--hover-tint);
        }
        .lss-statuspill.live{ color:var(--accent); border-color:var(--card-border-hover); background:rgba(0,255,136,0.1); }
        .lss-statuspill.paused{ color:#ff6b35; border-color:rgba(255,107,53,0.3); background:rgba(255,107,53,0.1); }
        .lss-statuspill .liveball{
          width:6px; height:6px; border-radius:50%; background:var(--accent); box-shadow:0 0 6px var(--accent);
          animation:lss-pulse 1.2s ease-in-out infinite;
        }

        .lss-caption{ text-align:center; font-size:11px; color:var(--text-faint); }
      `}</style>

      <div className={`lss-${orientation} lss-shellinner`} style={{ width: "100%", height: "100%", display: "flex" }}>
        <div className="lss-frame">
          <div className="lss-topbar">
            <div className="lss-icongroup">
              <button
                className="lss-iconbtn"
                title="Toggle orientation"
                onClick={() => setOrientation((o) => (o === "landscape" ? "portrait" : "landscape"))}
              >
                ⟳
              </button>
            </div>

            <div className="lss-scorecard">
              <div className="lss-timer">⏱ {fmtClock(elapsed)}</div>
              <div className="lss-rows">
                <div className="lss-row">
                  <span className={`lss-dot ${serverTeam === "team2" ? "" : "ghost"}`} />
                  <span className="lss-teamname">
                    {match.team2.logo} {match.team2.name}
                    <small>{match.team2.players?.join(" & ")}</small>
                  </span>
                  <span className={`lss-livescore ${justScored === "B" ? "bump" : ""}`}>{score2}</span>
                </div>
                <div className="lss-row">
                  <span className={`lss-dot ${serverTeam === "team1" ? "" : "ghost"}`} />
                  <span className="lss-teamname">
                    {match.team1.logo} {match.team1.name}
                    <small>{match.team1.players?.join(" & ")}</small>
                  </span>
                  <span className={`lss-livescore ${justScored === "A" ? "bump" : ""}`}>{score1}</span>
                </div>
              </div>
            </div>

            <div className="lss-icongroup">
              <button className="lss-iconbtn" disabled={history.length === 0 || locked} title="Undo" onClick={undo}>↩</button>
              <button className="lss-iconbtn" disabled={future.length === 0 || locked} title="Redo" onClick={redo}>↪</button>
            </div>
          </div>

          <div className="lss-court-wrap">
            <div
              className={`lss-plusrail ${locked ? "locked" : ""}`}
              onClick={() => handleScore("team1")}
              title={`Point — ${match.team1.name}`}
            >
              <span>+1</span>
            </div>

            <div className="lss-court">
              <div className="lss-servebar">
                🏸 Serving — {serverName}
                <span className="score">{serverScore}-{otherScore}</span>
              </div>

              <div
                className={`lss-cell side-1 ${isServing("team1", 0) ? "serving" : ""} ${locked ? "locked" : ""}`}
                onClick={() => handleScore("team1")}
                style={{ gridColumn: 1, gridRow: 1, cursor: locked ? "default" : "pointer" }}
              >
                <span className="lss-avatar">🏸</span>
                <span className="lss-pname">{match.team1.players?.[0]}</span>
                <span className={`lss-dot ${isServing("team1", 0) ? "" : "ghost"}`} />
              </div>

              <div
                className={`lss-cell side-2 ${isServing("team2", 0) ? "serving" : ""} ${locked ? "locked" : ""}`}
                onClick={() => handleScore("team2")}
                style={{ gridColumn: 2, gridRow: 1, cursor: locked ? "default" : "pointer", justifyContent: "flex-end" }}
              >
                <span className={`lss-dot ${isServing("team2", 0) ? "" : "ghost"}`} />
                <span className="lss-pname">{match.team2.players?.[0]}</span>
                <span className="lss-avatar">🏸</span>
              </div>

              <div
                className={`lss-cell side-1 ${isServing("team1", 1) ? "serving" : ""} ${locked ? "locked" : ""}`}
                onClick={() => handleScore("team1")}
                style={{ gridColumn: 1, gridRow: 2, cursor: locked ? "default" : "pointer" }}
              >
                <span className="lss-avatar">🏸</span>
                <span className="lss-pname">{match.team1.players?.[1]}</span>
                <span className={`lss-dot ${isServing("team1", 1) ? "" : "ghost"}`} />
              </div>

              <div
                className={`lss-cell side-2 ${isServing("team2", 1) ? "serving" : ""} ${locked ? "locked" : ""}`}
                onClick={() => handleScore("team2")}
                style={{ gridColumn: 2, gridRow: 2, cursor: locked ? "default" : "pointer", justifyContent: "flex-end" }}
              >
                <span className={`lss-dot ${isServing("team2", 1) ? "" : "ghost"}`} />
                <span className="lss-pname">{match.team2.players?.[1]}</span>
                <span className="lss-avatar">🏸</span>
              </div>
            </div>

            <div
              className={`lss-plusrail ${locked ? "locked" : ""}`}
              onClick={() => handleScore("team2")}
              title={`Point — ${match.team2.name}`}
            >
              <span>+1</span>
            </div>
          </div>

          <div className="lss-controlbar">
            <button className="lss-pill" onClick={onExit} title="Back to dashboard">← Exit</button>
            {match.status !== "completed" && (
              <button
                className="lss-pill amber"
                onClick={match.status === "paused" ? onResume : onPause}
                title={match.status === "paused" ? "Resume match" : "Pause match"}
              >
                {match.status === "paused" ? "▶ Resume" : "⏸ Pause"}
              </button>
            )}
            <button
              className={`lss-pill green ${match.status === "completed" ? "done" : ""}`}
              onClick={onComplete}
              disabled={match.status === "completed"}
              title="Mark match complete"
            >
              ✅ {match.status === "completed" ? "Completed" : "Complete"}
            </button>

            <span className="lss-spacer" />

            <span className={`lss-statuspill ${match.status}`}>
              {match.status === "live" && <span className="liveball" />}
              {match.status === "live" ? "Live" : match.status === "paused" ? "Paused" : "Completed"}
            </span>
          </div>

          <div className="lss-caption">
            {locked
              ? `Scoring is locked while the match is ${match.status} — tap Resume to continue.`
              : "Tap either half of the court or the +1 rails to score"}
          </div>
        </div>
      </div>
    </div>
  );
}
