import { useState, useEffect } from "react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');`;

const NOTIF_TYPES = [
  { id: "match_starting", label: "Match Starting Soon", desc: "10 minutes before your match", icon: "⏰", color: "#00ff88", defaultOn: true },
  { id: "match_live", label: "Match Went Live", desc: "When your match starts", icon: "🔴", color: "#ff6b35", defaultOn: true },
  { id: "match_result", label: "Match Results", desc: "Final score when a match ends", icon: "✅", color: "#3b82f6", defaultOn: true },
  { id: "semifinal", label: "Semi-Final Draw", desc: "When semi-final fixtures are announced", icon: "🏆", color: "#a855f7", defaultOn: true },
  { id: "final", label: "Final Announcement", desc: "When the championship match is set", icon: "🌟", color: "#facc15", defaultOn: true },
  { id: "schedule_change", label: "Schedule Delays", desc: "If a match is delayed or rescheduled", icon: "📅", color: "#ef4444", defaultOn: true },
];

const DEMO_LOG = [
  { id: 1, title: "Match Starting Soon", body: "Storm Eagles vs Thunder Hawks starts in 10 min", icon: "⏰", time: "2 min ago", platform: "android" },
  { id: 2, title: "🔴 Match Live", body: "Neon Vipers vs Iron Smash is now LIVE", icon: "🔴", time: "8 min ago", platform: "ios" },
  { id: 3, title: "✅ Match Result", body: "Storm Eagles won 21-18 against Thunder Hawks", icon: "✅", time: "25 min ago", platform: "web" },
  { id: 4, title: "🏆 Semi-Finals Announced", body: "Check the bracket — your fixture is live!", icon: "🏆", time: "1 hr ago", platform: "android" },
];

