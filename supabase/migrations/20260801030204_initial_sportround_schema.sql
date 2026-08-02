create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function private.set_updated_at() from public, anon, authenticated;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  host_token_hash text not null,
  share_code text not null unique,
  name text not null check (char_length(name) between 3 and 80),
  sport text not null default 'badminton' check (sport = 'badminton'),
  venue text not null check (char_length(venue) between 2 and 120),
  scheduled_start timestamptz not null,
  duration_minutes smallint not null check (duration_minutes between 30 and 720),
  timezone text not null default 'Asia/Jakarta',
  court_count smallint not null check (court_count between 1 and 12),
  game_format text not null check (game_format in ('singles', 'doubles')),
  status text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  current_round_number smallint not null default 0 check (current_round_number >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function private.set_updated_at();

create table public.players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  level text not null check (level in ('beginner', 'intermediate', 'pro')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index players_session_name_unique
on public.players (session_id, lower(name));

create index players_session_id_idx on public.players (session_id);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  round_number smallint not null check (round_number > 0),
  status text not null default 'planned' check (status in ('planned', 'live', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, round_number)
);

create index rounds_session_status_number_idx
on public.rounds (session_id, status, round_number desc);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  round_id uuid not null references public.rounds(id) on delete cascade,
  court_number smallint not null check (court_number > 0),
  status text not null default 'planned' check (status in ('planned', 'live', 'completed')),
  team_a_score smallint not null default 0 check (team_a_score between 0 and 21),
  team_b_score smallint not null default 0 check (team_b_score between 0 and 21),
  winner text check (winner in ('a', 'b')),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (round_id, court_number),
  check (
    (status <> 'completed' and winner is null)
    or
    (status = 'completed' and (
      (winner = 'a' and team_a_score = 21 and team_b_score between 0 and 20)
      or
      (winner = 'b' and team_b_score = 21 and team_a_score between 0 and 20)
    ))
  )
);

create trigger matches_set_updated_at
before update on public.matches
for each row execute function private.set_updated_at();

create index matches_session_status_idx on public.matches (session_id, status);
create index matches_round_id_idx on public.matches (round_id);

create table public.match_assignments (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team text not null check (team in ('a', 'b')),
  slot smallint not null check (slot between 1 and 2),
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create index match_assignments_match_id_idx on public.match_assignments (match_id);
create index match_assignments_player_id_idx on public.match_assignments (player_id);
create unique index match_assignments_active_slot_unique
on public.match_assignments (match_id, team, slot) where active;
create unique index match_assignments_active_player_unique
on public.match_assignments (match_id, player_id) where active;

create table public.match_substitutions (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  outgoing_assignment_id bigint not null references public.match_assignments(id),
  incoming_assignment_id bigint not null references public.match_assignments(id),
  created_at timestamptz not null default now(),
  check (outgoing_assignment_id <> incoming_assignment_id)
);

create index match_substitutions_match_id_idx on public.match_substitutions (match_id);
create index match_substitutions_outgoing_idx on public.match_substitutions (outgoing_assignment_id);
create index match_substitutions_incoming_idx on public.match_substitutions (incoming_assignment_id);

alter table public.sessions enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.matches enable row level security;
alter table public.match_assignments enable row level security;
alter table public.match_substitutions enable row level security;

revoke all on table public.sessions from anon, authenticated;
revoke all on table public.players from anon, authenticated;
revoke all on table public.rounds from anon, authenticated;
revoke all on table public.matches from anon, authenticated;
revoke all on table public.match_assignments from anon, authenticated;
revoke all on table public.match_substitutions from anon, authenticated;

grant usage on schema public to service_role;
grant all on table public.sessions to service_role;
grant all on table public.players to service_role;
grant all on table public.rounds to service_role;
grant all on table public.matches to service_role;
grant all on table public.match_assignments to service_role;
grant all on table public.match_substitutions to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
