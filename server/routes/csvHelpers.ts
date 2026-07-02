function normalizeCondition(raw: string): string {
  const s = (raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (s.includes("near mint") || s === "nm") return "Near Mint";
  if (s.includes("lightly played") || s === "lp") return "Lightly Played";
  if (s.includes("moderately played") || s === "mp") return "Moderately Played";
  if (s.includes("heavily played") || s === "hp") return "Heavily Played";
  if (s.includes("damaged") || s === "d") return "Damaged";
  return raw || "Near Mint";
}

function normalizeName(name: string): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"');
}

function normalizeNumber(n: string): string {
  return (n || "").trim().replace(/\s+/g, "");
}

function buildMatchKey(
  productName: string,
  number: string | null | undefined,
  condition: string | null | undefined,
  printing: string | null | undefined,
  setName: string | null | undefined,
  game: string
): string {
  return [
    game.toLowerCase(),
    normalizeName(productName),
    normalizeNumber(number || ""),
    (condition || "").toLowerCase(),
    (printing || "").toLowerCase(),
    normalizeName(setName || ""),
  ].join("|");
}

function ceilPrice(price: number | null | undefined): number {
  return price && !isNaN(price) ? Math.ceil(price) : 0;
}

function normalizeHeader(h: string): string {
  return h.replace(/^﻿/, "").replace(/^"|"$/g, "").trim();
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseCSV(content: string): Record<string, string>[] {
  const lines = content.replace(/^﻿/, "").split(/\r?\n/);
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length < 2) throw new Error("The CSV is empty or contains only a header row with no data.");

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const h of headers) {
    const key = h.toLowerCase();
    seen.has(key) ? duplicates.push(h) : seen.add(key);
  }
  if (duplicates.length > 0) {
    throw new Error(
      `The CSV contains duplicate column headers: ${duplicates.map(d => `"${d}"`).join(", ")}. ` +
      `Please remove duplicate columns and re-upload.`
    );
  }

  return lines
    .slice(1)
    .filter(l => l.trim())
    .map(line => {
      const values = parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = (values[i] || "").trim().replace(/^"|"$/g, "");
      });
      return row;
    });
}

function detectGameFromProductLine(productLine: string | null, fallback: string): string {
  if (!productLine) return fallback;
  const pl = productLine.toLowerCase();
  if (pl.includes("pokemon") || pl.includes("pokémon")) {
    if (pl.includes("japan") || pl.includes(" jp") || pl.includes("(jp)")) return "pokemon-jp";
    return "pokemon";
  }
  if (pl.includes("one piece")) return "one-piece";
  if (pl.includes("sorcery")) return "sorcery";
  if (pl.includes("dragon ball")) return "dragon-ball";
  if (pl.includes("magic") || pl.includes("the gathering") || pl === "mtg") return "mtg";
  if (pl.includes("star wars")) return "star-wars";
  if (pl.includes("lorcana")) return "lorcana";
  if (pl.includes("yu-gi-oh") || pl.includes("yugioh")) return "yugioh";
  if (pl.includes("digimon")) return "digimon";
  if (pl.includes("flesh and blood") || pl.includes("flesh & blood")) return "fab";
  return fallback;
}

