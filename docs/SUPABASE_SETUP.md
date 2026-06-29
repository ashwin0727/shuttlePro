# ShuttlePro — Supabase Backend Setup Guide

Complete guide for wiring the Supabase backend into your Next.js tournament platform.

---

## 1. Create Your Supabase Project

1. Go to [supabase.com](https://supabase.com) → **New Project**
2. Name it `shuttlepro` (or anything you like)
3. Pick a region close to your users
4. Save your **database password** securely

---

## 2. Run the SQL Schema

1. In Supabase Dashboard → **SQL Editor** → **New Query**
2. Paste the full contents of **`supabase_schema.sql`**
3. Click **Run** — this creates all 10 tables, triggers, RLS policies, and seed data

---

## 3. Enable Realtime

In Supabase Dashboard → **Database** → **Replication** → **Supabase Realtime**:

Toggle ON for these tables:
- `matches`
- `standings`
- `notifications`

Or run in SQL Editor:
```sql
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table standings;
alter publication supabase_realtime add table notifications;
```

---

## 4. Get Your API Keys

Supabase Dashboard → **Settings** → **API**

Copy:
- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` *(server-side only, never expose)*

---

## 5. Set Up Your Next.js Project

```bash
npx create-next-app@latest shuttlepro --typescript --tailwind --app
cd shuttlepro
npm install @supabase/supabase-js framer-motion
```

Create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

---

## 6. Add the Files

```
src/
├── lib/
│   └── supabase.ts          ← copy supabase.ts here
├── hooks/
│   └── useTournament.ts     ← copy useTournament.ts here
└── app/
    └── tournament/
        └── [id]/
            └── page.tsx     ← your main tournament page
```

---

## 7. Use the Hooks in Your Page

```tsx
// app/tournament/[id]/page.tsx
"use client";

import { useMatches, useStandings, useTeams, useNotifications } from "@/hooks/useTournament";

export default function TournamentPage({ params }: { params: { id: string } }) {
  const { liveMatches, upcomingMatches, startMatch, updateScore, completeMatch } = useMatches(params.id);
  const { standings, byGroup } = useStandings(params.id);
  const { teams, addTeam } = useTeams(params.id);
  const { notifications, send: sendNotif } = useNotifications(params.id);

  // All data is now live — Supabase Realtime pushes updates instantly
  // No polling, no refresh needed!

  async function handleStart(matchId: string) {
    await startMatch(matchId);
    await sendNotif("Match is LIVE!", "Tune in now.", "🔴", "alert");
  }

  async function handleComplete(matchId: string) {
    const match = await completeMatch(matchId);
    const winner = (match.score1 ?? 0) >= (match.score2 ?? 0) ? match.team1 : match.team2;
    await sendNotif("Match Over!", `${winner?.name} wins!`, "✅", "result");
  }

  return (
    <div>
      <h1>Live Matches: {liveMatches.length}</h1>
      {liveMatches.map(m => (
        <div key={m.id}>
          {m.team1?.name} {m.score1} – {m.score2} {m.team2?.name}
          <button onClick={() => updateScore(m.id, (m.score1 ?? 0) + 1, m.score2 ?? 0)}>+1 Team 1</button>
          <button onClick={() => handleComplete(m.id)}>End Match</button>
        </div>
      ))}
    </div>
  );
}
```

---

## 8. Create Admin Users

In Supabase Dashboard → **Authentication** → **Users** → **Invite User**

After the user signs up, set their role in the SQL editor:
```sql
update profiles set role = 'admin' where id = 'user-uuid-here';
```

Roles:
| Role | Can Do |
|------|--------|
| `superadmin` | Everything |
| `admin` | Manage tournament, teams, matches |
| `scorer` | Update scores only |
| `spectator` | View only (default for all) |

---

## 9. Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Add your `.env.local` values in Vercel Dashboard → **Settings** → **Environment Variables**.

---

## 10. Architecture Overview

```
Browser (Next.js)
    │
    ├── useMatches() ──────► Supabase DB (matches table)
    │       ↑ realtime        ◄── Postgres Trigger (standings)
    │       │
    ├── useStandings() ────► standings table (auto-updated by trigger)
    │       ↑ realtime
    │
    ├── useNotifications() ► notifications table
    │       ↑ realtime
    │
    └── Admin Panel ───────► matchApi.start/updateScore/complete
                             teamApi.create/bulkImport
                             groupApi.generate
                             matchApi.generateSemifinals/generateFinal
```

---

## 11. Realtime Flow

```
Admin clicks "Update Score"
    → matchApi.updateScore(id, 21, 18)
    → Supabase UPDATE on matches table
    → Postgres trigger recalc_standings() fires
    → standings table updated automatically
    → Supabase Realtime pushes to all connected clients
    → useMatches() + useStandings() update instantly
    → UI re-renders with new scores + standings
    → Zero polling, zero manual refresh
```

---

## 12. Checklist

- [ ] Supabase project created
- [ ] `supabase_schema.sql` executed
- [ ] Realtime enabled for `matches`, `standings`, `notifications`
- [ ] `.env.local` set up
- [ ] `supabase.ts` copied to `src/lib/`
- [ ] `useTournament.ts` copied to `src/hooks/`
- [ ] Admin user created and role set
- [ ] Deployed to Vercel

---

## Database Tables Summary

| Table | Purpose |
|-------|---------|
| `profiles` | User accounts + roles |
| `tournaments` | Tournament metadata |
| `teams` | Team records |
| `players` | Individual players per team |
| `groups` | Group A, B, C... |
| `group_teams` | Which team is in which group |
| `matches` | All fixtures (group/semi/final), ordered via `match_order` |
| `standings` | Auto-calculated W/L/PD/PTS |
| `notifications` | Push notification feed |

All tables have **Row Level Security** — spectators can only read, admins can write.
