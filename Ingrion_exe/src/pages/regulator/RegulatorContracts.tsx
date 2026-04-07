/**
 * REG-06: Regulator Contracts — Review and approve/reject contracts
 */
import React, { useEffect, useState } from "react";
import {
  Card, CardHeader, CardTitle, CardContent, Button, Textarea,
  Badge, Skeleton, EmptyState, Table, Th, Td, Tr
} from "@/components/ui";
import { useAppStore } from "@/store";
import { getContracts } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import PasswordModal from "@/components/modals/PasswordModal";

interface Contract {
  id: string;
  proposer: string;
  title: string;
  docHash: string;
  status: string;
  block: number;
  timestamp: number;
}

const statusVariant = (s: string) => {
  if (s === "approved") return "green";
  if (s === "rejected") return "red";
  if (s === "pending") return "amber";
  return "gray";
};

const RegulatorContracts: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selected, setSelected] = useState<Contract | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("pending");
  const [voteReason, setVoteReason] = useState("");
  const [voteModal, setVoteModal] = useState(false);
  const [voteTx, setVoteTx] = useState<any>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getContracts() as any;
      setContracts((res.contracts || []).map((c: any) => ({
        id: c.id, proposer: c.proposer, title: c.title || c.meta?.title || c.id,
        docHash: c.doc_hash || c.meta?.hash || "",
        status: c.status, block: c.block || 0, timestamp: c.timestamp || 0,
      })));
    } catch { } finally { setLoading(false); }
  };

  const handleVote = (approve: boolean) => {
    if (!selected) return;
    setVoteTx({ type: "tnx_vote_contract", proposalId: selected.id, vote: approve ? "yes" : "no", reason: voteReason });
    setVoteModal(true);
  };

  const filtered = contracts.filter(c => filterStatus === "all" || c.status === filterStatus);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1A3A5C]">Contract Review</h1>

      <div className="flex gap-3">
        {["all", "pending", "approved", "rejected"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filterStatus === s ? "bg-[#0D1F33] text-white border-[#0D1F33]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}>
            {s.charAt(0).toUpperCase() + s.slice(1)} {s !== "all" ? `(${contracts.filter(c => c.status === s).length})` : ""}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Contract list */}
        <div className="col-span-2 space-y-2">
          {loading ? [1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />) :
          filtered.length === 0 ? (
            <EmptyState icon={<span className="text-3xl">📄</span>} title="No contracts" description="No contracts match the current filter." />
          ) : filtered.map(c => (
            <button key={c.id} onClick={() => { setSelected(c); setVoteReason(""); }}
              className={`w-full text-left p-3 rounded-lg border transition-all ${selected?.id === c.id ? "border-[#C9A84C] bg-amber-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
              <div className="flex justify-between items-start gap-2">
                <span className="font-semibold text-[#1A3A5C] text-sm truncate">{c.title}</span>
                <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1 font-mono">{c.proposer.slice(0, 12)}…</p>
              <p className="text-xs text-gray-400">{formatDateTime(c.timestamp)}</p>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="col-span-3">
          {!selected ? (
            <Card><CardContent className="py-16 text-center text-gray-400">← Select a contract to review</CardContent></Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>{selected.title}</CardTitle>
                    <Badge variant={statusVariant(selected.status)}>{selected.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-gray-500">Contract ID:</span><br/><span className="font-mono text-xs">{selected.id}</span></div>
                    <div><span className="text-gray-500">Block:</span><br/><span className="font-mono">{selected.block.toLocaleString()}</span></div>
                    <div><span className="text-gray-500">Proposer:</span><br/><span className="font-mono text-xs">{selected.proposer.slice(0, 20)}…</span></div>
                    <div><span className="text-gray-500">Submitted:</span><br/><span className="text-xs">{formatDateTime(selected.timestamp)}</span></div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Document Hash (SHA-256)</p>
                    <p className="font-mono text-xs bg-gray-50 p-2 rounded border break-all">{selected.docHash || "Not provided"}</p>
                  </div>
                  {selected.docHash && (
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                      ℹ️ Verify this hash matches the physical document before approving. Use the Document Hash Tool (sidebar) to compute the hash of the received PDF.
                    </div>
                  )}
                </CardContent>
              </Card>

              {selected.status === "pending" && (
                <Card>
                  <CardHeader><CardTitle>Review Decision</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea label="Reason / Notes (optional)" value={voteReason} onChange={e => setVoteReason(e.target.value)}
                      placeholder="Provide justification for approval or rejection…" rows={3} />
                    <div className="flex gap-3">
                      <Button onClick={() => handleVote(true)} className="flex-1 bg-green-700 hover:bg-green-800 text-white">✓ Approve Contract</Button>
                      <Button onClick={() => handleVote(false)} variant="danger" className="flex-1">✗ Reject Contract</Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {voteModal && voteTx && (
        <PasswordModal
          txFields={voteTx}
          summary={{ type: `Contract ${voteTx.vote === "yes" ? "Approval" : "Rejection"}`, extra: selected?.title }}
          onClose={() => setVoteModal(false)}
          onSuccess={() => { setVoteModal(false); setSelected(null); load(); }}
        />
      )}
    </div>
  );
};

export default RegulatorContracts;
