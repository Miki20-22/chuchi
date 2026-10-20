// @ts-nocheck
// Doppelte Artikel auf der Einkaufsliste zusammenfassen (z. B. «Bundzwiebeln mit dem Grün» + «Frühlingszwiebeln»).
// 1. bekannte Zuordnungen aus der Tabelle «aliases» (ohne AI)
// 2. Gemini erkennt neue Gruppen; jede Zuordnung wird in «aliases» gemerkt.
import { db, detectDept, normName, loadOverrides } from "./db.ts";
import { gemini } from "./gemini.ts";

const SYSTEM = `Du räumst eine Schweizer Einkaufsliste auf. Finde Einträge, die beim Einkaufen GENAU dasselbe Produkt sind:
Synonyme (Bundzwiebeln = Frühlingszwiebeln, Karotten = Rüebli), Einzahl/Mehrzahl, Tippfehler, Zusätze wie "mit dem Grün", "frisch", "gehackt".
NICHT zusammenfassen, was man unterschiedlich kauft: Zwiebeln ≠ rote Zwiebeln ≠ Frühlingszwiebeln, Milch ≠ Hafermilch, Tomaten ≠ Cherrytomaten ≠ Pelati, Rahm ≠ Saucenhalbrahm, Butter ≠ Margarine.
Im Zweifel nicht zusammenfassen.
Gib JSON zurück: {"groups":[{"name":string,"items":number[]}]}
- items: die Nummern der Einträge (mindestens 2 pro Gruppe, jede Nummer höchstens einmal).
- name: kurzer, gebräuchlicher Name in Schweizer Schreibweise, Mehrzahl wo üblich, ohne Menge und ohne Zusätze (z. B. "Frühlingszwiebeln").
Keine Gruppen gefunden: {"groups":[]}`;

type Item = { id: string; name: string; qty: number | null; unit: string | null; recipe_title: string | null; department: string | null; created_at?: string };

async function merge(group: Item[], name: string) {
  const keep = [...group].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))[0];
  const withQty = group.filter(i => i.qty != null);
  const units = new Set(withQty.map(i => i.unit || null));
  let qty: number | null = keep.qty == null ? null : +keep.qty, unit = keep.unit;
  if (withQty.length && units.size === 1) { qty = withQty.reduce((s, i) => s + +i.qty!, 0); unit = withQty[0].unit; }
  else if (qty == null && withQty.length) { qty = +withQty[0].qty!; unit = withQty[0].unit; }
  const titles = [...new Set(group.flatMap(i => (i.recipe_title || "").split(", ")).filter(Boolean))].join(", ") || null;
  const dept = detectDept(name);
  const { error } = await db.from("shopping_items").update({ name, qty, unit, recipe_title: titles, department: dept === "sonstiges" ? keep.department : dept }).eq("id", keep.id);
  if (error) throw new Error(error.message);
  const rest = group.filter(i => i.id !== keep.id).map(i => i.id);
  if (rest.length) await db.from("shopping_items").delete().in("id", rest);
}

/** Fasst gleiche offene Artikel zusammen. Gibt die neuen Namen zurück, z. B. ["Frühlingszwiebeln (3×)"]. */
export async function dedupeList(useAi = true): Promise<{ merged: string[] }> {
  await loadOverrides();
  const { data: items, error } = await db.from("shopping_items").select("*").eq("checked", false).order("created_at");
  if (error) throw new Error(error.message);
  const aliases = new Map<string, string>(((await db.from("aliases").select("id,name")).data || []).map((a: any) => [a.id, a.name]));
  const canon = (n: string) => aliases.get(normName(n)) || n;
  const merged: string[] = [];

  // 1) Bekannte Zuordnungen
  const byKey = new Map<string, Item[]>();
  for (const i of items as Item[]) { const k = normName(canon(i.name)); byKey.set(k, [...(byKey.get(k) || []), i]); }
  let open: Item[] = [];
  for (const g of byKey.values()) {
    if (g.length > 1) { const name = canon(g[0].name); await merge(g, name); merged.push(`${name} (${g.length}×)`); open.push({ ...g[0], name }); }
    else open.push(g[0]);
  }
  if (!useAi || open.length < 2) return { merged };

  // 2) AI für Neues
  const list = open.map((i, n) => `${n}: ${i.name}`).join("\n");
  const out = await gemini([{ text: list }], { system: SYSTEM, temperature: 0.1 });
  const used = new Set<number>();
  const learn: { id: string; name: string }[] = [];
  for (const g of out?.groups || []) {
    const idx = [...new Set((g.items || []).map((x: any) => parseInt(x)))].filter((x: number) => x >= 0 && x < open.length && !used.has(x));
    const name = String(g.name || "").trim().slice(0, 60);
    if (idx.length < 2 || !name) continue;
    idx.forEach(x => used.add(x));
    const grp = idx.map(x => open[x]);
    await merge(grp, name);
    merged.push(`${name} (${grp.length}×)`);
    for (const i of grp) learn.push({ id: normName(i.name), name });
    learn.push({ id: normName(name), name });
  }
  if (learn.length) {
    const uniq = [...new Map(learn.filter(l => l.id).map(l => [l.id, l])).values()];
    await db.from("aliases").upsert(uniq); // fehlt vor Update 6: dann einfach nicht merken
  }
  return { merged };
}
