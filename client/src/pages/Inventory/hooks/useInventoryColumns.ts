import { useState } from "react";
import type { SortField } from "../constants";

const DEFAULT_COLUMN_ORDER: SortField[] = [
  "name",
  "game",
  "condition",
  "quantity",
  "marketPrice",
  "printedPrice",
  "labelStatus",
  "updatedAt",
];

export function useInventoryColumns() {
  const [columnOrder, setColumnOrder] = useState<SortField[]>(() => {
    try {
      const stored = sessionStorage.getItem("inventoryColumnOrder");
      if (stored) {
        const parsed = JSON.parse(stored) as SortField[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return DEFAULT_COLUMN_ORDER;
  });

  function moveColumn(from: number, to: number) {
    setColumnOrder(prev => {
      const next = [...prev];
      const [col] = next.splice(from, 1);
      next.splice(to, 0, col);
      try {
        sessionStorage.setItem("inventoryColumnOrder", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  return { columnOrder, moveColumn };
}
