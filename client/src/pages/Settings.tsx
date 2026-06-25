import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Check, Save, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

function FieldRow({ label, fields }: { label: string; fields: string[] }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-2.5 border-b border-border/50 last:border-0">
      <div className="sm:w-40 shrink-0 text-xs font-medium text-muted-foreground sm:pt-0.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {fields.map(f => (
          <span key={f} className="text-xs bg-accent px-2 py-0.5 rounded border border-border font-mono text-foreground">{f}</span>
        ))}
      </div>
    </div>
  );
}

function ThresholdSettings() {
  const { toast } = useToast();

  const { data: thresholds, isLoading } = useQuery<{ over100Pct: number; mid50to100Pct: number; under50Pct: number }>({
    queryKey: ["/api/settings/thresholds"],
  });

  const [draft, setDraft] = useState<{ over100Pct: string; mid50to100Pct: string; under50Pct: string } | null>(null);

  // Initialize draft when data loads (only once)
  const current = draft ?? (thresholds ? {
    over100Pct: String(thresholds.over100Pct),
    mid50to100Pct: String(thresholds.mid50to100Pct),
    under50Pct: String(thresholds.under50Pct),
  } : null);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!current) return;
      return apiRequest("PUT", "/api/settings/thresholds", {
        over100Pct: parseFloat(current.over100Pct),
        mid50to100Pct: parseFloat(current.mid50to100Pct),
        under50Pct: parseFloat(current.under50Pct),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/thresholds"] });
      setDraft(null);
      toast({ title: "Thresholds saved", description: "New thresholds will apply on the next CSV upload." });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const reset = () => {
    if (thresholds) {
      setDraft({
        over100Pct: String(thresholds.over100Pct),
        mid50to100Pct: String(thresholds.mid50to100Pct),
        under50Pct: String(thresholds.under50Pct),
      });
    }
  };

  const isDirty = thresholds && current && (
    current.over100Pct !== String(thresholds.over100Pct) ||
    current.mid50to100Pct !== String(thresholds.mid50to100Pct) ||
    current.under50Pct !== String(thresholds.under50Pct)
  );

  if (isLoading || !current) {
    return <div className="text-xs text-muted-foreground">Loading…</div>;
  }

  const rows = [
    {
      range: "Over $100",
      field: "over100Pct" as const,
      hint: "Cards priced above $100",
    },
    {
      range: "$50 – $100",
      field: "mid50to100Pct" as const,
      hint: "Cards priced $50 to $100",
    },
    {
      range: "Under $50",
      field: "under50Pct" as const,
      hint: "Cards priced below $50",
    },
  ];

  return (
    <div>
      <div className="space-y-0 mb-4">
        {rows.map(r => (
          <div key={r.range} className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">{r.range}</div>
              <div className="text-xs text-muted-foreground">{r.hint}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-muted-foreground">trigger if &gt;</span>
              <Input
                data-testid={`input-threshold-${r.field}`}
                type="number"
                min="0.1"
                max="100"
                step="0.5"
                value={current[r.field]}
                onChange={e => setDraft(prev => ({ ...(prev ?? current!), [r.field]: e.target.value }))}
                className="w-20 h-8 text-sm text-center font-mono"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button
          data-testid="button-save-thresholds"
          onClick={() => saveMut.mutate()}
          disabled={!isDirty || saveMut.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-sm"
        >
          <Save size={13} className="mr-1.5" />
          {saveMut.isPending ? "Saving…" : "Save Thresholds"}
        </Button>
        {isDirty && (
          <Button variant="ghost" onClick={reset} className="h-8 text-sm text-muted-foreground">
            <RotateCcw size={13} className="mr-1.5" /> Reset
          </Button>
        )}
        {!isDirty && thresholds && (
          <span className="text-xs text-muted-foreground">Defaults: {thresholds.over100Pct}% / {thresholds.mid50to100Pct}% / {thresholds.under50Pct}%</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-3">Changes apply on the next CSV upload — existing queue items are not re-evaluated.</p>
    </div>
  );
}

export default function Settings() {
  const { data: presets } = useQuery<any>({ queryKey: ["/api/settings/presets"] });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="space-y-6 max-w-3xl">

        {/* Repricing thresholds — now editable */}
        <div className="stat-card">
          <div className="text-sm font-semibold text-foreground mb-1">Repricing Thresholds</div>
          <p className="text-xs text-muted-foreground mb-4">
            Minimum % price movement required to flag existing inventory for a label reprint.
          </p>
          <ThresholdSettings />
        </div>

        {/* Label export format */}
        <div className="stat-card">
          <div className="text-sm font-semibold text-foreground mb-1">Label Export Format (Niimbot)</div>
          <p className="text-xs text-muted-foreground mb-4">Column order for exported Niimbot-ready CSV files. One row per physical label.</p>
          <div className="space-y-0">
            {[
              { col: "1", label: "Condition", note: "Shorthand: NM / LP / MP / HP / DMG" },
              { col: "2", label: "Current Market Price", note: "Rounded up to nearest whole dollar" },
              { col: "3", label: "Product Name", note: "Card identity" },
              { col: "4", label: "Number", note: "Secondary ID" },
              { col: "5", label: "Internal Inventory ID", note: "For traceability" },
            ].map(c => (
              <div key={c.col} className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
                <span className="text-xs font-mono text-muted-foreground w-5 shrink-0 pt-0.5">{c.col}</span>
                <span className="text-sm font-medium text-foreground w-36 shrink-0">{c.label}</span>
                <span className="text-xs text-muted-foreground">{c.note}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Condition shorthand reference */}
        <div className="stat-card">
          <div className="text-sm font-semibold text-foreground mb-1">Condition Shorthand</div>
          <p className="text-xs text-muted-foreground mb-4">Used in Niimbot CSV exports and inventory badges.</p>
          <div className="space-y-0">
            {[
              { full: "Near Mint", short: "NM", cls: "badge-nm" },
              { full: "Lightly Played", short: "LP", cls: "badge-lp" },
              { full: "Moderately Played", short: "MP", cls: "badge-mp" },
              { full: "Heavily Played", short: "HP", cls: "badge-hp" },
              { full: "Damaged", short: "DMG", cls: "badge-d" },
            ].map(c => (
              <div key={c.short} className="flex items-center gap-4 py-2 border-b border-border/50 last:border-0">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${c.cls}`}>{c.short}</span>
                <span className="text-sm text-foreground">{c.full}</span>
              </div>
            ))}
          </div>
        </div>

        {/* TCGplayer column mapping */}
        <div className="stat-card">
          <div className="text-sm font-semibold text-foreground mb-1">TCGplayer Column Mapping</div>
          <p className="text-xs text-muted-foreground mb-4">Fields recognized from TCGplayer export CSVs (e.g. your One Piece export).</p>
          {presets?.tcgplayer ? (
            <div className="space-y-0">
              <FieldRow label="Product Name" fields={presets.tcgplayer.productName} />
              <FieldRow label="Number" fields={presets.tcgplayer.number} />
              <FieldRow label="Condition" fields={presets.tcgplayer.condition} />
              <FieldRow label="Market Price" fields={presets.tcgplayer.marketPrice} />
              <FieldRow label="Add to Quantity" fields={presets.tcgplayer.quantity} />
              <FieldRow label="Product ID" fields={presets.tcgplayer.productId} />
              <FieldRow label="TCGplayer ID" fields={presets.tcgplayer.tcgplayerId} />
              <FieldRow label="Set Name" fields={presets.tcgplayer.setName} />
              <FieldRow label="Printing" fields={presets.tcgplayer.printing} />
              <FieldRow label="Rarity" fields={presets.tcgplayer.rarity} />
              <FieldRow label="Product Line" fields={presets.tcgplayer.productLine} />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Loading…</div>
          )}
        </div>

        {/* Matching strategy */}
        <div className="stat-card">
          <div className="text-sm font-semibold text-foreground mb-1">Matching Strategy</div>
          <p className="text-xs text-muted-foreground mb-4">How the parser identifies existing inventory vs. new items during a merge.</p>
          <div className="space-y-3">
            {[
              { priority: "1st", label: "Exact external IDs", desc: "Matches on Product ID or TCGplayer ID (most precise — no false merges)" },
              { priority: "2nd", label: "Composite key", desc: "Game + Product Line + Set Name + Product Name + Number + Condition + Printing" },
              { priority: "3rd", label: "Normalized fallback", desc: "Lowercased/trimmed Product Name + Number + Condition + Printing" },
              { priority: "Guard", label: "Ambiguity guard", desc: "If multiple items match, no auto-merge — flagged as warning for manual review" },
            ].map(s => (
              <div key={s.priority} className="flex gap-3">
                <span className="text-xs bg-primary/15 text-primary border border-primary/20 px-2 py-0.5 rounded font-mono shrink-0 h-fit mt-0.5">{s.priority}</span>
                <div>
                  <div className="text-sm font-medium text-foreground">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Price rounding */}
        <div className="stat-card">
          <div className="text-sm font-semibold text-foreground mb-1">Price Rounding Rules</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <Check size={14} className="text-primary shrink-0 mt-0.5" />
              <span className="text-foreground">Print price always rounds <strong>up</strong> to the nearest whole dollar (<code className="text-xs bg-muted px-1 rounded">Math.ceil</code>)</span>
            </div>
            <div className="flex items-start gap-2">
              <Check size={14} className="text-primary shrink-0 mt-0.5" />
              <span className="text-foreground">Raw market price is stored separately for analytics accuracy</span>
            </div>
            <div className="flex items-start gap-2">
              <Check size={14} className="text-primary shrink-0 mt-0.5" />
              <span className="text-foreground">Repricing thresholds compare raw-to-raw prices, not rounded prices</span>
            </div>
          </div>
        </div>

        {/* Phase info */}
        <div className="stat-card border-dashed">
          <div className="text-sm font-semibold text-foreground mb-1">Build Phase</div>
          <p className="text-xs text-muted-foreground">
            This is <strong className="text-foreground">Phase 1 (MVP)</strong>. Per-card sales/removals, XLSX export, bulk queue actions, scheduled market refresh, and multi-user roles are deferred to later phases.
          </p>
        </div>
      </div>
    </div>
  );
}
