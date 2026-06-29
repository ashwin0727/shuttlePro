// ============================================================
//  ShuttlePro · React Hooks (Supabase-powered)
//  File: src/hooks/useTournament.ts
//  These replace local useState with live Supabase data +
//  real-time subscriptions. Drop into your Next.js pages.
// ============================================================

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  supabase,
  auth,
  tournamentApi,
  teamApi,
  groupApi,
  matchApi,
  standingsApi,
  notifApi,
  realtime,
  type Tournament,
  type Team,
  type Group,
  type Match,
  type Standing,
  type Notification,
  type Profile,
} from "@/lib/supabase";

// ── Generic async state helper ────────────────────────────
function useAsync<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData]   = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fn());
    } catch (e: any) {
      setError(e.message ?? "An error occurred");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);
  return { data, loading, error, refetch: run };
}

// ============================================================
//  useAuth — current user + role
// ============================================================
export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auth.getProfile().then((p) => { setProfile(p); setLoading(false); });
    const { data: sub } = auth.onAuthChange(async (session) => {
      if (session) {
        setProfile(await auth.getProfile());
      } else {
        setProfile(null);
      }
    });
    return () => sub?.subscription.unsubscribe();
  }, []);

  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";
  const isScorer = isAdmin || profile?.role === "scorer";

  return { profile, loading, isAdmin, isScorer };
}

// ============================================================
//  useTournament — single tournament data
// ============================================================
export function useTournament(id: string) {
  return useAsync(() => tournamentApi.get(id), [id]);
}

// ============================================================
//  useTeams — teams list with real-time add/remove
// ============================================================
export function useTeams(tournamentId: string) {
  const [teams, setTeams]     = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTeams(await teamApi.list(tournamentId));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => { load(); }, [load]);

  const addTeam = useCallback(async (name: string, players: string[], logo?: string, color?: string) => {
    const team = await teamApi.create(tournamentId, name, players, logo, color);
    setTeams((prev) => [...prev, team]);
    return team;
  }, [tournamentId]);

  const removeTeam = useCallback(async (id: string) => {
    await teamApi.remove(id);
    setTeams((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { teams, loading, error, refetch: load, addTeam, removeTeam };
}

// ============================================================
//  useGroups — groups with their teams
// ============================================================
export function useGroups(tournamentId: string) {
  const { data: groups, loading, error, refetch } = useAsync(
    () => groupApi.list(tournamentId),
    [tournamentId]
  );

  const generateGroups = useCallback(async () => {
    await groupApi.generate(tournamentId);
    await refetch();
  }, [tournamentId, refetch]);

  return { groups: groups ?? [], loading, error, generateGroups, refetch };
}

// ============================================================
//  useMatches — live-updating match list
// ============================================================
export function useMatches(tournamentId: string) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMatches(await matchApi.list(tournamentId));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    load();

    // Subscribe to real-time match updates
    channelRef.current = realtime.onMatchUpdate(tournamentId, (updatedMatch) => {
      setMatches((prev) => {
        const idx = prev.findIndex((m) => m.id === updatedMatch.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updatedMatch;
          return next;
        }
        return [...prev, updatedMatch];
      });
    });

    return () => {
      if (channelRef.current) realtime.unsubscribe(channelRef.current);
    };
  }, [tournamentId, load]);

  const startMatch = useCallback(async (id: string) => {
    const updated = await matchApi.start(id);
    setMatches((prev) => prev.map((m) => m.id === id ? updated : m));
  }, []);

  const updateScore = useCallback(async (id: string, s1: number, s2: number) => {
    const updated = await matchApi.updateScore(id, s1, s2);
    setMatches((prev) => prev.map((m) => m.id === id ? updated : m));
  }, []);

  const completeMatch = useCallback(async (id: string) => {
    const updated = await matchApi.complete(id);
    setMatches((prev) => prev.map((m) => m.id === id ? updated : m));
    return updated;
  }, []);

  const pauseMatch = useCallback(async (id: string) => {
    const updated = await matchApi.pause(id);
    setMatches((prev) => prev.map((m) => m.id === id ? updated : m));
  }, []);

  const resumeMatch = useCallback(async (id: string) => {
    const updated = await matchApi.resume(id);
    setMatches((prev) => prev.map((m) => m.id === id ? updated : m));
  }, []);

  /**
   * Generate group-stage fixtures from a map of groupId → teamIds.
   * No court or time-slot inputs — the scheduler in matchApi
   * handles ordering and the rest-gap rule internally.
   */
  const generateGroupFixtures = useCallback(async (groupsWithTeamIds: Record<string, string[]>) => {
    await matchApi.generateGroupFixtures(tournamentId, groupsWithTeamIds);
    await load();
  }, [tournamentId, load]);

  const generateSemifinals = useCallback(async () => {
    await matchApi.generateSemifinals(tournamentId);
    await load();
  }, [tournamentId, load]);

  const generateFinal = useCallback(async () => {
    await matchApi.generateFinal(tournamentId);
    await load();
  }, [tournamentId, load]);

  const liveMatches     = matches.filter((m) => m.status === "live");
  const pausedMatches   = matches.filter((m) => m.status === "paused");
  const upcomingMatches = matches.filter((m) => m.status === "pending");
  const completedMatches = matches.filter((m) => m.status === "completed");
  const semifinalMatches = matches.filter((m) => m.stage === "semifinal");
  const finalMatch       = matches.find((m) => m.stage === "final");

  return {
    matches, loading, error, refetch: load,
    liveMatches, pausedMatches, upcomingMatches, completedMatches, semifinalMatches, finalMatch,
    startMatch, updateScore, completeMatch, pauseMatch, resumeMatch,
    generateGroupFixtures, generateSemifinals, generateFinal,
  };
}

// ============================================================
//  useStandings — auto-updates when scores change
// ============================================================
export function useStandings(tournamentId: string) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading]     = useState(true);
  const channelRef = useRef<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStandings(await standingsApi.list(tournamentId));
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
    channelRef.current = realtime.onStandingsUpdate(tournamentId, setStandings);
    return () => { if (channelRef.current) realtime.unsubscribe(channelRef.current); };
  }, [tournamentId, load]);

  const byGroup = standings.reduce<Record<string, Standing[]>>((acc, s) => {
    const key = s.group_id ?? "overall";
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return { standings, byGroup, loading, refetch: load };
}

// ============================================================
//  useNotifications — real-time notification feed
// ============================================================
export function useNotifications(tournamentId: string) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread]               = useState(0);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    notifApi.list(tournamentId).then((list) => {
      setNotifications(list);
      setUnread(list.filter((n) => !n.is_read).length);
    });

    channelRef.current = realtime.onNotification(tournamentId, (notif) => {
      setNotifications((prev) => [notif, ...prev]);
      setUnread((x) => x + 1);
    });

    return () => { if (channelRef.current) realtime.unsubscribe(channelRef.current); };
  }, [tournamentId]);

  const send = useCallback(async (title: string, body: string, icon?: string, type?: string) => {
    const notif = await notifApi.send(tournamentId, title, body, icon, type);
    setNotifications((prev) => [notif, ...prev]);
  }, [tournamentId]);

  const markRead = useCallback(async (id: string) => {
    await notifApi.markRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    setUnread((x) => Math.max(0, x - 1));
  }, []);

  return { notifications, unread, send, markRead };
}

// ============================================================
//  useLiveTimer — per-match elapsed timer
// ============================================================
export function useLiveTimer(startedAt: string | null): string {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) { setElapsed(0); return; }
    const start = new Date(startedAt).getTime();
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
