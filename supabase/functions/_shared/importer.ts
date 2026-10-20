// @ts-nocheck
// Rezept-Import: strukturierte Daten (schema.org/Recipe) zuerst, AI als Rückfall.
import { gemini, RECIPE_RULES } from "./gemini.ts";
import { guessCategory, validCat } from "./kitchen.js";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export type Recipe = {
  title: string; servings: number; category?: string | null; ingredients: string[]; steps: string[]; tags: string[];
  source_url?: string | null; image_url?: string | null; notes?: string | null; estimated?: boolean; kcal?: number | null;
};

const entities = (s: string) => s
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, "&");
const decode = (s: string) => entities(entities(String(s ?? ""))) // manche Seiten codieren doppelt
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ").trim();

function isRecipe(o: any) { const t = o && o["@type"]; return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe")); }
function findRecipe(o: any): any {
  if (!o || typeof o !== "object") return null;
  if (isRecipe(o)) return o;
  if (Array.isArray(o)) { for (const x of o) { const r = findRecipe(x); if (r) return r; } return null; }
  for (const k of ["@graph", "mainEntity", "itemListElement"]) if (o[k]) { const r = findRecipe(o[k]); if (r) return r; }
  return null;
}
function steps(ins: any): string[] {
  if (!ins) return [];
  if (typeof ins === "string") return entities(ins).replace(/<\/(p|li)>|<br\s*\/?>/gi, "\n").split(/\n|(?<=\.)\s+(?=\d+\.\s)/).map(decode).filter(Boolean);
  if (Array.isArray(ins)) return ins.flatMap(steps);
  if (ins.itemListElement) return steps(ins.itemListElement);
  if (ins.text) return [decode(ins.text)];
  if (ins.name) return [decode(ins.name)];
  return [];
}
function servings(y: any): number {
  const v = Array.isArray(y) ? y.join(" ") : String(y ?? "");
  const m = v.match(/\d+/); return m ? Math.max(1, parseInt(m[0])) : 4;
}
function image(i: any): string | null {
  if (!i) return null;
  if (typeof i === "string") return i;
  if (Array.isArray(i)) return image(i[0]);
  return i.url || i.contentUrl || null;
}
function calories(n: any): number | null {
  const v = String(n?.calories ?? "");
  const m = v.replace(",", ".").match(/[\d.]+/); if (!m) return null;
  const x = parseFloat(m[0]); if (!x) return null;
  return Math.round(/kj/i.test(v) ? x / 4.184 : x);
}
function tags(r: any): string[] {
  const raw = [r.recipeCategory, r.recipeCuisine, r.keywords].flat().filter(Boolean).join(",");
  return [...new Set(raw.split(",").map((s: string) => decode(s)).filter((s: string) => s && s.length < 25))].slice(0, 4);
}

function fromJsonLd(html: string): Recipe | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let data; try { data = JSON.parse(b[1].trim()); } catch { continue; }
    const r = findRecipe(data);
    if (!r) continue;
    const ingredients = (r.recipeIngredient || r.ingredients || []).map(decode).filter(Boolean);
    if (!ingredients.length) continue;
    return { title: decode(r.name || "Rezept"), servings: servings(r.recipeYield), ingredients, steps: steps(r.recipeInstructions), tags: tags(r), image_url: image(r.image), kcal: calories(r.nutrition) };
  }
  return null;
}

async function viaAi(text: string, hint = ""): Promise<Recipe> {
  const r = await gemini([{ text: `${hint}\n\nQuelle:\n${text.slice(0, 30000)}` }], { system: "Du extrahierst Kochrezepte.\n" + RECIPE_RULES });
  if (!r || !r.title || !Array.isArray(r.ingredients) || !r.ingredients.length) throw new Error("In dieser Quelle habe ich kein Rezept gefunden");
  return r;
}

