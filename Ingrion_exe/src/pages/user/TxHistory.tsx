/**
 * USER-07: Transaction History (shared across all roles)
 */
import React, { useState, useEffect } from "react";
import { Card, CardContent, Button, Badge, Table, Th, Td, Tr, Address, Select, Spinner } from "@/components/ui";
import { useAppStore } from "@/store";
import { getOwnTransactions } from "@/lib/db";
import { paiseToCurrency, formatDateTime, txTypeLabel } from "@/lib/utils";
import type { LocalTx } from "@/types";

const TX_TYPES = [
  { value: "", label: "All Types" },
  { value: "tnx_sendINR", label: "Send INR" },
  { value: "tnx_bid_stock", label: "IPO Bid" },
  { value: "tnx_buy_stock", label: "Buy Stock" },
  { value: "tnx_sell_stock", label: "Sell Stock" },
  { value: "tnx_transfer_stock", label: "Transfer Stock" },
  { value: "tnx_dividend", label: "Dividend" },
  { value: "tnx_allocate_ipo", label: "IPO Allocation" },
];

const TxHistory: React.FC = () => {
  const { keystore } = useAppStore();
  const [txs, setTxs] = useState<LocalTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LocalTx | null>(null);
  const [filters, setFilters] = useState({
    type: "",
    direction: "all" as "all" | "sent" | "received",
    search: "",
    stock: "",
  });

  const load = async () => {
    if (!keystore?.address) return;
    setLoading(true);
    try {
      const results = await getOwnTransactions(keystore.address, {
        type: filters.type || undefined,
        direction: filters.direction === "all" ? undefined : filters.direction,
        search: filters.search || undefined,
        stock: filters.stock || undefined,
        limit: 100,
      });
      setTxs(results);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters, keystore?.address]);

  const exportCSV = () => {
    const headers = ["Date", "Block", "Type", "Direction", "From", "To", "Amount", "Stock", "Hash"];
    const rows = txs.map((t) => [
      formatDateTime(t.timestamp),
      t.blockHeight,
      t.type,
      t.fromAddr === keystore?.address ? "Sent" : "Received",
      t.fromAddr,
      t.toAddr || "",
      t.amountPaise ? (t.amountPaise / 100).toFixed(2) : "",
      t.stock || "",
      t.txHash,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "tx_history.csv";
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-40">
              <label className="text-xs font-medium text-gray-700 block mb-1">Search</label>
              <input
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]"
                placeholder="Address, tx hash..."
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              />
            </div>
            <div className="w-40">
              <Select
                label="Type"
                value={filters.type}
                options={TX_TYPES}
                onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
              />
            </div>
            <div className="w-36">
              <Select
                label="Direction"
                value={filters.direction}
                options={[
                  { value: "all", label: "All" },
                  { value: "sent", label: "Sent" },
                  { value: "received", label: "Received" },
                ]}
                onChange={(e) => setFilters((f) => ({ ...f, direction: e.target.value as "all" | "sent" | "received" }))}
              />
            </div>
            <Button variant="secondary" size="sm" onClick={exportCSV}>Export CSV</Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : txs.length === 0 ? (
          <CardContent className="py-12 text-center text-gray-400">
            No transactions found
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Date/Time</Th>
                  <Th>Block</Th>
                  <Th>Type</Th>
                  <Th>Direction</Th>
                  <Th>Counterparty</Th>
                  <Th>Amount / Stock</Th>
                  <Th>Tx Hash</Th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx) => {
                  const isSent = tx.fromAddr === keystore?.address;
                  const counterparty = isSent ? tx.toAddr : tx.fromAddr;
                  return (
                    <Tr key={tx.txHash} onClick={() => setSelected(selected?.txHash === tx.txHash ? null : tx)} className="cursor-pointer">
                      <Td className="text-xs">{formatDateTime(tx.timestamp)}</Td>
                      <Td className="font-mono text-xs">#{tx.blockHeight}</Td>
                      <Td>
                        <Badge variant="blue">{txTypeLabel(tx.type)}</Badge>
                      </Td>
                      <Td>
                        <span className={`text-xs font-medium ${isSent ? "text-red-600" : "text-green-600"}`}>
                          {isSent ? "↑ Sent" : "↓ Received"}
                        </span>
                      </Td>
                      <Td>
                        {counterparty ? <Address value={counterparty} /> : <span className="text-gray-300">—</span>}
                      </Td>
                      <Td>
                        {tx.amountPaise ? (
                          <span className={`font-semibold ${isSent ? "text-red-600" : "text-green-600"}`}>
                            {isSent ? "-" : "+"}{paiseToCurrency(tx.amountPaise)}
                          </span>
                        ) : tx.stock ? (
                          <span className="font-mono font-bold">{tx.stock}</span>
                        ) : "—"}
                      </Td>
                      <Td>
                        <span
                          className="font-mono text-xs text-[#C9A84C] cursor-pointer hover:underline"
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(tx.txHash); }}
                          title="Click to copy"
                        >
                          {tx.txHash.slice(0, 16)}…
                        </span>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl border-l border-gray-200 z-40 overflow-y-auto animate-slide-in">
          <div className="px-5 py-4 border-b flex justify-between items-center sticky top-0 bg-white">
            <h3 className="font-bold text-[#1A3A5C]">Transaction Detail</h3>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">TX Hash</p>
              <code
                className="text-xs font-mono text-[#C9A84C] break-all cursor-pointer hover:opacity-80"
                onClick={() => navigator.clipboard.writeText(selected.txHash)}
              >
                {selected.txHash}
              </code>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-gray-500">Block</p><p className="font-mono">#{selected.blockHeight}</p></div>
              <div><p className="text-xs text-gray-500">Date</p><p>{formatDateTime(selected.timestamp)}</p></div>
              <div><p className="text-xs text-gray-500">Type</p><Badge variant="blue">{txTypeLabel(selected.type)}</Badge></div>
              {selected.amountPaise && <div><p className="text-xs text-gray-500">Amount</p><p className="font-bold">{paiseToCurrency(selected.amountPaise)}</p></div>}
              {selected.stock && <div><p className="text-xs text-gray-500">Stock</p><p className="font-mono font-bold">{selected.stock}</p></div>}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Full JSON</p>
              <pre className="bg-gray-50 rounded p-3 text-xs font-mono overflow-x-auto text-gray-700">
                {JSON.stringify(JSON.parse(selected.extraJson || "{}"), null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TxHistory;
