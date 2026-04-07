/**
 * REG-04: Account Enforcement — Freeze / Flag / Audit
 */
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Table, Th, Td, Tr, Address, Spinner } from "@/components/ui";
import { PasswordModal } from "@/components/modals/PasswordModal";
import { getFrozenAccounts, getAudit, getBalance } from "@/lib/api";
import { paiseToCurrency } from "@/lib/utils";
import type { FrozenAccount, AuditInfo } from "@/types";

const AccountEnforcement: React.FC = () => {
  const [frozenAccounts, setFrozenAccounts] = useState<FrozenAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchAddress, setSearchAddress] = useState("");
  const [auditInfo, setAuditInfo] = useState<AuditInfo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [txFields, setTxFields] = useState<Record<string, unknown>>({});
  const [txSummary, setTxSummary] = useState({ type: "", to: "", extra: "" });
  const [actionReason, setActionReason] = useState("");
  const [actionType, setActionType] = useState<"freeze" | "flag" | "unfreeze" | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await getFrozenAccounts();
        setFrozenAccounts(result.frozen || []);
      } finally { setLoading(false); }
    };
    load();
  }, []);

  const handleSearch = async () => {
    if (!searchAddress || searchAddress.length !== 64) return;
    setIsSearching(true);
    try {
      const audit = await getAudit(searchAddress);
      setAuditInfo(audit);
    } catch {
      // fallback: just get balance
      try {
        const bal = await getBalance(searchAddress);
        setAuditInfo({ address: searchAddress, balance: bal, flagHistory: [], freezeHistory: [], txCount: 0, largeTransferCount: 0 });
      } catch {
        setAuditInfo(null);
      }
    } finally { setIsSearching(false); }
  };

  const triggerAction = (type: "freeze" | "flag" | "unfreeze", address: string) => {
    const txType = { freeze: "tnx_freeze_account", flag: "tnx_flag_account", unfreeze: "tnx_unfreeze_account" }[type];
    setActionType(type);
    setTxFields({ type: txType, to: address, reason: actionReason });
    setTxSummary({ type: txType.replace("tnx_", "").replace("_", " "), to: address, extra: actionReason });
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Frozen Accounts */}
      <Card>
        <CardHeader><CardTitle>Frozen Accounts ({frozenAccounts.length})</CardTitle></CardHeader>
        {loading ? (
          <CardContent className="flex justify-center py-8"><Spinner /></CardContent>
        ) : (
          <Table>
            <thead><tr><Th>Address</Th><Th>Reason</Th><Th>Frozen at Block</Th><Th>Action</Th></tr></thead>
            <tbody>
              {frozenAccounts.map((acc, i) => (
                <Tr key={i}>
                  <Td><Address value={acc.address} /></Td>
                  <Td className="text-xs text-gray-600 max-w-48 truncate">{acc.reason}</Td>
                  <Td className="font-mono text-xs">#{acc.frozenAtBlock}</Td>
                  <Td>
                    <Button variant="secondary" size="sm" onClick={() => { setActionReason(""); triggerAction("unfreeze", acc.address); }}>
                      Unfreeze
                    </Button>
                  </Td>
                </Tr>
              ))}
              {frozenAccounts.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">No frozen accounts</Td></Tr>}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Account Search */}
      <Card>
        <CardHeader><CardTitle>Account Search & Audit</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <input
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]"
              placeholder="Enter 64-char hex address..."
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value.trim())}
              maxLength={64}
            />
            <Button variant="primary" onClick={handleSearch} loading={isSearching} disabled={searchAddress.length !== 64}>
              Search
            </Button>
          </div>

          {auditInfo && (
            <div className="space-y-4 animate-fade-in">
              {/* Balance Info */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#EAF0F8] rounded p-3">
                  <p className="text-xs text-gray-500">Balance</p>
                  <p className="font-bold text-[#1A3A5C]">{paiseToCurrency(auditInfo.balance.balancePaise)}</p>
                </div>
                <div className="bg-[#EAF0F8] rounded p-3">
                  <p className="text-xs text-gray-500">Role</p>
                  <p className="font-bold capitalize">{auditInfo.balance.role}</p>
                </div>
                <div className="bg-[#EAF0F8] rounded p-3">
                  <p className="text-xs text-gray-500">Status</p>
                  <div className="flex gap-1 flex-wrap mt-0.5">
                    {auditInfo.balance.isFrozen && <Badge variant="red">Frozen</Badge>}
                    {auditInfo.balance.isFlagged && <Badge variant="amber">Flagged</Badge>}
                    {!auditInfo.balance.isFrozen && !auditInfo.balance.isFlagged && <Badge variant="green">Clear</Badge>}
                  </div>
                </div>
              </div>

              {/* Reason input */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Reason (for freeze/flag)</label>
                <input
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Enter reason for enforcement action..."
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={!actionReason || !!auditInfo.balance.isFrozen}
                  onClick={() => triggerAction("freeze", searchAddress)}
                >
                  🔒 Freeze Account
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!actionReason}
                  onClick={() => triggerAction("flag", searchAddress)}
                >
                  🚩 Flag Account
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!auditInfo.balance.isFrozen}
                  onClick={() => triggerAction("unfreeze", searchAddress)}
                >
                  🔓 Unfreeze
                </Button>
              </div>

              {/* History */}
              {auditInfo.flagHistory.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Flag History</p>
                  {auditInfo.flagHistory.map((f, i) => (
                    <div key={i} className="text-xs text-gray-600 py-1 border-b border-gray-100">
                      Block #{f.block}: {f.reason}
                    </div>
                  ))}
                </div>
              )}
              {auditInfo.freezeHistory.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Freeze History</p>
                  {auditInfo.freezeHistory.map((f, i) => (
                    <div key={i} className="text-xs text-gray-600 py-1 border-b border-gray-100">
                      Block #{f.block}: {f.reason} {f.unfrozen ? "(Unfrozen)" : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <PasswordModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => { setShowModal(false); getFrozenAccounts().then((r) => setFrozenAccounts(r.frozen || [])); }}
        txFields={{ ...txFields, reason: actionReason }}
        summary={txSummary}
      />
    </div>
  );
};

export default AccountEnforcement;
