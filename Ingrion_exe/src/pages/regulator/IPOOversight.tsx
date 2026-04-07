/**
 * REG-02: IPO Oversight
 */
import React, { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, CardTitle, CardContent, Badge, Table, Th, Td, Tr, Spinner } from "@/components/ui";
import { getAllIPOs, getIPOBids, getIPOLive } from "@/lib/api";
import { paiseToCurrency, ipoStatusLabel } from "@/lib/utils";

interface IPOSummary { stock: string; status: string; companyAddress: string; biddingEndSlot?: number; totalShares?: number; priceBandLower?: number; priceBandUpper?: number; }
interface BidCategory { category: string; bids: number; shares: number; quota: number; }

const IPOOversight: React.FC = () => {
  const [ipos, setIpos] = useState<IPOSummary[]>([]);
  const [selected, setSelected] = useState<IPOSummary | null>(null);
  const [liveData, setLiveData] = useState<{ subscriptionRate: number; totalBids: number; categories: BidCategory[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingLive, setLoadingLive] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getAllIPOs();
        setIpos(data.ipos || []);
      } finally { setLoading(false); }
    };
    load();
  }, []);

  const selectIPO = async (ipo: IPOSummary) => {
    setSelected(ipo);
    setLiveData(null);
    if (ipo.status === "bidding" || ipo.status === "allocating") {
      setLoadingLive(true);
      try {
        const [live, bids] = await Promise.all([
          getIPOLive(ipo.stock).catch(() => null),
          getIPOBids(ipo.stock).catch(() => null),
        ]);
        setLiveData({
          subscriptionRate: live?.subscriptionRate || 0,
          totalBids: live?.totalBids || 0,
          categories: bids?.categories || [],
        });
      } finally { setLoadingLive(false); }
    }
  };

  const grouped: Record<string, IPOSummary[]> = {};
  ipos.forEach((i) => {
    if (!grouped[i.status]) grouped[i.status] = [];
    grouped[i.status].push(i);
  });

  const statusOrder = ["bidding", "allocating", "pending", "completed", "cancelled", "rejected"];

  return (
    <div className="grid grid-cols-5 gap-5">
      {/* IPO List */}
      <div className="col-span-2">
        <Card>
          <CardHeader><CardTitle>All IPOs ({ipos.length})</CardTitle></CardHeader>
          {loading ? (
            <CardContent className="flex justify-center py-8"><Spinner /></CardContent>
          ) : (
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {statusOrder.map((status) => {
                const group = grouped[status];
                if (!group?.length) return null;
                const { label, color } = ipoStatusLabel(status);
                return (
                  <div key={status}>
                    <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase sticky top-0">
                      {label} ({group.length})
                    </div>
                    {group.map((ipo) => (
                      <div key={ipo.stock}
                        className={`px-4 py-3 cursor-pointer hover:bg-[#EAF0F8] transition-colors ${selected?.stock === ipo.stock ? "bg-[#EAF0F8]" : ""}`}
                        onClick={() => selectIPO(ipo)}>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-[#1A3A5C]">{ipo.stock}</span>
                          <Badge variant={color as "green" | "amber" | "blue" | "red" | "gray"}>{label}</Badge>
                        </div>
                        {ipo.priceBandLower && (
                          <p className="text-xs text-gray-400 mt-0.5">Band: ₹{(ipo.priceBandLower / 100).toFixed(2)} – ₹{((ipo.priceBandUpper || 0) / 100).toFixed(2)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
              {ipos.length === 0 && <div className="p-6 text-center text-gray-400">No IPOs found</div>}
            </div>
          )}
        </Card>
      </div>

      {/* IPO Detail */}
      <div className="col-span-3">
        {!selected ? (
          <Card><CardContent className="py-16 text-center text-gray-400">
            <p className="text-4xl mb-3">📊</p>
            <p>Select an IPO to view oversight details</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>{selected.stock}</CardTitle>
                  <Badge variant={ipoStatusLabel(selected.status).color as "green" | "amber" | "blue" | "red" | "gray"}>
                    {ipoStatusLabel(selected.status).label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-gray-500">Company</p><p className="font-mono text-xs">{selected.companyAddress?.slice(0, 20)}…</p></div>
                  <div><p className="text-xs text-gray-500">Total Shares</p><p className="font-bold">{selected.totalShares?.toLocaleString() || "—"}</p></div>
                  <div><p className="text-xs text-gray-500">Price Band</p><p className="font-bold">{selected.priceBandLower ? `₹${(selected.priceBandLower / 100).toFixed(2)} – ₹${((selected.priceBandUpper || 0) / 100).toFixed(2)}` : "—"}</p></div>
                  {selected.biddingEndSlot && <div><p className="text-xs text-gray-500">Bidding Ends (Block)</p><p className="font-mono">#{selected.biddingEndSlot}</p></div>}
                </div>
              </CardContent>
            </Card>

            {/* Live Data */}
            {(selected.status === "bidding" || selected.status === "allocating") && (
              <Card>
                <CardHeader><CardTitle>Live Bid Data</CardTitle></CardHeader>
                <CardContent>
                  {loadingLive ? <div className="flex justify-center py-6"><Spinner /></div> :
                    liveData ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-[#EAF0F8] rounded p-3">
                            <p className="text-xs text-gray-500">Subscription Rate</p>
                            <p className="text-2xl font-bold text-[#1A3A5C]">{((liveData.subscriptionRate || 0) * 100).toFixed(1)}%</p>
                          </div>
                          <div className="bg-[#EAF0F8] rounded p-3">
                            <p className="text-xs text-gray-500">Total Bids</p>
                            <p className="text-2xl font-bold">{liveData.totalBids?.toLocaleString() || "0"}</p>
                          </div>
                        </div>

                        {/* Category breakdown chart */}
                        {liveData.categories?.length > 0 && (
                          <>
                            <p className="text-xs font-semibold text-gray-500 uppercase">Category Demand vs Quota</p>
                            <ResponsiveContainer width="100%" height={160}>
                              <BarChart data={liveData.categories} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#EAF0F8" />
                                <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                                <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={50} />
                                <Tooltip formatter={(v: number) => `${v}%`} />
                                <Bar dataKey="quota" fill="#EAF0F8" name="Quota %" radius={[0, 2, 2, 0]} />
                                <Bar dataKey="subscribed" fill="#C9A84C" name="Subscribed %" radius={[0, 2, 2, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                            <Table>
                              <thead><tr><Th>Category</Th><Th>Quota</Th><Th>Bids</Th><Th>Shares Bid</Th></tr></thead>
                              <tbody>
                                {liveData.categories.map((c, i) => (
                                  <Tr key={i}>
                                    <Td className="font-semibold uppercase text-xs">{c.category}</Td>
                                    <Td>{c.quota}%</Td>
                                    <Td>{c.bids?.toLocaleString()}</Td>
                                    <Td>{c.shares?.toLocaleString()}</Td>
                                  </Tr>
                                ))}
                              </tbody>
                            </Table>
                          </>
                        )}
                      </div>
                    ) : <p className="text-gray-400 text-sm text-center py-4">No live data available</p>
                  }
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default IPOOversight;