async function tiktok(url: string): Promise<Recipe> {
  const res = await fetch("https://www.tiktok.com/oembed?url=" + encodeURIComponent(url), { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error("TikTok-Video nicht gefunden");
  const o = await res.json();
  const caption = decode(o.title || "");
  if (caption.length < 40) throw new Error("Die TikTok-Beschreibung enthält kein Rezept. Speichere das Video und schick es dem Telegram-Bot direkt, dann liest die AI das Video");
  const r = await viaAi(caption, "Das ist die Beschreibung eines TikTok-Kochvideos. Erstelle daraus ein vollständiges Rezept. Wenn Mengen fehlen, schätze sie sinnvoll und setze estimated=true.");
  r.image_url = o.thumbnail_url || null;
  return r;
}

async function youtube(url: string): Promise<Recipe> {
  // Gemini kann öffentliche YouTube-Videos direkt ansehen (experimentell).
  const r = await gemini([{ file_data: { file_uri: url } }, { text: "Schau dir dieses Kochvideo an und schreib das Rezept auf. Schätze fehlende Mengen und setze dann estimated=true." }],
    { system: "Du extrahierst Kochrezepte aus Videos.\n" + RECIPE_RULES });
  if (!r?.ingredients?.length) throw new Error("Im Video habe ich kein Rezept erkannt");
  return r;
}

/** Video-Datei (z. B. aus Telegram) → Rezept */
export async function fromVideo(bytes: Uint8Array, mime = "video/mp4", caption = ""): Promise<Recipe> {
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await gemini([{ inline_data: { mime_type: mime, data: btoa(bin) } }, { text: `Schau dir dieses Kochvideo an (Bild, Ton und eingeblendeten Text) und schreib das Rezept auf. ${caption ? "Beschreibung dazu: " + caption : ""} Schätze fehlende Mengen und setze dann estimated=true.` }],
    { system: "Du extrahierst Kochrezepte aus Videos.\n" + RECIPE_RULES });
  if (!r?.ingredients?.length) throw new Error("Im Video habe ich kein Rezept erkannt");
  return r;
}

/** Kalorien pro Portion schätzen */
export async function estimateKcal(r: { title?: string; servings?: number; ingredients: string[] }): Promise<number> {
  const out = await gemini([{ text: `Rezept: ${r.title || ""}\nPortionen: ${r.servings || 4}\nZutaten:\n${(r.ingredients || []).join("\n")}` }],
    { system: 'Schätze die Kilokalorien pro Portion anhand der Zutatenmengen. Gib nur JSON zurück: {"kcal": number}', temperature: 0.2 });
  const k = Math.round(+out?.kcal);
  if (!k || k < 20 || k > 5000) throw new Error("Keine sinnvolle Schätzung");
  return k;
}

export async function importRecipe(url: string): Promise<Recipe> {
  let u: URL; try { u = new URL(url); } catch { throw new Error("Das ist kein gültiger Link"); }
  const host = u.hostname.replace(/^www\./, "");
  let r: Recipe;
  if (/(^|\.)tiktok\.com$/.test(host)) r = await tiktok(url);
  else if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) r = await youtube(url);
  else {
    const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "de-CH,de;q=0.9" }, redirect: "follow" });
    if (!res.ok) throw new Error(`Seite nicht erreichbar (${res.status})`);
    const html = await res.text();
    r = fromJsonLd(html) || await viaAi(decode(html.replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")), "Das ist der Text einer Webseite.");
    if (!r.image_url) r.image_url = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || [])[1] || null;
  }
  let kcal = r.kcal ? Math.round(+r.kcal) : null;
  if (!kcal) { try { kcal = await estimateKcal(r); } catch { kcal = null; } }
  return {
    kcal,
    title: String(r.title || "Rezept").trim(),
    servings: Math.max(1, parseInt(String(r.servings)) || 4),
    ingredients: (r.ingredients || []).map((x: any) => String(x).trim()).filter(Boolean),
    steps: (r.steps || []).map((x: any) => String(x).trim()).filter(Boolean),
    tags: (r.tags || []).slice(0, 4),
    category: validCat(r.category) || guessCategory(String(r.title || ""), r.tags || []),
    image_url: r.image_url || null,
    source_url: url,
    estimated: !!r.estimated,
    notes: null,
  };
}
