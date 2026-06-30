export type ParsedName = {
  cleanName: string;
  displaySuffix?: string;
};

export function parseProductName(
  rawName: string,
  game: string,
  existingNumber?: string
): ParsedName {
  const name = rawName.trim();

  switch (game) {
    case "sorcery": {
      const cleanName = name.replace(/\s*\(foil\)\s*$/i, "").trim();
      return { cleanName };
    }

    case "one-piece": {
      let working = name;

      // Step 1 — strip trailing dash-number suffix: " - OPXX-NNN" etc.
      working = working.replace(/\s*-\s*[A-Z]{2,4}\d{1,2}-\d{3,4}\s*$/, "").trim();

      // Step 2 — collect all trailing parenthetical tokens
      const suffixTokens: string[] = [];
      const parenRe = /\s*\(([^)]+)\)\s*$/;
      let safety = 20;
      while (safety-- > 0) {
        const m = working.match(parenRe);
        if (!m) break;
        const token = m[1].trim();
        // Drop if it looks like a card number (pure digits or set-code pattern)
        const isNumber = /^\d{2,4}$/.test(token) || /^[A-Z]{2,4}\d{1,2}-\d{3,4}$/.test(token);
        if (!isNumber) suffixTokens.unshift(token);
        working = working.slice(0, working.length - m[0].length).trim();
      }

      const cleanName = working;
      const displaySuffix = suffixTokens.length ? suffixTokens.join(" · ") : undefined;
      return { cleanName, displaySuffix };
    }

    case "dragon-ball": {
      // Strip trailing " - XXXX-NNN" dash-number
      let working = name.replace(/\s*-\s*[A-Z]{2,4}\d{2}-\d{3,4}\s*$/, "").trim();

      // Pull trailing all-caps parenthetical (e.g. "(SPR)")
      const suffixMatch = working.match(/\s*\(([A-Z]{1,6})\)\s*$/);
      let displaySuffix: string | undefined;
      if (suffixMatch) {
        displaySuffix = suffixMatch[1];
        working = working.slice(0, working.length - suffixMatch[0].length).trim();
      }

      return { cleanName: working, displaySuffix };
    }

    case "pokemon":
    case "pokemon-japan": {
      let working = name;
      // Strip trailing " - NNN/NNN"
      working = working.replace(/\s*-\s*\d+\/\d+\s*$/, "").trim();

      // Pull trailing parenthetical as displaySuffix
      const suffixMatch = working.match(/\s*\(([^)]+)\)\s*$/);
      let displaySuffix: string | undefined;
      if (suffixMatch) {
        displaySuffix = suffixMatch[1].trim();
        working = working.slice(0, working.length - suffixMatch[0].length).trim();
      }

      return { cleanName: working, displaySuffix };
    }

    case "star-wars": {
      let working = name;
      // Strip trailing "(Foil)" — already in Printing column
      working = working.replace(/\s*\(foil\)\s*$/i, "").trim();

      // Pull any other trailing parenthetical as displaySuffix (e.g. "(Hyperspace)")
      const suffixMatch = working.match(/\s*\(([^)]+)\)\s*$/);
      let displaySuffix: string | undefined;
      if (suffixMatch) {
        displaySuffix = suffixMatch[1].trim();
        working = working.slice(0, working.length - suffixMatch[0].length).trim();
      }

      // NOTE: do NOT strip " - subtitle" for star-wars (legitimate part of card name)
      return { cleanName: working, displaySuffix };
    }

    case "mtg": {
      return { cleanName: name };
    }

    default: {
      return { cleanName: name };
    }
  }
}
