/**
 * COM-01: Company Home Dashboard
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Address } from "@/components/ui";
import { useAppStore } from "@/store";
import { getRHPAll, getIPOLive } from "@/lib/api";
import { ipoStatusLabel, paiseToCurrency } from "@/lib/utils";
import type { RHPStatus } from "@/types";

const IPO_LIFECYCLE_STEPS = ["DRHP Filed", "RHP Uploaded", "Stock Initiated", "Bidding Open", "Allocating", "Completed"];

function getLifecycleStep(status: string): number {
  const map: Record<string, number> = { pending: 1, bidding: 3, allocating: 4, completed: 5, cancelled: -1, rejected: -1 };
  return map[status] ?? 0;
}

const CompanyDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { keystore, balancePaise } = useAppStore();
  const [stocks, setStocks] = useState<RHPStatus[]>([]);
  const [liveData, setLiveData] = useState<Record<string, { subscriptionRate: number; totalBids: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await getRHPAll();
        // Filter to only this company's stocks
        const myStocks = (res.rhps || []).filter(
          (r) => (r.companyAddress || r.companyAddress) === keystore?.address
        );
        setStocks(myStocks);
        // Fetch live subscription data for bidding stocks
        const live: typeof liveData = {};
        await Promise.allSettled(
          myStocks.filter((s) => s.status === "bidding").map(async (s) => {
            const d = await getIPOLive(s.stock).catch(() => null);
            if (d) live[s.stock] = { subscriptionRate: d.subscriptionRate, totalBids: d.totalBids };
          })
        );
        setLiveData(live);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [keystore?.address]);

  return (
    <div className="space-y-6">
      {/* Zone A: Summary */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 flex-wrap">
            <Address value={keystore?.address || ""} />
            <Badge variant="purple">COMPANY</Badge>
          </div>
          <div className="mt-4 flex gap-6 text-sm">
            <div>
              <p className="text-xs text-gray-500">INR Balance</p>
              <p className="text-2xl font-bold text-[#1A3A5C]">{paiseToCurrency(balancePaise)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Stocks Filed</p>
              <p className="text-2xl font-bold text-[#1A3A5C]">{stocks.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Zone B: IPO Lifecycle Tracker */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-[#1A3A5C]">IPO Lifecycle Tracker</h2>
          <Button variant="primary" onClick={() => navigate("/file-drhp")}>+ File New DRHP</Button>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">Loading stocks...</p>
        ) : stocks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-5xl mb-3">🏢</p>
              <p className="text-gray-500">No stocks filed yet</p>
              <Button variant="primary" className="mt-4" onClick={() => navigate("/file-drhp")}>File Your First DRHP</Button>
            </CardContent>
          </Card>
        ) : (
          stocks.map((stock) => {
            const step = getLifecycleStep(stock.status);
            const { label, color } = ipoStatusLabel(stock.status);
            const live = liveData[stock.stock];

            return (
              <Card key={stock.stock}>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xl font-bold text-[#1A3A5C]">{stock.stock}</p>
                      <Badge variant={color as "green" | "amber" | "blue" | "red" | "gray"} className="mt-1">{label}</Badge>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => navigate("/manage-ipo")}>
                      Manage →
                    </Button>
                  </div>

                  {/* Lifecycle Steps */}
                  <div className="mt-4 flex items-center gap-1 overflow-x-auto text-xs pb-1">
                    {IPO_LIFECYCLE_STEPS.map((s, i) => (
                      <React.Fragment key={s}>
                        <span className={`px-2 py-1 rounded whitespace-nowrap ${
                          i < step ? "bg-[#C9A84C] text-[#0D1F33] font-semibold" :
                          i === step ? "bg-[#1A3A5C] text-white font-semibold ring-2 ring-[#C9A84C]" :
                          "bg-gray-100 text-gray-400"
                        }`}>
                          {i === step ? "⏳ " : i < step ? "✓ " : ""}{s}
                        </span>
                        {i < IPO_LIFECYCLE_STEPS.length - 1 && <span className="text-gray-300 flex-shrink-0">→</span>}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Live IPO Stats */}
                  {stock.status === "bidding" && live && (
                    <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                      <div className="bg-[#EAF0F8] rounded p-2">
                        <p className="text-xs text-gray-500">Subscription Rate</p>
                        <p className="font-bold">{((live.subscriptionRate || 0) * 100).toFixed(1)}%</p>
                      </div>
                      <div className="bg-[#EAF0F8] rounded p-2">
                        <p className="text-xs text-gray-500">Total Bids</p>
                        <p className="font-bold">{live.totalBids?.toLocaleString() || "—"}</p>
                      </div>
                      <div className="bg-[#EAF0F8] rounded p-2">
                        <p className="text-xs text-gray-500">Bidding Ends</p>
                        <p className="font-mono text-xs">Block #{stock.biddingEndSlot}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CompanyDashboard;