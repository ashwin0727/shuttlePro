-- ============================================================
--  ShuttlePro · Badminton Tournament Platform
--  Supabase PostgreSQL Schema
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── EXTENSIONS ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── ENUMS ───────────────────────────────────────────────────
create type tournament_status as enum ('draft','active','completed','cancelled');
create type match_status      as enum ('pending','live','completed','paused','cancelled');
create type match_stage       as enum ('group','semifinal','final','third_place');
create type tournament_type   as enum ('singles','doubles','mixed_doubles');
create type user_role         as enum ('superadmin','admin','scorer','spectator');

-- ────────────────────────────────────────────────────────────
-- 1. PROFILES (extends Supabase auth.users)
-- ────────────────────────────────────────────────────────────
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  avatar_url  text,
  role        user_role not null default 'spectator',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on profiles for select using (true);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ────────────────────────────────────────────────────────────
-- 2. TOURNAMENTS
-- ────────────────────────────────────────────────────────────
create table tournaments (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  description   text,
  type          tournament_type not null default 'doubles',
  status        tournament_status not null default 'draft',
  venue         text,
  start_date    date,
  end_date      date,
  banner_url    text,
  max_teams     int default 32,
  group_count   int default 2,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table tournaments enable row level security;

create policy "Tournaments viewable by all"
  on tournaments for select using (true);

create policy "Admins can manage tournaments"
  on tournaments for all
  using (exists (
    select 1 from profiles where id = auth.uid() and role in ('admin','superadmin')
  ));

-- ────────────────────────────────────────────────────────────
-- 3. TEAMS
-- ────────────────────────────────────────────────────────────
create table teams (
  id              uuid primary key default uuid_generate_v4(),
  tournament_id   uuid not null references tournaments(id) on delete cascade,
  name            text not null,
  logo_emoji      text default '🏸',
  color           text default '#00ff88',
  seed            int,
  is_active       boolean default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tournament_id, name)
);

alter table teams enable row level security;

create policy "Teams viewable by all" on teams for select using (true);
create policy "Admins manage teams" on teams for all
  using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','superadmin','scorer')));

-- ────────────────────────────────────────────────────────────
-- 4. PLAYERS
-- ────────────────────────────────────────────────────────────
create table players (
  id            uuid primary key default uuid_generate_v4(),
  team_id       uuid not null references teams(id) on delete cascade,
  tournament_id uuid not null references tournaments(id) on delete cascade,
  full_name     text not null,
  jersey_number int,
  avatar_url    text,
  is_captain    boolean default false,
  created_at    timestamptz not null default now()
);

alter table players enable row level security;

create policy "Players viewable by all" on players for select using (true);
create policy "Admins manage players" on players for all
  using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','superadmin')));

-- ────────────────────────────────────────────────────────────
-- 5. GROUPS
-- ────────────────────────────────────────────────────────────
create table groups (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name          text not null,          -- 'A', 'B', 'C' …
  display_order int default 0,
  created_at    timestamptz not null default now(),
  unique (tournament_id, name)
);

alter table groups enable row level security;
create policy "Groups viewable by all" on groups for select using (true);
create policy "Admins manage groups" on groups for all
  using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','superadmin')));

-- ────────────────────────────────────────────────────────────
-- 6. GROUP MEMBERSHIPS
-- ────────────────────────────────────────────────────────────
create table group_teams (
  group_id  uuid not null references groups(id) on delete cascade,
  team_id   uuid not null references teams(id) on delete cascade,
  primary key (group_id, team_id)
);

alter table group_teams enable row level security;
create policy "Group teams viewable by all" on group_teams for select using (true);
create policy "Admins manage group teams" on group_teams for all
  using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','superadmin')));

-- ────────────────────────────────────────────────────────────
-- 7. MATCHES
-- ────────────────────────────────────────────────────────────
-- NOTE: there is intentionally no "courts" table and no court_id
-- here. The product no longer models courts or time-slots —
-- matches are just an ordered queue (see match_order below), with
-- conflict-avoidance and rest-gap rules enforced in application
-- code rather than via a scheduling/court data model.
create table matches (
  id              uuid primary key default uuid_generate_v4(),
  tournament_id   uuid not null references tournaments(id) on delete cascade,
  group_id        uuid references groups(id),
  team1_id        uuid not null references teams(id),
  team2_id        uuid not null references teams(id),
  score1          int,
  score2          int,
  status          match_status not null default 'pending',
  stage           match_stage not null default 'group',
  match_order     int not null default 0, -- play sequence position; no court/slot concept
  started_at      timestamptz,
  completed_at    timestamptz,
  winner_id       uuid references teams(id),
  round_number    int default 1,
  match_number    int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (team1_id <> team2_id)
);

