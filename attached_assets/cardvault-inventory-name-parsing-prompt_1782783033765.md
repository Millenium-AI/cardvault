# CARDVAULT INVENTORY — NAME PARSING + DISPLAY CLEANUP

You are working on **CardVault**, a TCG inventory web app built with React, Vite, Tailwind CSS, shadcn/ui, and Wouter. The backend runs on Railway, frontend on Netlify. The repo is at https://github.com/Millenium-AI/cardvault.

---

## CONTEXT

Cards are imported via CSV export from TCGplayer. Each game's export has a `Product Name` column that contains noise: duplicate card numbers in parentheses, foil/printing suffixes, alternate art labels, and promo source text. We want to parse this **once at upload approval time** on the backend, store the clean result in `matchMetadataJson`, and render clean data on the frontend — never parse at render time.

---

## PART 1 — BACKEND: `parseProductName()` UTILITY

Create a utility function (e.g. `server/lib/parseProductName.ts`) with this exact signature:

```ts
type ParsedName = {
  cleanName: string;
  displaySuffix?: string; // e.g. "Alternate Art", "Parallel", "SPR"
};

export function parseProductName(
  rawName: string,
  game: string,
  existingNumber?: string
): ParsedName
```

### Rules per game:

**`sorcery`**
- Strip trailing `(Foil)` (case-insensitive) from the name — it is already stored in the `Printing` column
- No `displaySuffix` needed
- The set name comes directly from the `Set Name` CSV column — do NOT try to extract it from the product name
- Examples: `"Gargantula (Foil)"` → `cleanName: "Gargantula"`

**`one-piece`**

Step 1 — Strip trailing dash-number suffix: if the name ends in ` - OPXX-NNN`, `- STXX-NNN`, `- EBXX-NNN`, etc., strip it. The number is already in the `Number` column.

Step 2 — Collect ALL trailing parenthetical tokens by repeatedly matching the last `(...)` group from the end of the string. For each token:
- If it matches `/^\d{2,4}$/` OR `/^[A-Z]{2,4}\d{1,2}-\d{3,4}$/` → it is a card number duplicate — **drop it silently**
- Otherwise → it is a variant label — **save it** to a `suffixTokens[]` array (preserve order, collect all of them)

Step 3 — Join all collected suffix tokens with ` · ` and return as `displaySuffix`.

Examples:
- `"Enel (100)"` → `cleanName: "Enel"`, no suffix
- `"Enel (100) (Alternate Art)"` → `cleanName: "Enel"`, `displaySuffix: "Alternate Art"`
- `"Sanji (104) (Alternate Art)"` → `cleanName: "Sanji"`, `displaySuffix: "Alternate Art"`
- `"Portgas.D.Ace (011) (Parallel)"` → `cleanName: "Portgas.D.Ace"`, `displaySuffix: "Parallel"`
- `"Dr.Kureha (Parallel)"` → `cleanName: "Dr.Kureha"`, `displaySuffix: "Parallel"`
- `"Sabo (Event Pack Vol. 4)"` → `cleanName: "Sabo"`, `displaySuffix: "Event Pack Vol. 4"`
- `"Donquixote Doflamingo - OP14-069"` → `cleanName: "Donquixote Doflamingo"`, no suffix
- `"Carrot (023)"` where Number=`OP08-023` → `cleanName: "Carrot"`, no suffix

**`dragon-ball`**
- Strip trailing ` - XXXX-NNN` dash-number suffix (e.g. `"Cell Jr. - FB02-085"` → `"Cell Jr."`)
- After stripping the dash-number, if the remaining name ends in `(ALL_CAPS_LETTERS)` like `(SPR)`, pull it out as `displaySuffix`
- Examples:
  - `"Cell Jr. - FB02-085"` → `cleanName: "Cell Jr."`, no suffix
  - `"SS Son Goku, Decision Made (SPR)"` → `cleanName: "SS Son Goku, Decision Made"`, `displaySuffix: "SPR"`

**`pokemon` and `pokemon-japan`**
- Strip trailing ` - NNN/NNN` (e.g. `"Jolteon ex - 209/187"` → `"Jolteon ex"`)
- If there is a trailing parenthetical like `(Poke Ball Pattern)`, `(Master Ball Pattern)`, `(Prismatic Evolutions Stamp)` — pull it as `displaySuffix`
- Examples:
  - `"Jolteon ex - 209/187"` → `cleanName: "Jolteon ex"`, no suffix
  - `"Lillipup (Poke Ball Pattern)"` → `cleanName: "Lillipup"`, `displaySuffix: "Poke Ball Pattern"`
  - `"Tyranitar ex (Prismatic Evolutions Stamp)"` → `cleanName: "Tyranitar ex"`, `displaySuffix: "Prismatic Evolutions Stamp"`

