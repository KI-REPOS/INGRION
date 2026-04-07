/**
 * VAL-02: Validator Staking — JOIN / UPDATE / EXIT
 */
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Badge, MetricCard } from "@/components/ui";
import { PasswordModal } from "@/components/modals/PasswordModal";
import { getStakeRewards, getValidators } from "@/lib/api";
import { useAppStore } from "@/store";
import { paiseToCurrency } from "@/lib/utils";

type Tab = "overview" | "join" | "update" | "exit";

const ValidatorStaking: React.FC = () => {
  const { keystore, balancePaise } = useAppStore();
  const address = keystore?.address || "";
  const [tab, setTab] = useState<Tab>("overview");
  const [stakeInfo, setStakeInfo] = useState<{ totalRewardsPaise: number; pendingRewardsPaise: number; stake: number; active: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinStake, setJoinStake] = useState("");
  const [joinNode, setJoinNode] = useState("");
  const [updateStake, setUpdateStake] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [txFields, setTxFields] = useState<Record<string, unknown>>({});
  const [txSummary, setTxSummary] = useState({ type: "", extra: "", to: "" });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [rewardData, valData] = await Promise.all([
          getStakeRewards(address).catch(() => null),
          getValidators().catch(() => ({ validators: [] })),
        ]);
        const me = (valData.validators || []).find((v: { address: string; stake: number; active: boolean }) => v.address === address);
        setStakeInfo({
          totalRewardsPaise: rewardData?.totalRewardsPaise || 0,
          pendingRewardsPaise: rewardData?.pendingRewardsPaise || 0,
          stake: me?.stake || 0,
          active: me?.active || false,
        });
      } finally { setLoading(false); }
    };
    load();
  }, [address]);

  const isValidator = !!(stakeInfo?.stake && stakeInfo.stake > 0);

  const openModal = (type: string, fields: Record<string, unknown>, summary: string) => {
    setTxFields({ type, ...fields });
    setTxSummary({ type: type.replace(/_/g, " ").replace("VALIDATOR ", ""), extra: summary, to: "" });
    setShowModal(true);
  };

  const TABS: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: "overview", label: "Overview" },
    { id: "join", label: "Join Validator Set", disabled: isValidator },
    { id: "update", label: "Update Stake", disabled: !isValidator },
    { id: "exit", label: "Exit", disabled: !isValidator },
  ];

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => !t.disabled && setTab(t.id)} disabled={t.disabled}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.id ? "bg-white text-[#1A3A5C] shadow-sm" :
              t.disabled ? "text-gray-300 cursor-not-allowed" : "text-gray-600 hover:text-gray-800"
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <MetricCard label="Current Stake" value={loading ? "..." : paiseToCurrency(stakeInfo?.stake || 0)} borderColor="#4338CA" />
            <MetricCard label="Status" value={loading ? "..." : stakeInfo?.active ? "Active Validator" : isValidator ? "Inactive" : "Not a Validator"} borderColor={stakeInfo?.active ? "#2D7D46" : "#6B7280"} />
            <MetricCard label="Total Rewards Earned" value={loading ? "..." : paiseToCurrency(stakeInfo?.totalRewardsPaise || 0)} borderColor="#C9A84C" />
            <MetricCard label="Pending Rewards" value={loading ? "..." : paiseToCurrency(stakeInfo?.pendingRewardsPaise || 0)} borderColor="#B7791F" />
          </div>
          {!isValidator ? (
            <Card><CardContent className="py-8 text-center">
              <p className="text-4xl mb-3">🔐</p>
              <p className="font-bold text-lg text-[#1A3A5C]">Not Currently a Validator</p>
              <p className="text-gray-500 text-sm mt-2">Stake INR to join the validator set and earn block rewards</p>
              <Button variant="primary" className="mt-4" onClick={() => setTab("join")}>Join Validator Set →</Button>
            </CardContent></Card>
          ) : (
            <Card>
              <CardHeader><div className="flex justify-between items-center"><CardTitle>Your Validator Identity</CardTitle><Badge variant={stakeInfo?.active ? "green" : "gray"}>{stakeInfo?.active ? "Active" : "Inactive"}</Badge></div></CardHeader>
              <CardContent>
                <div className="font-mono text-xs text-gray-600 break-all bg-gray-50 rounded p-3">{address}</div>
                <div className="mt-4 flex gap-3">
                  <Button variant="secondary" size="sm" onClick={() => setTab("update")}>Update Stake</Button>
                  <Button variant="danger" size="sm" onClick={() => setTab("exit")}>Exit Validator Set</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "join" && (
        <Card><CardHeader><CardTitle>Join the Validator Set</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-w-lg">
            <div className="bg-[#EAF0F8] rounded p-3 text-sm">
              <p className="font-semibold text-[#1A3A5C] mb-1">Requirements</p>
              <ul className="text-gray-600 text-xs space-y-1">
                <li>• Minimum stake required to participate in consensus</li>
                <li>• Your address must hold sufficient INR balance</li>
                <li>• Slashing applies for malicious behaviour</li>
              </ul>
            </div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Available Balance</label>
              <p className="text-2xl font-bold text-[#1A3A5C]">{paiseToCurrency(balancePaise)}</p>
            </div>
            <Input label="Stake Amount (INR)" type="number" step="0.01" min="0" value={joinStake}
              onChange={(e) => setJoinStake(e.target.value)} placeholder="e.g. 10000" hint="Amount in INR to stake" />
            <Input label="Node Endpoint (optional)" value={joinNode} onChange={(e) => setJoinNode(e.target.value)}
              placeholder="e.g. 127.0.0.1:4000" hint="Your P2P node address" />
            <Button variant="primary" className="w-full" disabled={!joinStake || parseFloat(joinStake) <= 0}
              onClick={() => openModal("VALIDATOR_JOIN", { amountPaise: Math.round(parseFloat(joinStake) * 100), meta: joinNode ? { nodeEndpoint: joinNode } : {} }, `Stake ${joinStake} INR`)}>
              Join Validator Set
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === "update" && (
        <Card><CardHeader><CardTitle>Update Stake Amount</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-w-lg">
            <div className="bg-[#EAF0F8] rounded p-3 text-sm">
              <p className="text-xs text-gray-600">Current Stake: <span className="font-bold">{paiseToCurrency(stakeInfo?.stake || 0)}</span></p>
              <p className="text-xs text-gray-600 mt-1">Available Balance: <span className="font-bold">{paiseToCurrency(balancePaise)}</span></p>
            </div>
            <Input label="New Stake Amount (INR)" type="number" step="0.01" value={updateStake}
              onChange={(e) => setUpdateStake(e.target.value)} placeholder="Enter new total stake"
              hint="This replaces your current stake (not additive)" />
            {updateStake && stakeInfo && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                {parseFloat(updateStake) > stakeInfo.stake / 100
                  ? `↑ Increasing stake by ${paiseToCurrency(Math.round(parseFloat(updateStake) * 100) - stakeInfo.stake)}`
                  : `↓ Decreasing stake by ${paiseToCurrency(stakeInfo.stake - Math.round(parseFloat(updateStake) * 100))}`}
              </div>
            )}
            <Button variant="primary" className="w-full" disabled={!updateStake || parseFloat(updateStake) <= 0}
              onClick={() => openModal("tnx_update_stake", { amountPaise: Math.round(parseFloat(updateStake) * 100) }, `New stake: ${updateStake} INR`)}>
              Update Stake
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === "exit" && (
        <Card><CardHeader><CardTitle>Exit Validator Set</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-w-lg">
            <div className="bg-red-50 border border-red-200 rounded p-4">
              <p className="font-semibold text-red-800 text-sm mb-2">⚠️ Warning</p>
              <p className="text-xs text-red-700">Exiting will withdraw your stake and remove you from block proposer rotation. Pending rewards will be credited on exit.</p>
            </div>
            <div><label className="text-xs font-medium text-gray-700 block mb-1">Reason (optional)</label>
              <input className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none"
                value={exitReason} onChange={(e) => setExitReason(e.target.value)} placeholder="e.g. Hardware maintenance..." />
            </div>
            <Button variant="danger" className="w-full"
              onClick={() => openModal("VALIDATOR_EXIT", { meta: exitReason ? { reason: exitReason } : {} }, "Exit validator set")}>
              Exit Validator Set
            </Button>
          </CardContent>
        </Card>
      )}

      <PasswordModal isOpen={showModal} onClose={() => setShowModal(false)}
        onSuccess={() => { setShowModal(false); setTab("overview"); }}
        txFields={txFields} summary={txSummary} />
    </div>
  );
};

export default ValidatorStaking;
