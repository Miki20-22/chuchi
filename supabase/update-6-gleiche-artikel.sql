-- Update 6: gelernte Artikelnamen (z. B. «Bundzwiebeln mit dem Grün» → «Frühlingszwiebeln»)
-- Supabase → SQL Editor → New query → einfügen → Run. Kann gefahrlos mehrmals laufen.
create table if not exists public.aliases (
  id         text primary key,
  name       text not null,
  created_at timestamptz not null default now()
);
alter table public.aliases enable row level security;
drop policy if exists "nur_wir" on public.aliases;
create policy "nur_wir" on public.aliases for all to authenticated using (true) with check (true);
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'aliases') then
    alter publication supabase_realtime add table public.aliases;
  end if;
end $$;
