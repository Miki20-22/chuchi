-- Update 5: Rezeptkategorien, Countdowns & Tageszähler
-- Supabase → SQL Editor → New query → einfügen → Run. Kann gefahrlos mehrmals laufen.
alter table public.recipes add column if not exists category text;

create table if not exists public.counters (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'countdown' check (kind in ('countdown', 'since')),
  day        date not null,
  yearly     boolean not null default false,
  record     int,
  created_at timestamptz not null default now()
);
alter table public.counters enable row level security;
drop policy if exists "nur_wir" on public.counters;
create policy "nur_wir" on public.counters for all to authenticated using (true) with check (true);
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'counters') then
    alter publication supabase_realtime add table public.counters;
  end if;
end $$;
