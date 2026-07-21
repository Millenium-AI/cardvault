import { useState } from "react";
import {
  ChevronDown, ChevronRight, Repeat, Receipt, Clock, CheckCircle, XCircle, Link2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { gameLabel } from "@shared/gameLabels";
import {
  fmtMoney, fmtDate, fmtPercent, channelLabel,
  txnTotalValue, txnItemCount, pendingIncomingCount,
} from "./constants";
import { useUpdateTransaction, useIncomingItemMutation } from "./hooks";

const statusColors: Record<string, string> = {
  pending: "text-primary bg-primary/10",
  approved: "text-emerald-400 bg-emerald-400/10",
  rejected: "text-muted-foreground bg-muted",
};

function IncomingReview({ tx }: { tx: any }) {
  const incomingMut = useIncomingItemMutation();
  const rows: any[] = tx.incomingItems ?? [];
  if (!rows.length) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">Trade-ins</span>
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-primary/10 text-primary">{rows.length}</span>
      </div>
      <div className="divide-y divide-border/50">
        {rows.map(row => (
          <div key={row.id} className="flex items-center gap-2 px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-foreground truncate">{row.productName}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <span>{gameLabel(row.game)}</span>
                {row.condition && <><span>·</span><span>{row.condition}</span></>}
                <span>·</span>
                <span className="tabular-nums">×{row.quantity}</span>
                <span>·</span>
                <span className="tabular-nums">{fmtMoney(row.cachedMarketPrice)} @ {fmtPercent(row.tradePercent)}</span>
                <span>·</span>
                <span className="tabular-nums font-medium text-foreground">{fmtMoney(row.tradeCreditValue)} credit</span>
              </div>
            </div>
            {row.status === "pending" ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => incomingMut.mutate({ transactionId: tx.id, itemId: row.id, action: "approve" })}
                  disabled={incomingMut.isPending}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                >
                  <CheckCircle size={12} /> Approve
                </button>
                <button
                  onClick={() => incomingMut.mutate({ transactionId: tx.id, itemId: row.id, action: "reject" })}
                  disabled={incomingMut.isPending}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                >
                  <XCircle size={12} /> Reject
                </button>
              </div>
            ) : (
              <span className={cn("shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", statusColors[row.status])}>
                {row.status === "approved" ? <CheckCircle size={11} /> : <XCircle size={11} />}
                {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OutgoingList({ tx, invMap }: { tx: any; invMap: Map<string, any> }) {
  const rows: any[] = tx.items ?? [];
  if (!rows.length) return null;
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">Cards out</span>
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-muted/60 text-muted-foreground">{rows.length}</span>
      </div>
      <div className="divide-y divide-border/50">
        {rows.map(row => {
          const item = invMap.get(row.inventoryItemId);
          return (
            <div key={row.id} className="flex items-center gap-2 px-3 py-2">
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">×{row.quantity}</span>
              <span className="flex-1 text-xs text-foreground truncate">
                {item?.productName ?? "Item removed"}
                {item?.condition && <span className="text-muted-foreground"> · {item.condition}</span>}
              </span>
              <span className="text-xs font-mono text-foreground tabular-nums shrink-0">{fmtMoney(row.allocatedPrice)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TransactionRow({ tx, shows, invMap }: { tx: any; shows: any[]; invMap: Map<string, any> }) {
  const [expanded, setExpanded] = useState(false);
  const updateMut = useUpdateTransaction();

  const isTrade = tx.type === "trade";
  const pending = pendingIncomingCount(tx);
  const attachedShow = shows.find(s => s.id === tx.showId);

  return (
    <div data-testid={`transaction-row-${tx.id}`} className="rounded-md border border-border overflow-hidden">
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button onClick={() => setExpanded(e => !e)} className="mt-0.5 text-muted-foreground shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <button onClick={() => setExpanded(e => !e)} className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
              isTrade ? "bg-sky-500/10 text-sky-400" : "bg-emerald-500/10 text-emerald-400",
            )}>
              {isTrade ? <Repeat size={11} /> : <Receipt size={11} />}
              {isTrade ? "Trade" : "Sale"}
            </span>
            <span className="text-sm font-semibold text-foreground tabular-nums">{fmtMoney(txnTotalValue(tx))}</span>
            {pending > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground">
                {pending} pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-0.5"><Clock size={9} />{fmtDate(tx.occurredAt)}</span>
            <span>·</span>
            <span>{txnItemCount(tx)} items</span>
            <span>·</span>
            <span>{channelLabel(tx.channel)}</span>
            <span>·</span>
            <span className={attachedShow ? "text-foreground" : ""}>
              {attachedShow ? attachedShow.showName : "Unattached"}
            </span>
          </div>
        </button>

        {/* Quick attach-to-show */}
        <div className="shrink-0" onClick={e => e.stopPropagation()}>
          <Select
            value={tx.showId ?? "none"}
            onValueChange={v => updateMut.mutate({ id: tx.id, patch: { showId: v === "none" ? null : v } })}
          >
            <SelectTrigger className="h-7 text-[11px] w-[130px] border-border gap-1">
              <Link2 size={11} className="text-muted-foreground shrink-0" />
              <SelectValue placeholder="Attach" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unattached</SelectItem>
              {shows.map(s => <SelectItem key={s.id} value={s.id}>{s.showName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/60 bg-muted/20 px-3 py-3 space-y-2">
          <OutgoingList tx={tx} invMap={invMap} />
          {isTrade && <IncomingReview tx={tx} />}
          {tx.notes && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">Notes: </span>{tx.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TransactionList({
  transactions, shows, inventory, isLoading,
}: { transactions: any[]; shows: any[]; inventory: any[]; isLoading: boolean }) {
  const invMap = new Map(inventory.map(i => [i.id, i]));
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
      </div>
    );
  }
  if (!transactions.length) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        No transactions yet — log your first sale or trade
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {transactions.map(tx => <TransactionRow key={tx.id} tx={tx} shows={shows} invMap={invMap} />)}
    </div>
  );
}
