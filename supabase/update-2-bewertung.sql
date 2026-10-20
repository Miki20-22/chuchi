-- Update 2: Sterne-Bewertung und Kalorien
-- Supabase → SQL Editor → New query → einfügen → Run
alter table public.recipes add column if not exists rating int check (rating between 1 and 5);
alter table public.recipes add column if not exists kcal int;