export function mapCsvRow(raw: Record<string, string>, game: string, rowIndex: number, uploadId: string): any {
  const k = (...candidates: string[]): string => {
    for (const c of candidates) {
      const found = Object.keys(raw).find(key => key.toLowerCase() === c.toLowerCase());
      if (found && raw[found]) return raw[found];
    }
    return "";
  };

  const productName     = k("Product Name", "Name", "Card Name", "product_name");
  const number          = k("Number", "Card Number", "Collector Number", "number");
  const condition       = normalizeCondition(k("Condition", "condition", "Cond"));
  const rawMarketPrice  = parseFloat(k("TCG Market Price", "Market Price", "TCGplayer Market Price", "Price", "market_price").replace(/[^0-9.]/g, "")) || null;
  const addToQuantity   = parseInt(k("Add to Quantity", "add_to_quantity")) || parseInt(k("Total Quantity", "total_quantity", "Quantity", "Qty", "quantity")) || 1;
  const sourceProductId     = k("Product ID", "product_id") || null;
  const sourceTcgplayerId   = sourceProductId;
  const sourceProductLine   = k("Product Line", "product_line") || null;
  const resolvedGame        = detectGameFromProductLine(sourceProductLine, game);
  const sourceSetName       = k("Set Name", "set_name", "Set", "Expansion") || null;
  const sourcePrinting      = k("Printing", "printing", "Foil", "Edition") || null;
  const sourceRarity        = k("Rarity", "rarity") || null;
  const photoUrl            = k("Photo URL", "photo_url", "Image URL") || null;

  const flags: string[] = [];
  if (!productName) flags.push("missing_product_name");
  if (!rawMarketPrice) flags.push("price_pending_live_fetch");

  return {
    id: crypto.randomUUID(),
    uploadId,
    rowIndex,
    game: resolvedGame,
    productName: productName || "(unknown)",
    number: number || null,
    condition: condition || null,
    rawMarketPrice,
    roundedPrintPrice: ceilPrice(rawMarketPrice),
    addToQuantity,
    normalizedMatchKey: buildMatchKey(productName, number, condition, sourcePrinting, sourceSetName, resolvedGame),
    sourceProductId,
    sourceTcgplayerId,
    sourceProductLine,
    sourceSetName,
    sourcePrinting,
    sourceRarity,
    sourcePayload: JSON.stringify({ ...raw, _photoUrl: photoUrl }),
    parseFlags: flags.length ? JSON.stringify(flags) : null,
    matchStatus: "pending",
    matchedInventoryId: null,
  };
}

export function checkRepricingThreshold(
  newPrice: number,
  oldPrice: number,
  thresholds: { over100Pct: number; mid50to100Pct: number; under50Pct: number }
): { triggered: boolean; rule: string } {
  if (!oldPrice) return { triggered: false, rule: "" };
  const pct = Math.abs((newPrice - oldPrice) / oldPrice) * 100;
  if (newPrice > 100 && pct > thresholds.over100Pct)
    return { triggered: true, rule: `>$100 / >${thresholds.over100Pct}%` };
  if (newPrice >= 50 && newPrice <= 100 && pct > thresholds.mid50to100Pct)
    return { triggered: true, rule: `$50-$100 / >${thresholds.mid50to100Pct}%` };
  if (newPrice < 50 && pct > thresholds.under50Pct)
    return { triggered: true, rule: `<$50 / >${thresholds.under50Pct}%` };
  return { triggered: false, rule: "" };
}

function buildNiimbotCsv(items: any[], CONDITION_SHORT: Record<string, string>): string {
  const headers = ["Condition", "Current Market Price", "Product Name", "Number", "Internal ID"];
  const rows = items.flatMap(item => {
    const qty = Math.max(1, parseInt(item.quantity) || 1);
    const row = [
      `"${CONDITION_SHORT[item.condition] || (item.condition || "").replace(/"/g, '""')}"`,
      `"$${item.roundedPrintPrice || 0}"`,
      `"${(item.productName || "").replace(/"/g, '""')}"`,
      `"${(item.number || "").replace(/"/g, '""')}"`,
      `"${item.inventoryItemId || item.id || ""}"`,
    ].join(",");
    return Array(qty).fill(row);
  });
  return [headers.join(","), ...rows].join("\n");
}

function buildNiimbotDualCsv(items: any[], CONDITION_SHORT: Record<string, string>): string {
  const expanded: any[] = items.flatMap(item => {
    const qty = Math.max(1, parseInt(item.quantity) || 1);
    return Array(qty).fill(item);
  });

  const nA = Math.ceil(expanded.length / 2);
  const sideA = expanded.slice(0, nA);
  const sideB = expanded.slice(nA);

  const headers = [
    "Condition A", "Price A", "Name A", "Number A",
    "Condition B", "Price B", "Name B", "Number B",
  ];

  const rows = sideA.map((a, i) => {
    const b = sideB[i] ?? null;
    const cell = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [
      cell(CONDITION_SHORT[a.condition] || a.condition || ""),
      cell(`$${a.roundedPrintPrice || 0}`),
      cell(a.productName || ""),
      cell(a.number || ""),
      cell(b ? (CONDITION_SHORT[b.condition] || b.condition || "") : ""),
      cell(b ? `$${b.roundedPrintPrice || 0}` : ""),
      cell(b?.productName || ""),
      cell(b?.number || ""),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export function buildLabelCsv(items: any[], stickerMode: string, CONDITION_SHORT: Record<string, string>): string {
  return stickerMode === "dual" ? buildNiimbotDualCsv(items, CONDITION_SHORT) : buildNiimbotCsv(items, CONDITION_SHORT);
}
