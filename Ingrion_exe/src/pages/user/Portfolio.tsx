/**
 * USER-05: Portfolio — Holdings, IPO allocations, INR summary
 */
import React, { useEffect, useState } from "react";
import {
  Card, CardHeader, CardTitle, CardContent,
  Badge, Skeleton, EmptyState, Table, Th, Td, Tr, MetricCard
} from "@/components/ui";
import { useAppStore } from "@/store";
import { getPortfolio, getStockPrice, getRHPStatus } from "@/lib/api";
import { paiseToCurrency } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from "recharts";

interface HoldingRow {
  stock: string;
  shares: number;
  avgCostPaise: number;
  currentPricePaise: number;
  pnlPaise: number;
  pnlPct: number;
}

interface AllocRow {
  stock: string;
  shares: number;
  pricePaise: number;
  status: string;
  block: number;
}

interface PortfolioData {
  holdings: HoldingRow[];
  ipoAllocations: AllocRow[];
  totalInvestedPaise: number;
  totalValuePaise: number;
  realizedPnlPaise: number;
}

const COLORS = ["#C9A84C", "#2D7D46", "#4338CA", "#B45309", "#9B1C1C", "#0D9488"];

const Portfolio: React.FC = () => {
  const { address, balancePaise: storePaise, blockedPaise: storeBlocked } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  // Use store values (kept live by AppShell) as the source of truth for balance display
  const balancePaise = storePaise;
  const blockedPaise = storeBlocked;
  const [tab, setTab] = useState<"holdings" | "ipo" | "summary">("holdings");

  useEffect(() => { if (address) load(); }, [address]);

  const load = async () => {
    setLoading(true);
    try {
      const [portfolioRes] = await Promise.allSettled([
        getPortfolio(address!),
      ]);

      if (portfolioRes.status === "fulfilled") {
        const data = portfolioRes.value;
        // Node returns: { stocks: { "INGRION01": 500, "INGRION02": 100 } }
        const stocksMap: Record<string, number> = data.stocks || {};
        const stockSymbols = Object.keys(stocksMap);

        // 1. Fetch per-stock market prices (may be 0 if no secondary trades yet)
        const priceResults = await Promise.allSettled(
          stockSymbols.map((sym) => getStockPrice(sym))
        );
        const marketPrices: Record<string, number> = {};
        stockSymbols.forEach((sym, i) => {
          const r = priceResults[i];
          marketPrices[sym] = r.status === "fulfilled" ? (r.value.pricePaise ?? 0) : 0;
        });

        // 2. For stocks with no market price, fall back to RHP price band midpoint
        const rhpFallbackResults = await Promise.allSettled(
          stockSymbols
            .filter((sym) => marketPrices[sym] === 0)
            .map((sym) => getRHPStatus(sym))
        );
        stockSymbols
          .filter((sym) => marketPrices[sym] === 0)
          .forEach((sym, i) => {
            const r = rhpFallbackResults[i];
            if (r.status === "fulfilled") {
              const rhp = r.value;
              // Use midpoint of price band as best estimate of IPO cutoff price
              marketPrices[sym] = Math.round(
                (rhp.priceBandLower + rhp.priceBandUpper) / 2
              );
            }
          });

        // 3. Derive avg cost per stock from local allocation records in SQLite
        //    These were synced by persistBlock as synthetic "tnx_allocate_ipo" entries
        const avgCosts: Record<string, number> = {};
        await Promise.allSettled(
          stockSymbols.map(async (sym) => {
            try {
              const { getOwnTransactions } = await import("@/lib/db");
              const allocTxs = await getOwnTransactions(address!, {
                type: "tnx_allocate_ipo",
                stock: sym,
              });
              if (allocTxs.length > 0) {
                let totalPaid = 0;
                let totalShares = 0;
                for (const atx of allocTxs) {
                  try {
                    const extra = JSON.parse(atx.extraJson);
                    const allocShares = extra.allocShares ?? 0;
                    const cutoffPricePaise = extra.cutoffPricePaise ?? 0;
                    if (allocShares > 0 && cutoffPricePaise > 0) {
                      totalPaid += allocShares * cutoffPricePaise;
                      totalShares += allocShares;
                    }
                  } catch { /* skip malformed */ }
                }
                if (totalShares > 0) {
                  avgCosts[sym] = Math.round(totalPaid / totalShares);
                }
              }
            } catch { /* silently skip */ }
          })
        );

        // 4. Build IPO allocation rows for the "IPO Allocations" tab
        const ipoAllocations: AllocRow[] = [];
        await Promise.allSettled(
          stockSymbols.map(async (sym) => {
            try {
              const { getOwnTransactions } = await import("@/lib/db");
              const allocTxs = await getOwnTransactions(address!, {
                type: "tnx_allocate_ipo",
                stock: sym,
              });
              for (const atx of allocTxs) {
                try {
                  const extra = JSON.parse(atx.extraJson);
                  ipoAllocations.push({
                    stock: sym,
                    shares: extra.allocShares ?? 0,
                    pricePaise: extra.cutoffPricePaise ?? 0,
                    status: "allocated",
                    block: atx.blockHeight,
                  });
                } catch { /* skip */ }
              }
            } catch { /* skip */ }
          })
        );

        const holdings: HoldingRow[] = stockSymbols
          .filter((sym) => stocksMap[sym] > 0)
          .map((sym) => {
            const shares = stocksMap[sym];
            const currentPricePaise = marketPrices[sym] ?? 0;
            const avgCostPaise = avgCosts[sym] ?? currentPricePaise;
            const pnlPaise = (currentPricePaise - avgCostPaise) * shares;
            const pnlPct = avgCostPaise > 0 ? (pnlPaise / (avgCostPaise * shares)) * 100 : 0;
            return { stock: sym, shares, avgCostPaise, currentPricePaise, pnlPaise, pnlPct };
          });

        const totalValue = holdings.reduce((s, h) => s + h.shares * h.currentPricePaise, 0);
        const totalInvested = holdings.reduce((s, h) => s + h.shares * h.avgCostPaise, 0);

        setPortfolio({
          holdings,
          ipoAllocations,
          totalInvestedPaise: totalInvested,
          totalValuePaise: totalValue,
          realizedPnlPaise: 0,
        });
      }
    } finally { setLoading(false); }
  };

  const unrealizedPnl = portfolio ? portfolio.totalValuePaise - portfolio.totalInvestedPaise : 0;
  const totalPnl = unrealizedPnl + (portfolio?.realizedPnlPaise || 0);
  const chartData = portfolio?.holdings.map(h => ({ name: h.stock, value: h.shares * h.currentPricePaise })) || [];

  const tabs = [
    { key: "holdings" as const, label: "Stock Holdings" },
    { key: "ipo" as const, label: "IPO Allocations" },
    { key: "summary" as const, label: "P&L Summary" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1A3A5C]">My Portfolio</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="INR Balance" value={loading ? "—" : paiseToCurrency(balancePaise)} sub={`Locked: ${paiseToCurrency(blockedPaise)}`} />
        <MetricCard label="Stock Portfolio Value" value={loading ? "—" : paiseToCurrency(portfolio?.totalValuePaise || 0)} sub={`Invested: ${paiseToCurrency(portfolio?.totalInvestedPaise || 0)}`} />
        <MetricCard label="Unrealized P&L" value={loading ? "—" : paiseToCurrency(unrealizedPnl)} valueColor={unrealizedPnl >= 0 ? "text-green-600" : "text-red-600"} sub={portfolio && portfolio.totalInvestedPaise > 0 ? `${((unrealizedPnl / portfolio.totalInvestedPaise) * 100).toFixed(2)}%` : "—"} />
        <MetricCard label="Realized P&L" value={loading ? "—" : paiseToCurrency(portfolio?.realizedPnlPaise || 0)} valueColor={(portfolio?.realizedPnlPaise || 0) >= 0 ? "text-green-600" : "text-red-600"} sub="All-time closed positions" />
      </div>

      {!loading && chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Portfolio Composition</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} layout="vertical">
                <XAxis type="number" tickFormatter={v => `₹${(v / 100).toLocaleString()}`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                <Tooltip formatter={(v: number) => paiseToCurrency(v)} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="border-b border-gray-200 flex gap-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? "border-[#C9A84C] text-[#1A3A5C]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "holdings" && (
        <Card>
          {loading ? <CardContent className="space-y-3 py-4">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</CardContent>
          : !portfolio || portfolio.holdings.length === 0 ? (
            <CardContent><EmptyState icon={<span className="text-4xl">📊</span>} title="No stock holdings" description="Purchase stocks via IPO bidding or the secondary market to see them here." /></CardContent>
          ) : (
            <Table>
              <thead><tr><Th>Stock</Th><Th>Shares</Th><Th>Avg Cost</Th><Th>Current Price</Th><Th>Market Value</Th><Th>P&L</Th><Th>% Return</Th></tr></thead>
              <tbody>
                {portfolio.holdings.map((h, i) => (
                  <Tr key={i}>
                    <Td><Badge variant="blue">{h.stock}</Badge></Td>
                    <Td className="font-mono">{h.shares.toLocaleString()}</Td>
                    <Td>{paiseToCurrency(h.avgCostPaise)}</Td>
                    <Td>{paiseToCurrency(h.currentPricePaise)}</Td>
                    <Td className="font-semibold">{paiseToCurrency(h.shares * h.currentPricePaise)}</Td>
                    <Td className={h.pnlPaise >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>{h.pnlPaise >= 0 ? "+" : ""}{paiseToCurrency(h.pnlPaise)}</Td>
                    <Td className={h.pnlPct >= 0 ? "text-green-600" : "text-red-600"}>{h.pnlPct >= 0 ? "+" : ""}{h.pnlPct.toFixed(2)}%</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "ipo" && (
        <Card>
          {loading ? <CardContent className="space-y-3 py-4">{[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</CardContent>
          : !portfolio || portfolio.ipoAllocations.length === 0 ? (
            <CardContent><EmptyState icon={<span className="text-4xl">🏦</span>} title="No IPO allocations" description="Participate in live IPOs to see your allocations here." /></CardContent>
          ) : (
            <Table>
              <thead><tr><Th>Stock</Th><Th>Shares Allocated</Th><Th>Issue Price</Th><Th>Total Cost</Th><Th>Status</Th><Th>Block</Th></tr></thead>
              <tbody>
                {portfolio.ipoAllocations.map((a, i) => (
                  <Tr key={i}>
                    <Td><Badge variant="blue">{a.stock}</Badge></Td>
                    <Td className="font-mono">{a.shares.toLocaleString()}</Td>
                    <Td>{paiseToCurrency(a.pricePaise)}</Td>
                    <Td className="font-semibold">{paiseToCurrency(a.shares * a.pricePaise)}</Td>
                    <Td><Badge variant={a.status === "allocated" ? "green" : a.status === "refunded" ? "amber" : "gray"}>{a.status}</Badge></Td>
                    <Td className="font-mono text-xs">{a.block.toLocaleString()}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "summary" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Return Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Total Invested", value: portfolio?.totalInvestedPaise || 0, color: "" },
                { label: "Current Market Value", value: portfolio?.totalValuePaise || 0, color: "" },
                { label: "Unrealized P&L", value: unrealizedPnl, color: unrealizedPnl >= 0 ? "text-green-600" : "text-red-600" },
                { label: "Realized P&L", value: portfolio?.realizedPnlPaise || 0, color: (portfolio?.realizedPnlPaise || 0) >= 0 ? "text-green-600" : "text-red-600" },
                { label: "Total P&L", value: totalPnl, color: `font-bold ${totalPnl >= 0 ? "text-green-600" : "text-red-600"}` },
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-center border-b border-gray-100 pb-2 last:border-0">
                  <span className="text-sm text-gray-600">{row.label}</span>
                  <span className={`text-sm font-mono ${row.color}`}>{paiseToCurrency(row.value)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Account Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "INR Balance", value: paiseToCurrency(balancePaise) },
                { label: "Locked / Blocked", value: paiseToCurrency(blockedPaise) },
                { label: "Available INR", value: paiseToCurrency(balancePaise - blockedPaise) },
                { label: "Stock Holdings", value: `${portfolio?.holdings.length || 0} stocks` },
                { label: "IPO Allocations", value: `${portfolio?.ipoAllocations.length || 0} allocations` },
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-center border-b border-gray-100 pb-2 last:border-0">
                  <span className="text-sm text-gray-600">{row.label}</span>
                  <span className="text-sm font-mono text-[#1A3A5C] font-semibold">{row.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Portfolio;