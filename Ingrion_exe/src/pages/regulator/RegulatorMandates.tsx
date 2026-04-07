/**
 * REG-05: Regulator Mandates
 */
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Badge, Table, Th, Td, Tr, Address, Spinner } from "@/components/ui";
import { PasswordModal } from "@/components/modals/PasswordModal";
import { getActiveMandates } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

interface Mandate { id: string; mandateType: string; target: string; issuer: string; issuedAt: number; reason: string; active: boolean; }

const MANDATE_TYPES = ["TRADING_HALT", "DISCLOSURE_REQUIRED", "COMPLIANCE_AUDIT", "LOCK_UP_EXTENSION", "REPORTING_OBLIGATION", "INVESTIGATION"];

const RegulatorMandates: React.FC = () => {
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [txFields, setTxFields] = useState<Record<string, unknown>>({});
  const [txSummary, setTxSummary] = useState({ type: "", to: "", extra: "" });
  const [form, setForm] = useState({ targetAddress: "", mandateType: "TRADING_HALT", reason: "" });

  const load = async () => {
    setLoading(true);
    try { setMandates((await getActiveMandates()).mandates || []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = () => {
    setTxFields({ type: "tnx_mandate", to: form.targetAddress, mandateType: form.mandateType, reason: form.reason });
    setTxSummary({ type: "Issue Mandate", to: form.targetAddress, extra: `${form.mandateType} — ${form.reason}` });
    setShowModal(true);
  };

  return (
    <div className="grid grid-cols-5 gap-5">
      {/* Issue Mandate Form */}
      <div className="col-span-2">
        <Card>
          <CardHeader><CardTitle>Issue Mandate</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Input label="Target Address" value={form.targetAddress} onChange={(e) => setForm((f) => ({ ...f, targetAddress: e.target.value.trim() }))}
              placeholder="64-char hex address" maxLength={64}
              error={form.targetAddress && form.targetAddress.length !== 64 ? "Must be 64 hex chars" : undefined} />
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Mandate Type</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none"
                value={form.mandateType} onChange={(e) => setForm((f) => ({ ...f, mandateType: e.target.value }))}>
                {MANDATE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Reason / Legal Basis</label>
              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none resize-none"
                rows={4} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Cite the regulatory basis and reason for this mandate..." />
            </div>
            <Button variant="primary" className="w-full"
              disabled={form.targetAddress.length !== 64 || !form.reason}
              onClick={submit}>
              Issue Mandate
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Active Mandates List */}
      <div className="col-span-3">
        <Card>
          <CardHeader><div className="flex justify-between items-center"><CardTitle>Active Mandates ({mandates.filter((m) => m.active).length})</CardTitle>
            <Button variant="secondary" size="sm" onClick={load}>Refresh</Button></div></CardHeader>
          {loading ? <CardContent className="flex justify-center py-8"><Spinner /></CardContent> : (
            <Table>
              <thead><tr><Th>Target</Th><Th>Type</Th><Th>Issued</Th><Th>Status</Th></tr></thead>
              <tbody>
                {mandates.map((m) => (
                  <Tr key={m.id}>
                    <Td><Address value={m.target} /></Td>
                    <Td><Badge variant="red">{m.mandateType.replace(/_/g, " ")}</Badge></Td>
                    <Td className="text-xs text-gray-500">{formatDateTime(m.issuedAt)}</Td>
                    <Td><Badge variant={m.active ? "amber" : "gray"}>{m.active ? "Active" : "Lifted"}</Badge></Td>
                  </Tr>
                ))}
                {mandates.length === 0 && <Tr><Td colSpan={4} className="text-center text-gray-400">No mandates issued</Td></Tr>}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <PasswordModal isOpen={showModal} onClose={() => setShowModal(false)}
        onSuccess={() => { setShowModal(false); load(); }}
        txFields={txFields} summary={txSummary} />
    </div>
  );
};

export default RegulatorMandates;
