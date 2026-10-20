// @ts-nocheck
// Telegram-Bot: Einkaufsliste, Wochenplan, Rezept-Import und Vorschläge per Chat.
import { gemini, RECIPE_RULES } from "../_shared/gemini.ts";
import { importRecipe, fromVideo } from "../_shared/importer.ts";
import { db, addToList, recipeEntries, saveRecipe, snapshot, listText, esc, parseLine, normName, detectDept, toBase } from "../_shared/db.ts";

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SECRET = Deno.env.get("TELEGRAM_SECRET") || "";
const ALLOWED = (Deno.env.get("ALLOWED_CHAT_IDS") || "").split(",").map(s => s.trim()).filter(Boolean);
const APP_URL = Deno.env.get("APP_URL") || "";
const TZ = "Europe/Zurich";
const WDL = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

const tg = (method: string, body: any) => fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}).then(r => r.json());
const send = (chat_id: number, text: string) =>
  tg("sendMessage", { chat_id, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true });

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date()); // YYYY-MM-DD
const wd = (iso: string) => WDL[new Date(iso + "T12:00:00Z").getUTCDay()];
const short = (iso: string) => { const [, m, d] = iso.split("-"); return `${+d}.${+m}.`; };

async function remember(chat_id: number, role: string, text: string) {
  await db.from("bot_messages").insert({ chat_id, role, text: text.slice(0, 2000) });
}
async function history(chat_id: number) {
  const { data } = await db.from("bot_messages").select("role,text").eq("chat_id", chat_id).order("id", { ascending: false }).limit(10);
  return (data || []).reverse().map((m: any) => `${m.role === "user" ? "Nutzer" : "Bot"}: ${m.text}`).join("\n");
}

function recipeSummary(r: any) {
  return `<b>${esc(r.title)}</b> · ${r.servings} Portionen · ${(r.ingredients || []).length} Zutaten` + (r.notes?.includes("geschätzt") ? "\n<i>Mengen von der AI geschätzt – kurz prüfen.</i>" : "");
}

async function planText(plan: any[], recipes: any[], from: string) {
  const rows = plan.filter(p => p.day >= from).slice(0, 14);
  if (!rows.length) return "Für die nächsten Tage ist noch nichts geplant.";
  return rows.map(p => `• ${wd(p.day).slice(0, 2)} ${short(p.day)}: ${esc(recipes.find(r => r.id === p.recipe_id)?.title || p.note || "?")} (${p.servings} P.)`).join("\n");
}

// ---------- AI-Agent ----------
const SYSTEM = `Du bist der Küchen-Assistent eines Paars in der Schweiz. Ihr teilt eine Rezeptsammlung, einen Wochenplan und eine Einkaufsliste.
Antworte kurz, freundlich und auf Hochdeutsch mit Schweizer Schreibweise ("ss" statt "ß"). Kein Markdown, nur Klartext.
Du gibst IMMER genau ein JSON-Objekt zurück:
{"reply": string, "actions": Action[]}
Mögliche Actions:
- {"type":"add_items","items":[{"name":string,"qty":number|null,"unit":string|null}]}   Artikel auf die Einkaufsliste
- {"type":"check_items","names":string[]}       Artikel als gekauft abhaken
- {"type":"remove_items","names":string[]}      Artikel von der Liste löschen
- {"type":"clear_checked"}                      alle abgehakten Artikel löschen
- {"type":"plan","entries":[{"day":"YYYY-MM-DD","recipe_ref":"R3"|null,"new_recipe":Recipe|null,"servings":number}]}
- {"type":"unplan","days":["YYYY-MM-DD"]}       Plan an diesen Tagen leeren
- {"type":"plan_to_list","from":"YYYY-MM-DD","to":"YYYY-MM-DD"}   Zutaten der geplanten Rezepte auf die Liste
- {"type":"save_recipe","recipe":Recipe}        neues Rezept in die Sammlung
- {"type":"rate","recipe_ref":"R3","stars":1-5}   Rezept bewerten (z. B. "das Curry war super, 5 Sterne")
- {"type":"note","recipe_ref":"R3","text":string}  Notiz zu einem Rezept (z. B. "beim Curry nächstes Mal weniger Salz")
- {"type":"pantry_add","names":string[]}        gehört zum Vorrat (immer da, wird bei Rezepten nicht auf die Liste gesetzt)
- {"type":"pantry_remove","names":string[]}     nicht mehr im Vorrat
- {"type":"recurring_add","items":[{"name":string,"qty":number|null,"unit":string|null}],"weekday":1-7}  jede Woche automatisch auf die Liste (1 = Montag … 7 = Sonntag)
Recipe = {"title":string,"servings":number,"ingredients":string[],"steps":string[],"tags":string[],"kcal":number}
Regeln:
- Führe nur Actions aus, die der Nutzer wirklich will. Bei "schlag mir was vor" nur Vorschläge im reply, ohne plan-Action, und frag, ob du einplanen sollst. Bestätigt der Nutzer später ("ja", "mach so"), plane gemäss Verlauf.
- Bevorzuge gut bewertete Rezepte (★4–5) und solche, die länger nicht gekocht wurden ("zuletzt"). Was in den letzten 14 Tagen schon dran war, planst du nur auf Wunsch. Rezepte mit ★1–2 schlägst du nicht vor.
- Bei Fragen nach Kalorien nutze die kcal-Angaben (pro Portion).
- "X ist leer / aus / fertig" heisst: X mit add_items auf die Liste setzen (auch wenn X im Vorrat ist).
- Beachte die Notizen zu Rezepten, wenn du sie vorschlägst oder beschreibst.
- Beim Wochenplan: nutze zuerst passende Rezepte aus der Sammlung (recipe_ref), ergänze bei Bedarf eigene Ideen als new_recipe mit vollständigen Zutaten und Schritten. Achte auf Abwechslung und Saison. Standard sind 2 Portionen, ausser der Nutzer sagt etwas anderes.
- Nach dem Planen biete an, die Zutaten auf die Liste zu setzen (plan_to_list), ausser der Nutzer hat es schon verlangt.
- Für "heute", "morgen", "nächste Woche" usw. rechne mit dem angegebenen heutigen Datum. Eine Woche beginnt am Montag.
- Wenn du ein Rezept vorschlägst oder beschreibst, das der Nutzer speichern will, nutze save_recipe.
${RECIPE_RULES.split("Regeln:")[1]}`;

