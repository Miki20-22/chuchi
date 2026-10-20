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
  created_at  timestamptz not null default now()
);

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
