/**
 * Password Prompt Modal
 * Used for every transaction - decrypts key, builds, signs, submits.
 */
import React, { useState } from "react";
import { Button, Input, Spinner } from "@/components/ui";
import { decryptKey } from "@/lib/crypto";
import { signTransaction } from "@/lib/crypto";
import { submitTx } from "@/lib/api";
import { useAppStore } from "@/store";
import { paiseToCurrency, formatAddress } from "@/lib/utils";

interface TxSummary {
  type: string;
  to?: string;
  amount?: number;
  stock?: string;
  extra?: string;
}

interface PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (txHash: string) => void;
  txFields: Record<string, unknown>;
  summary: TxSummary;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({
  isOpen, onClose, onSuccess, txFields, summary
}) => {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "signing" | "broadcasting" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const keystore = useAppStore((s) => s.keystore);

  const handleSubmit = async () => {
    if (!keystore || !password) return;
    setState("signing");
    setError("");

    try {
      // Decrypt private key
      const seedHex = await decryptKey(
        keystore.encrypted_key,
        keystore.salt,
        keystore.iv,
        password,
        keystore.pbkdf2_iterations
      );

      setState("broadcasting");

      // Get current nonce
      const { getBalance } = await import("@/lib/api");
      const account = await getBalance(keystore.address);
      const nonce = account.nonce + 1;

      // Build signed transaction
      const signed = await signTransaction(
        { ...txFields, from: keystore.address, nonce, timestamp: Math.floor(Date.now() / 1000) },
        seedHex
      );

      // Submit
      const result = await submitTx(signed);

      if (result.txHash) {
        setTxHash(result.txHash);
        setState("success");
        onSuccess(result.txHash);
      } else if (result.status?.toLowerCase().includes("accepted")) {
        setTxHash(result.txHash || "pending");
        setState("success");
        onSuccess(result.txHash || "");
      } else {
        throw new Error(result.error || "Transaction rejected");
      }
    } catch (err) {
      setError((err as Error).message || "Transaction failed");
      setState("error");
    } finally {
      // Wipe password from memory
      setPassword("");
    }
  };

  const handleClose = () => {
    setState("idle");
    setPassword("");
    setError("");
    setTxHash("");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 animate-fade-in">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-[#1A3A5C]">Confirm Transaction</h2>
          <p className="text-sm text-gray-500">Enter your password to sign and submit</p>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {/* Transaction Summary */}
          <div className="bg-[#EAF0F8] rounded-lg p-4 mb-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Type</span>
              <span className="font-semibold">{summary.type}</span>
            </div>
            {summary.to && (
              <div className="flex justify-between">
                <span className="text-gray-500">To</span>
                <span className="font-mono text-xs">{formatAddress(summary.to)}</span>
              </div>
            )}
            {summary.amount !== undefined && summary.amount > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-semibold text-[#1A3A5C]">{paiseToCurrency(summary.amount)}</span>
              </div>
            )}
            {summary.stock && (
              <div className="flex justify-between">
                <span className="text-gray-500">Stock</span>
                <span className="font-semibold">{summary.stock}</span>
              </div>
            )}
            {summary.extra && (
              <div className="flex justify-between">
                <span className="text-gray-500">Details</span>
                <span className="text-right max-w-48 text-xs">{summary.extra}</span>
              </div>
            )}
          </div>

          {/* Password input (idle/error states) */}
          {(state === "idle" || state === "error") && (
            <>
              <Input
                label="Encryption Password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                error={state === "error" ? error : undefined}
                autoFocus
              />
              {state === "error" && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </>
          )}

          {/* Signing/Broadcasting state */}
          {(state === "signing" || state === "broadcasting") && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Spinner size="lg" />
              <p className="text-sm text-gray-600">
                {state === "signing" ? "Signing transaction..." : "Broadcasting to network..."}
              </p>
            </div>
          )}

          {/* Success state */}
          {state === "success" && (
            <div className="flex flex-col items-center py-4 gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-2xl">✓</div>
              <p className="font-semibold text-green-700">Transaction Submitted!</p>
              {txHash && txHash !== "pending" && (
                <div className="w-full bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-500 mb-1">Transaction Hash</p>
                  <p
                    className="font-mono text-xs text-[#1A3A5C] cursor-pointer hover:text-[#C9A84C] break-all"
                    onClick={() => navigator.clipboard.writeText(txHash)}
                    title="Click to copy"
                  >
                    {txHash}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          {(state === "idle" || state === "error") && (
            <>
              <Button variant="secondary" onClick={handleClose}>Cancel</Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={!password}
              >
                Confirm & Sign
              </Button>
            </>
          )}
          {state === "success" && (
            <Button variant="primary" onClick={handleClose}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PasswordModal;
