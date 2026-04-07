/**
 * USER-04: Secondary Market — Buy / Sell / P2P Transfer
 */
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select } from "@/components/ui";
import { PasswordModal } from "@/components/modals/PasswordModal";
import { useAppStore } from "@/store";
import { getBalance, getRHPAll } from "@/lib/api";
import { paiseToCurrency } from "@/lib/utils";

type Tab = "buy" | "sell" | "transfer";

const SecondaryMarket: React.FC = () => {
  const { balancePaise, blockedPaise, keystore } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("buy");
  const [showModal, setShowModal] = useState(false);
  const [txFields, setTxFields] = useState<Record<string, unknown>>({});
  const [txSummary, setTxSummary] = useState<{ type: string; stock?: string; amount?: number; extra?: string }>({ type: "" });
  const [knownStocks, setKnownStocks] = useState<string[]>([]);

  // Dynamically discover listed/active stocks from the chain
  useEffect(() => {
    getRHPAll()
      .then((res) => {
        const active = (res.rhps || [])
          .filter((r) => ["bidding", "allocating", "completed"].includes(r.status))
          .map((r) => r.stock);
        if (active.length > 0) {
          setKnownStocks(active);
          // Auto-select first stock for each tab
          setBuyStock((prev) => prev || active[0]);
          setSellStock((prev) => prev || active[0]);
          setTransferStock((prev) => prev || active[0]);
        }
      })
      .catch(() => {/* silently fail, UI still usable with empty list */});
  }, []);

  // Buy tab
  const [buyStock, setBuyStock] = useState("");
  const [buyShares, setBuyShares] = useState("");
  const [buyMaxPrice, setBuyMaxPrice] = useState("");

  // Sell tab
  const [sellStock, setSellStock] = useState("");
  const [sellShares, setSellShares] = useState("");
  const [sellPrice, setSellPrice] = useState("");

  // Transfer tab
  const [transferTo, setTransferTo] = useState("");
  const [transferStock, setTransferStock] = useState("");
  const [transferShares, setTransferShares] = useState("");
  const [toValid, setToValid] = useState<boolean | null>(null);

  const available = balancePaise - blockedPaise;
  const stockOptions = knownStocks.map((s) => ({ value: s, label: s }));

  const validateTransferAddress = async (addr: string) => {
    setTransferTo(addr);
    if (addr.length === 64) {
      try { await getBalance(addr); setToValid(true); } catch { setToValid(false); }
    } else {
      setToValid(null);
    }
  };

  const submitBuy = () => {
    const pricePaise = Math.round(parseFloat(buyMaxPrice || "0") * 100);
    const shares = parseInt(buyShares || "0");
    setTxFields({ type: "tnx_buy_stock", stock: buyStock, shares, pricePaise });
    setTxSummary({ type: "Buy Stock", stock: buyStock, amount: pricePaise * shares, extra: `${shares} shares @ max ₹${buyMaxPrice}` });
    setShowModal(true);
  };

  const submitSell = () => {
    const pricePaise = Math.round(parseFloat(sellPrice || "0") * 100);
    const shares = parseInt(sellShares || "0");
    setTxFields({ type: "tnx_sell_stock", stock: sellStock, shares, pricePaise });
    setTxSummary({ type: "Sell Stock", stock: sellStock, extra: `${shares} shares @ ₹${sellPrice}` });
    setShowModal(true);
  };

  const submitTransfer = () => {
    const shares = parseInt(transferShares || "0");
    setTxFields({ type: "tnx_transfer_stock", to: transferTo, stock: transferStock, shares });
    setTxSummary({ type: "Transfer Stock", stock: transferStock, extra: `${shares} shares to ${transferTo.slice(0, 12)}…` });
    setShowModal(true);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "buy", label: "Buy" },
    { id: "sell", label: "Sell" },
    { id: "transfer", label: "P2P Transfer" },
  ];

  return (
    <div className="max-w-xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Secondary Market</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === t.id
                    ? "text-[#1A3A5C] border-b-2 border-[#C9A84C]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4">
            {/* Buy Tab */}
            {activeTab === "buy" && (
              <>
                <div className="bg-[#EAF0F8] rounded p-3 flex justify-between text-sm">
                  <span className="text-gray-600">Available Balance</span>
                  <span className="font-bold">{paiseToCurrency(available)}</span>
                </div>
                <Select
                  label="Stock Symbol"
                  value={buyStock}
                  options={stockOptions}
                  onChange={(e) => setBuyStock(e.target.value)}
                />
                <Input
                  label="Number of Shares"
                  type="number"
                  min="1"
                  value={buyShares}
                  onChange={(e) => setBuyShares(e.target.value)}
                  placeholder="e.g. 100"
                />
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Max Price per Share (₹)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                    <input
                      type="number"
                      className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]"
                      value={buyMaxPrice}
                      onChange={(e) => setBuyMaxPrice(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                {buyShares && buyMaxPrice && (
                  <div className="bg-[#EAF0F8] rounded p-3 flex justify-between text-sm">
                    <span className="text-gray-600">Max Total Spend</span>
                    <span className="font-bold">{paiseToCurrency(parseInt(buyShares || "0") * Math.round(parseFloat(buyMaxPrice) * 100))}</span>
                  </div>
                )}
                <Button variant="primary" className="w-full" disabled={!buyStock || !buyShares || !buyMaxPrice} onClick={submitBuy}>
                  Place Buy Order
                </Button>
              </>
            )}

            {/* Sell Tab */}
            {activeTab === "sell" && (
              <>
                <Select
                  label="Stock Symbol"
                  value={sellStock}
                  options={stockOptions}
                  onChange={(e) => setSellStock(e.target.value)}
                />
                <Input
                  label="Number of Shares to Sell"
                  type="number"
                  min="1"
                  value={sellShares}
                  onChange={(e) => setSellShares(e.target.value)}
                  placeholder="e.g. 50"
                />
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Asking Price per Share (₹)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                    <input
                      type="number"
                      className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]"
                      value={sellPrice}
                      onChange={(e) => setSellPrice(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                {sellShares && sellPrice && (
                  <div className="bg-[#EAF0F8] rounded p-3 flex justify-between text-sm">
                    <span className="text-gray-600">Estimated Proceeds</span>
                    <span className="font-bold text-green-700">{paiseToCurrency(parseInt(sellShares) * Math.round(parseFloat(sellPrice) * 100))}</span>
                  </div>
                )}
                <Button variant="primary" className="w-full" disabled={!sellStock || !sellShares || !sellPrice} onClick={submitSell}>
                  Place Sell Order
                </Button>
              </>
            )}

            {/* P2P Transfer Tab */}
            {activeTab === "transfer" && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Recipient Address</label>
                  <input
                    className={`w-full px-3 py-2 border rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C] ${
                      toValid === false ? "border-red-500" : toValid === true ? "border-green-500" : "border-gray-300"
                    }`}
                    value={transferTo}
                    onChange={(e) => validateTransferAddress(e.target.value.trim())}
                    placeholder="64-character hex address..."
                    maxLength={64}
                  />
                  {toValid === true && <p className="text-xs text-green-600 mt-1">✓ Address verified</p>}
                  {toValid === false && <p className="text-xs text-red-600 mt-1">Address not found on chain</p>}
                </div>
                <Select
                  label="Stock Symbol"
                  value={transferStock}
                  options={stockOptions}
                  onChange={(e) => setTransferStock(e.target.value)}
                />
                <Input
                  label="Number of Shares"
                  type="number"
                  min="1"
                  value={transferShares}
                  onChange={(e) => setTransferShares(e.target.value)}
                  placeholder="e.g. 25"
                />
                <Button
                  variant="primary"
                  className="w-full"
                  disabled={!toValid || !transferStock || !transferShares}
                  onClick={submitTransfer}
                >
                  Transfer
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <PasswordModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => setShowModal(false)}
        txFields={txFields}
        summary={txSummary}
      />
    </div>
  );
};

export default SecondaryMarket;