**`star-wars`**
- Card names can legitimately contain ` - subtitle` (e.g. `"Rey - Nobody"`) — **do NOT strip these**
- Strip trailing `(Foil)` only (already in `Printing` column)
- Any other trailing `(...)` → pull as `displaySuffix` (e.g. `"Jedi Consular (Hyperspace)"` → `displaySuffix: "Hyperspace"`)

---

## PART 2 — BACKEND: PLUG INTO UPLOAD APPROVAL

In the upload approval handler (wherever `matchMetadataJson` is built for each row, likely in `/api/uploads/:id/approve` or your `rpcNewItems` builder):

1. Import `parseProductName`
2. After reading `row["Product Name"]`, `row["Number"]`, and `row["Set Name"]` from the CSV row:

```ts
const rawName   = (row["Product Name"] ?? "").trim();
const csvNumber = (row["Number"] ?? "").trim();
const csvSet    = (row["Set Name"] ?? "").trim();

const { cleanName, displaySuffix } = parseProductName(rawName, game, csvNumber);

// Then in the matchMetadataJson object:
matchMetadataJson: JSON.stringify({
  ...existingMetaFields,
  cleanName,
  displaySuffix: displaySuffix ?? null,
  sourceSetName: csvSet || existingMeta?.sourceSetName || null,
  // keep all existing fields: sourceProductId, sourceTcgplayerId, etc.
})
```

3. Also update the TypeScript type/interface for `matchMetadataJson` to include:

```ts
cleanName?: string;
displaySuffix?: string | null;
sourceSetName?: string | null;
```

---

## PART 3 — FRONTEND: INVENTORY ROW — CARD NAME CELL

In the `InventoryRow` component, update the **Card Name** cell renderer to display two lines:

**Line 1:** Clean card name + optional variant badge  
**Line 2:** Number · Set name + optional Label badge

```tsx
// Card Name cell
<div className="flex flex-col gap-0.5 min-w-0">

  {/* Line 1: name + variant badge */}
  <div className="flex items-center gap-1.5 min-w-0">
    <span className="font-medium truncate">
      {meta.cleanName || item.name}
    </span>
    {meta.displaySuffix && (
      <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary leading-tight">
        {meta.displaySuffix}
      </span>
    )}
  </div>

  {/* Line 2: number · set + label badge */}
  <div className="flex items-center gap-1 min-w-0 text-xs text-muted-foreground">
    {item.number && (
      <span className="shrink-0">{item.number}</span>
    )}
    {item.number && meta.sourceSetName && (
      <span className="shrink-0">·</span>
    )}
    {meta.sourceSetName && (
      <span className="truncate max-w-[160px]">{meta.sourceSetName}</span>
    )}
    {item.labelCreatedAt && (
      <span className="shrink-0 ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm bg-green-500/15 text-green-600 leading-tight">
        Label
      </span>
    )}
  </div>

</div>
```

The column header for this column must read **"Card Name"** (not "Card").

---

## PART 4 — DEFAULT SORT TO ALPHABETICAL

In `Inventory.tsx` (or wherever inventory sort state is initialized), change the default sort:

```ts
// Before:
const [sortBy, setSortBy] = useState("lastSeenAt");

// After:
const [sortBy, setSortBy] = useState("name");
```

---

## PART 5 — COLUMN ALIGNMENT

Ensure the following column alignment rules are applied to all inventory columns:

- **Card Name** — left-aligned (header and cell)
- **All other columns** (Qty, Condition, Rarity, Market $, Print $, Total, etc.) — **centered** (both header text and cell content)

---

## WHAT NOT TO CHANGE

- Do not touch the TCGplayer URL builder (`buildTcgplayerUrl`) — it was recently fixed and is working
- Do not change any existing CSV upload/parse pipeline steps other than adding the `parseProductName` call at the approval stage
- Do not add parsing logic to the frontend — the frontend only reads `meta.cleanName`, `meta.displaySuffix`, and `meta.sourceSetName` from the already-stored JSON
- Do not re-order or remove existing fields from `matchMetadataJson` — only add the three new fields

---

## EXPECTED RESULTS BY GAME

After this change, Line 2 of each card row should look like:

| Game | Line 2 example |
|---|---|
| Sorcery | `Gothic` |
| One Piece | `OP05-100 · Awakening of the New Era` |
| Dragon Ball | `BT21-076 · Wild Resurgence` |
| Pokémon JP | `209/187 · SV8a: Terastal Fest ex` |
| Star Wars | `012/264 · Legends of the Force` |

And variant badges on Line 1 where applicable: `Alternate Art`, `Parallel`, `SPR`, `Hyperspace`, `Poke Ball Pattern`, etc.
