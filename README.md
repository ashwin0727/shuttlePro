# 🏸 ShuttlePro — Badminton Tournament Platform

A premium, production-ready badminton tournament management platform with real-time scores, live standings, bracket generation, admin panel, and WhatsApp sharing.

---

## ✨ Features

- **Live Score Updates** — Real-time via Supabase Realtime (no refresh needed)
- **Auto Standings** — Postgres trigger recalculates W/L/PD/PTS instantly on score save
- **Group Stage** — Auto-balanced random group generation
- **Knockout Bracket** — Auto semi-final and final generation from group toppers
- **Simple Match Queue** — Matches run in a clean ordered sequence with automatic rest-gap handling — no courts or time-slots to manage
- **Admin Panel** — Full match control, score entry, phase management
- **WhatsApp Sharing** — One-tap share for fixtures, scores, and winners
- **Notifications** — Real-time in-app notification feed
- **Dark Neon UI** — Orbitron/Rajdhani fonts, glassmorphism, animated accents
- **Mobile-First** — Fully responsive with bottom nav on mobile
- **Role-Based Auth** — superadmin / admin / scorer / spectator via Supabase RLS

---

## 🗂 Project Structure

```
shuttlepro/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Entry point
│   │   ├── layout.tsx            # Root layout
│   │   └── globals.css
│   ├── components/
│   │   └── BadmintonTournament.jsx  # Full UI (self-contained)
│   ├── lib/
│   │   └── supabase.ts           # Supabase client + all API functions
│   └── hooks/
│       └── useTournament.ts      # React hooks with realtime subscriptions
├── supabase/
│   └── schema.sql                # Full DB schema — run in Supabase SQL editor
├── docs/
│   └── SUPABASE_SETUP.md         # Step-by-step backend setup guide
├── .env.example                  # Copy to .env.local and fill in keys
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Supabase
See **`docs/SUPABASE_SETUP.md`** for the full guide. Quick version:
- Create project at [supabase.com](https://supabase.com)
- Run `supabase/schema.sql` in SQL Editor
- Enable Realtime for `matches`, `standings`, `notifications`
- Copy API keys

### 3. Configure environment
```bash
cp .env.example .env.local
# Fill in your Supabase URL and keys
```

### 4. Run locally
```bash
npm run dev
# Open http://localhost:3000
```

### 5. Deploy to Vercel
```bash
npx vercel
# Add env vars in Vercel dashboard
```

---

## 🗃 Database Tables

| Table | Description |
|-------|-------------|
| `profiles` | User accounts + roles |
| `tournaments` | Tournament metadata |
| `teams` | Team records with emoji + color |
| `players` | Individual players per team |
| `groups` | Group A, B, C… |
| `group_teams` | Team-to-group assignments |
| `matches` | All fixtures (group/semi/final), ordered via `match_order` |
| `standings` | Auto-calculated via DB trigger |
| `notifications` | Real-time notification feed |

---

## 🎮 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router) + React 18 |
| Styling | Tailwind CSS + custom CSS |
| Animation | Framer Motion |
| Backend | Supabase (PostgreSQL + Realtime) |
| Auth | Supabase Auth + RLS |
| Hosting | Vercel |
| Fonts | Orbitron, Rajdhani, JetBrains Mono |

---

## 📱 Mobile Support

The app is mobile-first with:
- Bottom navigation bar on small screens
- Touch-friendly score entry
- Responsive card grids
- Readable typography at all sizes

---

## 🔐 User Roles

| Role | Permissions |
|------|-------------|
| `superadmin` | Full access |
| `admin` | Manage tournament, teams, matches, notifications |
| `scorer` | Start matches, update scores, complete matches |
| `spectator` | View-only (default for all visitors) |

Set a user's role in Supabase SQL Editor:
```sql
update profiles set role = 'admin' where id = 'user-uuid';
```

---

## 🏗 What to Build Next

- [ ] Push notifications (Firebase Cloud Messaging / OneSignal)
- [ ] PWA manifest + service worker (offline support)
- [ ] PDF fixture sheet download
- [ ] Excel standings export
- [ ] QR code tournament sharing
- [ ] Match highlights / comments section
- [ ] Player statistics leaderboard

---

Built with ❤️ for the GameNova platform.
