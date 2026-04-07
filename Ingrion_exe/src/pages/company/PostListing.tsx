/**
 * COM-04: Post-Listing Actions — Dividend, Corporate Action, New Contract
 */
import React, { useState } from "react";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Input, Textarea, Select, Badge
} from "@/components/ui";
import { useAppStore } from "@/store";
import { paiseToCurrency } from "@/lib/utils";
import PasswordModal from "@/components/modals/PasswordModal";

type ActionTab = "dividend" | "corporate" | "contract";

const PostListing: React.FC = () => {
  const { address } = useAppStore();
  const [tab, setTab] = useState<ActionTab>("dividend");

  // Dividend state
  const [divStock, setDivStock] = useState("");
  const [divPaise, setDivPaise] = useState("");
  const [divModal, setDivModal] = useState(false);

  // Corporate action state
  const [corpStock, setCorpStock] = useState("");
  const [corpAction, setCorpAction] = useState("stock_split");
  const [corpRatioNum, setCorpRatioNum] = useState("");
  const [corpRatioDen, setCorpRatioDen] = useState("");
  const [corpModal, setCorpModal] = useState(false);

  // Contract state
  const [contractTitle, setContractTitle] = useState("");
  const [contractHash, setContractHash] = useState("");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractModal, setContractModal] = useState(false);
  const [hashComputing, setHashComputing] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setContractFile(file);
    setHashComputing(true);
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    setContractHash(hex);
    setHashComputing(false);
  };

  const tabs: { key: ActionTab; label: string; icon: string }[] = [
    { key: "dividend", label: "Declare Dividend", icon: "💰" },
    { key: "corporate", label: "Corporate Action", icon: "🔄" },
    { key: "contract", label: "New Contract", icon: "📄" },
  ];

  const divTx = { type: "tnx_dividend", stock: divStock, amountPaise: parseInt(divPaise) || 0 };
  const corpTx = { type: "tnx_corporate_action", stock: corpStock, actionType: corpAction, ratio: `${corpRatioNum}:${corpRatioDen}` };
  const contractTx = { type: "tnx_new_contract", meta: { title: contractTitle, hash: contractHash } };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1A3A5C]">Post-Listing Actions</h1>
      <p className="text-sm text-gray-500">Submit on-chain events for your listed securities. All actions require cryptographic signing.</p>

      {/* Tab selector */}
      <div className="flex gap-3">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-all ${
              tab === t.key ? "bg-[#0D1F33] text-white border-[#0D1F33]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Dividend */}
      {tab === "dividend" && (
        <Card>
          <CardHeader><CardTitle>💰 Declare Dividend</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">Submit <code className="bg-gray-100 px-1 rounded">tnx_dividend</code> to declare a per-share dividend. The node will distribute INR to all current shareholders proportionally.</p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              ℹ️ Dividend amount is per share, in paise. The total INR distributed = dividend amount × total outstanding shares.
            </div>
            <Input label="Stock Symbol" value={divStock} onChange={e => setDivStock(e.target.value)} placeholder="e.g. INGRION01" />
            <Input label="Dividend Amount (paise per share)" type="number" value={divPaise} onChange={e => setDivPaise(e.target.value)} placeholder="e.g. 500 = ₹5.00 per share"
              hint={divPaise ? `= ${paiseToCurrency(parseInt(divPaise))} per share` : undefined} />
            <Button onClick={() => setDivModal(true)} disabled={!divStock || !divPaise || parseInt(divPaise) <= 0} className="w-full">Declare Dividend</Button>
          </CardContent>
        </Card>
      )}

      {/* Corporate Action */}
      {tab === "corporate" && (
        <Card>
          <CardHeader><CardTitle>🔄 Corporate Action</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">Submit <code className="bg-gray-100 px-1 rounded">tnx_corporate_action</code> to initiate structural changes such as stock splits, bonus issues, or rights offerings.</p>
            <Input label="Stock Symbol" value={corpStock} onChange={e => setCorpStock(e.target.value)} placeholder="e.g. INGRION01" />
            <Select label="Action Type" value={corpAction} onChange={e => setCorpAction(e.target.value)}
              options={[
                { value: "stock_split", label: "Stock Split" },
                { value: "bonus_issue", label: "Bonus Issue" },
                { value: "rights_issue", label: "Rights Issue" },
                { value: "buyback", label: "Share Buyback" },
                { value: "merger", label: "Merger / Amalgamation" },
              ]} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ratio (e.g. 2:1 for 2-for-1 split)</label>
              <div className="flex items-center gap-2">
                <Input value={corpRatioNum} onChange={e => setCorpRatioNum(e.target.value)} placeholder="2" className="flex-1" />
                <span className="text-gray-500 font-bold">:</span>
                <Input value={corpRatioDen} onChange={e => setCorpRatioDen(e.target.value)} placeholder="1" className="flex-1" />
              </div>
              {corpRatioNum && corpRatioDen && (
                <p className="text-xs text-gray-500 mt-1">Shareholders receive {corpRatioNum} new share(s) for every {corpRatioDen} held.</p>
              )}
            </div>
            <Button onClick={() => setCorpModal(true)} disabled={!corpStock || !corpRatioNum || !corpRatioDen} className="w-full">Submit Corporate Action</Button>
          </CardContent>
        </Card>
      )}

      {/* New Contract */}
      {tab === "contract" && (
        <Card>
          <CardHeader><CardTitle>📄 New Contract</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">Submit <code className="bg-gray-100 px-1 rounded">tnx_new_contract</code> to anchor a legal document hash on-chain. The regulator must approve it before it becomes binding.</p>
            <Input label="Contract Title" value={contractTitle} onChange={e => setContractTitle(e.target.value)} placeholder="e.g. Shareholder Agreement v2" />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contract Document (PDF/JSON)</label>
              <input type="file" accept=".pdf,.json" onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[#0D1F33] file:text-white hover:file:bg-[#1A3A5C]" />
              {contractFile && (
                <p className="text-xs text-gray-500 mt-1">{contractFile.name} ({(contractFile.size / 1024).toFixed(1)} KB)</p>
              )}
            </div>
            {hashComputing && <p className="text-xs text-blue-600">Computing SHA-256…</p>}
            <Input label="Document Hash (SHA-256)" value={contractHash} onChange={e => setContractHash(e.target.value)}
              hint="Auto-computed from uploaded file, or paste manually" readOnly={!!contractFile} />
            {contractHash && (
              <div className="bg-gray-50 rounded p-2">
                <p className="text-xs text-gray-500 mb-1">Hash to be anchored on-chain:</p>
                <p className="font-mono text-xs text-[#1A3A5C] break-all">{contractHash}</p>
              </div>
            )}
            <Button onClick={() => setContractModal(true)} disabled={!contractTitle || !contractHash} className="w-full">Submit Contract for Regulator Approval</Button>
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      {divModal && (
        <PasswordModal txFields={divTx}
          summary={{ type: "Declare Dividend", stock: divStock, extra: `${paiseToCurrency(parseInt(divPaise))} per share` }}
          onClose={() => setDivModal(false)} onSuccess={() => { setDivModal(false); setDivStock(""); setDivPaise(""); }} />
      )}
      {corpModal && (
        <PasswordModal txFields={corpTx}
          summary={{ type: "Corporate Action", stock: corpStock, extra: `${corpAction} @ ${corpRatioNum}:${corpRatioDen}` }}
          onClose={() => setCorpModal(false)} onSuccess={() => { setCorpModal(false); setCorpStock(""); }} />
      )}
      {contractModal && (
        <PasswordModal txFields={contractTx}
          summary={{ type: "New Contract", extra: contractTitle }}
          onClose={() => setContractModal(false)} onSuccess={() => { setContractModal(false); setContractTitle(""); setContractHash(""); setContractFile(null); }} />
      )}
    </div>
  );
};

export default PostListing;
