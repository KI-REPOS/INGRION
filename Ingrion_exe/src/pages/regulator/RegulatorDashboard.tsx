/**
 * REG-01: Regulator Executive Analytics Dashboard
 */
import React, { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent, MetricCard, Badge, Button, Skeleton, Table, Th, Td, Tr, Address } from "@/components/ui";
import { getValidators } from "@/lib/api";
import { getDailyAnalytics, getAllTransactionsForAnalytics } from "@/lib/db";
import { useAppStore } from "@/store";
import { paiseToCurrency, formatDateTime } from "@/lib/utils";
import type { DailyAnalytics } from "@/types";

const COLORS = ["#C9A84C", "#1A3A5C", "#0D9488", "#4338CA", "#9B1C1C"];

const RegulatorDashboard: React.FC = () => {
  const { nodeStatus } = useAppStore();
  const [analytics, setAnalytics] = useState<DailyAnalytics[]>([]);
  const [validators, setValidators] = useState<Array<{ address: string; stake: number; active: boolean }>>([]);
  const [largeTransfers, setLargeTransfers] = useState<Array<{ time: number; from: string; to: string; amount: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ totalVolume24h: 0, activeAddresses: 0, validatorRate: 0, amlAlerts: 0 });
  const threshold = 1_000_000; // 10,000 INR

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [analyticsData, validatorData] = await Promise.all([
          getDailyAnalytics(30),
          getValidators().catch(() => ({ validators: [] })),
        ]);
        const sortedAnalytics = [...analyticsData].reverse();
        setAnalytics(sortedAnalytics);
        const vs: Array<{ address: string; stake: number; active: boolean }> = validatorData.validators || [];
        setValidators(vs);
        const active = vs.filter((v) => v.active).length;
        const since = Math.floor(Date.now() / 1000) - 86400;
        const allTxs = await getAllTransactionsForAnalytics(since);
        const large = allTxs.filter((tx) => (tx.amountPaise || 0) >= threshold).slice(0, 20).map((tx) => ({
          time: tx.timestamp, from: tx.fromAddr, to: tx.toAddr || "", amount: tx.amountPaise || 0,
        }));
        setLargeTransfers(large);
        const today = sortedAnalytics[sortedAnalytics.length - 1];
        setKpis({
          totalVolume24h: today?.totalVolumePaise || 0,
          activeAddresses: today?.activeAddresses || 0,
          validatorRate: vs.length > 0 ? Math.round((active / vs.length) * 100) : 0,
          amlAlerts: large.length,
        });
      } finally { setLoading(false); }
    };
    load();
  }, []);

  const stakePieData = validators.slice(0, 5).map((v) => ({ name: v.address.slice(0, 8) + "…", value: v.stake }));

  const exportReport = () => {
    const data = { generated: new Date().toISOString(), kpis, totalValidators: validators.length, largeTransferCount: largeTransfers.length };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `ingrion_report_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-4">
        <MetricCard label="24h Volume" value={paiseToCurrency(kpis.totalVolume24h)} borderColor="#C9A84C" />
        <MetricCard label="Active Addresses" value={kpis.activeAddresses.toLocaleString()} borderColor="#0D9488" />
        <MetricCard label="Validator Rate" value={`${kpis.validatorRate}%`} borderColor="#4338CA" />
        <MetricCard label="AML Alerts (24h)" value={kpis.amlAlerts} borderColor={kpis.amlAlerts > 0 ? "#B7791F" : "#2D7D46"} />
        <MetricCard label="Chain Height" value={nodeStatus ? `#${nodeStatus.height.toLocaleString()}` : "—"} borderColor="#1A3A5C" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2">
          <Card>
            <CardHeader><CardTitle>Transaction Volume — 30 Days</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-48 rounded" /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={analytics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EAF0F8" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `₹${(v / 10000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number, name: string) => [name === "totalVolumePaise" ? paiseToCurrency(v) : v, name === "totalVolumePaise" ? "Volume" : "Tx Count"]} />
                    <Line type="monotone" dataKey="totalVolumePaise" stroke="#C9A84C" strokeWidth={2} dot={false} name="Volume" />
                    <Line type="monotone" dataKey="txCount" stroke="#1A3A5C" strokeWidth={2} dot={false} name="Tx Count" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Stake Distribution</CardTitle></CardHeader>
          <CardContent>
            {stakePieData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No validator data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={stakePieData} dataKey="value" cx="50%" cy="50%" outerRadius={70}>
                    {stakePieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => paiseToCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Card>
          <CardHeader><CardTitle>Active Addresses (14 days)</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-40 rounded" /> : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={analytics.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAF0F8" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="activeAddresses" fill="#1A3A5C" radius={[2, 2, 0, 0]} name="Active" />
                  <Bar dataKey="newAddresses" fill="#C9A84C" radius={[2, 2, 0, 0]} name="New" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Large Transfer Alerts (24h)</CardTitle>
              <Badge variant="amber">{largeTransfers.length}</Badge>
            </div>
          </CardHeader>
          <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
            {largeTransfers.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">No large transfers detected</div>
            ) : largeTransfers.map((t, i) => (
              <div key={i} className="px-4 py-2.5 flex justify-between items-center hover:bg-amber-50">
                <div>
                  <p className="text-xs font-mono text-gray-600">{t.from.slice(0, 10)}… → {t.to.slice(0, 10)}…</p>
                  <p className="text-xs text-gray-400">{formatDateTime(t.time)}</p>
                </div>
                <span className="font-bold text-amber-700 text-sm">{paiseToCurrency(t.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Validator Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Validator Set ({validators.length})</CardTitle>
            <Button variant="secondary" size="sm" onClick={exportReport}>Export Report (JSON)</Button>
          </div>
        </CardHeader>
        <Table>
          <thead>
            <tr>
              <Th>Address</Th>
              <Th>Stake</Th>
              <Th>Status</Th>
              <Th>Index</Th>
            </tr>
          </thead>
          <tbody>
            {validators.slice(0, 15).map((v, i) => (
              <Tr key={i}>
                <Td><Address value={v.address} /></Td>
                <Td>{paiseToCurrency(v.stake)}</Td>
                <Td><Badge variant={v.active ? "green" : "gray"}>{v.active ? "Active" : "Inactive"}</Badge></Td>
                <Td className="font-mono text-xs">{i}</Td>
              </Tr>
            ))}
            {validators.length === 0 && (
              <Tr><Td colSpan={4} className="text-center text-gray-400">No validator data available</Td></Tr>
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
};

export default RegulatorDashboard;
