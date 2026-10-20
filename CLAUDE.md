# Chuchichäschtli – Notizen für die Weiterentwicklung

Private Küchen-App für zwei Personen (Michael und seine Freundin), Schweiz. Alles auf Deutsch, Schweizer Schreibweise (ss statt ß, Rüebli, Rahm …). Grundsatz: **keine laufenden Kosten**, nur Gratis-Angebote.

Repository: https://github.com/Miki20-22/chuchi (öffentlich, keine Geheimnisse im Code)
App: https://miki20-22.github.io/chuchi/
Supabase-Projekt: `aydgdfqzajhhssiyfuym` (Region Zürich, Free Plan)

## Aufbau

| Teil | Wo | Technik |
|---|---|---|
| App (Web-App fürs iPhone) | `web/app.html` (Quelle, eine Datei) → `python3 build.py` → `docs/` | Vanilla JS, kein Framework, Supabase JS 2.45.4 von jsDelivr |
| Hosting | `docs/` auf GitHub Pages | `docs/config.js` enthält Project URL + anon Key |
| Datenbank, Login, Live-Sync, Fotos | Supabase | Postgres mit RLS (nur `authenticated`), Realtime, Storage-Bucket `fotos` (privat), pg_cron |
| Rezept-Import, Kalorien | `supabase/functions/import-recipe` | Edge Function (Deno), JWT nötig |
| Telegram-Bot | `supabase/functions/telegram-bot` | Edge Function ohne JWT, Webhook mit Secret, Gemini als AI |
| Gemeinsamer Code | `supabase/functions/_shared/` | `kitchen.js` wird von `build.py` aus `web/app.html` erzeugt – nie von Hand ändern |
| Automatik | `.github/workflows/` | `backend.yml` deployt Funktionen bei Änderungen in `supabase/`, `keepalive.yml` pingt alle 3 Tage |

AI: Google Gemini Free Tier (`GEMINI_MODEL`, Standard `gemini-flash-latest`).

## Tabellen

`recipes` (ingredients/steps als JSON-Arrays von Strings, rating 1–5, kcal pro Portion, image_url = URL oder `storage:pfad`, category = id aus `CATS`, Raten mit `guessCategory()`), `shopping_items` (qty in Grundeinheit g/ml), `meal_plan`, `dept_overrides` (gelernte Abteilungen), `pantry` (Vorrat, id = normName), `recurring` (wöchentlich, weekday 1=Mo…7=So, Funktion `add_recurring()` + Cron 04:00 UTC), `todos`, `counters` (kind `countdown`/`since`, day, yearly, record = längster Stand vor Reset), `bot_messages`, `bot_updates`.

## Arbeitsweise bei Änderungen

1. App ändern in `web/app.html`, dann `python3 build.py`. Neue Tabellen in `T` und `OPTIONAL` eintragen, `emptyS()` ergänzen.
2. Datenbank-Änderungen als neue Datei `supabase/update-N-name.sql` (idempotent: `if not exists`, `drop policy if exists`) **und** am Ende von `schema.sql` anhängen. Bisher: Update 2 (Bewertung/kcal), 3 (Vorrat/Wöchentlich/Fotos), 4 (To-dos), 5 (Kategorien, Countdowns & Zähler).
3. Bot-Funktionen: neue Action im `SYSTEM`-Prompt beschreiben und in `agent()` ausführen; Kontext kommt aus `snapshot()` in `db.ts`.
4. Testen: JS-Syntax mit `node --check`, TS mit `node --experimental-strip-types --check`, App im Headless-Browser (Playwright) im Demo-Modus.
5. Auslieferung: Claude pusht direkt auf `main` (GitHub Pages und `backend.yml` deployen dann automatisch). Bei Datenbank-Änderungen **vorher** das SQL kurz im Chat zum Kopieren zeigen und auf Michaels Bestätigung warten, dass er es im Supabase SQL Editor ausgeführt hat; erst dann pushen. Falls Pushen nicht geht (GitHub-App nicht installiert): ZIP mit `docs`, `supabase`, `web`, Michael lädt die Ordner auf GitHub hoch. Danach App schliessen und neu öffnen. Bei Änderungen an `docs/` die Cache-Version in `docs/sw.js` erhöhen.
6. `docs/index.html` nie von Hand ändern, nur über `build.py`. Die Zeile `<script src="config.js">` erzeugt `build.py`; fehlt sie, fragt die App beim Start nach Project URL und Key. `build.py` bricht ab, wenn sie oder eine gültige `docs/config.js` fehlt.

Michael ist kein Entwickler: Anleitungen Schritt für Schritt, mit genauen Klickpfaden.
