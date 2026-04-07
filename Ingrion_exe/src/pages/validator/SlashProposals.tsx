/**
 * VAL-03: Slash Proposals — Create & Vote
 */
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Input, Table, Th, Td, Tr, Address } from "@/components/ui";
import { PasswordModal } from "@/components/modals/PasswordModal";
import { getSlashProposals } from "@/lib/api";
import { useAppStore } from "@/store";
import { paiseToCurrency, formatDateTime } from "@/lib/utils";
import type { SlashProposal } from "@/types";

const SlashProposals: React.FC = () => {
  const { keystore } = useAppStore();
  const address = keystore?.address || "";
  const [proposals, setProposals] = useState<SlashProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [txFields, setTxFields] = useState<Record<string, unknown>>({});
  const [txSummary, setTxSummary] = useState({ type: "", to: "", extra: "" });
  const [tab, setTab] = useState<"active" | "create">("active");
  // Create form
  const [targetAddress, setTargetAddress] = useState("");
  const [slashAmount, setSlashAmount] = useState("");
  const [slashReason, setSlashReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await getSlashProposals();
      setProposals(data.proposals || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const vote = (proposalId: string, support: boolean) => {
    setTxFields({ type: "tnx_vote_slash", proposalId, meta: { support: support ? "yes" : "no" } });
    setTxSummary({ type: "Vote Slash", to: "", extra: `${support ? "Support" : "Reject"} proposal ${proposalId.slice(0, 8)}…` });
    setShowModal(true);
  };

  const createProposal = () => {
    setTxFields({ type: "tnx_slash_proposal", to: targetAddress, amountPaise: Math.round(parseFloat(slashAmount) * 100), reason: slashReason });
    setTxSummary({ type: "Slash Proposal", to: targetAddress, extra: `${slashAmount} INR — ${slashReason}` });
    setShowModal(true);
  };

  const myProposals = proposals.filter((p) => p.proposer === address);
  const targetedProposals = proposals.filter((p) => p.target === address);
  const votableProposals = proposals.filter((p) => p.status === "pending" && p.proposer !== address && p.target !== address);

  const StatusBadge = ({ status }: { status: string }) => {
    const variants: Record<string, "green" | "amber" | "red" | "gray"> = {
      passed: "green", pending: "amber", rejected: "red", executed: "green"
    };
    return <Badge variant={variants[status] || "gray"}>{status}</Badge>;
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(["active", "create"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-white text-[#1A3A5C] shadow-sm" : "text-gray-600 hover:text-gray-800"}`}>
            {t === "active" ? `Active Proposals (${proposals.filter((p) => p.status === "pending").length})` : "Create Proposal"}
          </button>
        ))}
      </div>

      {tab === "active" && (
        <div className="space-y-5">
          {/* Votable proposals */}
          <Card>
            <CardHeader><CardTitle>Proposals Awaiting Your Vote ({votableProposals.length})</CardTitle></CardHeader>
            <Table>
              <thead><tr><Th>Target</Th><Th>Amount</Th><Th>Reason</Th><Th>Proposer</Th><Th>Votes For/Against</Th><Th>Action</Th></tr></thead>
              <tbody>
                {votableProposals.map((p) => (
                  <Tr key={p.proposalId}>
                    <Td><Address value={p.target} /></Td>
                    <Td>{paiseToCurrency(p.amount)}</Td>
                    <Td className="text-xs max-w-32 truncate text-gray-600">{p.reason}</Td>
                    <Td><Address value={p.proposer} /></Td>
                    <Td><span className="text-green-600 font-bold">{p.votesFor}</span> / <span className="text-red-600 font-bold">{p.votesAgainst}</span></Td>
                    <Td>
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" onClick={() => vote(p.proposalId, true)}>Support</Button>
                        <Button variant="danger" size="sm" onClick={() => vote(p.proposalId, false)}>Reject</Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
                {votableProposals.length === 0 && <Tr><Td colSpan={6} className="text-center text-gray-400">No pending proposals to vote on</Td></Tr>}
              </tbody>
            </Table>
          </Card>

          {/* Proposals against me */}
          {targetedProposals.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-red-700">⚠️ Proposals Against You ({targetedProposals.length})</CardTitle></CardHeader>
              <Table>
                <thead><tr><Th>Proposer</Th><Th>Amount</Th><Th>Reason</Th><Th>Status</Th><Th>Votes</Th></tr></thead>
                <tbody>
                  {targetedProposals.map((p) => (
                    <Tr key={p.proposalId} className="bg-red-50">
                      <Td><Address value={p.proposer} /></Td>
                      <Td className="text-red-700 font-bold">{paiseToCurrency(p.amount)}</Td>
                      <Td className="text-xs max-w-40 truncate">{p.reason}</Td>
                      <Td><StatusBadge status={p.status} /></Td>
                      <Td><span className="text-green-600">{p.votesFor}</span> / <span className="text-red-600">{p.votesAgainst}</span></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {/* My proposals */}
          {myProposals.length > 0 && (
            <Card>
              <CardHeader><CardTitle>My Proposals ({myProposals.length})</CardTitle></CardHeader>
              <Table>
                <thead><tr><Th>Target</Th><Th>Amount</Th><Th>Reason</Th><Th>Status</Th><Th>Votes For/Against</Th></tr></thead>
                <tbody>
                  {myProposals.map((p) => (
                    <Tr key={p.proposalId}>
                      <Td><Address value={p.target} /></Td>
                      <Td>{paiseToCurrency(p.amount)}</Td>
                      <Td className="text-xs max-w-40 truncate text-gray-600">{p.reason}</Td>
                      <Td><StatusBadge status={p.status} /></Td>
                      <Td><span className="text-green-600">{p.votesFor}</span> / <span className="text-red-600">{p.votesAgainst}</span></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {tab === "create" && (
        <Card><CardHeader><CardTitle>Create Slash Proposal</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-w-lg">
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
              Slash proposals require a majority of validators to vote in favour before execution.
              Provide clear evidence in the reason field.
            </div>
            <Input label="Target Validator Address" value={targetAddress} onChange={(e) => setTargetAddress(e.target.value.trim())}
              placeholder="64-char hex address" maxLength={64}
              error={targetAddress && targetAddress.length !== 64 ? "Must be 64 hex characters" : undefined} />
            <Input label="Slash Amount (INR)" type="number" step="0.01" min="0" value={slashAmount}
              onChange={(e) => setSlashAmount(e.target.value)} placeholder="e.g. 5000" />
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Reason / Evidence</label>
              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none resize-none"
                rows={4} value={slashReason} onChange={(e) => setSlashReason(e.target.value)}
                placeholder="Describe the malicious/negligent behaviour with block numbers and evidence..." />
            </div>
            <Button variant="danger" className="w-full"
              disabled={targetAddress.length !== 64 || !slashAmount || !slashReason}
              onClick={createProposal}>
              Submit Slash Proposal
            </Button>
          </CardContent>
        </Card>
      )}

      <PasswordModal isOpen={showModal} onClose={() => setShowModal(false)}
        onSuccess={() => { setShowModal(false); load(); }}
        txFields={txFields} summary={txSummary} />
    </div>
  );
};

export default SlashProposals;
