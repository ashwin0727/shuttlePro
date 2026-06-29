-- ============================================================
--  ShuttlePro · Push Notifications — Database Migration
--  Run AFTER supabase_schema.sql
-- ============================================================

-- ── DEVICE TOKENS TABLE ──────────────────────────────────────
create table device_tokens (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid references profiles(id) on delete cascade,
  tournament_id uuid references tournaments(id) on delete cascade,
  token         text not null,
  platform      text not null default 'web',  -- 'web' | 'android' | 'ios'
  is_active     boolean default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (token)
);

alter table device_tokens enable row level security;

create policy "Users manage their own tokens"
  on device_tokens for all
  using (auth.uid() = user_id or user_id is null);

create policy "Admins can view all tokens for sending"
  on device_tokens for select
  using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','superadmin')));

create trigger trg_device_tokens_updated_at
  before update on device_tokens for each row execute procedure update_updated_at();

-- ── NOTIFICATION PREFERENCES TABLE ───────────────────────────
create table notification_preferences (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references profiles(id) on delete cascade,
  tournament_id   uuid references tournaments(id) on delete cascade,
  match_starting  boolean default true,
  match_live      boolean default true,
  match_result    boolean default true,
  semifinal       boolean default true,
  final           boolean default true,
  schedule_change boolean default true,
  created_at      timestamptz not null default now(),
  unique (user_id, tournament_id)
);

alter table notification_preferences enable row level security;

create policy "Users manage their own preferences"
  on notification_preferences for all
  using (auth.uid() = user_id);

-- ── NOTIFICATION DELIVERY LOG ─────────────────────────────────
create table notification_deliveries (
  id              uuid primary key default uuid_generate_v4(),
  notification_id uuid references notifications(id) on delete cascade,
  device_token_id uuid references device_tokens(id) on delete set null,
  platform        text,
  status          text default 'sent',  -- 'sent' | 'delivered' | 'failed' | 'clicked'
  error_message   text,
  sent_at         timestamptz not null default now()
);

alter table notification_deliveries enable row level security;

create policy "Admins view delivery logs"
  on notification_deliveries for select
  using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','superadmin')));

-- ── AUTO-TRIGGER: notify on match status change ──────────────
-- This fires whenever a match goes live or completes,
-- inserting into the notifications table automatically.
create or replace function notify_on_match_change()
returns trigger language plpgsql security definer as $$
declare
  t1_name text;
  t2_name text;
  winner_name text;
begin
  select name into t1_name from teams where id = new.team1_id;
  select name into t2_name from teams where id = new.team2_id;

  -- Match went live
  if new.status = 'live' and old.status = 'pending' then
    insert into notifications (tournament_id, title, body, icon, type)
    values (new.tournament_id, 'Match is LIVE!', t1_name || ' vs ' || t2_name || ' has started', '🔴', 'alert');
  end if;

  -- Match completed
  if new.status = 'completed' and old.status != 'completed' then
    select name into winner_name from teams where id = new.winner_id;
    insert into notifications (tournament_id, title, body, icon, type)
    values (new.tournament_id, 'Match Complete', winner_name || ' wins ' || new.score1 || '-' || new.score2, '✅', 'result');
  end if;

  return new;
end;
$$;

create trigger trg_notify_on_match_change
  after update of status on matches
  for each row execute procedure notify_on_match_change();

-- ── REALTIME for new tables ───────────────────────────────────
-- alter publication supabase_realtime add table device_tokens;
-- alter publication supabase_realtime add table notification_deliveries;
