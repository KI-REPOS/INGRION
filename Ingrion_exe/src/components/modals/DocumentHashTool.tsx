/**
 * Document Hash Tool Modal (COMMON-01)
 * SHA-256 hashing and verification of PDF/JSON files
 */
import React, { useState } from "react";
import { Button, Badge } from "@/components/ui";
import { hashFile } from "@/lib/crypto";
import { insertHashHistory, getHashHistory } from "@/lib/db";
import { generateId, formatDateTime } from "@/lib/utils";
import type { HashHistoryEntry } from "@/types";

interface DocumentHashToolProps {
  isOpen: boolean;
  onClose: () => void;
  onHashGenerated?: (hash: string) => void;
  preloadedExpectedHash?: string; // for verification mode
}

export const DocumentHashTool: React.FC<DocumentHashToolProps> = ({
  isOpen, onClose, onHashGenerated, preloadedExpectedHash
}) => {
  const [activeTab, setActiveTab] = useState<"generate" | "verify">("generate");
  const [generateFile, setGenerateFile] = useState<File | null>(null);
  const [generatedHash, setGeneratedHash] = useState("");
  const [isHashing, setIsHashing] = useState(false);
  const [history, setHistory] = useState<HashHistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Verify tab
  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [expectedHash, setExpectedHash] = useState(preloadedExpectedHash || "");
  const [verifyResult, setVerifyResult] = useState<"match" | "mismatch" | null>(null);
  const [computedHash, setComputedHash] = useState("");

  const loadHistory = async () => {
    if (historyLoaded) return;
    const h = await getHashHistory();
    setHistory(h);
    setHistoryLoaded(true);
  };

  React.useEffect(() => {
    if (isOpen) loadHistory();
  }, [isOpen]);

  const handleGenerate = async (file: File) => {
    setGenerateFile(file);
    setIsHashing(true);
    setGeneratedHash("");
    try {
      const hash = await hashFile(file);
      setGeneratedHash(hash);
      onHashGenerated?.(hash);

      const entry: HashHistoryEntry = {
        id: generateId(),
        fileName: file.name,
        fileHash: hash,
        timestamp: Math.floor(Date.now() / 1000),
        fileType: file.name.endsWith(".json") ? "json" : "pdf",
      };
      await insertHashHistory(entry);
      setHistory((prev) => [entry, ...prev].slice(0, 10));
    } catch (e) {
      console.error("Hash failed:", e);
    } finally {
      setIsHashing(false);
    }
  };

  const handleVerify = async () => {
    if (!verifyFile || !expectedHash) return;
    setIsHashing(true);
    try {
      const hash = await hashFile(verifyFile);
      setComputedHash(hash);
      setVerifyResult(hash.toLowerCase() === expectedHash.toLowerCase() ? "match" : "mismatch");
    } catch {
      setVerifyResult("mismatch");
    } finally {
      setIsHashing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 animate-fade-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-[#1A3A5C]">Document Hash Tool</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 flex gap-1 border-b border-gray-100">
          {(["generate", "verify"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                activeTab === tab
                  ? "text-[#1A3A5C] border-b-2 border-[#C9A84C]"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "generate" ? "Generate Hash" : "Verify Hash"}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === "generate" && (
            <div className="space-y-5">
              {/* File Drop Zone */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-[#C9A84C] transition-colors"
                onClick={() => document.getElementById("hash-file-input")?.click()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleGenerate(f); }}
                onDragOver={(e) => e.preventDefault()}
              >
                <input
                  id="hash-file-input"
                  type="file"
                  accept=".pdf,.json"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleGenerate(f); }}
                />
                <div className="text-4xl mb-3">📄</div>
                <p className="font-semibold text-gray-700">Drop PDF or JSON here</p>
                <p className="text-sm text-gray-500 mt-1">Max 50MB • SHA-256 computed in browser</p>
              </div>

              {isHashing && (
                <div className="flex items-center gap-3 text-gray-600">
                  <svg className="animate-spin h-5 w-5 text-[#C9A84C]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span className="text-sm">Computing SHA-256...</span>
                </div>
              )}

              {generatedHash && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-700 uppercase tracking-wide">SHA-256 Hash</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-[#EAF0F8] text-[#1A3A5C] p-3 rounded-lg font-mono text-sm break-all">
                      {generatedHash}
                    </code>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(generatedHash)}
                    >
                      Copy
                    </Button>
                  </div>
                  {generateFile && (
                    <p className="text-xs text-gray-500">{generateFile.name} • {(generateFile.size / 1024).toFixed(1)} KB</p>
                  )}
                </div>
              )}

              {/* History */}
              {history.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Recent Hashes</p>
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div key={h.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                        <div>
                          <p className="text-xs font-medium text-gray-700">{h.fileName}</p>
                          <code className="text-xs text-gray-400 font-mono">{h.fileHash.slice(0, 24)}...</code>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{formatDateTime(h.timestamp)}</span>
                          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(h.fileHash)}>Copy</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "verify" && (
            <div className="space-y-5">
              {/* File to verify */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-[#C9A84C] transition-colors"
                onClick={() => document.getElementById("verify-file-input")?.click()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setVerifyFile(f); }}
                onDragOver={(e) => e.preventDefault()}
              >
                <input
                  id="verify-file-input"
                  type="file"
                  accept=".pdf,.json"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setVerifyFile(f); setVerifyResult(null); } }}
                />
                {verifyFile ? (
                  <p className="text-sm font-medium text-[#1A3A5C]">✓ {verifyFile.name}</p>
                ) : (
                  <>
                    <div className="text-3xl mb-2">🔍</div>
                    <p className="text-sm font-semibold text-gray-700">Select document to verify</p>
                  </>
                )}
              </div>

              {/* Expected hash input */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Expected Hash (SHA-256)</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]"
                  rows={2}
                  placeholder="Paste the expected SHA-256 hash here..."
                  value={expectedHash}
                  onChange={(e) => { setExpectedHash(e.target.value); setVerifyResult(null); }}
                />
              </div>

              <Button
                variant="primary"
                onClick={handleVerify}
                disabled={!verifyFile || !expectedHash}
                loading={isHashing}
              >
                Verify Document
              </Button>

              {/* Result */}
              {verifyResult && (
                <div className={`rounded-xl p-6 text-center ${verifyResult === "match" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                  <div className="text-5xl mb-3">{verifyResult === "match" ? "✅" : "❌"}</div>
                  <p className={`text-2xl font-bold ${verifyResult === "match" ? "text-green-700" : "text-red-700"}`}>
                    {verifyResult === "match" ? "MATCH ✓" : "MISMATCH ✗"}
                  </p>
                  <div className="mt-4 text-left space-y-2">
                    <div>
                      <p className="text-xs text-gray-500">Computed Hash</p>
                      <code className="text-xs font-mono break-all text-gray-700">{computedHash}</code>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Expected Hash</p>
                      <code className="text-xs font-mono break-all text-gray-700">{expectedHash}</code>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentHashTool;