alter table matches enable row level security;
create policy "Matches viewable by all" on matches for select using (true);
create policy "Admins and scorers manage matches" on matches for all
  using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','superadmin','scorer')));

-- ────────────────────────────────────────────────────────────
-- 8. STANDINGS (materialized via function, or cached table)
-- ────────────────────────────────────────────────────────────
create table standings (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  group_id      uuid references groups(id),
  team_id       uuid not null references teams(id),
  played        int default 0,
  wins          int default 0,
  losses        int default 0,
  points_for    int default 0,
  points_against int default 0,
  point_diff    int generated always as (points_for - points_against) stored,
  pts           int generated always as (wins * 2) stored,
  updated_at    timestamptz not null default now(),
  unique (tournament_id, team_id)
);

alter table standings enable row level security;
create policy "Standings viewable by all" on standings for select using (true);
create policy "Admins manage standings" on standings for all
  using (exists (select 1 from profiles where id = auth.uid() and role in ('admin','superadmin','scorer')));

-- ────────────────────────────────────────────────────────────
-- 9. NOTIFICATIONS
-- ────────────────────────────────────────────────────────────
create table notifications (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid references tournaments(id) on delete cascade,
  title         text not null,
  body          text not null,
  icon          text default '🏸',
  type          text default 'info',    -- info | alert | result
  is_read       boolean default false,
  sent_at       timestamptz not null default now()
);

alter table notifications enable row level security;
create policy "Notifications viewable by all" on notifications for select using (true);
create policy "Admins create notifications" on notifications for insert
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('admin','superadmin')));

-- ────────────────────────────────────────────────────────────
-- 10. AUTO-UPDATE updated_at TRIGGER
-- ────────────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_tournaments_updated_at before update on tournaments for each row execute procedure update_updated_at();
create trigger trg_teams_updated_at       before update on teams       for each row execute procedure update_updated_at();
create trigger trg_matches_updated_at     before update on matches     for each row execute procedure update_updated_at();
create trigger trg_standings_updated_at   before update on standings   for each row execute procedure update_updated_at();
create trigger trg_profiles_updated_at    before update on profiles    for each row execute procedure update_updated_at();

-- ────────────────────────────────────────────────────────────
-- 11. AUTO-RECALCULATE STANDINGS after match update
-- ────────────────────────────────────────────────────────────
create or replace function recalc_standings()
returns trigger language plpgsql security definer as $$
declare
  tid uuid := new.tournament_id;
  gid uuid := new.group_id;
begin
  -- Only recalc on completed matches
  if new.status = 'completed' and new.score1 is not null and new.score2 is not null then

    -- Upsert team1
    insert into standings (tournament_id, group_id, team_id, played, wins, losses, points_for, points_against)
    values (tid, gid, new.team1_id, 1,
      case when new.score1 > new.score2 then 1 else 0 end,
      case when new.score1 < new.score2 then 1 else 0 end,
      new.score1, new.score2)
    on conflict (tournament_id, team_id) do update set
      played        = standings.played + 1,
      wins          = standings.wins + case when new.score1 > new.score2 then 1 else 0 end,
      losses        = standings.losses + case when new.score1 < new.score2 then 1 else 0 end,
      points_for    = standings.points_for + new.score1,
      points_against= standings.points_against + new.score2,
      updated_at    = now();

    -- Upsert team2
    insert into standings (tournament_id, group_id, team_id, played, wins, losses, points_for, points_against)
    values (tid, gid, new.team2_id, 1,
      case when new.score2 > new.score1 then 1 else 0 end,
      case when new.score2 < new.score1 then 1 else 0 end,
      new.score2, new.score1)
    on conflict (tournament_id, team_id) do update set
      played        = standings.played + 1,
      wins          = standings.wins + case when new.score2 > new.score1 then 1 else 0 end,
      losses        = standings.losses + case when new.score2 < new.score1 then 1 else 0 end,
      points_for    = standings.points_for + new.score2,
      points_against= standings.points_against + new.score1,
      updated_at    = now();

    -- Set winner
    update matches set
      winner_id = case when new.score1 > new.score2 then new.team1_id else new.team2_id end,
      completed_at = now()
    where id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_recalc_standings
  after update of status, score1, score2 on matches
  for each row execute procedure recalc_standings();

