import { useState } from "react";

/**
 * Like useState but persists the value in sessionStorage.
 * Falls back gracefully if sessionStorage is unavailable.
 */
export function useInventoryPersist<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch {
      // ignore
    }
    return defaultValue;
  });

  function setValue(value: T | ((prev: T) => T)) {
    setState(prev => {
      const next = typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
      try {
        sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  return [state, setValue];
}
