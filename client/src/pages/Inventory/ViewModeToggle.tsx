import { LayoutList, LayoutGrid, Grid2X2 } from "lucide-react";
import { ViewMode } from "./constants";

export function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const modes: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: "list",    icon: <LayoutList size={14} />, label: "List" },
    { mode: "grid-sm", icon: <LayoutGrid size={14} />, label: "Small Grid" },
    { mode: "grid-lg", icon: <Grid2X2 size={14} />,    label: "Large Grid" },
  ];
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden shrink-0">
      {modes.map(({ mode, icon, label }) => (
        <button key={mode} title={label} onClick={() => onChange(mode)}
          className={`flex items-center justify-center h-8 w-8 transition-colors ${
            value === mode ? "bg-primary/15 text-primary border-primary/40" : "text-muted-foreground hover:text-foreground bg-transparent"
          }`}>
          {icon}
        </button>
      ))}
    </div>
  );
}
