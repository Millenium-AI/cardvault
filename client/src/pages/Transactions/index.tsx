import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CHANNELS } from "./constants";
import { useTransactions, type TransactionFilters } from "./hooks";
import { TransactionList } from "./TransactionList";
import { LogTransaction } from "./LogTransactionForm";

export default function Transactions() {
  const [logOpen, setLogOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [attachFilter, setAttachFilter] = useState("all");

  const filters: TransactionFilters = {};
  if (typeFilter !== "all") filters.type = typeFilter;
  if (channelFilter !== "all") filters.channel = channelFilter;
  if (attachFilter === "attached") filters.attached = "true";
  if (attachFilter === "unattached") filters.attached = "false";

  const { data: transactions = [], isLoading } = useTransactions(filters);

  const { data: shows = [] } = useQuery<any[]>({ queryKey: ["/api/shows"] });

  const { data: inventory = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory", "all", "all", ""],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/inventory");
      return res.json();
    },
    staleTime: 0,
  });

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Transactions</h1>
        <Button
          data-testid="button-log-transaction"
          onClick={() => setLogOpen(true)}
          className="hidden sm:flex bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={15} className="mr-2" /> Log Transaction
        </Button>
      </div>

      {/* Mobile FAB */}
      <button
        data-testid="button-log-transaction-fab"
        onClick={() => setLogOpen(true)}
        className="sm:hidden fixed z-30 w-14 h-14 rounded-full shadow-lg flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 transition-colors right-4"
        aria-label="Log Transaction"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 72px)" }}
      >
        <Plus size={24} />
      </button>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[120px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="sale">Sales</SelectItem>
            <SelectItem value="trade">Trades</SelectItem>
          </SelectContent>
        </Select>

        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            {CHANNELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={attachFilter} onValueChange={setAttachFilter}>
          <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Shows</SelectItem>
            <SelectItem value="attached">Attached</SelectItem>
            <SelectItem value="unattached">Unattached</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <TransactionList
        transactions={transactions}
        shows={shows}
        inventory={inventory}
        isLoading={isLoading}
      />

      <LogTransaction
        open={logOpen}
        onClose={() => setLogOpen(false)}
        inventory={inventory}
        shows={shows}
      />
    </div>
  );
}
