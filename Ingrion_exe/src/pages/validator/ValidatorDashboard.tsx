/**
 * VAL-01: Validator Home Dashboard
 */
import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardHeader, CardTitle, CardContent, MetricCard, Badge, Skeleton, Table, Th, Td, Tr, Address } from "@/components/ui";
import { getValidators, getValidatorScore, getValidatorHistory, getStakeRewards, getSlashProposals } from "@/lib/api";
import { useAppStore } from "@/store";
import { paiseToCurrency } from "@/lib/utils";
import type { ValidatorScore, SlashProposal } from "@/types";

const ValidatorDashboard: React.FC = () => {
  const { keystore, nodeStatus } = useAppStore();
  const address = keystore?.address || "";
  const [score, setScore] = useState<ValidatorScore | null>(null);
  const [history, setHistory] = useState<Array<{ date: string; proposed: number; missed: number }>>([]);
  const [validators, setValidators] = useState<Array<{ address: string; stake: number; active: boolean; proposerIndex: number }>>([]);
  const [rewards, setRewards] = useState<{ totalRewardsPaise: number; pendingRewardsPaise: number } | null>(null);
  const [slashProposals, setSlashProposals] = useState<SlashProposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [scoreData, histData, valData, rewardData, slashData] = await Promise.all([
          getValidatorScore(address).catch(() => null),
          getValidatorHistory(address).catch(() => ({ history: [] })),
          getValidators().catch(() => ({ validators: [] })),
          getStakeRewards(address).catch(() => null),
          getSlashProposals().catch(() => ({ proposals: [] })),
        ]);
        setScore(scoreData);
        setHistory(histData.history.slice(-30));
        setValidators(valData.validators || []);
        setRewards(rewardData);
        setSlashProposals(slashData.proposals || []);
      } finally { setLoading(false); }
    };
    load();
  }, [address]);

  const myValidator = validators.find((v) => v.address === address);
  const pendingSlash = slashProposals.filter((p) => p.target === address && p.status === "pending");

  return (
    <div className="space-y-6">
      {/* Zone A: Identity Banner */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <Address value={address} />
                <Badge variant="indigo">VALIDATOR</Badge>
                {myValidator?.active ? <Badge variant="green">Active</Badge> : <Badge variant="gray">Inactive</Badge>}
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Stake</p>
                  <p className="font-bold text-[#1A3A5C]">{paiseToCurrency(myValidator?.stake || 0)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Validator Score</p>
                  <p className="font-bold text-[#1A3A5C]">{score?.score?.toFixed(2) || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Participation</p>
                  <p className="font-bold">{score?.participation !== undefined ? `${(score.participation * 100).toFixed(1)}%` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Rewards</p>
                  <p className="font-bold text-green-600">{paiseToCurrency(rewards?.totalRewardsPaise || 0)}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Zone B: Performance Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Blocks Proposed" value={score?.blocksProposed?.toLocaleString() || "—"} borderColor="#4338CA" />
        <MetricCard label="Missed Blocks" value={score?.missedBlocks?.toLocaleString() || "0"} borderColor={score?.missedBlocks ? "#C0392B" : "#2D7D46"} />
        <MetricCard label="Slash Events" value={score?.slashEvents?.toLocaleString() || "0"} borderColor={score?.slashEvents ? "#B7791F" : "#2D7D46"} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <MetricCard label="Staking Rewards" value={paiseToCurrency(rewards?.totalRewardsPaise || 0)} borderColor="#C9A84C" />
        <MetricCard label="Pending Slash Proposals Against Me" value={pendingSlash.length} borderColor={pendingSlash.length > 0 ? "#C0392B" : "#2D7D46"} />
      </div>

      {/* Zone C: Proposal History Chart */}
      <Card>
        <CardHeader><CardTitle>Block Proposals (Last 30 Days)</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-48 rounded" /> :
            history.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No history data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAF0F8" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="proposed" fill="#4338CA" name="Proposed" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="missed" fill="#C0392B" name="Missed" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </CardContent>
      </Card>

      {/* Zone D: Active Validator Set */}
      <Card>
        <CardHeader><CardTitle>Active Validator Set ({validators.length})</CardTitle></CardHeader>
        <Table>
          <thead><tr><Th>Address</Th><Th>Stake</Th><Th>Status</Th><Th>Index</Th></tr></thead>
          <tbody>
            {validators.map((v, i) => (
              <Tr key={i} className={v.address === address ? "bg-indigo-50" : ""}>
                <Td>
                  <div className="flex items-center gap-2">
                    <Address value={v.address} />
                    {v.address === address && <Badge variant="indigo">You</Badge>}
                  </div>
                </Td>
                <Td>{paiseToCurrency(v.stake)}</Td>
                <Td><Badge variant={v.active ? "green" : "gray"}>{v.active ? "Active" : "Inactive"}</Badge></Td>
                <Td className="font-mono text-xs">{v.proposerIndex}</Td>
              </Tr>
            ))}
            {validators.length === 0 && (
              <Tr><Td colSpan={4} className="text-center text-gray-400">No validators found</Td></Tr>
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
};

export default ValidatorDashboard;
