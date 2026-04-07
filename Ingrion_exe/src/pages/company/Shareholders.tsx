/**
 * COM-05: Shareholder Register — Holdings breakdown, Gini, top holders
 */
import React, { useEffect, useState } from "react";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Select,
  Badge, Skeleton, EmptyState, Table, Th, Td, Tr, MetricCard
} from "@/components/ui";
import { useAppStore } from "@/store";
import { getAllIPOs, getStockHolders } from "@/lib/api";
import { paiseToCurrency } from "@/lib/utils";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface HolderRow {
  address: string;
  shares: number;
  pct: number;
  category: string;
}

interface HolderData {
  stock: string;
  totalShares: number;
  holderCount: number;
  giniCoefficient: number;
  topHolders: HolderRow[];
}

const COLORS = ["#C9A84C", "#0D9488", "#4338CA", "#B45309", "#9B1C1C", "#2D7D46", "#6B7280"];

const Shareholders: React.FC = () => {
  const { address } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [stocks, setStocks] = useState<string[]>([]);
  const [selectedStock, setSelectedStock] = useState("");
  const [holderData, setHolderData] = useState<HolderData | null>(null);
  const [iposLoading, setIposLoading] = useState(true);

  useEffect(() => { loadStocks(); }, []);
  useEffect(() => { if (selectedStock) loadHolders(selectedStock); }, [selectedStock]);

  const loadStocks = async () => {
    setIposLoading(true);
    try {
      const res = await getAllIPOs() as any;
      const myStocks = (res.ipos || [])
        .filter((ipo: any) => ipo.company_address === address && ipo.status === "completed")
        .map((ipo: any) => ipo.stock);
      setStocks(myStocks);
      if (myStocks.length > 0) setSelectedStock(myStocks[0]);
    } catch { } finally { setIposLoading(false); }
  };

  const loadHolders = async (stock: string) => {
    setLoading(true);
    try {
      const res = await getStockHolders(stock) as any;
      const topHolders: HolderRow[] = (res.holders || []).map((h: any) => ({
        address: h.address,
        shares: h.shares,
        pct: h.pct || 0,
        category: h.category || "retail",
      }));
      setHolderData({
        stock,
        totalShares: res.total_shares || 0,
        holderCount: res.holder_count || topHolders.length,
        giniCoefficient: res.gini || 0,
        topHolders,
      });
    } catch { setHolderData(null); } finally { setLoading(false); }
  };

  const exportCSV = () => {
    if (!holderData) return;
    const rows = [["Address", "Shares", "Percent", "Category"],
      ...holderData.topHolders.map(h => [h.address, h.shares.toString(), `${h.pct.toFixed(4)}%`, h.category])];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `shareholders_${holderData.stock}.csv`; a.click();
  };

  const pieData = holderData?.topHolders.slice(0, 6).map(h => ({
    name: `${h.address.slice(0, 8)}…`,
    value: h.shares,
  })) || [];
  if (holderData && holderData.topHolders.length > 6) {
    const othersShares = holderData.topHolders.slice(6).reduce((s, h) => s + h.shares, 0);
    pieData.push({ name: "Others", value: othersShares });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1A3A5C]">Shareholder Register</h1>
        {holderData && (
          <Button variant="secondary" onClick={exportCSV}>Export CSV</Button>
        )}
      </div>

      {iposLoading ? <Skeleton className="h-10 w-64" /> : stocks.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={<span className="text-4xl">🏢</span>} title="No listed securities" description="You have no completed IPOs. Complete the IPO process to see your shareholder register." />
          </CardContent>
        </Card>
      ) : (
        <>
          <Select label="Select Stock" value={selectedStock} onChange={e => setSelectedStock(e.target.value)}
            options={stocks.map(s => ({ value: s, label: s }))} className="max-w-xs" />

          {/* Metrics */}
          {holderData && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="Total Shares" value={holderData.totalShares.toLocaleString()} />
              <MetricCard label="Unique Holders" value={holderData.holderCount.toLocaleString()} />
              <MetricCard label="Top Holder %" value={holderData.topHolders[0] ? `${holderData.topHolders[0].pct.toFixed(2)}%` : "—"} />
              <MetricCard label="Gini Coefficient" value={holderData.giniCoefficient.toFixed(3)}
                sub={holderData.giniCoefficient > 0.6 ? "High concentration" : holderData.giniCoefficient > 0.3 ? "Moderate" : "Well distributed"}
                valueColor={holderData.giniCoefficient > 0.6 ? "text-red-600" : holderData.giniCoefficient > 0.3 ? "text-amber-600" : "text-green-600"} />
            </div>
          )}

          <div className="grid grid-cols-3 gap-6">
            {/* Pie chart */}
            <Card>
              <CardHeader><CardTitle>Ownership Distribution</CardTitle></CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-48 w-full" /> :
                pieData.length === 0 ? <EmptyState title="No data" icon={<span className="text-3xl">📊</span>} /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => v.toLocaleString() + " shares"} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Holder table */}
            <div className="col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Top Holders — {selectedStock}</CardTitle>
                </CardHeader>
                {loading ? <CardContent><Skeleton className="h-48 w-full" /></CardContent> :
                !holderData || holderData.topHolders.length === 0 ? (
                  <CardContent><EmptyState title="No holder data" description="Holder data syncs after IPO allocation." icon={<span className="text-3xl">👥</span>} /></CardContent>
                ) : (
                  <Table>
                    <thead><tr><Th>#</Th><Th>Address</Th><Th>Category</Th><Th>Shares</Th><Th>% Ownership</Th></tr></thead>
                    <tbody>
                      {holderData.topHolders.map((h, i) => (
                        <Tr key={i}>
                          <Td className="font-mono text-xs text-gray-400">{i + 1}</Td>
                          <Td><span className="font-mono text-xs">{h.address.slice(0, 16)}…</span></Td>
                          <Td>
                            <Badge variant={h.category === "QIB" ? "blue" : h.category === "NIB" ? "amber" : "green"}>
                              {h.category}
                            </Badge>
                          </Td>
                          <Td className="font-mono">{h.shares.toLocaleString()}</Td>
                          <Td>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div className="bg-[#C9A84C] h-1.5 rounded-full" style={{ width: `${Math.min(h.pct, 100)}%` }} />
                              </div>
                              <span className="text-xs font-mono w-12 text-right">{h.pct.toFixed(2)}%</span>
                            </div>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Shareholders;
