/**
 * COM-03: Manage IPO — Open IPO, live bid analytics, post-allocation summary
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  Card, CardHeader, CardTitle, CardContent, Button,
  Badge, Skeleton, Table, Th, Td, Tr
} from "@/components/ui";
import { useAppStore } from "@/store";
import { getRHPAll, getIPOBids, getIPOLive, getAllocation } from "@/lib/api";
import { paiseToCurrency } from "@/lib/utils";
import { PasswordModal } from "@/components/modals/PasswordModal";

interface IPOInfo {
  stock: string; status: string; totalShares: number;
  priceLowPaise: number; priceHighPaise: number;
  biddingStartSlot: number; biddingEndSlot: number;
  qibPct: number; nibPct: number; retailPct: number;
}
interface CategorySummary {
  category: string; totalBids: number; totalShares: number;
  reservedShares: number; demandShares?: number; allocatedShares?: number;
  subscriptionRate: number;
}
interface LiveStats {
  bidsReceived: number; blocksRemaining: number; biddingEndSlot: number;
  categories: CategorySummary[]; totalBidShares: number;
  totalReservedShares: number; overallSubscriptionRate: number;
}
interface AllocStats {
  cutoffPrice: number; allocated: number; totalShares: number;
  totalAmountRaised: number; totalRefunded: number;
  categories: CategorySummary[];
  subscriptionStatus: "oversubscribed" | "undersubscribed" | "fully_subscribed";
}

const ManageIPO: React.FC = () => {
  const { address } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [ipos, setIpos] = useState<IPOInfo[]>([]);
  const [selected, setSelected] = useState<IPOInfo | null>(null);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [allocStats, setAllocStats] = useState<AllocStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [openStock, setOpenStock] = useState("");
  const [openModal, setOpenModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRHPAll();
      const list: IPOInfo[] = (res.rhps || [])
        .filter((ipo: any) => {
          const addr = ipo.companyAddress || ipo.companyAddr || "";
          return addr === address || addr === "";
        })
        .map((ipo: any) => ({
          stock: ipo.stock, status: ipo.status,
          totalShares: ipo.totalShares ?? 0,
          priceLowPaise: ipo.priceBandLower ?? 0,
          priceHighPaise: ipo.priceBandUpper ?? 0,
          biddingStartSlot: ipo.biddingStartSlot ?? 0,
          biddingEndSlot: ipo.biddingEndSlot ?? 0,
          qibPct: ipo.qibPercentage ?? ipo.qibPct ?? 0,
          nibPct: ipo.nibPercentage ?? ipo.nibPct ?? 0,
          retailPct: ipo.retailPercentage ?? ipo.retailPct ?? 0,
        }));
      setIpos(list);
      if (list.length > 0 && !selected) setSelected(list[0]);
    } catch { /* offline */ } finally { setLoading(false); }
  }, [address]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (selected?.status !== "bidding") return;
    const interval = setInterval(() => loadStats(selected), 10000);
    return () => clearInterval(interval);
  }, [selected?.status, selected?.stock]);

  const loadStats = async (ipo: IPOInfo) => {
    setStatsLoading(true);
    setLiveStats(null);
    setAllocStats(null);
    try {
      if (ipo.status === "bidding" || ipo.status === "allocating") {
        const [live, bids] = await Promise.all([
          getIPOLive(ipo.stock).catch(() => null),
          getIPOBids(ipo.stock).catch(() => null) as any,
        ]);
        const categories: CategorySummary[] = (bids?.categories || []).map((c: any) => {
          const pct = c.category === "qib" ? ipo.qibPct : c.category === "nib" ? ipo.nibPct : ipo.retailPct;
          const reserved = Math.floor(ipo.totalShares * pct / 100);
          return {
            category: c.category.toUpperCase(),
            totalBids: c.totalBids ?? 0, totalShares: c.totalShares ?? 0,
            reservedShares: reserved,
            subscriptionRate: reserved > 0 ? (c.totalShares ?? 0) / reserved : 0,
          };
        });
        const totalBidShares = categories.reduce((s, c) => s + c.totalShares, 0);
        const totalReserved = categories.reduce((s, c) => s + c.reservedShares, 0);
        setLiveStats({
          bidsReceived: live?.bidsReceived ?? categories.reduce((s, c) => s + c.totalBids, 0),
          blocksRemaining: live?.blocksRemaining ?? 0,
          biddingEndSlot: live?.biddingEndSlot ?? ipo.biddingEndSlot,
          categories, totalBidShares, totalReservedShares: totalReserved,
          overallSubscriptionRate: totalReserved > 0 ? totalBidShares / totalReserved : 0,
        });
      } else if (ipo.status === "completed") {
        const plan = await getAllocation(ipo.stock).catch(() => null);
        if (plan) {
          const cutoff = plan.cutoffPrice ?? 0;

          const categories: CategorySummary[] = Object.entries(plan.categoryQuotas || {}).map(([cat, q]: [string, any]) => ({
            category: cat.toUpperCase(),
            totalBids: 0,
            totalShares: q.demandShares ?? 0,
            reservedShares: q.reservedShares ?? 0,
            demandShares: q.demandShares ?? 0,
            allocatedShares: q.allocatedShares ?? 0,
            subscriptionRate: q.reservedShares > 0 ? (q.demandShares ?? 0) / q.reservedShares : 0,
          }));

          // Total raised = total allocated shares × single global cutoff price
          const totalAmountRaised = (plan.allocated ?? 0) * cutoff;
          const totalRefunded = (plan.allocations || []).reduce((s: number, a: any) => s + (a.refundAmount ?? 0), 0);

          const totalDemand = categories.reduce((s, c) => s + (c.demandShares ?? 0), 0);
          const overallRate = plan.totalShares > 0 ? totalDemand / plan.totalShares : 0;
          setAllocStats({
            cutoffPrice: cutoff,
            allocated: plan.allocated ?? 0,
            totalShares: plan.totalShares ?? 0,
            totalAmountRaised,
            totalRefunded,
            categories,
            subscriptionStatus: overallRate > 1.05 ? "oversubscribed" : overallRate < 0.95 ? "undersubscribed" : "fully_subscribed",
          });
        }
      }
    } finally { setStatsLoading(false); }
  };

  const selectIPO = (ipo: IPOInfo) => { setSelected(ipo); loadStats(ipo); };
  const statusVariant = (s: string) => ({ bidding:"green", allocating:"amber", completed:"blue", cancelled:"red", rejected:"red" }[s] ?? "gray") as any;
  const subColor = (r: number) => r >= 1 ? "text-green-600" : r >= 0.5 ? "text-amber-500" : "text-red-500";
  const openableStocks = ipos.filter(i => i.status === "pending");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1A3A5C]">Manage IPO</h1>
      <div className="grid grid-cols-3 gap-6">
        {/* Left: stock list */}
        <div className="col-span-1 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Your Stocks</p>
          {loading ? [1,2].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />) :
          ipos.length === 0 ? <div className="text-sm text-gray-400 text-center py-8">No IPOs found.<br/>File a DRHP first.</div> :
          ipos.map(ipo => (
            <button key={ipo.stock} onClick={() => selectIPO(ipo)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${selected?.stock === ipo.stock ? "border-[#C9A84C] bg-amber-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
              <div className="flex justify-between items-start">
                <span className="font-semibold text-[#1A3A5C] text-sm">{ipo.stock}</span>
                <Badge variant={statusVariant(ipo.status)}>{ipo.status}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1">{ipo.totalShares.toLocaleString()} shares</p>
            </button>
          ))}
        </div>

        {/* Right panel */}
        <div className="col-span-2 space-y-4">
          {/* Stock overview */}
          {selected && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{selected.stock}</CardTitle>
                  <Badge variant={statusVariant(selected.status)}>{selected.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">Total Shares:</span> <span className="font-mono font-semibold">{selected.totalShares.toLocaleString()}</span></div>
                  <div><span className="text-gray-500">Price Band:</span> <span className="font-mono">{paiseToCurrency(selected.priceLowPaise)} – {paiseToCurrency(selected.priceHighPaise)}</span></div>
                  <div><span className="text-gray-500">QIB / NIB / Retail:</span> <span>{selected.qibPct}% / {selected.nibPct}% / {selected.retailPct}%</span></div>
                  {selected.biddingEndSlot > 0 && <div><span className="text-gray-500">Bidding Window:</span> <span className="font-mono">Block {selected.biddingStartSlot} – {selected.biddingEndSlot}</span></div>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* LIVE BIDDING ANALYTICS */}
          {selected && (selected.status === "bidding" || selected.status === "allocating") && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>{selected.status === "bidding" ? "🟢 Live Bid Analytics" : "⏳ Allocation Processing"}</CardTitle>
                  <button onClick={() => loadStats(selected)} className="text-xs text-[#1A3A5C] hover:underline">↻ Refresh</button>
                </div>
              </CardHeader>
              <CardContent>
                {statsLoading ? <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div> :
                liveStats ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: "Total Bids", value: liveStats.bidsReceived.toString() },
                        { label: "Shares Bid", value: liveStats.totalBidShares.toLocaleString() },
                        { label: "Subscription", value: `${(liveStats.overallSubscriptionRate * 100).toFixed(1)}%`, color: subColor(liveStats.overallSubscriptionRate) },
                        { label: "Blocks Left", value: liveStats.blocksRemaining.toString(), sub: `end #${liveStats.biddingEndSlot}` },
                      ].map(({ label, value, color, sub }) => (
                        <div key={label} className="bg-[#EAF0F8] rounded-lg p-3">
                          <p className="text-xs text-gray-500">{label}</p>
                          <p className={`text-xl font-bold ${color ?? "text-[#1A3A5C]"}`}>{value}</p>
                          {sub && <p className="text-xs text-gray-400">{sub}</p>}
                        </div>
                      ))}
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm flex justify-between">
                      <span className="text-amber-800">Implied raise at upper band</span>
                      <span className="font-bold text-amber-900">{paiseToCurrency(liveStats.totalBidShares * selected.priceHighPaise)}</span>
                    </div>
                    <Table>
                      <thead><tr><Th>Category</Th><Th>Bids</Th><Th>Shares Bid</Th><Th>Quota</Th><Th>Subscription</Th></tr></thead>
                      <tbody>
                        {liveStats.categories.map(c => (
                          <Tr key={c.category}>
                            <Td><Badge variant={c.category==="QIB"?"blue":c.category==="NIB"?"amber":"green"}>{c.category}</Badge></Td>
                            <Td className="font-mono">{c.totalBids}</Td>
                            <Td className="font-mono">{c.totalShares.toLocaleString()}</Td>
                            <Td className="font-mono text-gray-500">{c.reservedShares.toLocaleString()}</Td>
                            <Td><span className={`font-semibold ${subColor(c.subscriptionRate)}`}>{(c.subscriptionRate*100).toFixed(1)}%{c.subscriptionRate>=1?" 🔥":""}</span></Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                    {liveStats.overallSubscriptionRate >= 1 && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 font-medium">
                        ✓ Oversubscribed — allocation will run automatically at block #{liveStats.biddingEndSlot}.
                      </div>
                    )}
                  </div>
                ) : <p className="text-sm text-gray-400 py-4 text-center">No bid data yet.</p>}
              </CardContent>
            </Card>
          )}

          {/* POST-ALLOCATION SUMMARY */}
          {selected?.status === "completed" && (
            <Card>
              <CardHeader><CardTitle>📊 IPO Outcome &amp; Allocation Summary</CardTitle></CardHeader>
              <CardContent>
                {statsLoading ? <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div> :
                allocStats ? (
                  <div className="space-y-4">
                    <div className={`rounded-lg p-3 text-sm font-semibold border ${
                      allocStats.subscriptionStatus==="oversubscribed" ? "bg-green-50 border-green-200 text-green-700" :
                      allocStats.subscriptionStatus==="undersubscribed" ? "bg-red-50 border-red-200 text-red-700" :
                      "bg-blue-50 border-blue-200 text-blue-700"}`}>
                      {allocStats.subscriptionStatus==="oversubscribed"?"🔥 Oversubscribed":allocStats.subscriptionStatus==="undersubscribed"?"⚠️ Undersubscribed":"✓ Fully Subscribed"}
                      {" — "}{allocStats.allocated.toLocaleString()} shares allocated at {paiseToCurrency(allocStats.cutoffPrice)}/share
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-[#EAF0F8] rounded-lg p-3">
                        <p className="text-xs text-gray-500">Cutoff Price</p>
                        <p className="text-xl font-bold text-[#1A3A5C]">{paiseToCurrency(allocStats.cutoffPrice)}</p>
                        <p className="text-xs text-gray-400">per share (all categories)</p>
                      </div>
                      <div className="bg-[#EAF0F8] rounded-lg p-3">
                        <p className="text-xs text-gray-500">Total Raised</p>
                        <p className="text-xl font-bold text-green-600">{paiseToCurrency(allocStats.totalAmountRaised)}</p>
                      </div>
                      <div className="bg-[#EAF0F8] rounded-lg p-3">
                        <p className="text-xs text-gray-500">Total Refunded</p>
                        <p className="text-xl font-bold text-amber-600">{paiseToCurrency(allocStats.totalRefunded)}</p>
                        <p className="text-xs text-gray-400">to bidders</p>
                      </div>
                    </div>
                    <Table>
                      <thead><tr><Th>Category</Th><Th>Quota</Th><Th>Demand</Th><Th>Allocated</Th><Th>Subscription</Th></tr></thead>
                      <tbody>
                        {allocStats.categories.map((c: any) => (
                          <Tr key={c.category}>
                            <Td><Badge variant={c.category==="QIB"?"blue":c.category==="NIB"?"amber":"green"}>{c.category}</Badge></Td>
                            <Td className="font-mono text-gray-500">{c.reservedShares.toLocaleString()}</Td>
                            <Td className="font-mono">{(c.demandShares??0).toLocaleString()}</Td>
                            <Td className="font-mono text-green-600 font-semibold">{(c.allocatedShares??0).toLocaleString()}</Td>
                            <Td><span className={`font-semibold ${subColor(c.subscriptionRate)}`}>{(c.subscriptionRate*100).toFixed(1)}%</span></Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-gray-400 text-sm mb-2">Allocation data not available.</p>
                    <button onClick={() => loadStats(selected)} className="text-xs text-[#1A3A5C] hover:underline">↻ Retry</button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* OPEN IPO FORM */}
          <Card>
            <CardHeader><CardTitle>Open IPO Bidding</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">Submit <code className="bg-gray-100 px-1 rounded">tnx_open_ipo</code> to start bidding. Bidding window and price band are enforced from the approved RHP on-chain. Allocation happens automatically when the bidding window closes.</p>
              {openableStocks.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {openableStocks.map(s => (
                      <button key={s.stock} onClick={() => setOpenStock(s.stock)}
                        className={`w-full text-left px-3 py-2 rounded border text-sm transition-all ${openStock===s.stock?"border-[#C9A84C] bg-amber-50 font-semibold":"border-gray-200 hover:border-gray-300"}`}>
                        {s.stock} — {s.totalShares.toLocaleString()} shares · {paiseToCurrency(s.priceLowPaise)}–{paiseToCurrency(s.priceHighPaise)}
                      </button>
                    ))}
                  </div>
                  <Button variant="primary" className="w-full" disabled={!openStock} onClick={() => setOpenModal(true)}>
                    Open Bidding for {openStock || "…"}
                  </Button>
                </>
              ) : (
                <div className="text-sm text-gray-400 py-4 text-center">
                  No stocks with approved RHP ready to open.<br/>
                  {ipos.some(i => ["bidding","allocating","completed"].includes(i.status)) ? "All your stocks are already active or completed." : "File a DRHP and wait for regulator to upload RHP first."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {openModal && (
        <PasswordModal isOpen={openModal}
          txFields={{ type: "tnx_open_ipo", stock: openStock }}
          summary={{ type: "Open IPO", stock: openStock, extra: "Bidding window set by approved RHP" }}
          onClose={() => setOpenModal(false)}
          onSuccess={() => { setOpenModal(false); setOpenStock(""); load(); }} />
      )}
    </div>
  );
};

export default ManageIPO;

// /**
//  * COM-03: Manage IPO — Open IPO, live bid analytics, post-allocation summary
//  */
// import React, { useEffect, useState, useCallback } from "react";
// import {
//   Card, CardHeader, CardTitle, CardContent, Button,
//   Badge, Skeleton, Table, Th, Td, Tr
// } from "@/components/ui";
// import { useAppStore } from "@/store";
// import { getRHPAll, getIPOBids, getIPOLive, getAllocation } from "@/lib/api";
// import { paiseToCurrency } from "@/lib/utils";
// import { PasswordModal } from "@/components/modals/PasswordModal";

// interface IPOInfo {
//   stock: string; status: string; totalShares: number;
//   priceLowPaise: number; priceHighPaise: number;
//   biddingStartSlot: number; biddingEndSlot: number;
//   qibPct: number; nibPct: number; retailPct: number;
// }
// interface CategorySummary {
//   category: string; totalBids: number; totalShares: number;
//   reservedShares: number; demandShares?: number; allocatedShares?: number;
//   subscriptionRate: number;
// }
// interface LiveStats {
//   bidsReceived: number; blocksRemaining: number; biddingEndSlot: number;
//   categories: CategorySummary[]; totalBidShares: number;
//   totalReservedShares: number; overallSubscriptionRate: number;
// }
// interface AllocStats {
//   cutoffPrice: number; allocated: number; totalShares: number;
//   totalAmountRaised: number; totalRefunded: number;
//   categories: CategorySummary[];
//   subscriptionStatus: "oversubscribed" | "undersubscribed" | "fully_subscribed";
// }

// const ManageIPO: React.FC = () => {
//   const { address } = useAppStore();
//   const [loading, setLoading] = useState(true);
//   const [ipos, setIpos] = useState<IPOInfo[]>([]);
//   const [selected, setSelected] = useState<IPOInfo | null>(null);
//   const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
//   const [allocStats, setAllocStats] = useState<AllocStats | null>(null);
//   const [statsLoading, setStatsLoading] = useState(false);
//   const [openStock, setOpenStock] = useState("");
//   const [openModal, setOpenModal] = useState(false);

//   const load = useCallback(async () => {
//     setLoading(true);
//     try {
//       const res = await getRHPAll();
//       const list: IPOInfo[] = (res.rhps || [])
//         .filter((ipo: any) => {
//           const addr = ipo.companyAddress || ipo.companyAddr || "";
//           return addr === address || addr === "";
//         })
//         .map((ipo: any) => ({
//           stock: ipo.stock, status: ipo.status,
//           totalShares: ipo.totalShares ?? 0,
//           priceLowPaise: ipo.priceBandLower ?? 0,
//           priceHighPaise: ipo.priceBandUpper ?? 0,
//           biddingStartSlot: ipo.biddingStartSlot ?? 0,
//           biddingEndSlot: ipo.biddingEndSlot ?? 0,
//           qibPct: ipo.qibPercentage ?? ipo.qibPct ?? 0,
//           nibPct: ipo.nibPercentage ?? ipo.nibPct ?? 0,
//           retailPct: ipo.retailPercentage ?? ipo.retailPct ?? 0,
//         }));
//       setIpos(list);
//       if (list.length > 0 && !selected) setSelected(list[0]);
//     } catch { /* offline */ } finally { setLoading(false); }
//   }, [address]);

//   useEffect(() => { load(); }, [load]);

//   useEffect(() => {
//     if (selected?.status !== "bidding") return;
//     const interval = setInterval(() => loadStats(selected), 10000);
//     return () => clearInterval(interval);
//   }, [selected?.status, selected?.stock]);

//   const loadStats = async (ipo: IPOInfo) => {
//     setStatsLoading(true);
//     setLiveStats(null);
//     setAllocStats(null);
//     try {
//       if (ipo.status === "bidding" || ipo.status === "allocating") {
//         const [live, bids] = await Promise.all([
//           getIPOLive(ipo.stock).catch(() => null),
//           getIPOBids(ipo.stock).catch(() => null) as any,
//         ]);
//         const categories: CategorySummary[] = (bids?.categories || []).map((c: any) => {
//           const pct = c.category === "qib" ? ipo.qibPct : c.category === "nib" ? ipo.nibPct : ipo.retailPct;
//           const reserved = Math.floor(ipo.totalShares * pct / 100);
//           return {
//             category: c.category.toUpperCase(),
//             totalBids: c.totalBids ?? 0, totalShares: c.totalShares ?? 0,
//             reservedShares: reserved,
//             subscriptionRate: reserved > 0 ? (c.totalShares ?? 0) / reserved : 0,
//           };
//         });
//         const totalBidShares = categories.reduce((s, c) => s + c.totalShares, 0);
//         const totalReserved = categories.reduce((s, c) => s + c.reservedShares, 0);
//         setLiveStats({
//           bidsReceived: live?.bidsReceived ?? categories.reduce((s, c) => s + c.totalBids, 0),
//           blocksRemaining: live?.blocksRemaining ?? 0,
//           biddingEndSlot: live?.biddingEndSlot ?? ipo.biddingEndSlot,
//           categories, totalBidShares, totalReservedShares: totalReserved,
//           overallSubscriptionRate: totalReserved > 0 ? totalBidShares / totalReserved : 0,
//         });
//       } else if (ipo.status === "completed") {
//         const plan = await getAllocation(ipo.stock).catch(() => null);
//         if (plan) {
//           const categories: CategorySummary[] = Object.entries(plan.categoryQuotas || {}).map(([cat, q]: [string, any]) => ({
//             category: cat.toUpperCase(),
//             totalBids: 0, totalShares: q.demandShares ?? 0,
//             reservedShares: q.reservedShares ?? 0, demandShares: q.demandShares ?? 0,
//             allocatedShares: q.allocatedShares ?? 0,
//             subscriptionRate: q.reservedShares > 0 ? (q.demandShares ?? 0) / q.reservedShares : 0,
//           }));

//           // Total raised = shares actually allocated × cutoff price (correct IPO math)
//           const totalAmountRaised = plan.allocated * plan.cutoffPrice;
//           // Total refunded = what bidders locked minus what they paid
//           const totalRefunded = (plan.allocations || []).reduce((s: number, a: any) => s + (a.refundAmount ?? 0), 0);

//           // Total demand = sum of all bids placed (regardless of allocation)
//           const totalDemand = categories.reduce((s, c) => s + (c.demandShares ?? 0), 0);
//           const overallRate = plan.totalShares > 0 ? totalDemand / plan.totalShares : 0;
//           setAllocStats({
//             cutoffPrice: plan.cutoffPrice ?? 0, allocated: plan.allocated ?? 0,
//             totalShares: plan.totalShares ?? 0, totalAmountRaised, totalRefunded, categories,
//             subscriptionStatus: overallRate > 1.05 ? "oversubscribed" : overallRate < 0.95 ? "undersubscribed" : "fully_subscribed",
//           });
//         }
//       }
//     } finally { setStatsLoading(false); }
//   };

//   const selectIPO = (ipo: IPOInfo) => { setSelected(ipo); loadStats(ipo); };
//   const statusVariant = (s: string) => ({ bidding:"green", allocating:"amber", completed:"blue", cancelled:"red", rejected:"red" }[s] ?? "gray") as any;
//   const subColor = (r: number) => r >= 1 ? "text-green-600" : r >= 0.5 ? "text-amber-500" : "text-red-500";
//   const openableStocks = ipos.filter(i => i.status === "pending");

//   return (
//     <div className="space-y-6">
//       <h1 className="text-2xl font-bold text-[#1A3A5C]">Manage IPO</h1>
//       <div className="grid grid-cols-3 gap-6">
//         {/* Left: stock list */}
//         <div className="col-span-1 space-y-2">
//           <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Your Stocks</p>
//           {loading ? [1,2].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />) :
//           ipos.length === 0 ? <div className="text-sm text-gray-400 text-center py-8">No IPOs found.<br/>File a DRHP first.</div> :
//           ipos.map(ipo => (
//             <button key={ipo.stock} onClick={() => selectIPO(ipo)}
//               className={`w-full text-left p-3 rounded-lg border transition-all ${selected?.stock === ipo.stock ? "border-[#C9A84C] bg-amber-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
//               <div className="flex justify-between items-start">
//                 <span className="font-semibold text-[#1A3A5C] text-sm">{ipo.stock}</span>
//                 <Badge variant={statusVariant(ipo.status)}>{ipo.status}</Badge>
//               </div>
//               <p className="text-xs text-gray-500 mt-1">{ipo.totalShares.toLocaleString()} shares</p>
//             </button>
//           ))}
//         </div>

//         {/* Right panel */}
//         <div className="col-span-2 space-y-4">
//           {/* Stock overview */}
//           {selected && (
//             <Card>
//               <CardHeader>
//                 <div className="flex items-center justify-between">
//                   <CardTitle>{selected.stock}</CardTitle>
//                   <Badge variant={statusVariant(selected.status)}>{selected.status}</Badge>
//                 </div>
//               </CardHeader>
//               <CardContent>
//                 <div className="grid grid-cols-2 gap-3 text-sm">
//                   <div><span className="text-gray-500">Total Shares:</span> <span className="font-mono font-semibold">{selected.totalShares.toLocaleString()}</span></div>
//                   <div><span className="text-gray-500">Price Band:</span> <span className="font-mono">{paiseToCurrency(selected.priceLowPaise)} – {paiseToCurrency(selected.priceHighPaise)}</span></div>
//                   <div><span className="text-gray-500">QIB / NIB / Retail:</span> <span>{selected.qibPct}% / {selected.nibPct}% / {selected.retailPct}%</span></div>
//                   {selected.biddingEndSlot > 0 && <div><span className="text-gray-500">Bidding Window:</span> <span className="font-mono">Block {selected.biddingStartSlot} – {selected.biddingEndSlot}</span></div>}
//                 </div>
//               </CardContent>
//             </Card>
//           )}

//           {/* LIVE BIDDING ANALYTICS */}
//           {selected && (selected.status === "bidding" || selected.status === "allocating") && (
//             <Card>
//               <CardHeader>
//                 <div className="flex justify-between items-center">
//                   <CardTitle>{selected.status === "bidding" ? "🟢 Live Bid Analytics" : "⏳ Allocation Processing"}</CardTitle>
//                   <button onClick={() => loadStats(selected)} className="text-xs text-[#1A3A5C] hover:underline">↻ Refresh</button>
//                 </div>
//               </CardHeader>
//               <CardContent>
//                 {statsLoading ? <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div> :
//                 liveStats ? (
//                   <div className="space-y-4">
//                     <div className="grid grid-cols-4 gap-3">
//                       {[
//                         { label: "Total Bids", value: liveStats.bidsReceived.toString() },
//                         { label: "Shares Bid", value: liveStats.totalBidShares.toLocaleString() },
//                         { label: "Subscription", value: `${(liveStats.overallSubscriptionRate * 100).toFixed(1)}%`, color: subColor(liveStats.overallSubscriptionRate) },
//                         { label: "Blocks Left", value: liveStats.blocksRemaining.toString(), sub: `end #${liveStats.biddingEndSlot}` },
//                       ].map(({ label, value, color, sub }) => (
//                         <div key={label} className="bg-[#EAF0F8] rounded-lg p-3">
//                           <p className="text-xs text-gray-500">{label}</p>
//                           <p className={`text-xl font-bold ${color ?? "text-[#1A3A5C]"}`}>{value}</p>
//                           {sub && <p className="text-xs text-gray-400">{sub}</p>}
//                         </div>
//                       ))}
//                     </div>
//                     <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm flex justify-between">
//                       <span className="text-amber-800">Implied raise at upper band</span>
//                       <span className="font-bold text-amber-900">{paiseToCurrency(liveStats.totalBidShares * selected.priceHighPaise)}</span>
//                     </div>
//                     <Table>
//                       <thead><tr><Th>Category</Th><Th>Bids</Th><Th>Shares Bid</Th><Th>Quota</Th><Th>Subscription</Th></tr></thead>
//                       <tbody>
//                         {liveStats.categories.map(c => (
//                           <Tr key={c.category}>
//                             <Td><Badge variant={c.category==="QIB"?"blue":c.category==="NIB"?"amber":"green"}>{c.category}</Badge></Td>
//                             <Td className="font-mono">{c.totalBids}</Td>
//                             <Td className="font-mono">{c.totalShares.toLocaleString()}</Td>
//                             <Td className="font-mono text-gray-500">{c.reservedShares.toLocaleString()}</Td>
//                             <Td><span className={`font-semibold ${subColor(c.subscriptionRate)}`}>{(c.subscriptionRate*100).toFixed(1)}%{c.subscriptionRate>=1?" 🔥":""}</span></Td>
//                           </Tr>
//                         ))}
//                       </tbody>
//                     </Table>
//                     {liveStats.overallSubscriptionRate >= 1 && (
//                       <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 font-medium">
//                         ✓ Oversubscribed — allocation will run automatically at block #{liveStats.biddingEndSlot}.
//                       </div>
//                     )}
//                   </div>
//                 ) : <p className="text-sm text-gray-400 py-4 text-center">No bid data yet.</p>}
//               </CardContent>
//             </Card>
//           )}

//           {/* POST-ALLOCATION SUMMARY */}
//           {selected?.status === "completed" && (
//             <Card>
//               <CardHeader><CardTitle>📊 IPO Outcome &amp; Allocation Summary</CardTitle></CardHeader>
//               <CardContent>
//                 {statsLoading ? <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div> :
//                 allocStats ? (
//                   <div className="space-y-4">
//                     <div className={`rounded-lg p-3 text-sm font-semibold border ${
//                       allocStats.subscriptionStatus==="oversubscribed" ? "bg-green-50 border-green-200 text-green-700" :
//                       allocStats.subscriptionStatus==="undersubscribed" ? "bg-red-50 border-red-200 text-red-700" :
//                       "bg-blue-50 border-blue-200 text-blue-700"}`}>
//                       {allocStats.subscriptionStatus==="oversubscribed"?"🔥 Oversubscribed":allocStats.subscriptionStatus==="undersubscribed"?"⚠️ Undersubscribed":"✓ Fully Subscribed"}
//                       {" — "}{allocStats.allocated.toLocaleString()} shares allocated at {paiseToCurrency(allocStats.cutoffPrice)}/share
//                     </div>
//                     <div className="grid grid-cols-3 gap-3">
//                       <div className="bg-[#EAF0F8] rounded-lg p-3">
//                         <p className="text-xs text-gray-500">Cutoff Price</p>
//                         <p className="text-xl font-bold text-[#1A3A5C]">{paiseToCurrency(allocStats.cutoffPrice)}</p>
//                         <p className="text-xs text-gray-400">per share</p>
//                       </div>
//                       <div className="bg-[#EAF0F8] rounded-lg p-3">
//                         <p className="text-xs text-gray-500">Total Raised</p>
//                         <p className="text-xl font-bold text-green-600">{paiseToCurrency(allocStats.totalAmountRaised)}</p>
//                       </div>
//                       <div className="bg-[#EAF0F8] rounded-lg p-3">
//                         <p className="text-xs text-gray-500">Total Refunded</p>
//                         <p className="text-xl font-bold text-amber-600">{paiseToCurrency(allocStats.totalRefunded)}</p>
//                         <p className="text-xs text-gray-400">to bidders</p>
//                       </div>
//                     </div>
//                     <Table>
//                       <thead><tr><Th>Category</Th><Th>Quota</Th><Th>Demand</Th><Th>Allocated</Th><Th>Subscription</Th></tr></thead>
//                       <tbody>
//                         {allocStats.categories.map(c => (
//                           <Tr key={c.category}>
//                             <Td><Badge variant={c.category==="QIB"?"blue":c.category==="NIB"?"amber":"green"}>{c.category}</Badge></Td>
//                             <Td className="font-mono text-gray-500">{c.reservedShares.toLocaleString()}</Td>
//                             <Td className="font-mono">{(c.demandShares??0).toLocaleString()}</Td>
//                             <Td className="font-mono text-green-600 font-semibold">{(c.allocatedShares??0).toLocaleString()}</Td>
//                             <Td><span className={`font-semibold ${subColor(c.subscriptionRate)}`}>{(c.subscriptionRate*100).toFixed(1)}%</span></Td>
//                           </Tr>
//                         ))}
//                       </tbody>
//                     </Table>
//                   </div>
//                 ) : (
//                   <div className="text-center py-6">
//                     <p className="text-gray-400 text-sm mb-2">Allocation data not available.</p>
//                     <button onClick={() => loadStats(selected)} className="text-xs text-[#1A3A5C] hover:underline">↻ Retry</button>
//                   </div>
//                 )}
//               </CardContent>
//             </Card>
//           )}

//           {/* OPEN IPO FORM */}
//           <Card>
//             <CardHeader><CardTitle>Open IPO Bidding</CardTitle></CardHeader>
//             <CardContent className="space-y-4">
//               <p className="text-sm text-gray-500">Submit <code className="bg-gray-100 px-1 rounded">tnx_open_ipo</code> to start bidding. Bidding window and price band are enforced from the approved RHP on-chain. Allocation happens automatically when the bidding window closes.</p>
//               {openableStocks.length > 0 ? (
//                 <>
//                   <div className="space-y-2">
//                     {openableStocks.map(s => (
//                       <button key={s.stock} onClick={() => setOpenStock(s.stock)}
//                         className={`w-full text-left px-3 py-2 rounded border text-sm transition-all ${openStock===s.stock?"border-[#C9A84C] bg-amber-50 font-semibold":"border-gray-200 hover:border-gray-300"}`}>
//                         {s.stock} — {s.totalShares.toLocaleString()} shares · {paiseToCurrency(s.priceLowPaise)}–{paiseToCurrency(s.priceHighPaise)}
//                       </button>
//                     ))}
//                   </div>
//                   <Button variant="primary" className="w-full" disabled={!openStock} onClick={() => setOpenModal(true)}>
//                     Open Bidding for {openStock || "…"}
//                   </Button>
//                 </>
//               ) : (
//                 <div className="text-sm text-gray-400 py-4 text-center">
//                   No stocks with approved RHP ready to open.<br/>
//                   {ipos.some(i => ["bidding","allocating","completed"].includes(i.status)) ? "All your stocks are already active or completed." : "File a DRHP and wait for regulator to upload RHP first."}
//                 </div>
//               )}
//             </CardContent>
//           </Card>
//         </div>
//       </div>

//       {openModal && (
//         <PasswordModal isOpen={openModal}
//           txFields={{ type: "tnx_open_ipo", stock: openStock }}
//           summary={{ type: "Open IPO", stock: openStock, extra: "Bidding window set by approved RHP" }}
//           onClose={() => setOpenModal(false)}
//           onSuccess={() => { setOpenModal(false); setOpenStock(""); load(); }} />
//       )}
//     </div>
//   );
// };

// export default ManageIPO;
