import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Copy, Plus, Check, ShieldOff } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

const ADMIN_EMAIL = "bonsaicollects@gmail.com";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-primary transition-colors p-1">
      {copied ? <Check size={13} className="text-primary" /> : <Copy size={13} />}
    </button>
  );
}

export default function Admin() {
  const { toast } = useToast();
  const { user } = useAuth();

  if (user?.email !== ADMIN_EMAIL) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <ShieldOff size={36} className="text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Admin access only</p>
        <p className="text-xs text-muted-foreground">This page is restricted to the app administrator.</p>
      </div>
    );
  }

  const [count, setCount] = useState("5");
  const [note, setNote] = useState("");
  const [newCodes, setNewCodes] = useState<string[]>([]);

  const { data: codes = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/invite-codes"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/invite-codes");
      return res.json();
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/invite-codes", {
        count: parseInt(count, 10),
        note,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setNewCodes(data.codes.map((c: any) => c.code));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invite-codes"] });
      toast({ title: `${data.codes.length} codes generated` });
    },
    onError: () => toast({ title: "Failed to generate codes", variant: "destructive" }),
  });

  const unused = codes.filter((c: any) => !c.used);
  const used = codes.filter((c: any) => c.used);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Admin — Invite Codes</h1>

      {/* Generate panel */}
      <div className="stat-card p-4 space-y-3">
        <div className="text-sm font-medium text-foreground">Generate New Codes</div>
        <div className="flex gap-2 flex-wrap">
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">How many</div>
            <Input
              type="number" min="1" max="50" value={count}
              onChange={e => setCount(e.target.value)}
              className="h-8 w-20 text-sm font-mono"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[140px]">
            <div className="text-[11px] text-muted-foreground">Note (optional)</div>
            <Input
              placeholder="e.g. Card show batch"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="gap-1.5 h-8 text-xs"
        >
          <Plus size={13} />
          {generate.isPending ? "Generating…" : "Generate Codes"}
        </Button>

        {/* Newly generated codes */}
        {newCodes.length > 0 && (
          <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
            <div className="text-xs font-semibold text-primary">New codes — share these:</div>
            <div className="space-y-1">
              {newCodes.map(code => (
                <div key={code} className="flex items-center gap-2">
                  <span className="font-mono text-sm text-foreground tracking-widest">{code}</span>
                  <CopyButton text={code} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Unused codes */}
      <div className="stat-card p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Available Codes</span>
          <span className="text-xs font-mono text-primary">{unused.length} remaining</span>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
          </div>
        ) : unused.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">No unused codes — generate some above</div>
        ) : (
          <div className="divide-y divide-border/50">
            {unused.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2">
                <span className="font-mono text-sm text-foreground tracking-widest">{c.code}</span>
                <div className="flex items-center gap-2">
                  {c.note && <span className="text-xs text-muted-foreground">{c.note}</span>}
                  <CopyButton text={c.code} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Used codes */}
      {used.length > 0 && (
        <div className="stat-card p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/40">
            <span className="text-xs font-medium text-muted-foreground">Used Codes ({used.length})</span>
          </div>
          <div className="divide-y divide-border/50">
            {used.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2 opacity-50">
                <span className="font-mono text-sm text-foreground tracking-widest line-through">{c.code}</span>
                {c.note && <span className="text-xs text-muted-foreground">{c.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
