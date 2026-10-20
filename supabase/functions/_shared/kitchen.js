// Automatisch aus web/app.html erzeugt (python3 build.py). Nicht von Hand ändern.
let OVERRIDES = [];
export function setOverrides(o) { OVERRIDES = o || []; }
// ---------- Abteilungen (Reihenfolge wie ein typischer Rundgang bei Migros/Coop) ----------
const DEPTS = [
  { id: "gemuese", name: "Gemüse & Kräuter", h: 120 },
  { id: "fruechte", name: "Früchte", h: 30 },
  { id: "brot", name: "Brot & Backwaren", h: 38 },
  { id: "milch", name: "Milch, Eier & Kühlregal", h: 205 },
  { id: "kaese", name: "Käse", h: 48 },
  { id: "fleisch", name: "Fleisch, Fisch & Vegi", h: 0 },
  { id: "vorrat", name: "Vorrat & Konserven", h: 25 },
  { id: "gewuerze", name: "Gewürze, Öl & Saucen", h: 15 },
  { id: "backen", name: "Backen", h: 330 },
  { id: "fruehstueck", name: "Frühstück & Kaffee", h: 20 },
  { id: "suesses", name: "Süsses & Snacks", h: 300 },
  { id: "getraenke", name: "Getränke", h: 190 },
  { id: "tiefkuehl", name: "Tiefkühl", h: 215 },
  { id: "haushalt", name: "Haushalt & Hygiene", h: 265 },
  { id: "sonstiges", name: "Sonstiges", h: 200 }
];
const DEPT = Object.fromEntries(DEPTS.map((d, i) => [d.id, { ...d, i }]));
// "=wort" heisst: nur als ganzes Wort (sonst steckt "ei" in "Reis").
const KEYWORDS = {
  gemuese: "rüebli karotte zwiebel knoblauch kartoffel härdöpfel tomate cherrytomate peperoni paprika zucchetti zucchini gurke salat nüsslisalat eisbergsalat rucola spinat lauch sellerie stangensellerie broccoli brokkoli blumenkohl kohl rotkohl kabis rosenkohl randen rande fenchel aubergine pilz champignon steinpilz kürbis süsskartoffel ingwer chili frühlingszwiebel schalotte avocado =mais maiskolben radieschen spargel petersilie basilikum koriander schnittlauch dill minze rosmarin thymian salbei kresse pak choi chicorée federkohl wirz kohlrabi pastinake topinambur sprossen",
  fruechte: "apfel äpfel birne banane zitrone limette orange mandarine clementine beeren erdbeere himbeere heidelbeere brombeere trauben mango ananas kiwi pfirsich nektarine aprikose kirsche zwetschge pflaume melone wassermelone granatapfel feige grapefruit passionsfrucht datteln",
  brot: "brot zopf weggli toast toastbrot baguette gipfeli tortilla =wrap wraps pita brötchen fladenbrot ciabatta knäckebrot paniermehl semmelbrösel",
  milch: "milch vollmilch rahm vollrahm halbrahm saucenhalbrahm sahne joghurt jogurt quark butter =ei =eier crème fraîche creme fraiche sauerrahm mascarpone ricotta blätterteig kuchenteig pizzateig kuchenteig hafermilch mandelmilch skyr",
  kaese: "käse reibkäse parmesan grana mozzarella gruyère gruyere emmentaler feta raclette sbrinz appenzeller gorgonzola halloumi burrata hüttenkäse tilsiter mascarpone_x vacherin fondue",
  fleisch: "poulet pouletbrust huhn hähnchen rind rindfleisch schwein kalb lamm hack hackfleisch gehacktes speck =specks schinken salami wurst cervelat bratwurst lachs crevetten fisch kabeljau trutenbrust steak filet geschnetzeltes tofu tempeh seitan quorn planted",
  vorrat: "teigwaren pasta spaghetti penne fusilli nudeln hörnli makkaroni magronen lasagne reis risottoreis basmati couscous bulgur quinoa linsen kichererbsen bohnen polenta tomatenpüree passata pelati tomatenstücke kokosmilch bouillon brühe gemüsebouillon thon sardinen mais_dose oliven kapern erdnussbutter nüsse cashew baumnüsse pinienkerne mandeln sonnenblumenkerne",
  gewuerze: "salz pfeffer paprikapulver curry currypulver zimt muskat muskatnuss kreuzkümmel kurkuma oregano getrocknet gemahlen öl olivenöl rapsöl sonnenblumenöl essig balsamico senf ketchup mayonnaise mayo sojasauce worcester sambal harissa tahini sriracha pesto bratensauce gewürz lorbeer garam masala",
  backen: "mehl weissmehl zucker rohzucker puderzucker backpulver hefe trockenhefe vanille vanillezucker kakao maizena speisestärke gelatine",
  fruehstueck: "müesli haferflocken konfitüre konfi honig nutella kaffee tee cornflakes ahornsirup",
  suesses: "schokolade guetzli kekse chips biscuits bonbons glacé popcorn",
  getraenke: "wasser mineralwasser saft orangensaft apfelsaft bier wein weisswein rotwein prosecco cola sirup eistee",
  tiefkuehl: "tiefkühl tk glace pommes frites tiefgekühlt gefroren",
  haushalt: "toilettenpapier wc-papier haushaltpapier abwaschmittel spülmittel geschirrspültabs waschmittel zahnpasta zahnbürste shampoo duschgel seife abfallsäcke kehrichtsäcke alufolie backpapier frischhaltefolie schwamm deo taschentücher"
};
const KW = [];
for (const [d, s] of Object.entries(KEYWORDS)) for (let w of s.split(/\s+/)) {
  if (!w || w.includes("_")) continue;
  const whole = w.startsWith("="); if (whole) w = w.slice(1);
  KW.push({ d, w, whole });
}
KW.sort((a, b) => b.w.length - a.w.length);
const L = "a-zäöüàâéèêëîïôûçß";
function detectDept(name) {
  const n = " " + String(name).toLowerCase() + " ";
  const ov = OVERRIDES.find(o => o.id === normName(name));
  if (ov) return ov.department;
  if (/getrocknet|gemahlen|pulver/.test(n)) return "gewuerze";
  if (/tiefkühl|\btk[- ]|gefroren/.test(n)) return "tiefkuehl";
  for (const k of KW) {
    if (k.whole ? new RegExp(`(^|[^${L}])${k.w}([^${L}]|$)`).test(n) : n.includes(k.w)) return k.d;
  }
  return "sonstiges";
}

