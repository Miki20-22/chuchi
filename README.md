# Chuchichäschtli

Eure private Küchen-App: Rezepte, Wochenplan und eine Einkaufsliste, die auf beiden iPhones live synchron ist. Dazu ein Telegram-Bot mit AI, der Rezepte vorschlägt, einplant und Links, Fotos oder TikTok-Videos in Rezepte verwandelt.

**Kosten: 0 Franken.** Alles läuft auf Gratis-Angeboten (GitHub, Supabase, Google Gemini, Telegram). Keine Kreditkarte nötig.

---

## Was die App kann

| Bereich | Funktionen |
|---|---|
| **Einkaufsliste** | Sortiert nach Abteilungen (Gemüse, Früchte, Milch, …) wie bei Migros/Coop. Eingabe wie «2 l Milch, Rüebli». Gleiche Artikel werden zusammengezählt (2× 200 g Rüebli → 400 g). Falsch einsortiert? Antippen, Abteilung ändern, die App merkt es sich. Live-Sync zwischen euch beiden, funktioniert auch offline. |
| **Rezepte** | Von Hand erfassen oder per Link importieren. Portionen umrechnen, Schritte beim Kochen abhaken, mit einem Tipp auf die Einkaufsliste. |
| **Wochenplan** | Rezepte auf Tage verteilen, ganze Woche auf die Einkaufsliste. |
| **Telegram-Bot** | «Milch und Eier auf die Liste», «Plane nächste Woche, einmal Fisch», «Was koche ich mit Lauch?». Rezept-Links, Fotos aus dem Kochbuch und gespeicherte TikTok-Videos schicken. Befehle: `/liste`, `/plan`, `/hilfe`. |

## So hängt alles zusammen

```
 iPhone (Web-App vom Homescreen)  ──┐
 iPhone deiner Freundin           ──┼──►  Supabase (Datenbank, Login, Live-Sync)
 Telegram-Bot  ──► Edge Function  ──┘            │
                         └──► Google Gemini (AI) ◄┘ Rezept-Import
 GitHub: hostet die App (Pages) und lädt den Bot automatisch hoch (Actions)
```

---

## Einrichtung (ca. 45 Minuten, einmalig)

Am einfachsten am Computer. Ihr braucht ein Konto bei **GitHub**, **Supabase**, **Google** und **Telegram**.

### 1. Code auf GitHub

