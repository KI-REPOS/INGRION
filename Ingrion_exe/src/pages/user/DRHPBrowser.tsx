/**
 * USER-06: DRHP/RHP Browser & Document Verifier (shared across all roles)
 */
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Skeleton, Table, Th, Td, Tr } from "@/components/ui";
import { DocumentHashTool } from "@/components/modals/DocumentHashTool";
import { getRHPAll } from "@/lib/api";
import { ipoStatusLabel } from "@/lib/utils";
import type { RHPStatus } from "@/types";

const DRHPBrowser: React.FC = () => {
  const [stocks, setStocks] = useState<RHPStatus[]>([]);
  const [selected, setSelected] = useState<RHPStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHashTool, setShowHashTool] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Dynamically discover all RHPs from the node (no hardcoded stock list)
        const res = await getRHPAll();
        setStocks(res.rhps || []);
      } catch (e) {
        console.error("[DRHPBrowser] failed to load RHPs:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = stocks.filter((s) => {
    if (filterStatus && s.status !== filterStatus) return false;
    if (searchQuery && !s.stock.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Filters */}
      <Card>
        <CardContent className="py-4 flex gap-3 items-center flex-wrap">
          <input
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C] w-64"
            placeholder="Search by stock symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="bidding">Bidding</option>
            <option value="allocating">Allocating</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
          </select>
        </CardContent>
      </Card>

      <div className="grid grid-cols-5 gap-5">
        {/* List */}
        <div className="col-span-2">
          <Card>
            <CardHeader><CardTitle>All Stocks</CardTitle></CardHeader>
            {loading ? (
              <CardContent className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded" />)}
              </CardContent>
            ) : (
              <div className="overflow-auto max-h-[60vh]">
                <Table>
                  <thead>
                    <tr>
                      <Th>Stock</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => {
                      const { label, color } = ipoStatusLabel(s.status);
                      return (
                        <Tr
                          key={s.stock}
                          onClick={() => setSelected(s)}
                          className={`cursor-pointer ${selected?.stock === s.stock ? "bg-[#EAF0F8]" : ""}`}
                        >
                          <Td className="font-mono font-bold">{s.stock}</Td>
                          <Td><Badge variant={color as "green" | "amber" | "blue" | "red" | "gray"}>{label}</Badge></Td>
                        </Tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <Tr><Td colSpan={2} className="text-center text-gray-400">No stocks found</Td></Tr>
                    )}
                  </tbody>
                </Table>
              </div>
            )}
          </Card>
        </div>

        {/* Detail */}
        <div className="col-span-3">
          {selected ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{selected.stock}</CardTitle>
                    <Badge variant={ipoStatusLabel(selected.status).color as "green" | "amber" | "blue" | "red" | "gray"}>
                      {ipoStatusLabel(selected.status).label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* IPO Lifecycle Steps */}
                  <div className="flex items-center gap-1 mb-4 text-xs overflow-x-auto">
                    {["DRHP", "RHP", "Pending", "Bidding", "Allocating", "Completed"].map((step, i) => (
                      <React.Fragment key={step}>
                        <span className={`px-2 py-1 rounded ${
                          i <= ["pending", "bidding", "allocating", "completed"].indexOf(selected.status)
                            ? "bg-[#C9A84C] text-[#0D1F33] font-semibold"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          {step}
                        </span>
                        {i < 5 && <span className="text-gray-300">→</span>}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* RHP Details */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Company Address</p>
                      <code className="text-xs font-mono text-[#1A3A5C]">{(selected.companyAddress || selected.companyAddress)?.slice(0, 16)}…</code>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Shares</p>
                      <p className="font-bold">{selected.totalShares?.toLocaleString() || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Price Band</p>
                      <p className="font-bold">₹{((selected.priceBandLower || 0) / 100).toFixed(2)} – ₹{((selected.priceBandUpper || 0) / 100).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Face Value</p>
                      <p className="font-bold">₹{((selected.faceValue || 0) / 100).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Bidding Window</p>
                      <p className="font-mono text-xs">Block #{selected.biddingStartSlot} – #{selected.biddingEndSlot}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Retail Lot Size</p>
                      <p className="font-bold">{selected.retailLotSize || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Category Quotas</p>
                      <p className="text-xs">QIB {selected.qibPct}% | NIB {selected.nibPct}% | Retail {selected.retailPct}%</p>
                    </div>
                  </div>

                  {/* Hashes */}
                  <div className="mt-4 space-y-2">
                    <div>
                      <p className="text-xs text-gray-500">DRHP Hash</p>
                      <code className="text-xs font-mono text-[#C9A84C] break-all">{selected.drhpHash || "Not available"}</code>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">RHP Hash</p>
                      <code className="text-xs font-mono text-[#C9A84C] break-all">{selected.rhpHash || "Not available"}</code>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Document Verify Panel */}
              <Card>
                <CardHeader><CardTitle>Verify Document</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4">
                    Upload the original prospectus file to verify its integrity against the on-chain hash.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setShowHashTool(true)}
                  >
                    🔍 Open Document Verifier
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center text-gray-400">
                <p className="text-4xl mb-3">📄</p>
                <p>Select a stock from the list to view its DRHP/RHP details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <DocumentHashTool
        isOpen={showHashTool}
        onClose={() => setShowHashTool(false)}
        preloadedExpectedHash={selected?.drhpHash || selected?.rhpHash}
      />
    </div>
  );
};

export default DRHPBrowser;