const styles = `
${FONTS}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0a0f; color: #e2e8f0; font-family: 'Rajdhani', sans-serif; }
.app { min-height: 100vh; background: #0a0a0f; padding: 24px; max-width: 1100px; margin: 0 auto; }

.header { margin-bottom: 28px; }
.header-eyebrow { font-family: 'Orbitron', sans-serif; font-size: 10px; letter-spacing: 4px; color: #00ff88; margin-bottom: 8px; }
.header-title { font-family: 'Orbitron', sans-serif; font-size: clamp(22px, 4vw, 34px); font-weight: 900; color: #fff; margin-bottom: 6px; }
.header-title span { color: #00ff88; }
.header-sub { color: #475569; font-size: 15px; }

.tabs { display: flex; gap: 4px; background: rgba(17,17,24,0.9); border-radius: 14px; padding: 5px; margin-bottom: 24px; width: fit-content; border: 1px solid rgba(255,255,255,0.06); flex-wrap: wrap; }
.tab { padding: 9px 18px; border-radius: 10px; border: none; background: transparent; color: #475569;
  cursor: pointer; font-family: 'Rajdhani', sans-serif; font-size: 13px; font-weight: 600; transition: all 0.2s; }
.tab.active { background: rgba(0,255,136,0.12); color: #00ff88; }
.tab:hover:not(.active) { color: #94a3b8; }

.card { background: rgba(17,17,24,0.9); border: 1px solid rgba(255,255,255,0.07); border-radius: 18px; padding: 22px; margin-bottom: 16px; }
.card-title { font-family: 'Orbitron', sans-serif; font-size: 11px; letter-spacing: 2.5px; color: #475569; margin-bottom: 16px; text-transform: uppercase; }

/* PERMISSION BANNER */
.perm-banner { display: flex; align-items: center; gap: 16px; padding: 18px; border-radius: 16px; margin-bottom: 20px; border: 1px solid; }
.perm-default { background: rgba(96,165,250,0.08); border-color: rgba(96,165,250,0.3); }
.perm-granted { background: rgba(0,255,136,0.08); border-color: rgba(0,255,136,0.3); }
.perm-denied { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.3); }
.perm-icon { font-size: 28px; }
.perm-text { flex: 1; }
.perm-title { font-weight: 700; font-size: 15px; margin-bottom: 2px; }
.perm-sub { font-size: 12px; color: #94a3b8; }

.btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 10px; border: none;
  cursor: pointer; font-family: 'Rajdhani', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.3px; transition: all 0.2s; white-space: nowrap; }
.btn-primary { background: #00ff88; color: #0a0a0f; }
.btn-primary:hover { background: #00cc6a; }
.btn-secondary { background: rgba(0,255,136,0.1); color: #00ff88; border: 1px solid rgba(0,255,136,0.3); }
.btn-secondary:hover { background: rgba(0,255,136,0.18); }
.btn-sm { padding: 7px 12px; font-size: 12px; border-radius: 8px; }

/* TOGGLE LIST */
.notif-pref { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.notif-pref:last-child { border-bottom: none; }
.notif-pref-icon { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.notif-pref-text { flex: 1; }
.notif-pref-title { font-size: 14px; font-weight: 700; color: #e2e8f0; }
.notif-pref-desc { font-size: 12px; color: #475569; margin-top: 1px; }

/* TOGGLE SWITCH */
.toggle { position: relative; width: 46px; height: 26px; border-radius: 16px; background: rgba(255,255,255,0.1); cursor: pointer; transition: background 0.2s; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.1); }
.toggle.on { background: rgba(0,255,136,0.3); border-color: rgba(0,255,136,0.5); }
.toggle-knob { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #475569; transition: all 0.2s; }
.toggle.on .toggle-knob { transform: translateX(20px); background: #00ff88; box-shadow: 0 0 8px rgba(0,255,136,0.6); }

/* DEVICE LIST */
.device-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.device-row:last-child { border-bottom: none; }
.device-icon { width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center; font-size: 16px; border: 1px solid rgba(255,255,255,0.07); }
.device-info { flex: 1; }
.device-name { font-size: 13px; font-weight: 700; color: #e2e8f0; }
.device-meta { font-size: 11px; color: #475569; }
.device-status { font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 12px; font-family: 'Orbitron', sans-serif; }
.status-active { background: rgba(0,255,136,0.1); color: #00ff88; }

/* NOTIFICATION PREVIEW (mock phone notification) */
.phone-mock { background: linear-gradient(180deg, #1a1a2e, #0a0a0f); border-radius: 28px; padding: 20px; border: 1px solid rgba(255,255,255,0.08); max-width: 360px; margin: 0 auto; }
.phone-notif { background: rgba(30,30,40,0.95); backdrop-filter: blur(20px); border-radius: 16px; padding: 14px; display: flex; gap: 12px; align-items: flex-start; border: 1px solid rgba(255,255,255,0.06); margin-bottom: 10px; animation: slideIn 0.4s ease; }
@keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
.phone-notif-icon { width: 38px; height: 38px; border-radius: 10px; background: rgba(0,255,136,0.15); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.phone-notif-content { flex: 1; min-width: 0; }
.phone-notif-app { font-size: 10px; color: #64748b; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 2px; text-transform: uppercase; }
.phone-notif-title { font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 2px; }
.phone-notif-body { font-size: 12px; color: #94a3b8; line-height: 1.4; }
.phone-notif-time { font-size: 10px; color: #475569; margin-top: 4px; }

/* LOG LIST */
.log-item { display: flex; align-items: flex-start; gap: 12px; padding: 14px; background: rgba(17,17,24,0.9); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; margin-bottom: 10px; }
.log-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; background: rgba(0,255,136,0.08); }
.log-text { flex: 1; }
.log-title { font-size: 13px; font-weight: 700; color: #e2e8f0; }
.log-body { font-size: 12px; color: #64748b; margin-top: 2px; }
.log-meta { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
.log-time { font-size: 10px; color: #334155; }
.platform-badge { font-size: 9px; padding: 1px 7px; border-radius: 8px; font-weight: 700; letter-spacing: 0.5px; font-family: 'Orbitron', sans-serif; }
.platform-android { background: rgba(0,255,136,0.1); color: #00ff88; }
.platform-ios { background: rgba(96,165,250,0.1); color: #60a5fa; }
.platform-web { background: rgba(168,85,247,0.1); color: #c084fc; }

/* CODE BLOCK */
.code-block { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; line-height: 1.8; overflow-x: auto; color: #94a3b8; }
.code-comment { color: #475569; }
.code-key { color: #60a5fa; }
.code-string { color: #00ff88; }
.code-kw { color: #c084fc; }

/* COMPOSER */
.composer-grid { display: grid; grid-template-columns: 1fr 320px; gap: 20px; }
@media(max-width:760px) { .composer-grid { grid-template-columns: 1fr; } }
.input-group { margin-bottom: 14px; }
.input-label { display: block; font-size: 10px; letter-spacing: 1.5px; color: #475569; font-weight: 600; text-transform: uppercase; margin-bottom: 6px; font-family: 'Orbitron', sans-serif; }
.input, .textarea { width: 100%; padding: 10px 14px; background: rgba(17,17,24,0.9); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; color: #e2e8f0; font-family: 'Rajdhani', sans-serif; font-size: 14px; outline: none; transition: border-color 0.2s; }
.input:focus, .textarea:focus { border-color: rgba(0,255,136,0.4); }
.textarea { resize: vertical; min-height: 70px; }
.audience-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.audience-chip { padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); cursor: pointer; font-size: 12px; font-weight: 600; color: #94a3b8; transition: all 0.2s; }
.audience-chip.active { background: rgba(0,255,136,0.1); border-color: rgba(0,255,136,0.3); color: #00ff88; }

.stat-row { display: flex; gap: 24px; margin-bottom: 20px; }
.stat-box { text-align: center; }
.stat-val { font-family: 'Orbitron', sans-serif; font-size: 24px; font-weight: 700; color: #00ff88; }
.stat-lbl { font-size: 10px; color: #475569; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 2px; }

.divider { height: 1px; background: rgba(255,255,255,0.06); margin: 20px 0; }
`;

