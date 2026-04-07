/**
 * VAL-05: Network & Peers
 */
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, Badge, MetricCard, Table, Th, Td, Tr, Spinner } from "@/components/ui";
import { getStatus, getNetwork } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

interface Peer { address: string; height: number; lastSeen: number; connected: boolean; role: string; }

const NetworkPeers: React.FC = () => {
  const [status, setStatus] = useState<{ chainId: string; height: number; validators: number; peers: number; mempool: number } | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [st, net] = await Promise.all([
          getStatus().catch(() => null),
          getNetwork().catch(() => ({ peers: [] })),
        ]);
        setStatus(st);
        setPeers(net.peers || []);
      } finally { setLoading(false); }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  const connected = peers.filter((p) => p.connected);

  return (
    <div className="space-y-5">
      {loading ? <div className="flex justify-center py-12"><Spinner size="lg" /></div> : (
        <>
          {/* Node info */}
          <Card>
            <CardHeader><CardTitle>Your Node</CardTitle></CardHeader>
            <CardContent>
              {status ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><p className="text-xs text-gray-500">Chain ID</p><p className="font-mono text-sm font-bold">{status.chainId}</p></div>
                  <div><p className="text-xs text-gray-500">Block Height</p><p className="font-bold text-[#1A3A5C]">#{status.height.toLocaleString()}</p></div>
                  <div><p className="text-xs text-gray-500">Validators</p><p className="font-bold">{status.validators}</p></div>
                  <div><p className="text-xs text-gray-500">Mempool</p><p className="font-bold">{status.mempool} pending</p></div>
                </div>
              ) : <p className="text-gray-400 text-sm">Node offline</p>}
            </CardContent>
          </Card>

          {/* Peer metrics */}
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="Total Peers" value={peers.length} borderColor="#4338CA" />
            <MetricCard label="Connected" value={connected.length} borderColor="#2D7D46" />
            <MetricCard label="Disconnected" value={peers.length - connected.length} borderColor={peers.length - connected.length > 0 ? "#C0392B" : "#6B7280"} />
          </div>

          {/* Peer Table */}
          <Card>
            <CardHeader><CardTitle>Peer List ({peers.length})</CardTitle></CardHeader>
            <Table>
              <thead><tr><Th>Address / Endpoint</Th><Th>Role</Th><Th>Height</Th><Th>Last Seen</Th><Th>Status</Th></tr></thead>
              <tbody>
                {peers.map((p, i) => (
                  <Tr key={i}>
                    <Td><span className="font-mono text-xs">{p.address}</span></Td>
                    <Td><span className="capitalize text-xs">{p.role || "—"}</span></Td>
                    <Td className="font-mono text-xs">#{p.height?.toLocaleString() || "—"}</Td>
                    <Td className="text-xs text-gray-500">{p.lastSeen ? formatDateTime(p.lastSeen) : "—"}</Td>
                    <Td><Badge variant={p.connected ? "green" : "red"}>{p.connected ? "Connected" : "Disconnected"}</Badge></Td>
                  </Tr>
                ))}
                {peers.length === 0 && <Tr><Td colSpan={5} className="text-center text-gray-400">No peers found</Td></Tr>}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
};

export default NetworkPeers;
