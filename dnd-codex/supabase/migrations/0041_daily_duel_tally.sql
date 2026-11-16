-- Daily Duel win-rate tally (T-66). The Daily Duel page records each finished
-- duel here (aggregate only: a random per-browser device id, never an account
-- id), and uses the PREVIOUS day's win rate versus that tier's balance target
-- to lean today's twist toward the hero or the foe. Run in Supabase -> SQL Editor.
--
-- INTENTIONAL ANON GRANTS: the Daily Duel is public and signed-out, so the
-- three RPCs below are callable by `anon` (and `authenticated`). This is a
-- deliberate exception to the 0024 rule. The tables have RLS on and NO policies,
-- so nobody can read or write a row directly; only the validated functions can.

create table if not exists public.daily_duel_results (
  id          bigint generated always as identity primary key,
  day         date not null,
  tier        text not null check (tier in ('easy', 'standard', 'hard')),
  outcome     text not null check (outcome in ('won', 'lost')),
  rounds      int  not null check (rounds between 1 and 999),
  hero_id     text not null check (char_length(hero_id) between 1 and 40),
  foe_id      text not null check (char_length(foe_id) between 1 and 40),
  twist_id    text not null check (char_length(twist_id) <= 40),
  device_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (day, device_id)
);
alter table public.daily_duel_results enable row level security;
-- No policies on purpose: no select, insert, update or delete for any role.

create table if not exists public.daily_twists (
  day            date primary key,
  lean           text not null check (lean in ('hero', 'foe')),
  based_on_rate  numeric not null,
  based_on_n     int not null,
  created_at     timestamptz not null default now()
);
alter table public.daily_twists enable row level security;

-- Max rows accepted per day; bounds abuse from scripted anon calls.
create or replace function public.record_duel_result(
  p_day date, p_tier text, p_outcome text, p_rounds int,
  p_hero_id text, p_foe_id text, p_twist_id text, p_device_id uuid
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_cap constant int := 5000;
  v_rows int;
begin
  if p_day is null or p_day < v_today - 1 or p_day > v_today + 1 then return false; end if;
  if p_tier is null or p_tier not in ('easy', 'standard', 'hard') then return false; end if;
  if p_outcome is null or p_outcome not in ('won', 'lost') then return false; end if;
  if p_rounds is null or p_rounds < 1 or p_rounds > 999 then return false; end if;
  if p_hero_id is null or char_length(p_hero_id) not between 1 and 40 then return false; end if;
  if p_foe_id is null or char_length(p_foe_id) not between 1 and 40 then return false; end if;
  if p_twist_id is null or char_length(p_twist_id) > 40 then return false; end if;
  if p_device_id is null then return false; end if;

  if (select count(*) from public.daily_duel_results where day = p_day) >= v_cap then
    return false;
  end if;

  -- The first result of a day stands, like the local history.
  insert into public.daily_duel_results
    (day, tier, outcome, rounds, hero_id, foe_id, twist_id, device_id)
  values (p_day, p_tier, p_outcome, p_rounds, p_hero_id, p_foe_id, p_twist_id, p_device_id)
  on conflict (day, device_id) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Win-rate targets per tier come from the balance simulation
-- (dnd-codex/scripts/duel-sim.entry.ts). Keep in step with src/lib/duelLean.ts.
create or replace function public.get_duel_lean(p_day date)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_today  date := (now() at time zone 'utc')::date;
  v_prev   date;
  v_tier   text;
  v_target numeric;
  v_n      int;
  v_wins   int;
  v_rate   numeric;
  v_lean   text;
begin
  if p_day is null or p_day > v_today then return null; end if;

  select lean into v_lean from public.daily_twists where day = p_day;
  if found then return v_lean; end if;

  v_prev := p_day - 1;
  -- The previous day's tier is its dominant tier (all clients play the same one).
  select tier, count(*), count(*) filter (where outcome = 'won')
    into v_tier, v_n, v_wins
  from public.daily_duel_results
  where day = v_prev
  group by tier
  order by count(*) desc
  limit 1;

  if v_tier is null or v_n < 20 then return null; end if;

  v_target := case v_tier when 'easy' then 0.95 when 'standard' then 0.65 else 0.39 end;
  v_rate := v_wins::numeric / v_n;

  if v_rate - v_target > 0.12 then v_lean := 'foe';
  elsif v_rate - v_target < -0.12 then v_lean := 'hero';
  else return null;
  end if;

  insert into public.daily_twists (day, lean, based_on_rate, based_on_n)
  values (p_day, v_lean, round(v_rate, 4), v_n)
  on conflict (day) do nothing;

  select lean into v_lean from public.daily_twists where day = p_day;
  return v_lean;
end;
$$;

-- Aggregate only: how many played the day and what share won.
create or replace function public.get_duel_stats(p_day date)
returns table (played int, win_rate numeric)
language sql security definer set search_path = public stable as $$
  select count(*)::int,
         case when count(*) = 0 then null
              else round(count(*) filter (where outcome = 'won')::numeric / count(*), 4) end
  from public.daily_duel_results
  where day = p_day
    and p_day <= (now() at time zone 'utc')::date;
$$;

-- Deliberately callable by anon (see the header): revoke the PUBLIC default,
-- then grant just these three functions.
revoke all on function public.record_duel_result(date, text, text, int, text, text, text, uuid) from public;
revoke all on function public.get_duel_lean(date) from public;
revoke all on function public.get_duel_stats(date) from public;
grant execute on function public.record_duel_result(date, text, text, int, text, text, text, uuid) to anon, authenticated;
grant execute on function public.get_duel_lean(date) to anon, authenticated;
grant execute on function public.get_duel_stats(date) to anon, authenticated;
