// @ts-nocheck
// Wird von der App aufgerufen: { url } -> { recipe } (wird erst nach Prüfung in der App gespeichert)
import { importRecipe, estimateKcal } from "../_shared/importer.ts";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    if (body.kcal) return json({ kcal: await estimateKcal(body.kcal) });
    const { url } = body;
    if (!url) return json({ error: "Kein Link angegeben" });
    return json({ recipe: await importRecipe(String(url).trim()) });
  } catch (e) {
    return json({ error: e?.message || String(e) });
  }
});
