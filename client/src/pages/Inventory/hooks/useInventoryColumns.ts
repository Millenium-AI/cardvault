import { useState } from "react";
import { type ColumnKey, DEFAULT_COLUMN_ORDER, mergeColumnOrder } from "../constants";

export function useInventoryColumns() {
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => {
    try {
      const stored = sessionStorage.getItem("inventoryColumnOrder");
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) return mergeColumnOrder(parsed);
      }
    } catch {
      // ignore
    }
    return [...DEFAULT_COLUMN_ORDER];
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
