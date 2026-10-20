-- Update 4: To-do-Liste
-- Supabase → SQL Editor → New query → einfügen → Run. Kann gefahrlos mehrmals laufen.
create table if not exists public.todos (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  due        date,
  done       boolean not null default false,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.todos enable row level security;
drop policy if exists "nur_wir" on public.todos;
create policy "nur_wir" on public.todos for all to authenticated using (true) with check (true);
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'todos') then
    alter publication supabase_realtime add table public.todos;
  end if;
end $$;
