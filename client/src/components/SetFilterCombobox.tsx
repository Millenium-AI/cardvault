import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";

interface SetOption { set_id: string; set_name: string; }

interface Props {
  sets: SetOption[];
  value: string;
  onChange: (val: string) => void;
}

export function SetFilterCombobox({ sets, value, onChange }: Props) {
  const [open, setOpen]       = useState(false);
  const [filter, setFilter]   = useState("");
  const containerRef          = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLInputElement>(null);

  const selected = sets.find(s => s.set_id === value);

  const filtered = filter.trim()
    ? sets.filter(s => s.set_name.toLowerCase().includes(filter.toLowerCase()))
    : sets;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  function select(setId: string) {
    onChange(setId);
    setOpen(false);
    setFilter("");
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("all");
    setFilter("");
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full h-10 px-3 text-sm rounded-md border border-input bg-background hover:bg-accent transition-colors"
      >
        <span className="truncate text-left">
          {selected ? selected.set_name : "All Sets"}
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {value !== "all" && (
            <X
              className="h-3 w-3 text-muted-foreground hover:text-foreground"
              onClick={clear}
            />
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {/* Search input */}
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search sets..."
              className="w-full px-2 py-1 text-sm rounded border border-input bg-background outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* List */}
          <ul className="max-h-60 overflow-y-auto py-1">
            <li
              onClick={() => select("all")}
              className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent"
            >
              All Sets
            </li>
            {filtered.length ? (
              filtered.map(s => (
                <li
                  key={s.set_id}
                  onClick={() => select(s.set_id)}
                  className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-accent ${
                    s.set_id === value ? "bg-accent font-medium" : ""
                  }`}
                >
                  {s.set_name}
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-sm text-muted-foreground">No sets found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}