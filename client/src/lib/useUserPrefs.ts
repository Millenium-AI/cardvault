import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useEffect } from "react";

export interface ConditionColors {
  "Near Mint"?:         string;
  "Lightly Played"?:    string;
  "Moderately Played"?: string;
  "Heavily Played"?:    string;
  "Damaged"?:           string;
}

export interface UserPrefs {
  theme: "dark" | "light";
  conditionColors: ConditionColors;
}

export const DEFAULT_CONDITION_COLORS: Required<ConditionColors> = {
  "Near Mint":         "#34d399", // emerald-400
  "Lightly Played":    "#4ade80", // green-400
  "Moderately Played": "#facc15", // yellow-400
  "Heavily Played":    "#f87171", // red-400
  "Damaged":           "#ef4444", // red-500
};

const CONDITIONS = Object.keys(DEFAULT_CONDITION_COLORS) as (keyof ConditionColors)[];

/** Apply condition colors as CSS variables on <html> */
function applyConditionColors(colors: ConditionColors) {
  const root = document.documentElement;
  CONDITIONS.forEach(cond => {
    const hex = colors[cond] ?? DEFAULT_CONDITION_COLORS[cond];
    const key = cond.toLowerCase().replace(/\s+/g, "-");
    root.style.setProperty(`--badge-${key}-color`, hex);
  });
}

/** Apply theme class to <html> */
function applyTheme(theme: "dark" | "light") {
  const root = document.documentElement;
  if (theme === "light") {
    root.classList.add("light");
    root.classList.remove("dark");
  } else {
    root.classList.add("dark");
    root.classList.remove("light");
  }
}

export function useUserPrefs() {
  const { data, isLoading } = useQuery<UserPrefs>({
    queryKey: ["/api/settings/user-prefs"],
    staleTime: 1000 * 60 * 5,
  });

  // Apply to DOM whenever data changes
  useEffect(() => {
    if (data) {
      applyConditionColors(data.conditionColors ?? {});
      applyTheme(data.theme ?? "dark");
    } else {
      applyConditionColors({});
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async (next: Partial<UserPrefs>) => {
      const merged = { theme: data?.theme ?? "dark", conditionColors: data?.conditionColors ?? {}, ...next };
      await apiRequest("PUT", "/api/settings/user-prefs", merged);
      return merged as UserPrefs;
    },
    onSuccess: (merged) => {
      queryClient.setQueryData(["/api/settings/user-prefs"], merged);
      applyConditionColors(merged.conditionColors ?? {});
      applyTheme(merged.theme ?? "dark");
    },
  });

  return {
    prefs: data,
    isLoading,
    theme: data?.theme ?? "dark",
    conditionColors: { ...DEFAULT_CONDITION_COLORS, ...(data?.conditionColors ?? {}) },
    setTheme: (theme: "dark" | "light") => saveMut.mutate({ theme }),
    setConditionColors: (conditionColors: ConditionColors) => saveMut.mutate({ conditionColors }),
    isSaving: saveMut.isPending,
  };
}
