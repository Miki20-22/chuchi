// @ts-nocheck
// Datenbank-Helfer für den Bot (Service-Key, umgeht RLS – nur serverseitig verwenden!)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { detectDept, parseLine, normName, toBase, fmtQty, setOverrides, DEPTS, DEPT } from "./kitchen.js";

export const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
export { DEPTS, DEPT, fmtQty, parseLine, normName };

function must<T>(r: { data: T; error: any }): T { if (r.error) throw new Error(r.error.message); return r.data; }

export async function loadOverrides() { setOverrides(must(await db.from("dept_overrides").select("*"))); }

/** Gleiche Logik wie in der App: gleiche Zutaten werden zusammengezählt. */
export async function addToList(entries: { name: string; qty?: number | null; unit?: string | null; from?: string | null }[]) {
  await loadOverrides();
  const open: any[] = must(await db.from("shopping_items").select("*").eq("checked", false));
  let added = 0, merged = 0;
  const inserts: any[] = [], updates = new Map<string, any>();
  for (const e of entries) {
    if (!e?.name) continue;
    const [q, u] = toBase(e.qty ?? null, e.unit ?? null);
    const key = normName(e.name);
    const hit = open.find(i => normName(i.name) === key && ((i.unit || null) === (u || null) || i.qty == null || q == null));
    if (hit) {
      if (q != null) { hit.qty = (hit.qty == null ? 0 : +hit.qty) + q; hit.unit = u; }
      if (e.from && !(hit.recipe_title || "").includes(e.from)) hit.recipe_title = [hit.recipe_title, e.from].filter(Boolean).join(", ");
      if (!inserts.includes(hit)) updates.set(hit.id, hit);
      merged++;
    } else {
      const row = { id: crypto.randomUUID(), name: e.name.charAt(0).toUpperCase() + e.name.slice(1), qty: q, unit: u, department: detectDept(e.name), checked: false, recipe_title: e.from || null };
      open.push(row); inserts.push(row); added++;
    }
  }
  if (inserts.length) must(await db.from("shopping_items").insert(inserts));
  for (const h of updates.values()) must(await db.from("shopping_items").update({ qty: h.qty, unit: h.unit, recipe_title: h.recipe_title }).eq("id", h.id));
  return { added, merged };
}

export function recipeEntries(r: any, servings?: number) {
  const f = servings && r.servings ? servings / r.servings : 1;
  return (r.ingredients || []).map(parseLine).filter(Boolean)
    .filter((p: any) => !/^(salz|pfeffer|wasser)(\s+und\s+pfeffer)?$/i.test(p.name))
    .map((p: any) => ({ qty: p.qty == null ? null : p.qty * f, unit: p.unit, name: p.name, from: r.title }));
}

export async function saveRecipe(r: any) {
  const row = { title: r.title, servings: Math.max(1, parseInt(r.servings) || 4), ingredients: r.ingredients || [], steps: r.steps || [], tags: r.tags || [],
    source_url: r.source_url || null, image_url: r.image_url || null, notes: r.estimated ? "Mengen von der AI geschätzt – bitte prüfen." : (r.notes || null) };
  return must(await db.from("recipes").insert(row).select().single());
}

export async function snapshot(today: string) {
  const to = new Date(today); to.setDate(to.getDate() + 21);
  const from = new Date(today); from.setDate(from.getDate() - 7);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [recipes, items, plan] = await Promise.all([
    db.from("recipes").select("id,title,servings,tags,ingredients").order("title"),
    db.from("shopping_items").select("*").order("created_at"),
    db.from("meal_plan").select("*").gte("day", iso(from)).lte("day", iso(to)).order("day"),
  ]);
  return { recipes: must(recipes), items: must(items), plan: must(plan) };
}

export function listText(items: any[]) {
  const open = items.filter(i => !i.checked);
  if (!open.length) return "Die Einkaufsliste ist leer.";
  const out: string[] = [];
  for (const d of DEPTS) {
    const g = open.filter(i => (i.department in DEPT ? i.department : "sonstiges") === d.id);
    if (!g.length) continue;
    out.push(`<b>${d.name}</b>`);
    for (const i of g) out.push(`• ${esc(i.name)}${i.qty != null ? " – " + fmtQty(+i.qty, i.unit) : ""}`);
  }
  return out.join("\n");
}

export const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
