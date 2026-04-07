/**
 * COM-02: DRHP Filing
 */
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Input } from "@/components/ui";
import { PasswordModal } from "@/components/modals/PasswordModal";
import { hashFile } from "@/lib/crypto";

const FileDRHP: React.FC = () => {
  const [stockSymbol, setStockSymbol] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");
  const [description, setDescription] = useState("");
  const [bizFile, setBizFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState("");
  const [isHashing, setIsHashing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [success, setSuccess] = useState("");

  const handleFile = async (file: File) => {
    setBizFile(file);
    setIsHashing(true);
    const hash = await hashFile(file);
    setFileHash(hash);
    setIsHashing(false);
  };

  const meta: Record<string, string> = {
    // Go's processUploadDRHP reads meta["payload"] as a raw string and stores it.
    // All DRHP data must be serialized into this single "payload" key.
    payload: JSON.stringify({
      companyName,
      sector,
      description,
      ...(fileHash ? { documentHash: fileHash, fileName: bizFile?.name || "" } : {}),
    }),
  };

  const previewJSON = JSON.stringify({ type: "tnx_upload_drhp", stock: stockSymbol, meta }, null, 2);

  const txFields = {
    type: "tnx_upload_drhp",
    stock: stockSymbol,
    meta,
  };

  const canSubmit = stockSymbol.length >= 3 && companyName && bizFile;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Card>
        <CardHeader><CardTitle>File DRHP — Draft Red Herring Prospectus</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <Input
            label="Stock Symbol"
            value={stockSymbol}
            onChange={(e) => setStockSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="e.g. INGRION01"
            hint="Alphanumeric only, used as the on-chain stock identifier"
          />
          <Input
            label="Company Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Legal entity name..."
          />
          <Input
            label="Sector / Industry"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            placeholder="e.g. Technology, Finance..."
          />
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Brief Description</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none resize-none"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the company and IPO purpose..."
            />
          </div>

          {/* Business Plan Upload */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Business Plan Document (PDF or JSON)</label>
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-[#C9A84C] transition-colors"
              onClick={() => document.getElementById("drhp-file")?.click()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onDragOver={(e) => e.preventDefault()}
            >
              <input id="drhp-file" type="file" accept=".pdf,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {isHashing ? <p className="text-sm text-gray-500">Computing SHA-256...</p> :
                bizFile ? (
                  <div>
                    <p className="text-sm font-semibold text-green-700">✓ {bizFile.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{(bizFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-3xl mb-2">📄</p>
                    <p className="text-sm font-semibold text-gray-700">Drop PDF or JSON here</p>
                    <p className="text-xs text-gray-400 mt-1">SHA-256 hash computed locally — file content embedded in meta</p>
                  </div>
                )
              }
            </div>
            {fileHash && (
              <div className="mt-2 p-3 bg-[#EAF0F8] rounded-lg">
                <p className="text-xs text-gray-500">Document Hash (SHA-256)</p>
                <code className="text-xs font-mono text-[#1A3A5C] break-all">{fileHash}</code>
              </div>
            )}
          </div>

          {/* Preview JSON */}
          {stockSymbol && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Preview Transaction Meta</p>
              <pre className="bg-gray-50 rounded p-3 text-xs font-mono overflow-x-auto text-gray-700 max-h-32">
                {previewJSON}
              </pre>
            </div>
          )}

          <Button
            variant="primary"
            className="w-full"
            disabled={!canSubmit}
            onClick={() => setShowModal(true)}
          >
            Submit DRHP to Chain
          </Button>

          {success && (
            <div className="bg-green-50 border border-green-200 rounded p-3 text-center">
              <p className="text-sm font-semibold text-green-700">DRHP Submitted! Tx: {success.slice(0, 20)}…</p>
              <p className="text-xs text-gray-500 mt-1">Awaiting regulator review</p>
            </div>
          )}
        </CardContent>
      </Card>

      <PasswordModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={(hash) => { setSuccess(hash); setShowModal(false); }}
        txFields={txFields}
        summary={{ type: "Upload DRHP", stock: stockSymbol, extra: `${companyName} — ${sector}` }}
      />
    </div>
  );
};

export default FileDRHP;