// ---------- Mengen & Einheiten ----------
const UNIT_MAP = { g: "g", gr: "g", gramm: "g", kg: "kg", kilo: "kg", mg: "mg", ml: "ml", cl: "cl", dl: "dl", l: "l", lt: "l", liter: "l",
  el: "EL", essl: "EL", "esslöffel": "EL", tbsp: "EL", tl: "TL", "teelöffel": "TL", tsp: "TL", msp: "Msp", messerspitze: "Msp", prise: "Prise", prisen: "Prise",
  stk: "Stk", "stück": "Stk", st: "Stk", bund: "Bund", dose: "Dose", dosen: "Dose", becher: "Becher", pck: "Pck", pk: "Pck", packung: "Pck", packungen: "Pck", "päckli": "Pck", "päckchen": "Pck", beutel: "Beutel",
  zehe: "Zehe", zehen: "Zehe", scheibe: "Scheibe", scheiben: "Scheibe", tasse: "Tasse", tassen: "Tasse", cup: "Tasse", cups: "Tasse", handvoll: "Handvoll",
  zweig: "Zweig", zweige: "Zweig", glas: "Glas", "gläser": "Glas", flasche: "Flasche", flaschen: "Flasche", kopf: "Kopf", knolle: "Knolle", stange: "Stange", stangen: "Stange", blatt: "Blatt", "blätter": "Blatt", rolle: "Rolle", rollen: "Rolle" };
const BASE = { g: ["g", 1], kg: ["g", 1000], mg: ["g", .001], ml: ["ml", 1], cl: ["ml", 10], dl: ["ml", 100], l: ["ml", 1000] };
const FRAC = { "½": .5, "¼": .25, "¾": .75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": .125 };
const QTY = "(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?\\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛])";
function num(s) {
  s = String(s).trim();
  const f = s.slice(-1);
  if (FRAC[f] != null) { const w = s.slice(0, -1).trim(); return (w ? parseFloat(w.replace(",", ".")) : 0) + FRAC[f]; }
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/); if (m) return +m[1] + m[2] / m[3];
  m = s.match(/^(\d+)\/(\d+)$/); if (m) return m[1] / m[2];
  const n = parseFloat(s.replace(",", ".")); return isNaN(n) ? null : n;
}
function takeUnit(rest) {
  const m = rest.match(/^([A-Za-zÄÖÜäöüß-]+)\.?(?=\s|$|,)/);
  if (m && UNIT_MAP[m[1].toLowerCase()]) return [UNIT_MAP[m[1].toLowerCase()], rest.slice(m[0].length).trim()];
  return [null, rest];
}
/** "200 g Rüebli, in Stücken" -> {qty:200, unit:"g", name:"Rüebli", note:"in Stücken"} */
function parseLine(line) {
  let t = String(line).replace(/^[\s\-•*·–]+/, "").trim();
  if (!t) return null;
  let qty = null, unit = null, rest = t;
  let m = t.match(new RegExp("^" + QTY + "(?:\\s*(?:-|–|bis)\\s*" + QTY + ")?\\s*(?:x\\s+)?(.*)$", "i"));
  if (m) {
    qty = num(m[2] || m[1]); rest = m[3];
    [unit, rest] = takeUnit(rest);
  } else {
    // "Milch 2 l" – Menge hinten
    m = t.match(new RegExp("^(.+?)\\s+" + QTY + "\\s*([A-Za-zÄÖÜäöüß]+)?\\.?$"));
    if (m && (!m[3] || UNIT_MAP[m[3].toLowerCase()])) { rest = m[1]; qty = num(m[2]); unit = m[3] ? UNIT_MAP[m[3].toLowerCase()] : null; }
  }
  let name = rest.replace(/^(von|vom)\s+/i, "").trim(), note = "";
  const c = name.indexOf(",");
  if (c > 0) { note = name.slice(c + 1).trim(); name = name.slice(0, c).trim(); }
  name = name.replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (!name) name = t;
  return { qty, unit, name, note, text: t };
}
function normName(n) {
  let s = String(n).toLowerCase().replace(/\(.*?\)/g, "").split(",")[0].replace(/\b(frische?n?|grosse?n?|kleine?n?|reife?n?|bio)\b/g, "").replace(/\s+/g, " ").trim();
  if (s.length > 4) s = s.replace(/(en|n|e|s)$/, "");
  return s;
}
function toBase(qty, unit) { if (qty == null) return [null, unit]; const b = BASE[unit]; return b ? [qty * b[1], b[0]] : [qty, unit]; }

