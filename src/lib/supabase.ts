// ============================================================
//  ShuttlePro · Supabase Client, Types & Hooks
//  File: src/lib/supabase.ts
//  Install: npm install @supabase/supabase-js
// ============================================================

import { createClient, RealtimeChannel } from "@supabase/supabase-js";

// ── ENV (add to .env.local) ───────────────────────────────
// NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
// NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
// SUPABASE_SERVICE_ROLE_KEY=your-service-key  ← server only

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── TYPES ─────────────────────────────────────────────────
export type MatchStatus   = "pending" | "live" | "completed" | "paused" | "cancelled";
export type MatchStage    = "group" | "semifinal" | "final" | "third_place";
export type TournamentStatus = "draft" | "active" | "completed" | "cancelled";
export type UserRole      = "superadmin" | "admin" | "scorer" | "spectator";

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
}

export interface Tournament {
  id: string;
  name: string;
  description: string | null;
  type: "singles" | "doubles" | "mixed_doubles";
  status: TournamentStatus;
  venue: string | null;
  start_date: string | null;
  end_date: string | null;
  banner_url: string | null;
  max_teams: number;
  group_count: number;
  created_by: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  tournament_id: string;
  name: string;
  logo_emoji: string;
  color: string;
  seed: number | null;
  is_active: boolean;
  players?: Player[];
}

export interface Player {
  id: string;
  team_id: string;
  tournament_id: string;
  full_name: string;
  jersey_number: number | null;
  avatar_url: string | null;
  is_captain: boolean;
}

export interface Group {
  id: string;
  tournament_id: string;
  name: string;
  display_order: number;
  teams?: Team[];
}

// NOTE: there is intentionally no Court interface and no court_id
// on Match below. The product doesn't model courts or time-slots —
// matches are just an ordered queue (see match_order), with
// conflict-avoidance and rest-gap rules enforced in application
// code (see the scheduler in the main component) rather than via
// a court/scheduling data model.
export interface Match {
  id: string;
  tournament_id: string;
  group_id: string | null;
  team1_id: string;
  team2_id: string;
  score1: number | null;
  score2: number | null;
  status: MatchStatus;
  stage: MatchStage;
  match_order: number; // play sequence position; no court/slot concept
  started_at: string | null;
  completed_at: string | null;
  winner_id: string | null;
  round_number: number;
  match_number: number | null;
  created_at: string;
  updated_at: string;
  // Joined
  team1?: Team;
  team2?: Team;
  group?: Group;
}

export interface Standing {
  id: string;
  tournament_id: string;
  group_id: string | null;
  team_id: string;
  played: number;
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  pts: number;
  updated_at: string;
  team?: Team;
}

export interface Notification {
  id: string;
  tournament_id: string | null;
  title: string;
  body: string;
  icon: string;
  type: string;
  is_read: boolean;
  sent_at: string;
}

// ============================================================
//  AUTH API
// ============================================================
export const auth = {
  /** Sign in as admin */
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  /** Sign out */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /** Get current session */
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  /** Get current user profile with role */
  async getProfile(): Promise<Profile | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    return data;
  },

  /** Subscribe to auth state changes */
  onAuthChange(callback: (session: any) => void) {
    return supabase.auth.onAuthStateChange((_event, session) => callback(session));
  },
};

// ============================================================
//  TOURNAMENT API
// ============================================================
export const tournamentApi = {
  /** Fetch all tournaments */
  async list(): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  /** Fetch single tournament */
  async get(id: string): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  /** Create tournament */
  async create(payload: Partial<Tournament>): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Update tournament */
  async update(id: string, payload: Partial<Tournament>): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Set tournament status */
  async setStatus(id: string, status: TournamentStatus) {
    return tournamentApi.update(id, { status });
  },
};

// ============================================================
//  TEAM API
// ============================================================
export const teamApi = {
  /** Get all teams for a tournament (with players) */
  async list(tournamentId: string): Promise<Team[]> {
    const { data, error } = await supabase
      .from("teams")
      .select(`*, players(*)`)
      .eq("tournament_id", tournamentId)
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data ?? [];
  },

  /** Create team + players in one go */
  async create(tournamentId: string, name: string, playerNames: string[], logo = "🏸", color = "#00ff88"): Promise<Team> {
    const { data: team, error } = await supabase
      .from("teams")
      .insert({ tournament_id: tournamentId, name, logo_emoji: logo, color })
      .select()
      .single();
    if (error) throw error;

    if (playerNames.length > 0) {
      const players = playerNames.map((full_name, i) => ({
        team_id: team.id,
        tournament_id: tournamentId,
        full_name,
        is_captain: i === 0,
      }));
      await supabase.from("players").insert(players);
    }
    return team;
  },

  /** Delete team */
  async remove(id: string) {
    const { error } = await supabase.from("teams").update({ is_active: false }).eq("id", id);
    if (error) throw error;
  },

  /** Bulk import teams from CSV array */
  async bulkImport(tournamentId: string, rows: Array<{ name: string; player1: string; player2: string }>) {
    const results = await Promise.all(
      rows.map((r) => teamApi.create(tournamentId, r.name, [r.player1, r.player2]))
    );
    return results;
  },
};

