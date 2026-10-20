// @ts-nocheck
// Minimaler Gemini-Client (REST). Modell per Secret GEMINI_MODEL wählbar.

export const MODEL = () => Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";

export function parseJson(text: string) {
  let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch { /* weiter */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error("AI-Antwort war kein JSON");
}

/** parts: Gemini "parts" (z. B. [{text}], [{inline_data:{mime_type,data}}], [{file_data:{file_uri}}]) */
export async function gemini(parts: any[], opts: { system?: string; json?: boolean; temperature?: number } = {}) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY fehlt (supabase secrets set GEMINI_API_KEY=...)");
  const body: any = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: opts.temperature ?? 0.4 },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  if (opts.json !== false) body.generationConfig.responseMimeType = "application/json";

  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    if (res.status === 429 || res.status >= 500) { last = `${res.status}`; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
    return opts.json === false ? text : parseJson(text);
  }
  throw new Error(last === "429" ? "Das Gratis-Kontingent der AI ist gerade aufgebraucht. Versuch es in ein paar Minuten nochmals." : "Die AI ist gerade nicht erreichbar.");
}

export const RECIPE_RULES = `Gib ein JSON-Objekt zurück:
{"title": string, "servings": number, "ingredients": string[], "steps": string[], "tags": string[], "kcal": number, "estimated": boolean}
Regeln:
- Alles auf Deutsch (Schweizer Schreibweise: "ss" statt "ß"; Begriffe wie Rahm, Rüebli, Peperoni, Zucchetti sind willkommen). Übersetze bei Bedarf.
- Jede Zutat als eine Zeile im Format "Menge Einheit Zutat, Hinweis", z. B. "200 g Teigwaren", "1 Zwiebel, fein gehackt", "2 dl Rahm", "1 EL Olivenöl".
- Nur metrische Einheiten (g, kg, ml, dl, l, EL, TL, Prise, Stk, Bund, Dose). Cups, oz usw. umrechnen.
- Jeder Arbeitsschritt ein eigener, kurzer Eintrag ohne Nummerierung.
- kcal: geschätzte Kilokalorien pro Portion (ganze Zahl), aus den Zutatenmengen berechnet.
- tags: 1–4 kurze Stichworte (z. B. "vegi", "schnell", "Ofen", "Pasta").
- estimated = true, wenn du Mengen oder Schritte schätzen musstest, weil sie in der Quelle fehlen.`;
