import { LayoutList, LayoutGrid, Grid2X2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewMode } from "./constants";

export function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const modes: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: "list", icon: <LayoutList className="size-4" />, label: "List" },
    { mode: "grid-sm", icon: <LayoutGrid className="size-4" />, label: "Small Grid" },
    { mode: "grid-lg", icon: <Grid2X2 className="size-4" />, label: "Large Grid" },
  ];

  return (
    <div className="inline-flex h-10 overflow-hidden rounded-md border border-border shrink-0 bg-background">
      {modes.map(({ mode, icon, label }) => (
        <button
          key={mode}
          type="button"
          title={label}
          onClick={() => onChange(mode)}
          className={cn(
            "flex h-10 w-10 items-center justify-center transition-colors",
            "border-r border-border last:border-r-0",
            value === mode
              ? "bg-primary/15 text-primary"
              : "bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}