// ---------- Rezeptkategorien (auch vom Bot und beim Import verwendet) ----------
const CATS = [
  { id: "hauptgang", name: "Hauptgang" },
  { id: "salat", name: "Salat & Vorspeise" },
  { id: "suppe", name: "Suppe" },
  { id: "beilage", name: "Beilage" },
  { id: "dessert", name: "Dessert" },
  { id: "backen", name: "Backen & Brot" },
  { id: "fruehstueck", name: "Frühstück & Brunch" },
  { id: "apero", name: "Apéro & Snacks" },
  { id: "getraenk", name: "Getränke" }
];
const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
// Reihenfolge zählt: «Fruchtsalat» ist Dessert, «Brotsalat» ist Salat, «Kartoffelsalat» ist Salat.
const CAT_RULES = [
  ["getraenk", /smoothie|cocktail|mocktail|limonade|sirup|punsch|glühwein|eistee|milchshake|\bshake\b|\blatte\b|\bchai\b|getränk|\bdrink/],
  ["suppe", /suppe|bouillon|eintopf|minestrone|gazpacho|chowder|\bramen\b|\bpho\b|velouté|\bsoup/],
  ["dessert", /dessert|mousse|tiramisu|glace|\beis\b|crème brûlée|creme brulee|pudding|panna cotta|parfait|kompott|crumble|meringue|fruchtsalat|sorbet|vermicelles|fondue au chocolat|schokoladenfondue|süssspeise|nachspeise|nachtisch|tiramisù|zabaione|clafoutis/],
  ["salat", /salat|carpaccio|bruschetta|vorspeise|tatar|ceviche|antipast|\bsalad/],
  ["fruehstueck", /frühstück|brunch|porridge|müesli|muesli|overnight oats|pancake|omelett|rührei|shakshuka|granola|french toast|birchermüesli|bircher|smoothie bowl|eggs benedict/],
  ["backen", /kuchen|torte|muffin|cookie|guetzli|brownie|\bcake\b|cupcake|cheesecake|\bbrot\b|zopf|gugelhopf|scones|biscuit|plätzchen|brötchen|weggli|gipfeli|focaccia|baguette|cantuccini|lebkuchen|grittibänz|früchtewähe|apfelwähe|zwetschgenwähe|aprikosenwähe|rhabarberwähe|backen|gebäck|\btarte tatin/],
  ["apero", /apéro|apero|\bdip\b|hummus|guacamole|tapas|fingerfood|snack|crostini|blätterteigstangen|blätterteigschnecken|käsestangen|tzatziki|aufstrich|antipasti/],
  ["beilage", /beilage|kartoffelstock|ofenkartoffeln|bratkartoffeln|pommes|rösti\b|kartoffelgratin|ofengemüse|\bpüree\b/]
];
/** Kategorie aus Titel und Tags erraten (Standard: Hauptgang) */
function guessCategory(title, tags) {
  const t = " " + [title, ...(tags || [])].join(" ").toLowerCase() + " ";
  for (const [id, re] of CAT_RULES) if (re.test(t)) return id;
  return "hauptgang";
}
const validCat = c => (c && CAT[c]) ? c : null;
function round(n) { return Math.round(n * 100) / 100; }
function fmtNum(n) {
  const r = round(n), w = Math.floor(r), f = r - w;
  const fr = { .25: "¼", .5: "½", .75: "¾" }[round(f)];
  if (fr && w < 10) return (w ? w : "") + fr;
  return String(r);
}
function fmtQty(qty, unit) {
  if (qty == null) return unit || "";
  if (unit === "g" && qty >= 1000) return fmtNum(qty / 1000) + " kg";
  if (unit === "ml" && qty >= 1000) return fmtNum(qty / 1000) + " l";
  if (unit === "ml" && qty >= 100) return fmtNum(qty / 100) + " dl";
  if (unit === "g" && qty >= 50) qty = Math.round(qty);
  return fmtNum(qty) + (unit ? " " + unit : "");
}


export { DEPTS, DEPT, detectDept, parseLine, normName, toBase, fmtQty, num, CATS, CAT, guessCategory, validCat };
