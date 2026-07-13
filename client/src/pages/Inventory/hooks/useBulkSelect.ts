import { useState, useCallback } from "react";

export function useBulkSelect() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleOne = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[]) => {
    setSelected(prev => {
      const allSelected = ids.every(id => prev.has(id));
      if (allSelected) return new Set<string>();
      return new Set(ids);
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  return { selected, toggleOne, toggleAll, clearSelection };
}
