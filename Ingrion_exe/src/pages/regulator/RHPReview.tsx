/**
 * REG-03: RHP Review Queue
 */
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Spinner, Input, Table, Th, Td, Tr } from "@/components/ui";
import { PasswordModal } from "@/components/modals/PasswordModal";
import { getDRHPPending } from "@/lib/api";
import { hashFile } from "@/lib/crypto";

interface PendingDRHP {
  stock: string;
  companyAddr: string;
  payload: string;       // raw JSON string from chain
  parsedPayload: {       // parsed for display
    companyName?: string;
    sector?: string;
    description?: string;
    documentHash?: string;
    fileName?: string;
    [key: string]: string | undefined;
  };
  rhpStatus: string;
  rejected: boolean;
}

const RHPReview: React.FC = () => {
  const [pending, setPending] = useState<PendingDRHP[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PendingDRHP | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [txFields, setTxFields] = useState<Record<string, unknown>>({});
  const [txSummary, setTxSummary] = useState({ type: "", stock: "", extra: "" });
  const [rhpForm, setRhpForm] = useState({
    totalShares: "", priceBandLower: "", priceBandUpper: "", biddingWindowBlocks: "",
    faceValue: "", qibPct: "40", nibPct: "30", retailPct: "30",
    retailLotSize: "10", minRetailBid: "10", maxRetailBid: "500",
  });
  const [analysisFile, setAnalysisFile] = useState<File | null>(null);
  const [analysisHash, setAnalysisHash] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [activeAction, setActiveAction] = useState<"rhp" | "reject" | null>(null);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const result = await getDRHPPending();
      const drhps: PendingDRHP[] = (result.drhps || []).map((d) => {
        let parsedPayload: PendingDRHP["parsedPayload"] = {};
        try { parsedPayload = JSON.parse(d.payload); } catch { /* raw string */ }
        return { ...d, parsedPayload };
      });
      setPending(drhps);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadQueue(); }, []);

  const handleAnalysisFile = async (file: File) => {
    setAnalysisFile(file);
    const hash = await hashFile(file);
    setAnalysisHash(hash);
  };

  const submitRHP = () => {
    // Go's processUploadRHP parses meta["payload"] as json.Unmarshal into RHPMetadata struct.
    // Field names must match Go JSON tags exactly:
    //   totalShares, priceBandLower, priceBandUpper, biddingWindowBlocks, faceValue,
    //   qibPercentage, nibPercentage, retailPercentage, retailLotSize,
    //   minRetailBid, maxRetailBid, companyAddr
    const rhpPayload = {
      stock: selected?.stock || "",
      totalShares: parseInt(rhpForm.totalShares),
      priceBandLower: Math.round(parseFloat(rhpForm.priceBandLower) * 100),
      priceBandUpper: Math.round(parseFloat(rhpForm.priceBandUpper) * 100),
      biddingWindowBlocks: parseInt(rhpForm.biddingWindowBlocks),
      faceValue: Math.round(parseFloat(rhpForm.faceValue) * 100),
      qibPercentage: parseInt(rhpForm.qibPct),
      nibPercentage: parseInt(rhpForm.nibPct),
      retailPercentage: parseInt(rhpForm.retailPct),
      retailLotSize: parseInt(rhpForm.retailLotSize),
      minRetailBid: parseInt(rhpForm.minRetailBid),
      maxRetailBid: parseInt(rhpForm.maxRetailBid),
      companyAddr: selected?.companyAddr || "",
      status: "pending",
      ...(analysisHash ? { analysisReportHash: analysisHash } : {}),
    };
    const meta: Record<string, string> = {
      payload: JSON.stringify(rhpPayload),
    };
    setTxFields({ type: "tnx_upload_rhp", stock: selected?.stock, meta });
    setTxSummary({ type: "Upload RHP", stock: selected?.stock || "", extra: `${rhpForm.totalShares} shares, ₹${rhpForm.priceBandLower}–₹${rhpForm.priceBandUpper}` });
    setShowModal(true);
  };

  const submitReject = () => {
    setTxFields({ type: "tnx_reject_drhp", stock: selected?.stock, reason: rejectReason });
    setTxSummary({ type: "Reject DRHP", stock: selected?.stock || "", extra: rejectReason });
    setShowModal(true);
  };

  return (
    <div className="grid grid-cols-5 gap-5">
      {/* Queue List */}
      <div className="col-span-2">
        <Card>
          <CardHeader><CardTitle>Pending RHPs ({pending.length})</CardTitle></CardHeader>
          {loading ? (
            <CardContent className="flex justify-center py-8"><Spinner /></CardContent>
          ) : pending.length === 0 ? (
            <CardContent className="py-8 text-center text-gray-400">No pending DRHPs</CardContent>
          ) : (
            <div className="divide-y">
              {pending.map((p) => (
                <div
                  key={p.stock}
                  className={`px-5 py-4 cursor-pointer hover:bg-[#EAF0F8] transition-colors ${selected?.stock === p.stock ? "bg-[#EAF0F8]" : ""}`}
                  onClick={() => { setSelected(p); setActiveAction(null); }}
                >
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-[#1A3A5C]">{p.stock}</p>
                    {p.rejected
                      ? <Badge variant="red">Rejected</Badge>
                      : p.rhpStatus === "pending"
                      ? <Badge variant="blue">RHP Uploaded</Badge>
                      : <Badge variant="amber">Awaiting RHP</Badge>
                    }
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">{p.parsedPayload.companyName || "—"}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{p.companyAddr?.slice(0, 20)}…</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Review Form */}
      <div className="col-span-3">
        {selected ? (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Review: {selected.stock}</CardTitle>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActiveAction("rhp")}
                      className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${activeAction === "rhp" ? "bg-[#1A3A5C] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                    >Upload RHP</button>
                    <button
                      onClick={() => setActiveAction("reject")}
                      className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${activeAction === "reject" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                    >Reject</button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* DRHP Content */}
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-2">DRHP Details</p>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                    {selected.parsedPayload.companyName && (
                      <div className="flex justify-between"><span className="text-gray-500">Company</span><span className="font-semibold">{selected.parsedPayload.companyName}</span></div>
                    )}
                    {selected.parsedPayload.sector && (
                      <div className="flex justify-between"><span className="text-gray-500">Sector</span><span>{selected.parsedPayload.sector}</span></div>
                    )}
                    {selected.parsedPayload.description && (
                      <div><span className="text-gray-500 text-xs block mb-1">Description</span><p className="text-xs text-gray-700">{selected.parsedPayload.description}</p></div>
                    )}
                    {selected.parsedPayload.documentHash && (
                      <div><span className="text-gray-500 text-xs block mb-1">Document Hash</span><code className="text-xs font-mono text-[#C9A84C] break-all">{selected.parsedPayload.documentHash}</code></div>
                    )}
                    {selected.parsedPayload.fileName && (
                      <div className="flex justify-between"><span className="text-gray-500">File</span><span className="text-xs font-mono">{selected.parsedPayload.fileName}</span></div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-gray-200"><span className="text-gray-500">Company Address</span><code className="text-xs font-mono">{selected.companyAddr?.slice(0, 16)}…</code></div>
                  </div>
                  {selected.rejected && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-medium">⚠ This DRHP has been rejected</div>
                  )}
                </div>

                {/* RHP Upload Form */}
                {activeAction === "rhp" && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Total Shares" type="number" value={rhpForm.totalShares} onChange={(e) => setRhpForm((f) => ({ ...f, totalShares: e.target.value }))} placeholder="e.g. 100000" />
                      <Input label="Face Value (₹)" type="number" step="0.01" value={rhpForm.faceValue} onChange={(e) => setRhpForm((f) => ({ ...f, faceValue: e.target.value }))} placeholder="e.g. 10" />
                      <Input label="Price Band Lower (₹)" type="number" step="0.01" value={rhpForm.priceBandLower} onChange={(e) => setRhpForm((f) => ({ ...f, priceBandLower: e.target.value }))} placeholder="e.g. 10" />
                      <Input label="Price Band Upper (₹)" type="number" step="0.01" value={rhpForm.priceBandUpper} onChange={(e) => setRhpForm((f) => ({ ...f, priceBandUpper: e.target.value }))} placeholder="e.g. 20" />
                      <Input label="Bidding Window (blocks)" type="number" value={rhpForm.biddingWindowBlocks} onChange={(e) => setRhpForm((f) => ({ ...f, biddingWindowBlocks: e.target.value }))} placeholder="e.g. 30" />
                      <Input label="Retail Lot Size" type="number" value={rhpForm.retailLotSize} onChange={(e) => setRhpForm((f) => ({ ...f, retailLotSize: e.target.value }))} placeholder="10" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Input label="QIB %" type="number" value={rhpForm.qibPct} onChange={(e) => setRhpForm((f) => ({ ...f, qibPct: e.target.value }))} />
                      <Input label="NIB %" type="number" value={rhpForm.nibPct} onChange={(e) => setRhpForm((f) => ({ ...f, nibPct: e.target.value }))} />
                      <Input label="Retail %" type="number" value={rhpForm.retailPct} onChange={(e) => setRhpForm((f) => ({ ...f, retailPct: e.target.value }))} />
                    </div>
                    {/* Analysis Report */}
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">Analysis Report (PDF)</label>
                      <div
                        className="border-2 border-dashed border-gray-300 rounded p-3 text-center cursor-pointer hover:border-[#C9A84C]"
                        onClick={() => document.getElementById("analysis-file-input")?.click()}
                      >
                        <input id="analysis-file-input" type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAnalysisFile(f); }} />
                        {analysisFile ? <p className="text-xs text-green-700">✓ {analysisFile.name}</p> : <p className="text-xs text-gray-500">Click to select PDF</p>}
                      </div>
                      {analysisHash && <p className="text-xs font-mono text-gray-400 mt-1 break-all">{analysisHash.slice(0, 40)}…</p>}
                    </div>
                    <Button variant="primary" className="w-full" onClick={submitRHP}>
                      Upload RHP to Chain
                    </Button>
                  </div>
                )}

                {/* Reject Form */}
                {activeAction === "reject" && (
                  <div className="space-y-3 animate-fade-in">
                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">Rejection Reason</label>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none resize-none"
                        rows={3}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Explain why this DRHP is being rejected..."
                      />
                    </div>
                    <Button variant="danger" className="w-full" disabled={!rejectReason} onClick={submitReject}>
                      Reject DRHP
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-gray-400">
              <p className="text-4xl mb-3">📋</p>
              <p>Select a pending RHP from the queue to review</p>
            </CardContent>
          </Card>
        )}
      </div>

      <PasswordModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          setShowModal(false);
          setSelected(null);
          setActiveAction(null);
          loadQueue();
        }}
        txFields={txFields}
        summary={txSummary}
      />
    </div>
  );
};

export default RHPReview;