1. Auf [github.com](https://github.com) anmelden → oben rechts **+** → **New repository**.
2. Name: `chuchi`, Sichtbarkeit **Public** (nötig für Gratis-Hosting; im Code sind keine Passwörter). → **Create repository**.
3. Auf der leeren Seite **uploading an existing file** wählen und den **Inhalt** des entpackten Ordners hineinziehen (nicht den Ordner selbst).
   - Mac: Der Ordner `.github` ist im Finder versteckt. Mit `⌘ + ⇧ + .` sichtbar machen und mit hochladen.
4. **Commit changes**.
5. **Settings → Pages**: Source **Deploy from a branch**, Branch **main**, Ordner **/docs** → **Save**.
   Nach 1–2 Minuten ist die App erreichbar unter `https://DEIN-NAME.github.io/chuchi/`.

### 2. Datenbank bei Supabase

1. Auf [supabase.com](https://supabase.com) → **New project**. Name `chuchi`, ein sicheres Datenbank-Passwort (aufschreiben), Region in Europa (Zürich, falls angeboten, sonst Frankfurt). Plan: **Free**.
2. Links **SQL Editor** → **New query** → Inhalt von `supabase/schema.sql` einfügen → **Run**. Es sollte «Success» erscheinen.
3. **Authentication → Users → Add user → Create new user**: für dich und deine Freundin je E-Mail und Passwort eintragen, **Auto Confirm User** anhaken.
4. **Authentication → Sign In / Providers**: **Allow new users to sign up** ausschalten. Jetzt kommt niemand ausser euch zwei hinein.
5. **Project Settings → API** (bzw. **API Keys**): Notiere
   - **Project URL** (z. B. `https://abcd1234.supabase.co`). Der Teil `abcd1234` ist eure **Project Ref**.
   - **anon public key**. In neueren Ansichten steht er im Tab **Legacy API Keys** und beginnt mit `eyJ`. Nehmt diesen, nicht den «publishable key». Er darf in der App stehen; die Daten schützt das Login.

### 3. App auf die iPhones

Auf **beiden** iPhones:

1. In **Safari** die GitHub-Pages-Adresse öffnen.
2. Unten **Mehr** → Project URL und anon Key eintragen → **Verbinden** → mit eurer E-Mail anmelden.
3. Teilen-Symbol → **Zum Home-Bildschirm**. Ab jetzt startet die App wie eine normale App.

Die Einkaufsliste ist jetzt synchron. Rezept-Import per Link und der Bot folgen in den nächsten Schritten.

### 4. AI-Schlüssel (Google Gemini)

1. [aistudio.google.com](https://aistudio.google.com) mit dem Google-Konto öffnen → **Get API key** → **Create API key**.
2. Schlüssel kopieren. Keine Kreditkarte hinterlegen, dann bleibt es sicher gratis (bei zu vielen Anfragen meldet der Bot einfach «später nochmals»).

### 5. Telegram-Bot erstellen

1. In Telegram **@BotFather** öffnen → `/newbot` → Namen wählen (z. B. «Chuchi») und einen Benutzernamen, der auf `bot` endet.
2. Den **Token** kopieren (sieht aus wie `123456:ABC-…`).

### 6. Geheimnisse bei GitHub hinterlegen

Im Repository: **Settings → Secrets and variables → Actions → New repository secret**. Lege diese an:

| Name | Wert |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Bei Supabase: Profilbild → **Account preferences → Access Tokens → Generate new token** |
| `SUPABASE_PROJECT_REF` | Die Project Ref aus Schritt 2.5, z. B. `abcd1234` |
| `TELEGRAM_BOT_TOKEN` | Token aus Schritt 5 |
| `TELEGRAM_SECRET` | Ein selbst erfundenes Passwort, nur Buchstaben, Zahlen, `_` und `-`, ca. 30 Zeichen |
| `GEMINI_API_KEY` | Schlüssel aus Schritt 4 |
| `ALLOWED_CHAT_IDS` | Vorerst `0` (wird in Schritt 8 ersetzt) |

Danach **Settings → Actions → General → Workflow permissions → Read and write permissions → Save** (für das automatische Wachhalten).

### 7. Bot hochladen

**Actions → Backend einrichten → Run workflow**. Nach ca. 1 Minute ist der Haken grün.

### 8. Bot für euch freischalten

1. Beide schreiben dem Bot in Telegram `/id`. Er antwortet mit eurer Chat-ID.
2. Secret `ALLOWED_CHAT_IDS` bearbeiten: beide IDs mit Komma, z. B. `123456789,987654321`.
3. **Actions → Backend einrichten → Run workflow** nochmals ausführen.
4. Dem Bot `/start` schreiben. Fertig!

**Tipp – gemeinsame Gruppe:** Erstellt eine Telegram-Gruppe mit euch beiden und dem Bot. Bei @BotFather `/setprivacy` → euren Bot → **Disable**, damit der Bot normale Nachrichten in der Gruppe sieht. Mit `/id` in der Gruppe die Gruppen-ID holen (beginnt mit `-`) und zu `ALLOWED_CHAT_IDS` hinzufügen.

---

## Gut zu wissen

- **Supabase schläft nach 7 Tagen ohne Nutzung ein.** Der GitHub-Job «Wachhalten» pingt alle 3 Tage, das verhindert es. Falls das Projekt doch einmal pausiert: im Supabase-Dashboard auf **Restore** klicken, es gehen keine Daten verloren.
- **Datenschutz:** Beim Gratis-Zugang darf Google die AI-Anfragen zur Verbesserung seiner Dienste verwenden. Der Bot schickt nur Rezepte, eure Listen und Chat-Nachrichten an Gemini, keine Passwörter. Die Datenbank ist nur mit eurem Login lesbar.
- **TikTok:** Ein Link funktioniert, wenn das Rezept in der Videobeschreibung steht. Steht es nur im Video: in TikTok **Teilen → Video speichern** und das Video dem Bot schicken. Die AI schaut sich dann Bild, Ton und eingeblendeten Text an und schätzt fehlende Mengen. Videos bis 20 MB.
- **YouTube-Links** (auch Shorts) kann die AI direkt ansehen. Das ist noch experimentell.
- **Import in der App** zeigt das Rezept zuerst zur Kontrolle an. Der Bot speichert direkt; ihr könnt es danach in der App bearbeiten.
- **AI-Modell:** Standard ist `gemini-flash-latest`. Falls Google das umbenennt, im Repository ein Secret `GEMINI_MODEL` setzen und in `.github/workflows/backend.yml` bei «Geheimnisse» ergänzen.

## Änderungen machen

- Die ganze App steckt in `web/app.html`. Nach einer Änderung `python3 build.py` ausführen; das aktualisiert `docs/` und die gemeinsamen Regeln für den Bot.
- Abteilungen und Stichworte stehen in `web/app.html` unter `KEYWORDS`.
- Änderungen im Ordner `supabase/` lädt GitHub automatisch hoch.

## Dateien

```
web/app.html                     Quelle der App (alles in einer Datei)
docs/                            Gehostete App für GitHub Pages (von build.py erzeugt)
supabase/schema.sql              Datenbank-Tabellen, Zugriffsregeln, Live-Sync
supabase/functions/import-recipe Rezept-Import für die App
supabase/functions/telegram-bot  Telegram-Bot mit AI
supabase/functions/_shared       Gemeinsamer Code (Import, AI, Abteilungen)
.github/workflows/               Automatisches Hochladen und Wachhalten
build.py                         Baut docs/ aus web/app.html
```
