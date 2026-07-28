-- Floppy Degen Ape leaderboard (run in Supabase SQL Editor)
create table if not exists public.leaderboard (
  username text primary key,
  score integer not null check (score > 0 and score <= 100000),
  updated_at timestamptz not null default now()
);

create index if not exists leaderboard_score_idx
  on public.leaderboard (score desc, updated_at asc);

alter table public.leaderboard enable row level security;

-- Anyone can read the board (optional; API also reads via service role)
drop policy if exists "Public read leaderboard" on public.leaderboard;
create policy "Public read leaderboard"
  on public.leaderboard
  for select
  to anon, authenticated
  using (true);

-- Writes only via service role (server API) — no public insert/update policies