export default function App() {
  const [tab, setTab] = useState("settings");
  const [permission, setPermission] = useState("default"); // default | granted | denied
  const [prefs, setPrefs] = useState(
    NOTIF_TYPES.reduce((acc, t) => ({ ...acc, [t.id]: t.defaultOn }), {})
  );
  const [composerTitle, setComposerTitle] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [sentLog, setSentLog] = useState(DEMO_LOG);
  const [showPreview, setShowPreview] = useState(null);

  function requestPermission() {
    // Simulates the real Notification.requestPermission() flow
    setTimeout(() => setPermission("granted"), 600);
  }

  function togglePref(id) {
    setPrefs((p) => ({ ...p, [id]: !p[id] }));
  }

  function sendTestNotification() {
    const notif = {
      id: Date.now(),
      title: composerTitle || "Test Notification",
      body: composerBody || "This is a test push notification from ShuttlePro",
      icon: "🏸",
      time: "Just now",
      platform: "web",
    };
    setSentLog((prev) => [notif, ...prev]);
    setShowPreview(notif);
    setTimeout(() => setShowPreview(null), 4000);
  }

  const AUDIENCES = [
    { id: "all", label: "All Spectators", count: 1240 },
    { id: "teams", label: "Registered Teams", count: 16 },
    { id: "live", label: "Currently Watching Live", count: 312 },
    { id: "admins", label: "Admins Only", count: 4 },
  ];

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <div className="header">
          <div className="header-eyebrow">🏸 ShuttlePro · GameNova Invitational 2026</div>
          <div className="header-title">Push <span>Notifications</span></div>
          <div className="header-sub">Firebase Cloud Messaging + OneSignal integration for match alerts</div>
        </div>

        <div className="tabs">
          {[
            { id: "settings", label: "🔔 Notification Settings" },
            { id: "compose", label: "📤 Send Notification" },
            { id: "devices", label: "📱 Devices" },
            { id: "log", label: "📋 Activity Log" },
            { id: "setup", label: "⚙️ Dev Setup" },
          ].map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* ── SETTINGS TAB ──────────────────────────── */}
        {tab === "settings" && (
          <div>
            {permission === "default" && (
              <div className="perm-banner perm-default">
                <div className="perm-icon">🔔</div>
                <div className="perm-text">
                  <div className="perm-title">Enable push notifications</div>
                  <div className="perm-sub">Get alerted when your matches start, results are posted, or the bracket updates</div>
                </div>
                <button className="btn btn-primary" onClick={requestPermission}>Enable</button>
              </div>
            )}
            {permission === "granted" && (
              <div className="perm-banner perm-granted">
                <div className="perm-icon">✅</div>
                <div className="perm-text">
                  <div className="perm-title">Notifications enabled</div>
                  <div className="perm-sub">You'll receive alerts based on your preferences below</div>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-title">Notification Types</div>
              {NOTIF_TYPES.map((t) => (
                <div key={t.id} className="notif-pref">
                  <div className="notif-pref-icon" style={{ background: t.color + "18", color: t.color }}>{t.icon}</div>
                  <div className="notif-pref-text">
                    <div className="notif-pref-title">{t.label}</div>
                    <div className="notif-pref-desc">{t.desc}</div>
                  </div>
                  <div className={`toggle ${prefs[t.id] ? "on" : ""}`} onClick={() => togglePref(t.id)}>
                    <div className="toggle-knob" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── COMPOSE TAB ───────────────────────────── */}
        {tab === "compose" && (
          <div className="composer-grid">
            <div className="card">
              <div className="card-title">Compose Notification (Admin)</div>
              <div className="input-group">
                <label className="input-label">Title</label>
                <input className="input" placeholder="e.g. Final starting in 5 minutes!" value={composerTitle} onChange={(e) => setComposerTitle(e.target.value)} />
              </div>
              <div className="input-group">
                <label className="input-label">Message</label>
                <textarea className="textarea" placeholder="e.g. Storm Eagles vs Cosmic Aces — Main Stadium" value={composerBody} onChange={(e) => setComposerBody(e.target.value)} />
              </div>
              <div className="input-group">
                <label className="input-label">Send To</label>
                <div className="audience-chips">
                  {AUDIENCES.map((a) => (
                    <div key={a.id} className={`audience-chip ${audience === a.id ? "active" : ""}`} onClick={() => setAudience(a.id)}>
                      {a.label} · {a.count.toLocaleString()}
                    </div>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" onClick={sendTestNotification}>📤 Send Notification</button>
            </div>

            <div>
              <div className="card-title" style={{ marginBottom: "12px" }}>Live Preview</div>
              <div className="phone-mock">
                <div className="phone-notif">
                  <div className="phone-notif-icon">🏸</div>
                  <div className="phone-notif-content">
                    <div className="phone-notif-app">ShuttlePro</div>
                    <div className="phone-notif-title">{composerTitle || "Notification Title"}</div>
                    <div className="phone-notif-body">{composerBody || "Your message will appear here exactly as the recipient sees it"}</div>
                    <div className="phone-notif-time">now</div>
                  </div>
                </div>
                {showPreview && (
                  <div className="phone-notif">
                    <div className="phone-notif-icon">✅</div>
                    <div className="phone-notif-content">
                      <div className="phone-notif-app">ShuttlePro</div>
                      <div className="phone-notif-title">Sent!</div>
                      <div className="phone-notif-body">Delivered to {AUDIENCES.find(a => a.id === audience)?.count.toLocaleString()} devices</div>
                      <div className="phone-notif-time">now</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── DEVICES TAB ───────────────────────────── */}
        {tab === "devices" && (
          <div>
            <div className="stat-row">
              <div className="stat-box"><div className="stat-val">1,556</div><div className="stat-lbl">Total Subscribers</div></div>
              <div className="stat-box"><div className="stat-val">892</div><div className="stat-lbl">Android</div></div>
              <div className="stat-box"><div className="stat-val">487</div><div className="stat-lbl">iOS</div></div>
              <div className="stat-box"><div className="stat-val">177</div><div className="stat-lbl">Web Push</div></div>
            </div>
            <div className="card">
              <div className="card-title">Your Registered Devices</div>
              {[
                { name: "Pixel 8 Pro", platform: "📱 Android", meta: "Chrome · Subscribed 3 days ago", status: "Active" },
                { name: "iPhone 15", platform: "📱 iOS", meta: "Safari Web Push · Subscribed 1 day ago", status: "Active" },
                { name: "MacBook Pro", platform: "💻 Web", meta: "Chrome Desktop · Subscribed today", status: "Active" },
              ].map((d, i) => (
                <div key={i} className="device-row">
                  <div className="device-icon">{d.platform.split(" ")[0]}</div>
                  <div className="device-info">
                    <div className="device-name">{d.name}</div>
                    <div className="device-meta">{d.meta}</div>
                  </div>
                  <span className="device-status status-active">{d.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── LOG TAB ───────────────────────────────── */}
        {tab === "log" && (
          <div>
            <div className="card-title" style={{ marginBottom: "12px" }}>Recent Notifications Sent</div>
            {sentLog.map((n) => (
              <div key={n.id} className="log-item">
                <div className="log-icon">{n.icon}</div>
                <div className="log-text">
                  <div className="log-title">{n.title}</div>
                  <div className="log-body">{n.body}</div>
                  <div className="log-meta">
                    <span className="log-time">{n.time}</span>
                    <span className={`platform-badge platform-${n.platform}`}>{n.platform.toUpperCase()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── DEV SETUP TAB ─────────────────────────── */}
        {tab === "setup" && (
          <div>
            <div className="card">
              <div className="card-title">1. Firebase Cloud Messaging Setup</div>
              <div className="code-block">
                <span className="code-comment">// npm install firebase</span><br/>
                <span className="code-kw">import</span> {"{ initializeApp }"} <span className="code-kw">from</span> <span className="code-string">"firebase/app"</span>;<br/>
                <span className="code-kw">import</span> {"{ getMessaging, getToken, onMessage }"} <span className="code-kw">from</span> <span className="code-string">"firebase/messaging"</span>;<br/><br/>
                <span className="code-kw">const</span> <span className="code-key">firebaseConfig</span> = {"{"}<br/>
                {"  "}apiKey: <span className="code-string">"YOUR_API_KEY"</span>,<br/>
                {"  "}projectId: <span className="code-string">"shuttlepro-xxxxx"</span>,<br/>
                {"  "}messagingSenderId: <span className="code-string">"123456789"</span>,<br/>
                {"  "}appId: <span className="code-string">"1:123:web:abc"</span><br/>
                {"};"}<br/><br/>
                <span className="code-kw">const</span> app = initializeApp(firebaseConfig);<br/>
                <span className="code-kw">const</span> messaging = getMessaging(app);
              </div>
            </div>

            <div className="card">
              <div className="card-title">2. Request Permission & Get Token</div>
              <div className="code-block">
                <span className="code-kw">async function</span> <span className="code-key">enablePush</span>() {"{"}<br/>
                {"  "}<span className="code-kw">const</span> permission = <span className="code-kw">await</span> Notification.requestPermission();<br/>
                {"  "}<span className="code-kw">if</span> (permission === <span className="code-string">"granted"</span>) {"{"}<br/>
                {"    "}<span className="code-kw">const</span> token = <span className="code-kw">await</span> getToken(messaging, {"{"}<br/>
                {"      "}vapidKey: <span className="code-string">"YOUR_VAPID_KEY"</span><br/>
                {"    "}{"});"}<br/>
                {"    "}<span className="code-comment">// Save token to Supabase: device_tokens table</span><br/>
                {"    "}<span className="code-kw">await</span> supabase.from(<span className="code-string">"device_tokens"</span>).upsert({"{ token, user_id }"});<br/>
                {"  "}{"}"}<br/>
                {"}"}
              </div>
            </div>

            <div className="card">
              <div className="card-title">3. Service Worker (firebase-messaging-sw.js)</div>
              <div className="code-block">
                <span className="code-comment">// public/firebase-messaging-sw.js</span><br/>
                importScripts(<span className="code-string">"https://www.gstatic.com/firebasejs/10.x/firebase-app-compat.js"</span>);<br/>
                importScripts(<span className="code-string">"https://www.gstatic.com/firebasejs/10.x/firebase-messaging-compat.js"</span>);<br/><br/>
                firebase.initializeApp(firebaseConfig);<br/>
                <span className="code-kw">const</span> messaging = firebase.messaging();<br/><br/>
                messaging.onBackgroundMessage((payload) =&gt; {"{"}<br/>
                {"  "}self.registration.showNotification(payload.notification.title, {"{"}<br/>
                {"    "}body: payload.notification.body,<br/>
                {"    "}icon: <span className="code-string">"/icon-192.png"</span><br/>
                {"  "}{"});"}<br/>
                {"});"}
              </div>
            </div>

            <div className="card">
              <div className="card-title">4. Send From Server (Supabase Edge Function)</div>
              <div className="code-block">
                <span className="code-comment">// supabase/functions/send-notification/index.ts</span><br/>
                <span className="code-kw">import</span> {"{ JWT }"} <span className="code-kw">from</span> <span className="code-string">"google-auth-library"</span>;<br/><br/>
                Deno.serve(<span className="code-kw">async</span> (req) =&gt; {"{"}<br/>
                {"  "}<span className="code-kw">const</span> {"{ title, body, tokens }"} = <span className="code-kw">await</span> req.json();<br/><br/>
                {"  "}<span className="code-kw">await</span> fetch(<span className="code-string">"https://fcm.googleapis.com/v1/projects/shuttlepro/messages:send"</span>, {"{"}<br/>
                {"    "}method: <span className="code-string">"POST"</span>,<br/>
                {"    "}headers: {"{ Authorization: `Bearer ${"}accessToken{"}`}"},<br/>
                {"    "}body: JSON.stringify({"{ message: { token, notification: { title, body } } }"})<br/>
                {"  "}{"});"}<br/>
                {"});"}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Alternative: OneSignal (Simpler Setup)</div>
              <div className="code-block">
                <span className="code-comment">// npm install react-onesignal</span><br/>
                <span className="code-kw">import</span> OneSignal <span className="code-kw">from</span> <span className="code-string">"react-onesignal"</span>;<br/><br/>
                <span className="code-kw">await</span> OneSignal.init({"{"}<br/>
                {"  "}appId: <span className="code-string">"YOUR_ONESIGNAL_APP_ID"</span>,<br/>
                {"  "}allowLocalhostAsSecureOrigin: <span className="code-kw">true</span><br/>
                {"});"}<br/><br/>
                <span className="code-comment">// Trigger from anywhere in your app</span><br/>
                <span className="code-kw">await</span> OneSignal.Notifications.requestPermission();
              </div>
            </div>

            <div className="card">
              <div className="card-title">5. Database Table for Tokens</div>
              <div className="code-block">
                <span className="code-kw">create table</span> device_tokens (<br/>
                {"  "}id uuid primary key default uuid_generate_v4(),<br/>
                {"  "}user_id uuid references profiles(id),<br/>
                {"  "}token text not null unique,<br/>
                {"  "}platform text, <span className="code-comment">-- 'web' | 'android' | 'ios'</span><br/>
                {"  "}tournament_id uuid references tournaments(id),<br/>
                {"  "}created_at timestamptz default now()<br/>
                );
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
