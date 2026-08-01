import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Check, Save, RotateCcw, AlertTriangle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useUserPrefs, DEFAULT_CONDITION_COLORS, ConditionColors } from "@/lib/useUserPrefs";
import { cn } from "@/lib/utils";

// ── Condition color swatches ────────────────────────────────────────────────
const COLOR_SWATCHES = [
  "#34d399", // emerald-400
  "#4ade80", // green-400
  "#86efac", // green-300
  "#6ee7b7", // emerald-300
  "#a3e635", // lime-400
  "#facc15", // yellow-400
  "#fb923c", // orange-400
  "#f87171", // red-400
  "#ef4444", // red-500
  "#c084fc", // purple-400
  "#60a5fa", // blue-400
  "#38bdf8", // sky-400
  "#f472b6", // pink-400
  "#94a3b8", // slate-400
  "#e2e8f0", // slate-200
];

const CONDITIONS: { key: keyof ConditionColors; label: string; short: string }[] = [
  { key: "Near Mint",         label: "Near Mint",         short: "NM"  },
  { key: "Lightly Played",    label: "Lightly Played",    short: "LP"  },
  { key: "Moderately Played", label: "Moderately Played", short: "MP"  },
  { key: "Heavily Played",    label: "Heavily Played",    short: "HP"  },
  { key: "Damaged",           label: "Damaged",           short: "DMG" },
];

