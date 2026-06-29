// ============================================================
//  ShuttlePro · Push Notification Client
//  File: src/lib/push.ts
//
//  Install: npm install firebase
// ============================================================

import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, onMessage, type Messaging } from "firebase/messaging";
import { supabase } from "./supabase";

// ── Firebase Config (from your Firebase project settings) ──
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!;

let messaging: Messaging | null = null;

function getMessagingInstance(): Messaging | null {
  if (typeof window === "undefined") return null;
  if (!getApps().length) initializeApp(firebaseConfig);
  if (!messaging) {
    try {
      messaging = getMessaging();
    } catch {
      return null; // Not supported in this browser
    }
  }
  return messaging;
}

// ============================================================
//  PERMISSION & TOKEN MANAGEMENT
// ============================================================
export const push = {
  /** Check current permission state */
  getPermissionState(): NotificationPermission | "unsupported" {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  },

  /**
   * Request permission, register service worker, get FCM token,
   * and save it to Supabase tied to the current user + tournament.
   */
  async enable(userId: string | null, tournamentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!("Notification" in window)) {
        return { success: false, error: "Notifications not supported in this browser" };
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return { success: false, error: "Permission denied" };
      }

      // Register the service worker that handles background messages
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

      const msg = getMessagingInstance();
      if (!msg) return { success: false, error: "Messaging not supported" };

      const token = await getToken(msg, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (!token) return { success: false, error: "Failed to get device token" };

      // Detect platform
      const platform = /android/i.test(navigator.userAgent)
        ? "android"
        : /iphone|ipad|ipod/i.test(navigator.userAgent)
        ? "ios"
        : "web";

      // Save token to Supabase
      const { error } = await supabase.from("device_tokens").upsert(
        {
          user_id: userId,
          tournament_id: tournamentId,
          token,
          platform,
          is_active: true,
        },
        { onConflict: "token" }
      );

      if (error) return { success: false, error: error.message };

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  /** Disable push — mark token inactive */
  async disable(): Promise<void> {
    const msg = getMessagingInstance();
    if (!msg) return;
    const token = await getToken(msg, { vapidKey: VAPID_KEY }).catch(() => null);
    if (token) {
      await supabase.from("device_tokens").update({ is_active: false }).eq("token", token);
    }
  },

  /**
   * Listen for foreground messages (when the tab is open and active).
   * Background messages are handled by the service worker instead.
   */
  onForegroundMessage(callback: (payload: { title: string; body: string; icon?: string }) => void): () => void {
    const msg = getMessagingInstance();
    if (!msg) return () => {};

    const unsubscribe = onMessage(msg, (payload) => {
      callback({
        title: payload.notification?.title ?? "ShuttlePro",
        body: payload.notification?.body ?? "",
        icon: payload.notification?.icon,
      });
    });

    return unsubscribe;
  },
};

// ============================================================
//  NOTIFICATION PREFERENCES API
// ============================================================
export interface NotifPrefs {
  match_starting: boolean;
  match_live: boolean;
  match_result: boolean;
  semifinal: boolean;
  final: boolean;
  schedule_change: boolean;
}

export const notifPrefsApi = {
  async get(userId: string, tournamentId: string): Promise<NotifPrefs | null> {
    const { data } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    return data;
  },

  async update(userId: string, tournamentId: string, prefs: Partial<NotifPrefs>): Promise<void> {
    await supabase.from("notification_preferences").upsert(
      { user_id: userId, tournament_id: tournamentId, ...prefs },
      { onConflict: "user_id,tournament_id" }
    );
  },
};

// ============================================================
//  ADMIN: TRIGGER A PUSH NOTIFICATION (calls Edge Function)
// ============================================================
export const adminPush = {
  /**
   * Send a push notification to devices subscribed to a tournament.
   * Calls the `send-push` Supabase Edge Function, which fans out
   * to FCM and logs deliveries.
   */
  async send(params: {
    tournamentId: string;
    title: string;
    body: string;
    icon?: string;
    type?: string;
    audience?: "all" | "teams" | "admins" | "live_viewers";
    data?: Record<string, string>;
  }): Promise<{ success: boolean; sent?: number; failed?: number; error?: string }> {
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: {
        tournament_id: params.tournamentId,
        title: params.title,
        body: params.body,
        icon: params.icon,
        type: params.type,
        audience: params.audience ?? "all",
        data: params.data ?? {},
      },
    });

    if (error) return { success: false, error: error.message };
    return data;
  },

  // ── Quick presets matching the in-app notification types ──
  matchStarting: (tournamentId: string, team1: string, team2: string) =>
    adminPush.send({
      tournamentId,
      title: "⏰ Match Starting Soon",
      body: `${team1} vs ${team2} starts soon`,
      icon: "⏰",
      type: "alert",
    }),

  matchLive: (tournamentId: string, team1: string, team2: string) =>
    adminPush.send({
      tournamentId,
      title: "🔴 Match is LIVE",
      body: `${team1} vs ${team2} is now live`,
      icon: "🔴",
      type: "alert",
    }),

  matchResult: (tournamentId: string, winner: string, score: string) =>
    adminPush.send({
      tournamentId,
      title: "✅ Match Complete",
      body: `${winner} wins ${score}`,
      icon: "✅",
      type: "result",
    }),

  semifinalAnnounced: (tournamentId: string) =>
    adminPush.send({
      tournamentId,
      title: "🏆 Semi-Finals Announced",
      body: "Check the bracket — fixtures are live!",
      icon: "🏆",
      type: "info",
    }),

  finalAnnounced: (tournamentId: string) =>
    adminPush.send({
      tournamentId,
      title: "🌟 THE FINAL IS SET",
      body: "The championship match is about to begin!",
      icon: "🌟",
      type: "alert",
    }),

  champion: (tournamentId: string, winner: string) =>
    adminPush.send({
      tournamentId,
      title: "🏆 CHAMPIONS!",
      body: `${winner} wins the tournament! Congratulations!`,
      icon: "🥇",
      type: "result",
      audience: "all",
    }),
};