// ============================================================
//  GROUP API
// ============================================================
export const groupApi = {
  /** Get groups with teams for a tournament */
  async list(tournamentId: string): Promise<Group[]> {
    const { data, error } = await supabase
      .from("groups")
      .select(`*, group_teams(team_id, teams(*))`)
      .eq("tournament_id", tournamentId)
      .order("display_order");
    if (error) throw error;

    // Flatten group_teams into teams array
    return (data ?? []).map((g: any) => ({
      ...g,
      teams: g.group_teams?.map((gt: any) => gt.teams) ?? [],
    }));
  },

  /** Auto-generate balanced groups from all teams */
  async generate(tournamentId: string): Promise<void> {
    const teams = await teamApi.list(tournamentId);
    const tournament = await tournamentApi.get(tournamentId);
    const groupCount = tournament.group_count ?? 2;

    // Shuffle teams
    const shuffled = [...teams].sort(() => Math.random() - 0.5);

    // Delete existing group assignments
    const { data: existingGroups } = await supabase
      .from("groups")
      .select("id")
      .eq("tournament_id", tournamentId);

    if (existingGroups?.length) {
      await supabase.from("group_teams").delete()
        .in("group_id", existingGroups.map((g: any) => g.id));
      await supabase.from("groups").delete().eq("tournament_id", tournamentId);
    }

    // Create new groups
    const groupNames = "ABCDEFGHIJ".slice(0, groupCount).split("");
    const groupIds: string[] = [];

    for (let i = 0; i < groupNames.length; i++) {
      const { data } = await supabase
        .from("groups")
        .insert({ tournament_id: tournamentId, name: groupNames[i], display_order: i + 1 })
        .select()
        .single();
      groupIds.push(data.id);
    }

    // Distribute teams round-robin across groups
    const assignments = shuffled.map((team, idx) => ({
      group_id: groupIds[idx % groupCount],
      team_id: team.id,
    }));

    await supabase.from("group_teams").insert(assignments);
  },
};

