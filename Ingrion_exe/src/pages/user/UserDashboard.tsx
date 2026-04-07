/**
 * USER-01: User / Investor Home Dashboard
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent, MetricCard, Badge, Button, Skeleton, Table, Th, Td, Tr, Address } from "@/components/ui";
import { useAppStore } from "@/store";
import { getBalance, getRHPAll } from "@/lib/api";
import { getOwnTransactions } from "@/lib/db";
import { paiseToCurrency, formatRelativeTime, txTypeLabel, ipoStatusLabel } from "@/lib/utils";
import type { LocalTx } from "@/types";

const UserDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { keystore, balancePaise, blockedPaise, nodeOnline } = useAppStore();
  const [recentTx, setRecentTx] = useState<LocalTx[]>([]);
  const [stockStatuses, setStockStatuses] = useState<Record<string, { status: string; priceBandLower: number; priceBandUpper: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!keystore?.address) return;
      setLoading(true);
      try {
        const txs = await getOwnTransactions(keystore.address, { limit: 10 });
        setRecentTx(txs);

        // Dynamically discover all stocks from the chain
        const rhpRes = await getRHPAll();
        const statuses: typeof stockStatuses = {};
        (rhpRes.rhps || []).forEach((rhp) => {
          statuses[rhp.stock] = {
            status: rhp.status,
            priceBandLower: rhp.priceBandLower,
            priceBandUpper: rhp.priceBandUpper,
          };
        });
        setStockStatuses(statuses);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [keystore?.address]);

  const available = balancePaise - blockedPaise;
  const role = keystore?.role;
  const category = keystore?.category;

  return (
    <div className="space-y-6">
      {/* Zone A: Account Summary */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <Address value={keystore?.address || ""} />
                <Badge variant="teal">USER</Badge>
                {category && <Badge variant="indigo">{category.toUpperCase()}</Badge>}
              </div>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500">INR Balance</p>
                  <p className="text-2xl font-bold text-[#1A3A5C]">{paiseToCurrency(balancePaise)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Locked</p>
                  <p className="text-xl font-bold text-amber-600">{paiseToCurrency(blockedPaise)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Available</p>
                  <p className="text-xl font-bold text-green-600">{paiseToCurrency(available)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Node Status</p>
                  <Badge variant={nodeOnline ? "green" : "red"}>{nodeOnline ? "Online" : "Offline"}</Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Zone B */}
      <div className="grid grid-cols-3 gap-5">
        {/* Activity Feed */}
        <div className="col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Activity</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/tx-history")}>View All →</Button>
            </CardHeader>
            <div className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="px-5 py-3 flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3 w-48" />
                      <Skeleton className="h-2 w-24" />
                    </div>
                  </div>
                ))
              ) : recentTx.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-400 text-sm">
                  No transactions yet — make your first transfer
                </div>
              ) : (
                recentTx.map((tx) => {
                  const isSent = tx.fromAddr === keystore?.address;
                  return (
                    <div key={tx.txHash} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${isSent ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                        {isSent ? "↑" : "↓"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-700">{txTypeLabel(tx.type)}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {isSent ? `To: ${tx.toAddr?.slice(0, 12)}…` : `From: ${tx.fromAddr?.slice(0, 12)}…`}
                        </p>
                      </div>
                      <div className="text-right">
                        {tx.amountPaise ? (
                          <p className={`text-sm font-semibold ${isSent ? "text-red-600" : "text-green-600"}`}>
                            {isSent ? "-" : "+"}{paiseToCurrency(tx.amountPaise)}
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-400">{formatRelativeTime(tx.timestamp)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div>
          <Card>
            <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Button variant="primary" className="w-full" onClick={() => navigate("/send-inr")}>
                ↑ Send INR
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => navigate("/ipo-bidding")}>
                📊 Bid in IPO
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => navigate("/secondary-market")}>
                ⇄ Buy / Sell Stocks
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Zone C: Market Pulse */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle>Market Pulse</CardTitle></CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 space-y-2">
                {[1, 2].map((i) => <Skeleton key={i} className="h-10 rounded" />)}
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Stock</Th>
                    <Th>Status</Th>
                    <Th>Price Band</Th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stockStatuses).map(([sym, s]) => {
                    const { label, color } = ipoStatusLabel(s.status);
                    return (
                      <Tr key={sym} onClick={() => navigate("/drhp-browser")} className="cursor-pointer">
                        <Td className="font-mono font-bold">{sym}</Td>
                        <Td><Badge variant={color as "green" | "amber" | "blue" | "red" | "gray"}>{label}</Badge></Td>
                        <Td className="text-xs">₹{(s.priceBandLower / 100).toFixed(2)} – ₹{(s.priceBandUpper / 100).toFixed(2)}</Td>
                      </Tr>
                    );
                  })}
                  {Object.keys(stockStatuses).length === 0 && (
                    <Tr><Td colSpan={3} className="text-center text-gray-400">No active stocks</Td></Tr>
                  )}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>DRHP / RHP Alerts</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stockStatuses).map(([sym, s]) => (
                <div
                  key={sym}
                  className="flex items-center justify-between p-3 bg-[#EAF0F8] rounded-lg cursor-pointer hover:bg-[#d5e5f5]"
                  onClick={() => navigate("/drhp-browser")}
                >
                  <div>
                    <p className="font-bold text-sm text-[#1A3A5C]">{sym}</p>
                    <p className="text-xs text-gray-500 capitalize">{s.status}</p>
                  </div>
                  <span className="text-[#C9A84C]">→</span>
                </div>
              ))}
              {Object.keys(stockStatuses).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No DRHP/RHP updates</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UserDashboard;