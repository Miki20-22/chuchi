-- Chuchichäschtli – Datenbank
-- Im Supabase-Dashboard: SQL Editor → New query → alles einfügen → Run.
-- Das Skript kann gefahrlos mehrmals ausgeführt werden.

create extension if not exists pgcrypto;

create table if not exists public.recipes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  servings    int  not null default 4,
  ingredients jsonb not null default '[]'::jsonb,   -- ["200 g Mehl", "1 Zwiebel, gehackt", ...]
  steps       jsonb not null default '[]'::jsonb,   -- ["Schritt 1", "Schritt 2", ...]
  tags        text[] not null default '{}',
  source_url  text,
  image_url   text,
  notes       text,
  rating      int check (rating between 1 and 5),
  kcal        int,                                  -- pro Portion
  created_at  timestamptz not null default now()
);
-- Für Projekte, die vor Version 2 angelegt wurden:
alter table public.recipes add column if not exists rating int check (rating between 1 and 5);
alter table public.recipes add column if not exists kcal int;

create table if not exists public.shopping_items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  qty          numeric,           -- in Grundeinheit (g, ml) oder Stück
  unit         text,
  department   text not null default 'sonstiges',
  checked      boolean not null default false,
  recipe_title text,
  created_at   timestamptz not null default now()
);

create table if not exists public.meal_plan (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  recipe_id  uuid references public.recipes(id) on delete cascade,
  servings   int not null default 2,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists meal_plan_day on public.meal_plan(day);

-- Gelernte Abteilungen ("rüebli" -> "gemuese")
create table if not exists public.dept_overrides (
  id         text primary key,
  department text not null
);

-- Nur für den Telegram-Bot (Gesprächsverlauf, doppelte Zustellungen verhindern)
create table if not exists public.bot_messages (
  id         bigserial primary key,
  chat_id    bigint not null,
  role       text not null,          -- 'user' | 'bot'
  text       text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.bot_updates (
  update_id  bigint primary key,
  created_at timestamptz not null default now()
);

-- Zugriff: nur angemeldete Personen (ihr zwei). Neue Registrierungen schaltet ihr in Supabase ab.
alter table public.recipes        enable row level security;
alter table public.shopping_items enable row level security;
alter table public.meal_plan      enable row level security;
alter table public.dept_overrides enable row level security;
alter table public.bot_messages   enable row level security;  -- keine Policy = nur der Bot (Service-Key)
alter table public.bot_updates    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['recipes','shopping_items','meal_plan','dept_overrides'] loop
    execute format('drop policy if exists "nur_wir" on public.%I', t);
    execute format('create policy "nur_wir" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Live-Sync zwischen den iPhones
do $$
declare t text;
begin
  foreach t in array array['recipes','shopping_items','meal_plan','dept_overrides'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ===== Update 3 =====

-- Vorrat: Dinge, die immer da sind (werden beim Übertragen von Rezepten weggelassen)
create table if not exists public.pantry (
  id         text primary key,          -- normalisierter Name, z. B. "olivenöl"
  name       text not null,
  created_at timestamptz not null default now()
);

-- Jede Woche automatisch auf die Liste
create table if not exists public.recurring (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  qty        numeric,
  unit       text,
  department text not null default 'sonstiges',
  weekday    int  not null default 6 check (weekday between 1 and 7),  -- 1 = Montag … 7 = Sonntag
  last_added date,
  created_at timestamptz not null default now()
);

alter table public.pantry    enable row level security;
alter table public.recurring enable row level security;
do $$
declare t text;
begin
  foreach t in array array['pantry','recurring'] loop
    execute format('drop policy if exists "nur_wir" on public.%I', t);
    execute format('create policy "nur_wir" on public.%I for all to authenticated using (true) with check (true)', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Fällige wöchentliche Artikel auf die Liste setzen (nicht doppelt)
create or replace function public.add_recurring() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record; n int := 0;
  today date := (now() at time zone 'Europe/Zurich')::date;
begin
  for r in select * from public.recurring
           where weekday = extract(isodow from today)::int and (last_added is null or last_added < today)
  loop
    if not exists (select 1 from public.shopping_items where not checked and lower(name) = lower(r.name)) then
      insert into public.shopping_items (name, qty, unit, department, recipe_title)
      values (r.name, r.qty, r.unit, r.department, 'jede Woche');
      n := n + 1;
    end if;
    update public.recurring set last_added = today where id = r.id;
  end loop;
  return n;
end $$;
revoke all on function public.add_recurring() from public, anon;
grant execute on function public.add_recurring() to authenticated, service_role;

-- Jeden Morgen um ca. 6 Uhr (Schweizer Zeit) ausführen
create extension if not exists pg_cron;
select cron.schedule('chuchi-jede-woche', '0 4 * * *', 'select public.add_recurring()');

-- Privater Foto-Speicher, nur für angemeldete Personen
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false) on conflict (id) do nothing;
drop policy if exists "fotos_nur_wir" on storage.objects;
create policy "fotos_nur_wir" on storage.objects for all to authenticated
  using (bucket_id = 'fotos') with check (bucket_id = 'fotos');