// ============================================================
//  MATCH API
// ============================================================
export const matchApi = {
  /** Fetch all matches for a tournament with joins, in play order */
  async list(tournamentId: string): Promise<Match[]> {
    const { data, error } = await supabase
      .from("matches")
      .select(`
        *,
        team1:teams!matches_team1_id_fkey(*),
        team2:teams!matches_team2_id_fkey(*),
        group:groups(*)
      `)
      .eq("tournament_id", tournamentId)
      .order("match_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  /** Fetch single match */
  async get(id: string): Promise<Match> {
    const { data, error } = await supabase
      .from("matches")
      .select(`
        *,
        team1:teams!matches_team1_id_fkey(*),
        team2:teams!matches_team2_id_fkey(*),
        group:groups(*)
      `)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },

  /** Start a match — only transitions a match currently "pending" */
  async start(id: string): Promise<Match> {
    const { data, error } = await supabase
      .from("matches")
      .update({ status: "live", score1: 0, score2: 0, started_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Update score (auto-triggers standings recalc in DB) */
  async updateScore(id: string, score1: number, score2: number): Promise<Match> {
    const { data, error } = await supabase
      .from("matches")
      .update({ score1, score2, status: "live" })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Complete a match — only transitions a match currently "live" or "paused" */
  async complete(id: string): Promise<Match> {
    const { data, error } = await supabase
      .from("matches")
      .update({ status: "completed" })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Pause a live match */
  async pause(id: string): Promise<Match> {
    const { data, error } = await supabase
      .from("matches")
      .update({ status: "paused" })
      .eq("id", id)
      .eq("status", "live")
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Resume a paused match back to live */
  async resume(id: string): Promise<Match> {
    const { data, error } = await supabase
      .from("matches")
      .update({ status: "live" })
      .eq("id", id)
      .eq("status", "paused")
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Auto-generate round-robin fixtures for a tournament's groups,
   * combined into a single ordered queue (match_order) — no court
   * assignment, no time-slots. A team is never given two matches
   * close enough together to violate the minimum rest gap.
   */
  async generateGroupFixtures(tournamentId: string, groupsWithTeamIds: Record<string, string[]>): Promise<void> {
    const REST_GAP = 2;
    type Pairing = { groupId: string; team1Id: string; team2Id: string };

    const pairings: Pairing[] = [];
    for (const [groupId, teamIds] of Object.entries(groupsWithTeamIds)) {
      for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < teamIds.length; j++) {
          pairings.push({ groupId, team1Id: teamIds[i], team2Id: teamIds[j] });
        }
      }
    }

    const lastPlayedOrder: Record<string, number> = {};
    const queue = [...pairings];
    const fixtures: Partial<Match>[] = [];
    let order = 0;
    let safety = 0;
    const maxSafety = (pairings.length + 1) * 6 + 50;

    while (queue.length > 0 && safety < maxSafety) {
      safety++;
      let placed = false;

      for (let qi = 0; qi < queue.length; qi++) {
        const p = queue[qi];
        const t1Last = lastPlayedOrder[p.team1Id];
        const t2Last = lastPlayedOrder[p.team2Id];
        const t1Ok = t1Last === undefined || order - t1Last >= REST_GAP;
        const t2Ok = t2Last === undefined || order - t2Last >= REST_GAP;

        if (t1Ok && t2Ok) {
          fixtures.push({
            tournament_id: tournamentId,
            group_id: p.groupId,
            team1_id: p.team1Id,
            team2_id: p.team2Id,
            stage: "group",
            status: "pending",
            match_order: order,
            round_number: 1,
            match_number: fixtures.length + 1,
          });
          lastPlayedOrder[p.team1Id] = order;
          lastPlayedOrder[p.team2Id] = order;
          queue.splice(qi, 1);
          placed = true;
          break;
        }
      }

      order++;
      if (!placed && safety > pairings.length * 4) {
        const p = queue.shift();
        if (p) {
          fixtures.push({
            tournament_id: tournamentId,
            group_id: p.groupId,
            team1_id: p.team1Id,
            team2_id: p.team2Id,
            stage: "group",
            status: "pending",
            match_order: order,
            round_number: 1,
            match_number: fixtures.length + 1,
          });
          lastPlayedOrder[p.team1Id] = order;
          lastPlayedOrder[p.team2Id] = order;
        }
      }
    }

    const { error } = await supabase.from("matches").insert(fixtures);
    if (error) throw error;
  },

  /** Generate semi-final fixtures from group toppers — no court assignment */
  async generateSemifinals(tournamentId: string): Promise<void> {
    const standings = await standingsApi.list(tournamentId);

    // Group by group_id, sort by pts then point_diff
    const byGroup: Record<string, Standing[]> = {};
    for (const s of standings) {
      if (!s.group_id) continue;
      if (!byGroup[s.group_id]) byGroup[s.group_id] = [];
      byGroup[s.group_id].push(s);
    }

    const groups = Object.values(byGroup);
    if (groups.length < 2) throw new Error("Need at least 2 groups");

    const toppers  = groups.map((g) => g.sort((a, b) => b.pts - a.pts || b.point_diff - a.point_diff)[0]);
    const runners  = groups.map((g) => g.sort((a, b) => b.pts - a.pts || b.point_diff - a.point_diff)[1]);

    // Both semis share the same match_order — they involve 4
    // distinct teams (toppers vs. opposite-group runners-up) so
    // there's no possibility of a team conflict between them.
    const { data: existing } = await supabase
      .from("matches")
      .select("match_order")
      .eq("tournament_id", tournamentId)
      .order("match_order", { ascending: false })
      .limit(1);
    const baseOrder = (existing?.[0]?.match_order ?? -1) + 1;

    const fixtures = [
      { team1_id: toppers[0].team_id, team2_id: runners[1].team_id, match_number: 1 },
      { team1_id: toppers[1].team_id, team2_id: runners[0].team_id, match_number: 2 },
    ].map((s) => ({
      tournament_id: tournamentId,
      team1_id: s.team1_id,
      team2_id: s.team2_id,
      stage: "semifinal" as MatchStage,
      status: "pending" as MatchStatus,
      match_order: baseOrder,
      match_number: s.match_number,
    }));

    const { error } = await supabase.from("matches").insert(fixtures);
    if (error) throw error;
  },

  /** Generate the final from semifinal winners — no court assignment */
  async generateFinal(tournamentId: string): Promise<void> {
    const { data: semis } = await supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("stage", "semifinal")
      .eq("status", "completed");

    if (!semis || semis.length < 2) throw new Error("Semifinals not complete");

    const finalists = semis.map((s: any) =>
      (s.score1 ?? 0) >= (s.score2 ?? 0) ? s.team1_id : s.team2_id
    );

    const { data: existing } = await supabase
      .from("matches")
      .select("match_order")
      .eq("tournament_id", tournamentId)
      .order("match_order", { ascending: false })
      .limit(1);
    const order = (existing?.[0]?.match_order ?? -1) + 1;

    const { error } = await supabase.from("matches").insert({
      tournament_id: tournamentId,
      team1_id: finalists[0],
      team2_id: finalists[1],
      stage: "final",
      status: "pending",
      match_order: order,
      match_number: 1,
    });
    if (error) throw error;
  },
};

// ============================================================
//  STANDINGS API
// ============================================================
export const standingsApi = {
  /** Get standings for tournament (with team details) */
  async list(tournamentId: string): Promise<Standing[]> {
    const { data, error } = await supabase
      .from("standings")
      .select(`*, team:teams(*)`)
      .eq("tournament_id", tournamentId)
      .order("pts", { ascending: false })
      .order("point_diff", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  /** Get standings for a specific group */
  async listByGroup(tournamentId: string, groupId: string): Promise<Standing[]> {
    const { data, error } = await supabase
      .from("standings")
      .select(`*, team:teams(*)`)
      .eq("tournament_id", tournamentId)
      .eq("group_id", groupId)
      .order("pts", { ascending: false })
      .order("point_diff", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};

// ============================================================
//  NOTIFICATION API
// ============================================================
export const notifApi = {
  /** List notifications for tournament */
  async list(tournamentId: string, limit = 20): Promise<Notification[]> {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("sent_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  /** Send a notification (admin only) */
  async send(tournamentId: string, title: string, body: string, icon = "🏸", type = "info"): Promise<Notification> {
    const { data, error } = await supabase
      .from("notifications")
      .insert({ tournament_id: tournamentId, title, body, icon, type })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Mark as read */
  async markRead(id: string) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  },

  /** Quick helpers */
  matchStarting: (tid: string, t1: string, t2: string) =>
    notifApi.send(tid, "Match Starting!", `${t1} vs ${t2}`, "⚡", "alert"),

  matchResult: (tid: string, winner: string, score: string) =>
    notifApi.send(tid, "Match Complete", `${winner} wins! ${score}`, "✅", "result"),

  semifinalReady: (tid: string) =>
    notifApi.send(tid, "Semi-Finals Announced!", "Check the bracket for your fixture.", "🏆", "info"),

  finalReady: (tid: string) =>
    notifApi.send(tid, "🔴 THE FINAL IS SET!", "The championship match is about to begin!", "🌟", "alert"),

  champion: (tid: string, winner: string) =>
    notifApi.send(tid, "🏆 CHAMPIONS!", `${winner} wins the tournament! Congratulations!`, "🥇", "result"),
};

// ============================================================
//  REALTIME SUBSCRIPTIONS
// ============================================================
export const realtime = {
  /**
   * Subscribe to live match score updates
   * Fires callback whenever any match in the tournament changes
   */
  onMatchUpdate(tournamentId: string, callback: (match: Match) => void): RealtimeChannel {
    return supabase
      .channel(`matches:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        async (payload) => {
          // Re-fetch with joins for full data
          if (payload.new && (payload.new as any).id) {
            const match = await matchApi.get((payload.new as any).id);
            callback(match);
          }
        }
      )
      .subscribe();
  },

  /**
   * Subscribe to standings changes
   */
  onStandingsUpdate(tournamentId: string, callback: (standings: Standing[]) => void): RealtimeChannel {
    return supabase
      .channel(`standings:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "standings",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        async () => {
          const standings = await standingsApi.list(tournamentId);
          callback(standings);
        }
      )
      .subscribe();
  },

  /**
   * Subscribe to new notifications
   */
  onNotification(tournamentId: string, callback: (notif: Notification) => void): RealtimeChannel {
    return supabase
      .channel(`notifications:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => callback(payload.new as Notification)
      )
      .subscribe();
  },

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: RealtimeChannel) {
    await supabase.removeChannel(channel);
  },
};

// ============================================================
//  WHATSAPP SHARING HELPERS
// ============================================================
export const whatsapp = {
  shareMatch(match: Match): void {
    const t1 = match.team1?.name ?? "Team 1";
    const t2 = match.team2?.name ?? "Team 2";
    const score = match.score1 !== null ? `${match.score1} - ${match.score2}` : "vs";
    const msg = `🏸 *Match Update*\n${t1} ${score} ${t2}\n\n_ShuttlePro Tournament Platform_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  },

  shareStandings(group: string, standings: Standing[]): void {
    const rows = standings
      .map((s, i) => `${i + 1}. ${s.team?.name} — ${s.pts}pts (${s.wins}W/${s.losses}L)`)
      .join("\n");
    const msg = `🏸 *Group ${group} Standings*\n\n${rows}\n\n_ShuttlePro Tournament Platform_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  },

  shareWinner(team: Team): void {
    const msg = `🏆 *CHAMPIONS!*\n\n${team.logo_emoji} *${team.name}* wins the tournament!\n\n_ShuttlePro Tournament Platform_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  },
};
