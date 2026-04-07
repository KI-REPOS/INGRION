/**
 * VAL-04: Block Explorer with Mempool
 */
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent, Badge, Input, Button, Table, Th, Td, Tr, Address, Spinner } from "@/components/ui";
import { getBlock, getMempool } from "@/lib/api";
import { getRecentBlocks } from "@/lib/db";
import { formatDateTime, txTypeLabel, paiseToCurrency } from "@/lib/utils";

interface BlockSummary { height: number; hash: string; txCount: number; proposer: string; timestamp: number; }
interface TxRaw { type: string; from: string; to?: string; amountPaise?: number; stock?: string; }

const BlockExplorer: React.FC = () => {
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [mempool, setMempool] = useState<TxRaw[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<{ height: number; hash: string; transactions: TxRaw[]; proposer: string; timestamp: number } | null>(null);
  const [searchHeight, setSearchHeight] = useState("");
  const [loadingBlock, setLoadingBlock] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  const loadBlocks = useCallback(async () => {
    setLoadingList(true);
    try {
      const result = await getRecentBlocks(20);
      setBlocks(result.blocks || []);
    } finally { setLoadingList(false); }
  }, []);

  const loadMempool = useCallback(async () => {
    try {
      const result = await getMempool();
      setMempool(result.transactions || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadBlocks();
    loadMempool();
    const interval = setInterval(loadMempool, 3000);
    return () => clearInterval(interval);
  }, [loadBlocks, loadMempool]);

  const openBlock = async (height: number) => {
    setLoadingBlock(true);
    try {
      const b = await getBlock(height);
      setSelectedBlock(b);
    } finally { setLoadingBlock(false); }
  };

  const search = async () => {
    const h = parseInt(searchHeight);
    if (isNaN(h)) return;
    await openBlock(h);
  };

  return (
    <div className="space-y-5">
      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Input label="" placeholder="Search by block height..." value={searchHeight}
              onChange={(e) => setSearchHeight(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="flex-1"
            />
            <Button variant="secondary" onClick={search} className="self-end">Search</Button>
            <Button variant="secondary" onClick={loadBlocks} className="self-end">↻ Refresh</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-5">
        {/* Block List */}
        <div className="space-y-3">
          {/* Mempool */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Mempool (live)</CardTitle>
                <Badge variant="amber">{mempool.length} pending</Badge>
              </div>
            </CardHeader>
            <div className="max-h-48 overflow-y-auto divide-y">
              {mempool.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-xs">Empty mempool</div>
              ) : mempool.slice(0, 15).map((tx, i) => (
                <div key={i} className="px-4 py-2 flex justify-between items-center text-xs">
                  <div>
                    <Badge variant="blue">{txTypeLabel(tx.type)}</Badge>
                    <p className="font-mono text-gray-400 mt-0.5">{tx.from.slice(0, 12)}…</p>
                  </div>
                  {tx.amountPaise ? <span className="text-[#1A3A5C] font-bold">{paiseToCurrency(tx.amountPaise)}</span> : null}
                  {tx.stock ? <span className="text-indigo-600 font-bold">{tx.stock}</span> : null}
                </div>
              ))}
            </div>
          </Card>

          {/* Recent Blocks */}
          <Card>
            <CardHeader><CardTitle>Recent Blocks</CardTitle></CardHeader>
            {loadingList ? <CardContent className="flex justify-center py-6"><Spinner /></CardContent> : (
              <div className="divide-y max-h-80 overflow-y-auto">
                {blocks.map((b) => (
                  <div key={b.height}
                    className={`px-4 py-3 cursor-pointer hover:bg-[#EAF0F8] transition-colors ${selectedBlock?.height === b.height ? "bg-[#EAF0F8]" : ""}`}
                    onClick={() => openBlock(b.height)}>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-[#1A3A5C]">#{b.height.toLocaleString()}</span>
                      <Badge variant="blue">{b.txCount} txs</Badge>
                    </div>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{b.hash.slice(0, 20)}…</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatDateTime(b.timestamp)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Block Detail */}
        <Card>
          <CardHeader><CardTitle>{selectedBlock ? `Block #${selectedBlock.height.toLocaleString()}` : "Block Detail"}</CardTitle></CardHeader>
          {loadingBlock ? (
            <CardContent className="flex justify-center py-12"><Spinner /></CardContent>
          ) : !selectedBlock ? (
            <CardContent className="py-12 text-center text-gray-400">
              <p className="text-3xl mb-2">🧱</p>
              <p className="text-sm">Click a block to inspect</p>
            </CardContent>
          ) : (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-xs text-gray-500">Hash</p>
                  <p className="font-mono text-xs break-all">{selectedBlock.hash}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-xs text-gray-500">Proposer</p>
                  <Address value={selectedBlock.proposer} />
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-xs text-gray-500">Timestamp</p>
                  <p className="text-xs">{formatDateTime(selectedBlock.timestamp)}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-xs text-gray-500">Transactions</p>
                  <p className="font-bold">{selectedBlock.transactions.length}</p>
                </div>
              </div>

              {selectedBlock.transactions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Transactions</p>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {selectedBlock.transactions.map((tx, i) => (
                      <div key={i} className="bg-gray-50 rounded p-2 flex justify-between items-center text-xs">
                        <div>
                          <Badge variant="blue">{txTypeLabel(tx.type)}</Badge>
                          <p className="font-mono text-gray-400 mt-0.5">{tx.from.slice(0, 12)}… {tx.to ? `→ ${tx.to.slice(0, 8)}…` : ""}</p>
                        </div>
                        <div className="text-right">
                          {tx.amountPaise && <p className="font-bold">{paiseToCurrency(tx.amountPaise)}</p>}
                          {tx.stock && <p className="text-indigo-600">{tx.stock}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
};

export default BlockExplorer;

// /**
//  * VAL-04: Block Explorer with Mempool
//  */
// import React, { useState, useEffect, useCallback } from "react";
// import { Card, CardHeader, CardTitle, CardContent, Badge, Input, Button, Table, Th, Td, Tr, Address, Spinner } from "@/components/ui";
// import { getRecentBlocks, getBlock, getMempool } from "@/lib/api";
// import { formatDateTime, txTypeLabel, paiseToCurrency } from "@/lib/utils";

// interface BlockSummary { height: number; hash: string; txCount: number; proposer: string; timestamp: number; }
// interface TxRaw { type: string; from: string; to?: string; amountPaise?: number; stock?: string; }

// const BlockExplorer: React.FC = () => {
//   const [blocks, setBlocks] = useState<BlockSummary[]>([]);
//   const [mempool, setMempool] = useState<TxRaw[]>([]);
//   const [selectedBlock, setSelectedBlock] = useState<{ height: number; hash: string; transactions: TxRaw[]; proposer: string; timestamp: number } | null>(null);
//   const [searchHeight, setSearchHeight] = useState("");
//   const [loadingBlock, setLoadingBlock] = useState(false);
//   const [loadingList, setLoadingList] = useState(true);

//   const loadBlocks = useCallback(async () => {
//     setLoadingList(true);
//     try {
//       const result = await getRecentBlocks(20);
//       setBlocks(result.blocks || []);
//     } finally { setLoadingList(false); }
//   }, []);

//   const loadMempool = useCallback(async () => {
//     try {
//       const result = await getMempool();
//       setMempool(result.transactions || []);
//     } catch { /* ignore */ }
//   }, []);

//   useEffect(() => {
//     loadBlocks();
//     loadMempool();
//     const interval = setInterval(loadMempool, 3000);
//     return () => clearInterval(interval);
//   }, [loadBlocks, loadMempool]);

//   const openBlock = async (height: number) => {
//     setLoadingBlock(true);
//     try {
//       const b = await getBlock(height);
//       setSelectedBlock(b);
//     } finally { setLoadingBlock(false); }
//   };

//   const search = async () => {
//     const h = parseInt(searchHeight);
//     if (isNaN(h)) return;
//     await openBlock(h);
//   };

//   return (
//     <div className="space-y-5">
//       {/* Search */}
//       <Card>
//         <CardContent className="p-4">
//           <div className="flex gap-3">
//             <Input label="" placeholder="Search by block height..." value={searchHeight}
//               onChange={(e) => setSearchHeight(e.target.value)}
//               onKeyDown={(e) => e.key === "Enter" && search()}
//               className="flex-1"
//             />
//             <Button variant="secondary" onClick={search} className="self-end">Search</Button>
//             <Button variant="secondary" onClick={loadBlocks} className="self-end">↻ Refresh</Button>
//           </div>
//         </CardContent>
//       </Card>

//       <div className="grid grid-cols-2 gap-5">
//         {/* Block List */}
//         <div className="space-y-3">
//           {/* Mempool */}
//           <Card>
//             <CardHeader>
//               <div className="flex justify-between items-center">
//                 <CardTitle>Mempool (live)</CardTitle>
//                 <Badge variant="amber">{mempool.length} pending</Badge>
//               </div>
//             </CardHeader>
//             <div className="max-h-48 overflow-y-auto divide-y">
//               {mempool.length === 0 ? (
//                 <div className="p-4 text-center text-gray-400 text-xs">Empty mempool</div>
//               ) : mempool.slice(0, 15).map((tx, i) => (
//                 <div key={i} className="px-4 py-2 flex justify-between items-center text-xs">
//                   <div>
//                     <Badge variant="blue">{txTypeLabel(tx.type)}</Badge>
//                     <p className="font-mono text-gray-400 mt-0.5">{tx.from.slice(0, 12)}…</p>
//                   </div>
//                   {tx.amountPaise ? <span className="text-[#1A3A5C] font-bold">{paiseToCurrency(tx.amountPaise)}</span> : null}
//                   {tx.stock ? <span className="text-indigo-600 font-bold">{tx.stock}</span> : null}
//                 </div>
//               ))}
//             </div>
//           </Card>

//           {/* Recent Blocks */}
//           <Card>
//             <CardHeader><CardTitle>Recent Blocks</CardTitle></CardHeader>
//             {loadingList ? <CardContent className="flex justify-center py-6"><Spinner /></CardContent> : (
//               <div className="divide-y max-h-80 overflow-y-auto">
//                 {blocks.map((b) => (
//                   <div key={b.height}
//                     className={`px-4 py-3 cursor-pointer hover:bg-[#EAF0F8] transition-colors ${selectedBlock?.height === b.height ? "bg-[#EAF0F8]" : ""}`}
//                     onClick={() => openBlock(b.height)}>
//                     <div className="flex justify-between items-center">
//                       <span className="font-bold text-[#1A3A5C]">#{b.height.toLocaleString()}</span>
//                       <Badge variant="blue">{b.txCount} txs</Badge>
//                     </div>
//                     <p className="text-xs text-gray-400 font-mono mt-0.5">{b.hash.slice(0, 20)}…</p>
//                     <p className="text-xs text-gray-500 mt-0.5">{formatDateTime(b.timestamp)}</p>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </Card>
//         </div>

//         {/* Block Detail */}
//         <Card>
//           <CardHeader><CardTitle>{selectedBlock ? `Block #${selectedBlock.height.toLocaleString()}` : "Block Detail"}</CardTitle></CardHeader>
//           {loadingBlock ? (
//             <CardContent className="flex justify-center py-12"><Spinner /></CardContent>
//           ) : !selectedBlock ? (
//             <CardContent className="py-12 text-center text-gray-400">
//               <p className="text-3xl mb-2">🧱</p>
//               <p className="text-sm">Click a block to inspect</p>
//             </CardContent>
//           ) : (
//             <CardContent className="space-y-4">
//               <div className="grid grid-cols-2 gap-3 text-sm">
//                 <div className="bg-gray-50 rounded p-2">
//                   <p className="text-xs text-gray-500">Hash</p>
//                   <p className="font-mono text-xs break-all">{selectedBlock.hash}</p>
//                 </div>
//                 <div className="bg-gray-50 rounded p-2">
//                   <p className="text-xs text-gray-500">Proposer</p>
//                   <Address value={selectedBlock.proposer} />
//                 </div>
//                 <div className="bg-gray-50 rounded p-2">
//                   <p className="text-xs text-gray-500">Timestamp</p>
//                   <p className="text-xs">{formatDateTime(selectedBlock.timestamp)}</p>
//                 </div>
//                 <div className="bg-gray-50 rounded p-2">
//                   <p className="text-xs text-gray-500">Transactions</p>
//                   <p className="font-bold">{selectedBlock.transactions.length}</p>
//                 </div>
//               </div>

//               {selectedBlock.transactions.length > 0 && (
//                 <div>
//                   <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Transactions</p>
//                   <div className="space-y-1 max-h-64 overflow-y-auto">
//                     {selectedBlock.transactions.map((tx, i) => (
//                       <div key={i} className="bg-gray-50 rounded p-2 flex justify-between items-center text-xs">
//                         <div>
//                           <Badge variant="blue">{txTypeLabel(tx.type)}</Badge>
//                           <p className="font-mono text-gray-400 mt-0.5">{tx.from.slice(0, 12)}… {tx.to ? `→ ${tx.to.slice(0, 8)}…` : ""}</p>
//                         </div>
//                         <div className="text-right">
//                           {tx.amountPaise && <p className="font-bold">{paiseToCurrency(tx.amountPaise)}</p>}
//                           {tx.stock && <p className="text-indigo-600">{tx.stock}</p>}
//                         </div>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               )}
//             </CardContent>
//           )}
//         </Card>
//       </div>
//     </div>
//   );
// };

// export default BlockExplorer;