function ConditionColorEditor() {
  const { conditionColors, setConditionColors, isSaving } = useUserPrefs();
  const [draft, setDraft] = useState<ConditionColors | null>(null);
  const current: Required<ConditionColors> = { ...DEFAULT_CONDITION_COLORS, ...(draft ?? conditionColors) };

  const isDirty = draft !== null && CONDITIONS.some(c => draft[c.key] !== conditionColors[c.key]);

  function applyDraft(colors: ConditionColors) {
    // Apply preview to DOM immediately
    CONDITIONS.forEach(c => {
      const hex = colors[c.key] ?? DEFAULT_CONDITION_COLORS[c.key];
      const cssKey = c.key.toLowerCase().replace(/\s+/g, "-");
      document.documentElement.style.setProperty(`--badge-${cssKey}-color`, hex);
    });
  }

  function setSwatch(condKey: keyof ConditionColors, hex: string) {
    const next = { ...current, [condKey]: hex };
    setDraft(next);
    applyDraft(next);
  }

  function save() {
    setConditionColors({ ...DEFAULT_CONDITION_COLORS, ...(draft ?? conditionColors) });
    setDraft(null);
  }

  function reset() {
    setDraft({ ...DEFAULT_CONDITION_COLORS });
    applyDraft(DEFAULT_CONDITION_COLORS);
  }

  return (
    <div>
      <div className="space-y-4 mb-4">
        {CONDITIONS.map(({ key, label, short }) => (
          <div key={key}>
            <div className="flex items-center gap-3 mb-2">
              {/* Live preview badge */}
              <span
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border shrink-0"
                style={{
                  color: current[key],
                  background: `color-mix(in srgb, ${current[key]} 15%, transparent)`,
                  borderColor: `color-mix(in srgb, ${current[key]} 30%, transparent)`,
                }}
              >
                {short}
              </span>
              <span className="text-sm text-foreground">{label}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {COLOR_SWATCHES.map(hex => (
                <button
                  key={hex}
                  onClick={() => setSwatch(key, hex)}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 transition-all shrink-0",
                    current[key] === hex
                      ? "border-white scale-125 shadow-md"
                      : "border-transparent hover:border-white/50 hover:scale-110"
                  )}
                  style={{ background: hex }}
                  title={hex}
                />
              ))}
              {/* Custom hex input */}
              <input
                type="color"
                value={current[key]}
                onChange={e => setSwatch(key, e.target.value)}
                className="w-6 h-6 rounded-full cursor-pointer border-2 border-border bg-transparent p-0"
                title="Custom color"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={save}
          disabled={!isDirty || isSaving}
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-sm"
        >
          <Save size={13} className="mr-1.5" />
          {isSaving ? "Saving…" : "Save Colors"}
        </Button>
        <Button variant="ghost" onClick={reset} className="h-8 text-sm text-muted-foreground">
          <RotateCcw size={13} className="mr-1.5" /> Reset Defaults
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">Changes preview instantly. Click Save Colors to persist across devices.</p>
    </div>
  );
}

// ── Threshold settings (unchanged) ─────────────────────────────────────────
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

function SalesCrossCheckSettings() {
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading } = useQuery<any>({
    queryKey: ["/api/settings/sales-check"],
  });

  const { data: bands, isLoading: bandsLoading } = useQuery<any>({
    queryKey: ["/api/settings/divergence-bands"],
  });

  const [settingsDraft, setSettingsDraft] = useState<any>(null);
  const [bandsDraft, setBandsDraft] = useState<any>(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (settingsDraft) {
        await apiRequest("PUT", "/api/settings/sales-check", {
          enabled: settingsDraft.enabled,
          autoAdjust: settingsDraft.autoAdjust,
          windowDays: parseInt(settingsDraft.windowDays || "30"),
        });
      }
      if (bandsDraft) {
        await apiRequest("PUT", "/api/settings/divergence-bands", bandsDraft);
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/sales-check"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/divergence-bands"] });
      setSettingsDraft(null);
      setBandsDraft(null);
      toast({ title: "Settings saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const checkMut = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/prices/check-sales", {});
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      const summary = result?.summary;
      toast({
        title: "Sales check complete",
        description: `${summary?.itemsUpdated} items updated, ${summary?.pricesAdjusted} prices adjusted`,
      });
    },
    onError: (e: any) => toast({ title: "Check failed", description: e.message, variant: "destructive" }),
  });

  const { data: breaker } = useQuery<any>({
    queryKey: ["/api/sales/status"],
    refetchInterval: 5000,
  });

  const currentSettings = settingsDraft ?? settings;
  const currentBands = bandsDraft ?? bands;
  const isDirty = settingsDraft !== null || bandsDraft !== null;

  if (settingsLoading || bandsLoading || !currentSettings || !currentBands) {
    return <div className="text-xs text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      {breaker?.breaker?.open && (
        <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Circuit breaker active</div>
            <div className="text-amber-400/80">Sales checks are paused until {new Date(breaker.breaker.opensUntil).toLocaleString()}.</div>
          </div>
        </div>
      )}

      {/* Feature toggles */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={currentSettings.enabled}
            onChange={(e) => setSettingsDraft({ ...currentSettings, enabled: e.target.checked })}
            className="w-4 h-4 rounded"
          />
          <label className="text-sm font-medium text-foreground flex-1">
            Enable sales cross-check
          </label>
        </div>
        <div className="flex items-center gap-3 ml-7">
          <input
            type="checkbox"
            checked={currentSettings.autoAdjust}
            onChange={(e) => setSettingsDraft({ ...currentSettings, autoAdjust: e.target.checked })}
            disabled={!currentSettings.enabled}
            className="w-4 h-4 rounded"
          />
          <label className="text-sm font-medium text-foreground flex-1">
            Auto-adjust prices
          </label>
        </div>
        <div className="flex items-center gap-3 ml-7">
          <label className="text-xs text-muted-foreground w-24">Window (days)</label>
          <Input
            type="number"
            min="1"
            value={currentSettings.windowDays}
            onChange={(e) => setSettingsDraft({ ...currentSettings, windowDays: e.target.value })}
            disabled={!currentSettings.enabled}
            className="w-20 h-8 text-sm"
          />
        </div>
      </div>

      {/* Threshold bands table */}
      <div className="mt-6">
        <div className="text-xs font-semibold text-muted-foreground mb-2">Divergence Thresholds</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">Price Range</th>
                <th className="text-center px-2 py-1.5 font-medium">Under %</th>
                <th className="text-center px-2 py-1.5 font-medium">Over %</th>
                <th className="text-center px-2 py-1.5 font-medium">Min $</th>
              </tr>
            </thead>
            <tbody>
              {currentBands.map((band: any, idx: number) => (
                <tr key={idx} className="border-b border-border/50">
                  <td className="px-2 py-2 font-mono text-muted-foreground">{band.label}</td>
                  <td className="text-center px-2 py-2">
                    <Input
                      type="number"
                      value={band.underPct ?? ""}
                      onChange={(e) => {
                        const updated = [...currentBands];
                        updated[idx] = { ...band, underPct: e.target.value ? parseFloat(e.target.value) : null };
                        setBandsDraft(updated);
                      }}
                      className="w-16 h-7 text-sm text-center"
                      disabled={band.underPct === null}
                    />
                  </td>
                  <td className="text-center px-2 py-2">
                    <Input
                      type="number"
                      value={band.overPct ?? ""}
                      onChange={(e) => {
                        const updated = [...currentBands];
                        updated[idx] = { ...band, overPct: e.target.value ? parseFloat(e.target.value) : null };
                        setBandsDraft(updated);
                      }}
                      className="w-16 h-7 text-sm text-center"
                      disabled={band.overPct === null}
                    />
                  </td>
                  <td className="text-center px-2 py-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={band.minDelta ?? ""}
                      onChange={(e) => {
                        const updated = [...currentBands];
                        updated[idx] = { ...band, minDelta: e.target.value ? parseFloat(e.target.value) : null };
                        setBandsDraft(updated);
                      }}
                      className="w-16 h-7 text-sm text-center"
                      disabled={band.minDelta === null}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save and Run Check buttons */}
      <div className="flex items-center gap-2 pt-3 border-t border-border">
        <Button
          onClick={() => saveMut.mutate()}
          disabled={!isDirty || saveMut.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-sm"
        >
          <Save size={13} className="mr-1.5" />
          {saveMut.isPending ? "Saving…" : "Save Settings"}
        </Button>
        <Button
          onClick={() => checkMut.mutate()}
          disabled={!currentSettings.enabled || checkMut.isPending}
          variant="outline"
          className="h-8 text-sm"
        >
          <Play size={13} className="mr-1.5" />
          {checkMut.isPending ? "Running…" : "Run check now"}
        </Button>
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
      toast({ title: "Thresholds saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const reset = () => {
    if (thresholds) setDraft({
      over100Pct: String(thresholds.over100Pct),
      mid50to100Pct: String(thresholds.mid50to100Pct),
      under50Pct: String(thresholds.under50Pct),
    });
  };

  const isDirty = thresholds && current && (
    current.over100Pct !== String(thresholds.over100Pct) ||
    current.mid50to100Pct !== String(thresholds.mid50to100Pct) ||
    current.under50Pct !== String(thresholds.under50Pct)
  );

  if (isLoading || !current) return <div className="text-xs text-muted-foreground">Loading…</div>;

  const rows = [
    { range: "Over $100",   field: "over100Pct"     as const, hint: "Cards priced above $100"     },
    { range: "$50 – $100",  field: "mid50to100Pct" as const, hint: "Cards priced $50 to $100"     },
    { range: "Under $50",   field: "under50Pct"     as const, hint: "Cards priced below $50"       },
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
                type="number" min="0.1" max="100" step="0.5"
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
          <span className="text-xs text-muted-foreground">
            {thresholds.over100Pct}% / {thresholds.mid50to100Pct}% / {thresholds.under50Pct}%
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-3">Changes apply on the next CSV upload.</p>
    </div>
  );
}

// ── Main Settings page ──────────────────────────────────────────────────────
export default function Settings() {
  const { isAdmin } = useAuth();
  const { data: presets } = useQuery<any>({ queryKey: ["/api/settings/presets"] });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="space-y-6 max-w-3xl">

        {/* ── SALES CROSS-CHECK — visible to everyone ── */}
        <div className="stat-card">
          <div className="text-sm font-semibold text-foreground mb-1">Sales Cross-Check</div>
          <p className="text-xs text-muted-foreground mb-4">
            Cross-check JustTCG prices against TCGplayer sales to flag significant divergences.
          </p>
          <SalesCrossCheckSettings />
        </div>

        {/* ── REPRICING THRESHOLDS — visible to everyone ── */}
        <div className="stat-card">
          <div className="text-sm font-semibold text-foreground mb-1">Repricing Thresholds</div>
          <p className="text-xs text-muted-foreground mb-4">
            Minimum % price movement required to flag inventory for a label reprint.
          </p>
          <ThresholdSettings />
        </div>

        {/* ── CONDITION COLORS — visible to everyone ── */}
        <div className="stat-card">
          <div className="text-sm font-semibold text-foreground mb-1">Condition Badge Colors</div>
          <p className="text-xs text-muted-foreground mb-4">
            Customize the color of each condition badge across the whole app. Saved to your account.
          </p>
          <ConditionColorEditor />
        </div>

        {/* ── ADMIN-ONLY SECTIONS ── */}
        {isAdmin && (
          <>
            {/* Label export format */}
            <div className="stat-card">
              <div className="text-sm font-semibold text-foreground mb-1">Label Export Format (Niimbot)</div>
              <p className="text-xs text-muted-foreground mb-4">Column order for exported Niimbot-ready CSV files.</p>
              <div className="space-y-0">
                {[
                  { col: "1", label: "Condition",               note: "Shorthand: NM / LP / MP / HP / DMG" },
                  { col: "2", label: "Current Market Price",     note: "Rounded up to nearest whole dollar" },
                  { col: "3", label: "Product Name",             note: "Card identity" },
                  { col: "4", label: "Number",                   note: "Secondary ID" },
                  { col: "5", label: "Internal Inventory ID",    note: "For traceability" },
                ].map(c => (
                  <div key={c.col} className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
                    <span className="text-xs font-mono text-muted-foreground w-5 shrink-0 pt-0.5">{c.col}</span>
                    <span className="text-sm font-medium text-foreground w-36 shrink-0">{c.label}</span>
                    <span className="text-xs text-muted-foreground">{c.note}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Condition shorthand */}
            <div className="stat-card">
              <div className="text-sm font-semibold text-foreground mb-1">Condition Shorthand</div>
              <p className="text-xs text-muted-foreground mb-4">Used in Niimbot CSV exports and inventory badges.</p>
              <div className="space-y-0">
                {[
                  { full: "Near Mint",        short: "NM",  cls: "badge-nm" },
                  { full: "Lightly Played",   short: "LP",  cls: "badge-lp" },
                  { full: "Moderately Played",short: "MP",  cls: "badge-mp" },
                  { full: "Heavily Played",   short: "HP",  cls: "badge-hp" },
                  { full: "Damaged",          short: "DMG", cls: "badge-d"  },
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
              <p className="text-xs text-muted-foreground mb-4">Fields recognized from TCGplayer export CSVs.</p>
              {presets?.tcgplayer ? (
                <div className="space-y-0">
                  <FieldRow label="Product Name"  fields={presets.tcgplayer.productName} />
                  <FieldRow label="Number"        fields={presets.tcgplayer.number} />
                  <FieldRow label="Condition"     fields={presets.tcgplayer.condition} />
                  <FieldRow label="Market Price"  fields={presets.tcgplayer.marketPrice} />
                  <FieldRow label="Add to Qty"    fields={presets.tcgplayer.quantity} />
                  <FieldRow label="Product ID"    fields={presets.tcgplayer.productId} />
                  <FieldRow label="TCGplayer ID"  fields={presets.tcgplayer.tcgplayerId} />
                  <FieldRow label="Set Name"      fields={presets.tcgplayer.setName} />
                  <FieldRow label="Printing"      fields={presets.tcgplayer.printing} />
                  <FieldRow label="Rarity"        fields={presets.tcgplayer.rarity} />
                  <FieldRow label="Product Line"  fields={presets.tcgplayer.productLine} />
                </div>
              ) : <div className="text-xs text-muted-foreground">Loading…</div>}
            </div>

            {/* Matching strategy */}
            <div className="stat-card">
              <div className="text-sm font-semibold text-foreground mb-1">Matching Strategy</div>
              <p className="text-xs text-muted-foreground mb-4">How the parser identifies existing inventory vs. new items during a merge.</p>
              <div className="space-y-3">
                {[
                  { priority: "1st",   label: "Exact external IDs",  desc: "Matches on Product ID or TCGplayer ID" },
                  { priority: "2nd",   label: "Composite key",        desc: "Game + Product Line + Set + Name + Number + Condition + Printing" },
                  { priority: "3rd",   label: "Normalized fallback",  desc: "Lowercased/trimmed Name + Number + Condition + Printing" },
                  { priority: "Guard", label: "Ambiguity guard",      desc: "Multiple matches → flagged for manual review" },
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
                {[
                  "Print price always rounds up to the nearest whole dollar (Math.ceil)",
                  "Raw market price is stored separately for analytics accuracy",
                  "Repricing thresholds compare raw-to-raw prices, not rounded prices",
                ].map(t => (
                  <div key={t} className="flex items-start gap-2">
                    <Check size={14} className="text-primary shrink-0 mt-0.5" />
                    <span className="text-foreground">{t}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="stat-card border-dashed">
              <div className="text-sm font-semibold text-foreground mb-1">Build Phase</div>
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Phase 1 (MVP)</strong>. Per-card sales/removals, scheduled refresh, and multi-user roles are deferred.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
