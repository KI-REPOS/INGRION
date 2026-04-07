/**
 * USER-03: Live IPO Bidding Page
 */
import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Skeleton } from "@/components/ui";
import { PasswordModal } from "@/components/modals/PasswordModal";
import { useAppStore } from "@/store";
import { getIPOActive } from "@/lib/api";
import { paiseToCurrency } from "@/lib/utils";
import type { RHPStatus } from "@/types";

const IPOBidding: React.FC = () => {
  const { keystore, balancePaise, blockedPaise } = useAppStore();
  const [ipos, setIpos] = useState<RHPStatus[]>([]);
  const [selected, setSelected] = useState<RHPStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidPrice, setBidPrice] = useState("");
  const [bidShares, setBidShares] = useState("");
  const [showModal, setShowModal] = useState(false);

  const available = balancePaise - blockedPaise;
  const category = keystore?.category || "retail";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Dynamically discover all IPOs in bidding phase from the node
        const res = await getIPOActive();
        const results: RHPStatus[] = res.ipos || [];
        setIpos(results);
        if (results.length > 0) setSelected(results[0]);
      } catch (e) {
        console.error("[IPOBidding] failed to load active IPOs:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const bidPricePaise = Math.round(parseFloat(bidPrice || "0") * 100);
  const bidSharesNum = parseInt(bidShares || "0");
  const totalBidValue = bidPricePaise * bidSharesNum;

  const isValidBid =
    selected &&
    bidPricePaise >= selected.priceBandLower &&
    bidPricePaise <= selected.priceBandUpper &&
    bidSharesNum > 0 &&
    totalBidValue <= available;

  const txFields = selected
    ? {
        type: "tnx_bid_stock",
        stock: selected.stock,
        bidPricePaise,
        bidShares: bidSharesNum,
        category,
      }
    : {};

  if (loading) return <div className="flex justify-center pt-20"><Skeleton className="w-96 h-64" /></div>;

  // getIPOActive already returns only bidding-phase IPOs
  const biddingIPOs = ipos;
  const otherIPOs: RHPStatus[] = [];

  return (
    <div className="grid grid-cols-5 gap-5 h-full">
      {/* Left: IPO List */}
      <div className="col-span-3 space-y-4">
        <h2 className="text-lg font-bold text-[#1A3A5C]">Open IPOs</h2>
        {biddingIPOs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-400">
              No IPOs currently in bidding phase.
            </CardContent>
          </Card>
        ) : (
          biddingIPOs.map((ipo) => (
            <Card
              key={ipo.stock}
              className={`cursor-pointer transition-all hover:shadow-md ${selected?.stock === ipo.stock ? "ring-2 ring-[#C9A84C]" : ""}`}
              onClick={() => { setSelected(ipo); setBidPrice(""); setBidShares(""); }}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xl font-bold text-[#1A3A5C]">{ipo.stock}</p>
                    <p className="text-sm text-gray-500 mt-0.5">Company: <code className="text-xs">{ipo.companyAddress?.slice(0, 12)}…</code></p>
                  </div>
                  <Badge variant="green">Bidding Open</Badge>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Price Band</p>
                    <p className="font-semibold">₹{(ipo.priceBandLower / 100).toFixed(2)} – ₹{(ipo.priceBandUpper / 100).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Total Shares</p>
                    <p className="font-semibold">{ipo.totalShares.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Bidding Ends</p>
                    <p className="font-semibold">Block #{ipo.biddingEndSlot}</p>
                  </div>
                </div>
                {/* Category Quotas */}
                <div className="mt-3 flex gap-2 text-xs">
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">QIB {ipo.qibPct}%</span>
                  <span className="bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">NIB {ipo.nibPct}%</span>
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Retail {ipo.retailPct}%</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {otherIPOs.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-gray-500 font-medium py-2">Other IPOs ({otherIPOs.length})</summary>
            <div className="mt-2 space-y-2">
              {otherIPOs.map((ipo) => (
                <div key={ipo.stock} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex justify-between items-center">
                  <span className="font-bold text-sm">{ipo.stock}</span>
                  <Badge variant={ipo.status === "completed" ? "gray" : ipo.status === "cancelled" ? "red" : "amber"}>
                    {ipo.status}
                  </Badge>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Right: Bid Form */}
      <div className="col-span-2">
        {selected && selected.status === "bidding" ? (
          <Card>
            <CardHeader>
              <CardTitle>Place Bid — {selected.stock}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Bidder Category</span>
                <Badge variant="indigo">{category.toUpperCase()}</Badge>
              </div>

              <div className="bg-[#EAF0F8] rounded p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Available</span>
                  <span className="font-bold">{paiseToCurrency(available)}</span>
                </div>
              </div>

              {/* Price slider + input */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  Bid Price (₹ per share)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input
                    type="number"
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]"
                    value={bidPrice}
                    onChange={(e) => setBidPrice(e.target.value)}
                    min={(selected.priceBandLower / 100).toFixed(2)}
                    max={(selected.priceBandUpper / 100).toFixed(2)}
                    step="0.01"
                    placeholder={`${(selected.priceBandLower / 100).toFixed(2)} – ${(selected.priceBandUpper / 100).toFixed(2)}`}
                  />
                </div>
                <input
                  type="range"
                  className="w-full mt-2 accent-[#C9A84C]"
                  min={selected.priceBandLower}
                  max={selected.priceBandUpper}
                  step={1}
                  value={bidPricePaise || selected.priceBandLower}
                  onChange={(e) => setBidPrice((parseInt(e.target.value) / 100).toFixed(2))}
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>₹{(selected.priceBandLower / 100).toFixed(2)}</span>
                  <span>₹{(selected.priceBandUpper / 100).toFixed(2)}</span>
                </div>
              </div>

              {/* Shares */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Number of Shares</label>
                <input
                  type="number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]"
                  value={bidShares}
                  onChange={(e) => setBidShares(e.target.value)}
                  min={category === "retail" ? selected.minRetailBid : 1}
                  max={category === "retail" ? selected.maxRetailBid : undefined}
                  placeholder={`Min: ${category === "retail" ? selected.minRetailBid : 1}`}
                />
                {category === "retail" && (
                  <p className="text-xs text-gray-400 mt-1">
                    Lot size: {selected.retailLotSize} • Range: {selected.minRetailBid}–{selected.maxRetailBid}
                  </p>
                )}
              </div>

              {/* Total */}
              <div className="bg-[#EAF0F8] rounded p-3 flex justify-between text-sm">
                <span className="text-gray-600">Total Bid Value</span>
                <span className="font-bold text-[#1A3A5C]">{paiseToCurrency(totalBidValue)}</span>
              </div>

              {totalBidValue > available && (
                <p className="text-xs text-red-600">⚠️ Bid value exceeds available balance</p>
              )}

              <Button
                variant="primary"
                className="w-full"
                disabled={!isValidBid}
                onClick={() => setShowModal(true)}
              >
                Place Bid
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-gray-400">
              <p className="text-4xl mb-3">📋</p>
              <p>Select an active IPO to place a bid</p>
            </CardContent>
          </Card>
        )}
      </div>

      <PasswordModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => setShowModal(false)}
        txFields={txFields}
        summary={{
          type: "IPO Bid",
          stock: selected?.stock,
          amount: totalBidValue,
          extra: `${bidSharesNum} shares @ ₹${parseFloat(bidPrice || "0").toFixed(2)}`,
        }}
      />
    </div>
  );
};

export default IPOBidding;