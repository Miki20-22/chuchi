#!/usr/bin/env python3
"""Baut aus web/app.html die gehostete Version (docs/) und die gemeinsame Logik für den Bot.
Aufruf:  python3 build.py
"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).parent
src = (ROOT / "web/app.html").read_text(encoding="utf-8")

# 1) docs/index.html = vollständiges HTML-Dokument für GitHub Pages
head_end = src.index("<header")
head, body = src[:head_end], src[head_end:]
html = f"""<!doctype html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#eaefec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1619" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="icon-192.png">
<style>:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
{head}</head>
<body>
{body}
</body>
</html>
"""
(ROOT / "docs/index.html").write_text(html, encoding="utf-8")

# 2) Gemeinsame Regeln (Abteilungen, Mengen) für die Edge Functions
js = re.findall(r"<script>(.*?)</script>", src, re.S)[0]
a, b = js.index("// ---------- Abteilungen"), js.index("// ---------- Datenhaltung")
shared = ("// Automatisch aus web/app.html erzeugt (python3 build.py). Nicht von Hand ändern.\n"
          "let OVERRIDES = [];\nexport function setOverrides(o) { OVERRIDES = o || []; }\n"
          + js[a:b].replace("S.dept_overrides", "OVERRIDES")
          + "\nexport { DEPTS, DEPT, detectDept, parseLine, normName, toBase, fmtQty, num };\n")
(ROOT / "supabase/functions/_shared/kitchen.js").write_text(shared, encoding="utf-8")

# 3) Manifest
manifest = {
    "name": "Chuchichäschtli", "short_name": "Chuchi", "lang": "de-CH",
    "start_url": "./", "scope": "./", "display": "standalone",
    "background_color": "#eaefec", "theme_color": "#1d6b4d",
    "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
              {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}],
}
(ROOT / "docs/manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print("Gebaut: docs/index.html, docs/manifest.json, supabase/functions/_shared/kitchen.js")