async function agent(chat_id: number, text: string) {
  const t = today();
  const s = await snapshot(t);
  const refs = s.recipes.map((r: any, i: number) => ({ ref: `R${i + 1}`, r }));
  const ctx = [
    `Heute: ${wd(t)}, ${t}`,
    `Rezeptsammlung:\n${refs.map(({ ref, r }) => `${ref} | ${r.title} | ${r.servings} P. | ${r.rating ? "★" + r.rating : "unbewertet"} | ${r.kcal ? r.kcal + " kcal/P." : "kcal ?"} | zuletzt ${s.last[r.id] || "nie"} | ${(r.tags || []).join(", ")} |${r.notes ? " Notizen: " + String(r.notes).replace(/\n/g, "; ").slice(-120) + " |" : ""} ${(r.ingredients || []).slice(0, 6).map((x: string) => parseLine(x)?.name).join(", ")}`).join("\n") || "(leer)"}`,
    `Einkaufsliste (offen): ${s.items.filter((i: any) => !i.checked).map((i: any) => i.name).join(", ") || "(leer)"}`,
    `Vorrat (immer da): ${s.pantry.join(", ") || "(leer)"}`,
    `Jede Woche: ${s.recurring.map((r: any) => `${r.name} (${["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][r.weekday]})`).join(", ") || "(nichts)"}`,
    `Abgehakt: ${s.items.filter((i: any) => i.checked).map((i: any) => i.name).join(", ") || "(nichts)"}`,
    `Wochenplan:\n${s.plan.map((p: any) => `${p.day} (${wd(p.day)}): ${s.recipes.find((r: any) => r.id === p.recipe_id)?.title || "?"}, ${p.servings} P.`).join("\n") || "(leer)"}`,
    `Bisheriger Chat:\n${await history(chat_id) || "(neu)"}`,
    `Neue Nachricht: ${text}`,
  ].join("\n\n");

  const out = await gemini([{ text: ctx }], { system: SYSTEM, temperature: 0.6 });
  const done: string[] = [];
  for (const a of out.actions || []) {
    try {
      if (a.type === "add_items") {
        const entries = (a.items || []).map((i: any) => { const p = parseLine(`${i.qty ?? ""} ${i.unit ?? ""} ${i.name}`.trim()); return p && { qty: p.qty, unit: p.unit, name: p.name }; });
        const r = await addToList(entries.filter(Boolean)); done.push(`${r.added + r.merged} Artikel auf der Liste`);
      }
      if (a.type === "check_items" || a.type === "remove_items") {
        const keys = (a.names || []).map(normName);
        const hits = s.items.filter((i: any) => keys.some((k: string) => normName(i.name) === k || normName(i.name).includes(k)));
        for (const h of hits) a.type === "check_items" ? await db.from("shopping_items").update({ checked: true }).eq("id", h.id) : await db.from("shopping_items").delete().eq("id", h.id);
        done.push(`${hits.length} ${a.type === "check_items" ? "abgehakt" : "gelöscht"}`);
      }
      if (a.type === "clear_checked") { await db.from("shopping_items").delete().eq("checked", true); done.push("Abgehakte gelöscht"); }
      if (a.type === "plan") {
        let n = 0;
        for (const e of a.entries || []) {
          let rid = refs.find(x => x.ref === e.recipe_ref)?.r.id;
          if (!rid && e.new_recipe?.title) rid = (await saveRecipe(e.new_recipe)).id;
          if (!rid || !/^\d{4}-\d{2}-\d{2}$/.test(e.day)) continue;
          await db.from("meal_plan").insert({ day: e.day, recipe_id: rid, servings: Math.max(1, parseInt(e.servings) || 2) }); n++;
        }
        done.push(`${n} Tage eingeplant`);
      }
      if (a.type === "unplan") { await db.from("meal_plan").delete().in("day", a.days || []); done.push("Plan angepasst"); }
      if (a.type === "plan_to_list") {
        const { data: plan } = await db.from("meal_plan").select("*, recipes(*)").gte("day", a.from).lte("day", a.to);
        const entries = (plan || []).flatMap((p: any) => p.recipes ? recipeEntries(p.recipes, p.servings) : []);
        const r = await addToList(entries); done.push(`${r.added} neu, ${r.merged} zusammengeführt` + (r.skipped ? `, ${r.skipped} aus dem Vorrat weggelassen` : ""));
      }
      if (a.type === "rate") {
        const hit = refs.find(x => x.ref === a.recipe_ref);
        const n = Math.min(5, Math.max(1, parseInt(a.stars) || 0));
        if (hit && n) { await db.from("recipes").update({ rating: n }).eq("id", hit.r.id); done.push(`«${hit.r.title}» ${"★".repeat(n)}`); }
      }
      if (a.type === "note" && a.text) {
        const hit = refs.find(x => x.ref === a.recipe_ref);
        if (hit) {
          const { data: cur } = await db.from("recipes").select("notes").eq("id", hit.r.id).single();
          const [y, m, d] = today().split("-");
          const line = `${+d}.${+m}.${y.slice(2)}: ${a.text}`;
          await db.from("recipes").update({ notes: cur?.notes ? cur.notes + "\n" + line : line }).eq("id", hit.r.id);
          done.push(`Notiz bei «${hit.r.title}»`);
        }
      }
      if (a.type === "pantry_add") {
        const rows = (a.names || []).map((n: string) => ({ id: normName(n), name: n.charAt(0).toUpperCase() + n.slice(1) }));
        if (rows.length) { await db.from("pantry").upsert(rows); done.push(`${rows.length} im Vorrat`); }
      }
      if (a.type === "pantry_remove") {
        const ids = (a.names || []).map(normName);
        if (ids.length) { await db.from("pantry").delete().in("id", ids); done.push(`${ids.length} aus dem Vorrat`); }
      }
      if (a.type === "recurring_add") {
        const wd = Math.min(7, Math.max(1, parseInt(a.weekday) || 6));
        const rows = (a.items || []).map((i: any) => { const p = parseLine(`${i.qty ?? ""} ${i.unit ?? ""} ${i.name}`.trim()); if (!p) return null; const [q, u] = toBase(p.qty, p.unit); return { name: p.name.charAt(0).toUpperCase() + p.name.slice(1), qty: q, unit: u, department: detectDept(p.name), weekday: wd }; }).filter(Boolean);
        if (rows.length) { await db.from("recurring").insert(rows); await db.rpc("add_recurring"); done.push(`${rows.length} jede Woche`); }
      }
      if (a.type === "save_recipe" && a.recipe?.title) { await saveRecipe(a.recipe); done.push(`Rezept «${a.recipe.title}» gespeichert`); }
    } catch (e) { done.push(`Fehler bei ${a.type}: ${e.message}`); }
  }
  const reply = esc(out.reply || "Erledigt.") + (done.length ? `\n\n<i>✓ ${esc(done.join(" · "))}</i>` : "");
  await remember(chat_id, "bot", (out.reply || "") + (done.length ? ` [${done.join("; ")}]` : ""));
  return reply;
}

// ---------- Nachrichten verarbeiten ----------
async function fileBytes(file_id: string) {
  const f = await tg("getFile", { file_id });
  if (!f.ok) throw new Error("Die Datei ist zu gross (Telegram-Bots dürfen max. 20 MB laden)");
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${f.result.file_path}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function handle(msg: any) {
  const chat_id = msg.chat.id;
  const text: string = (msg.text || msg.caption || "").trim();

  if (text === "/id") return send(chat_id, `Deine Chat-ID: <code>${chat_id}</code>`);
  if (!ALLOWED.includes(String(chat_id))) {
    return send(chat_id, `Dieser Bot ist privat. Falls das dein Bot ist: trag diese Chat-ID in ALLOWED_CHAT_IDS ein: <code>${chat_id}</code>`);
  }
  tg("sendChatAction", { chat_id, action: "typing" });

  if (text === "/start" || text === "/hilfe") {
    return send(chat_id, `Hoi! Ich kümmere mich um eure Küche. Zum Beispiel:\n• «Milch, Eier und 2 Zitronen auf die Liste»\n• «Plane nächste Woche, 5 Abende, einmal Fisch»\n• «Was kann ich mit Lauch und Kartoffeln kochen?»\n• Einen Rezept-Link, ein TikTok-Video oder ein Foto aus dem Kochbuch schicken\n\nBefehle: /liste /plan${APP_URL ? `\nApp: ${APP_URL}` : ""}`);
  }
  if (text === "/liste") { const s = await snapshot(today()); return send(chat_id, listText(s.items)); }
  if (text === "/plan") { const s = await snapshot(today()); return send(chat_id, await planText(s.plan, s.recipes, today())); }

  // Video (z. B. gespeichertes TikTok) oder Foto (Kochbuch) -> Rezept
  const video = msg.video || msg.video_note || (msg.document?.mime_type?.startsWith("video/") ? msg.document : null);
  const photo = msg.photo ? msg.photo[msg.photo.length - 1] : (msg.document?.mime_type?.startsWith("image/") ? msg.document : null);
  if (video || photo) {
    await send(chat_id, video ? "Ich schaue mir das Video an, das dauert einen Moment…" : "Ich lese das Rezept vom Foto…");
    try {
      let r;
      if (video) r = await fromVideo(await fileBytes(video.file_id), video.mime_type || "video/mp4", text);
      else {
        const bytes = await fileBytes(photo.file_id);
        let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        r = await gemini([{ inline_data: { mime_type: photo.mime_type || "image/jpeg", data: btoa(bin) } }, { text: "Lies das Rezept auf diesem Bild ab. " + text }], { system: "Du extrahierst Kochrezepte.\n" + RECIPE_RULES });
      }
      const saved = await saveRecipe(r);
      await remember(chat_id, "bot", `Rezept «${saved.title}» aus ${video ? "Video" : "Foto"} gespeichert.`);
      return send(chat_id, `Gespeichert: ${recipeSummary(saved)}\n\nSoll ich es einplanen oder die Zutaten auf die Liste setzen?`);
    } catch (e) { return send(chat_id, "Das hat nicht geklappt: " + esc(e.message)); }
  }

  if (!text) return;
  await remember(chat_id, "user", text);

  // Link -> Rezept importieren
  const link = text.match(/https?:\/\/\S+/)?.[0];
  if (link && text.replace(link, "").trim().length < 40) {
    try {
      const saved = await saveRecipe(await importRecipe(link));
      await remember(chat_id, "bot", `Rezept «${saved.title}» importiert und gespeichert.`);
      return send(chat_id, `Importiert: ${recipeSummary(saved)}\n\nSoll ich es einplanen? Zum Beispiel «am Freitag für 2».`);
    } catch (e) {
      await remember(chat_id, "bot", `Import fehlgeschlagen: ${e.message}`);
      return send(chat_id, "Import nicht möglich: " + esc(e.message));
    }
  }

  try { return send(chat_id, await agent(chat_id, text)); }
  catch (e) { return send(chat_id, "Da ging etwas schief: " + esc(e.message)); }
}

Deno.serve(async (req) => {
  // GET = wöchentlicher Ping, damit das Gratis-Projekt nicht pausiert
  if (req.method === "GET") {
    const { count } = await db.from("recipes").select("id", { count: "exact", head: true });
    return new Response(`ok, ${count ?? 0} Rezepte`);
  }
  if (SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== SECRET) return new Response("forbidden", { status: 403 });
  const update = await req.json().catch(() => null);
  const msg = update?.message || update?.edited_message;
  if (!msg) return new Response("ok");

  // Doppelte Zustellung (Telegram wiederholt bei Zeitüberschreitung) ignorieren
  const { error } = await db.from("bot_updates").insert({ update_id: update.update_id });
  if (error) return new Response("ok");

  const work = handle(msg).catch(e => console.error(e));
  // Sofort antworten, im Hintergrund weiterarbeiten (Videos können dauern)
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) { EdgeRuntime.waitUntil(work); return new Response("ok"); }
  await work; return new Response("ok");
});