-- ────────────────────────────────────────────────────────────
-- 12. REALTIME — enable publications
-- ────────────────────────────────────────────────────────────
-- Run these in Supabase Dashboard → Database → Replication
-- or uncomment here:

-- alter publication supabase_realtime add table matches;
-- alter publication supabase_realtime add table standings;
-- alter publication supabase_realtime add table notifications;

-- ────────────────────────────────────────────────────────────
-- 13. SEED DATA (optional demo tournament)
-- ────────────────────────────────────────────────────────────
do $$
declare
  t_id uuid;
  ga_id uuid;
  gb_id uuid;
  team_ids uuid[] := array[]::uuid[];
  emojis text[] := array['🦅','🦅','🐍','⚡','🔥','🌟','🕶️','🥇'];
  names  text[] := array['Storm Eagles','Thunder Hawks','Neon Vipers','Iron Smash','Blaze Rackets','Cosmic Aces','Shadow Nets','Gold Smashers'];
  p1s    text[] := array['Arjun K','Vikram S','Suresh P','Dev A','Sam J','Leo P','Rony D','Tian C'];
  p2s    text[] := array['Manu R','Rahul M','Kiran T','Ravi B','Alex W','Max K','Shiv M','Wei L'];
  colors text[] := array['#ff6b35','#00ff88','#a855f7','#3b82f6','#ef4444','#f59e0b','#6366f1','#eab308'];
  i int;
  tid uuid;
begin
  -- Tournament
  insert into tournaments (name, description, type, status, venue, start_date, end_date, max_teams, group_count)
  values ('GameNova Invitational 2026','Premium doubles badminton championship','doubles','active','GameNova Arena','2026-06-17','2026-06-18',8,2)
  returning id into t_id;

  -- Groups
  insert into groups (tournament_id, name, display_order) values (t_id,'A',1) returning id into ga_id;
  insert into groups (tournament_id, name, display_order) values (t_id,'B',2) returning id into gb_id;

  -- Teams + Players
  for i in 1..8 loop
    insert into teams (tournament_id, name, logo_emoji, color)
    values (t_id, names[i], emojis[i], colors[i])
    returning id into tid;

    team_ids := array_append(team_ids, tid);

    insert into players (team_id, tournament_id, full_name, is_captain)
    values (tid, t_id, p1s[i], true);

    insert into players (team_id, tournament_id, full_name, is_captain)
    values (tid, t_id, p2s[i], false);

    -- First 4 teams → Group A, rest → Group B
    if i <= 4 then
      insert into group_teams (group_id, team_id) values (ga_id, tid);
    else
      insert into group_teams (group_id, team_id) values (gb_id, tid);
    end if;
  end loop;

  -- Sample pending matches, in simple play order (match_order).
  -- No court or scheduled-time concept — the app queues matches
  -- up itself and enforces the rest-gap rule in application code.
  insert into matches (tournament_id, group_id, team1_id, team2_id, stage, match_order)
  values
    (t_id, ga_id, team_ids[1], team_ids[2], 'group', 0),
    (t_id, gb_id, team_ids[5], team_ids[6], 'group', 1),
    (t_id, ga_id, team_ids[3], team_ids[4], 'group', 2),
    (t_id, gb_id, team_ids[7], team_ids[8], 'group', 3),
    (t_id, ga_id, team_ids[1], team_ids[3], 'group', 4),
    (t_id, gb_id, team_ids[5], team_ids[7], 'group', 5),
    (t_id, ga_id, team_ids[2], team_ids[4], 'group', 6),
    (t_id, gb_id, team_ids[6], team_ids[8], 'group', 7),
    (t_id, ga_id, team_ids[1], team_ids[4], 'group', 8),
    (t_id, gb_id, team_ids[5], team_ids[8], 'group', 9),
    (t_id, ga_id, team_ids[2], team_ids[3], 'group', 10),
    (t_id, gb_id, team_ids[6], team_ids[7], 'group', 11);

end $$;
