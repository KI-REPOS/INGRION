/**
 * USER-02: Send INR Transaction Page
 * Supports UPI-style phone/name lookup AND raw 64-char address input.
 */
import React, { useState, useRef, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Address, Badge } from "@/components/ui";
import { PasswordModal } from "@/components/modals/PasswordModal";
import { useAppStore } from "@/store";
import { getBalance } from "@/lib/api";
import { paiseToCurrency } from "@/lib/utils";
import { hashFile } from "@/lib/crypto";

// ─────────────────────────────────────────────────────────────────────────────
// HARDCODED CONTACT BOOK
// Each entry: { name, phone, address (64-char hex public key) }
// Replace / extend this list with real users on your Ingrion network.
// ─────────────────────────────────────────────────────────────────────────────
interface Contact {
  name: string;
  phone: string;
  address: string;
  initials: string;
  color: string;
}

const CONTACTS: Contact[] = [
  { name: "Aarav Sharma",    phone: "9876543210", address: "f5408b8874c9ef0a7f676d5b69322ed39b780b1cddd63ab76e36e4c5c00ad150", initials: "AS", color: "#1A3A5C" },
  { name: "Bhavna Patel",    phone: "9123456780", address: "5678e9da8fa93aac8e13f2989d68b0147d4649ddb6d957f47456453ad4fc316a", initials: "BP", color: "#C9A84C" },
  { name: "Chirag Mehta",    phone: "9988776655", address: "23d52ecf777498e02eda164dc3cbc74231e40a1d4c1a19050d6ca9c6ad85d7fc", initials: "CM", color: "#2E7D6B" },
  { name: "Divya Reddy",     phone: "9871234560", address: "08268a20545ba5d72f86c954bda04a43e31ce1459c6770f3cd10494fde5d7bb3", initials: "DR", color: "#7B3F9E" },
  { name: "Eshan Gupta",     phone: "9765432109", address: "346f628e16ed8e035005e11a0ebaae202716de3f9497411553b9793db1075d58", initials: "EG", color: "#C0392B" },
  { name: "Farida Shaikh",   phone: "9654321098", address: "ce99f8dde5b823bffb0928fbba1c719f4fd9e88ed90b3e01252ec20f7eff33d9", initials: "FS", color: "#1A3A5C" },
  { name: "Gaurav Joshi",    phone: "9543210987", address: "4ca3a0ef65fcd00d4414986c484265f89c554aae416cfa090e3da546b22c715f", initials: "GJ", color: "#C9A84C" },
  { name: "Hema Iyer",       phone: "9432109876", address: "5a84a2408d7867fc7d708d4c822411a6b8cf1e90eba8962daf316754f13aef95", initials: "HI", color: "#2E7D6B" },
  { name: "Imran Khan",      phone: "9321098765", address: "81ec5efec28bd2ad6c3ff65f0bd4a56c4884ff566df8b7a8d2aa4c88ae042e36", initials: "IK", color: "#7B3F9E" },
  { name: "Jyoti Nair",      phone: "9210987654", address: "144171be66d9da444ef5525e08ba2f158d21b7e83ec20c4204653cf3ba78e1da", initials: "JN", color: "#C0392B" },
  { name: "Karan Verma",     phone: "9109876543", address: "961546dfd742ca7fad64ef17ace247c502903c853f548bb5aa1f3fc73f8417ca", initials: "KV", color: "#1A3A5C" },
  { name: "Lakshmi Pillai",  phone: "9098765432", address: "42da010c56fd8152c24b26119fe090baf1985b12ba63bc839c829c619e185af3", initials: "LP", color: "#C9A84C" },
  { name: "Manoj Tiwari",    phone: "8987654321", address: "e86aa733063c3cbf36e860c7af7023c28def0463842b211c9ac61d3809008aab", initials: "MT", color: "#2E7D6B" },
  { name: "Nisha Bose",      phone: "8876543210", address: "7bbc6636b6e0d5c70b65188c8c38b7d3d62035150752ea5fdfccb042d87efef6", initials: "NB", color: "#7B3F9E" },
  { name: "Om Prakash",      phone: "8765432109", address: "fe4b51f63583da7a13d931334db90f114bce35d86f3694fd73cd0ff5bacd8f4b", initials: "OP", color: "#C0392B" },
  { name: "Pooja Agarwal",   phone: "8654321098", address: "62c5ff0bdc37ffdb3eb0c73c3a9b539c8dc82840b8ef089fd2f6358ffceba6f0", initials: "PA", color: "#1A3A5C" },
  { name: "Qasim Ali",       phone: "8543210987", address: "64729fc68b6585edb0660184940bd89e9803e2b88eef0be6c67936b0db465e27", initials: "QA", color: "#C9A84C" },
  { name: "Rashmi Kulkarni", phone: "8432109876", address: "7aeeb34a20685327d65f2711dbfd4e361ad40f4b1b10845280453b77d50cfecf", initials: "RK", color: "#2E7D6B" },
  { name: "Suresh Yadav",    phone: "8321098765", address: "8abdbba762f0b04cd9809da16ee752a74fb72381686ddb606317133bcf01100d", initials: "SY", color: "#7B3F9E" },
  { name: "Tanvi Desai",     phone: "8210987654", address: "28b7d65bb887fa929ecce4183e420d2064c662398c2d94018fe3415420ed30f7", initials: "TD", color: "#C0392B" },
  { name: "Uday Menon",      phone: "8109876543", address: "b496a39ce6111f9b4de3d3f2652d4bcaddb9cda783918e66af63bb0b89122250", initials: "UM", color: "#1A3A5C" },
  { name: "Vandana Singh",   phone: "7998765432", address: "4d7be546155e91c7c6ea8a318f77b1219043564f9482271efe415828ab5938f0", initials: "VS", color: "#C9A84C" },
  { name: "Wasim Ansari",    phone: "7887654321", address: "9464f26963d8c7e50fb63eb22f7a78e53fba65550919990491a51d96b6821419", initials: "WA", color: "#2E7D6B" },
  { name: "Xena D'Souza",    phone: "7776543210", address: "b755cc5b9af4cfe5df36315574cdce1985747552f1d91134e94c3eec191fb397", initials: "XD", color: "#7B3F9E" },
  { name: "Yash Chopra",     phone: "7665432109", address: "4997a8a7d9de7fbefe910b5ecb57b3acf2767d8eebd36c62c2b9221e371c9be2", initials: "YC", color: "#C0392B" },
  { name: "Zara Mirza",      phone: "7554321098", address: "954d3ed2dfb9102ece8e6527113eee0569af627182ed595fafb9a40403f4edfc", initials: "ZM", color: "#1A3A5C" },
  { name: "Ankit Roy",       phone: "7443210987", address: "43cbfbe9e28e88f6f779b20b5d5bf3729576e59bffb69d7f533e57f2d9010929", initials: "AR", color: "#C9A84C" },
  { name: "Bharati Das",     phone: "7332109876", address: "c006039459024b9589ce2e74d05a20f8404a0ec7ef93ad2cb8a5178c216c1bc6", initials: "BD", color: "#2E7D6B" },
  { name: "Chetan Garg",     phone: "7221098765", address: "3d8719873fb937067143099a8b9a169ffbbe12e3f3c1109490546c24cc06c1fa", initials: "CG", color: "#7B3F9E" },
  { name: "Deepa Kumar",     phone: "7110987654", address: "f0e6e57b88dc50aa919bf61546e95a2f2f8c6fa9f9e3b0407eedd01978b9568a", initials: "DK", color: "#C0392B" },
];
// ─────────────────────────────────────────────────────────────────────────────

type InputMode = "upi" | "address";

const Avatar: React.FC<{ contact: Contact; size?: "sm" | "md" }> = ({ contact, size = "md" }) => {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: contact.color }}
    >
      {contact.initials}
    </div>
  );
};

const SendINR: React.FC = () => {
  const { keystore, balancePaise, blockedPaise } = useAppStore();
  const available = balancePaise - blockedPaise;

  const [inputMode, setInputMode] = useState<InputMode>("upi");

  // UPI mode
  const [searchQuery, setSearchQuery]         = useState("");
  const [searchResults, setSearchResults]     = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showDropdown, setShowDropdown]       = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Address mode
  const [toAddress, setToAddress] = useState("");
  const [toError, setToError]     = useState("");
  const [toValid, setToValid]     = useState<boolean | null>(null);

  // Common
  const [amount, setAmount]               = useState("");
  const [showDocHash, setShowDocHash]     = useState(false);
  const [docFile, setDocFile]             = useState<File | null>(null);
  const [docHash, setDocHash]             = useState("");
  const [isHashingDoc, setIsHashingDoc]   = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [successHash, setSuccessHash]     = useState("");

  const amountPaise    = Math.round(parseFloat(amount || "0") * 100);
  const isAmountValid  = amountPaise > 0 && amountPaise <= available;

  const recipientAddress = inputMode === "upi" ? (selectedContact?.address || "") : toAddress;
  const recipientValid   = inputMode === "upi" ? !!selectedContact : toValid === true;
  const canSubmit        = recipientValid && isAmountValid;

  // ── UPI search ──────────────────────────────────────────────────────────────
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    setSelectedContact(null);
    if (!q.trim()) { setSearchResults([]); setShowDropdown(false); return; }
    const lower   = q.toLowerCase().trim();
    const results = CONTACTS.filter(
      (c) => c.name.toLowerCase().includes(lower) || c.phone.includes(lower)
    ).slice(0, 6);
    setSearchResults(results);
    setShowDropdown(results.length > 0);
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setSearchQuery(contact.phone);
    setShowDropdown(false);
    setSearchResults([]);
  };

  const handleClearContact = () => {
    setSelectedContact(null);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Raw address ─────────────────────────────────────────────────────────────
  const validateAddress = async (addr: string) => {
    setToAddress(addr);
    setToValid(null);
    setToError("");
    if (!addr || addr.length !== 64) {
      if (addr.length > 0) setToError("Address must be 64 hex characters");
      return;
    }
    try { await getBalance(addr); setToValid(true); }
    catch { setToValid(false); setToError("Address not found on chain"); }
  };

  const switchMode = (mode: InputMode) => {
    setInputMode(mode);
    setSelectedContact(null); setSearchQuery(""); setSearchResults([]); setShowDropdown(false);
    setToAddress(""); setToError(""); setToValid(null);
    setSuccessHash("");
  };

  // ── Doc hash ────────────────────────────────────────────────────────────────
  const handleDocFile = async (file: File) => {
    setDocFile(file); setIsHashingDoc(true);
    setDocHash(await hashFile(file));
    setIsHashingDoc(false);
  };

  const txFields: Record<string, unknown> = {
    type: "tnx_sendINR",
    to: recipientAddress,
    amountPaise,
    ...(docHash ? { meta: { docHash, fileName: docFile?.name || "" } } : {}),
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto">
      <Card>
        <CardHeader><CardTitle>Send INR</CardTitle></CardHeader>
        <CardContent className="space-y-5">

          {/* From */}
          <div>
            <p className="text-xs text-gray-500 mb-1">From</p>
            <div className="flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2">
              <Address value={keystore?.address || ""} />
              <Badge variant="teal">YOU</Badge>
            </div>
          </div>

          {/* Balance */}
          <div className="bg-[#EAF0F8] rounded-lg px-4 py-3 flex justify-between">
            <span className="text-sm text-gray-600">Available Balance</span>
            <span className="font-bold text-[#1A3A5C]">{paiseToCurrency(available)}</span>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
            <button
              className={`flex-1 py-2 transition-colors ${inputMode === "upi" ? "bg-[#1A3A5C] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              onClick={() => switchMode("upi")}
            >
              📱 Phone / Name
            </button>
            <button
              className={`flex-1 py-2 border-l border-gray-200 transition-colors ${inputMode === "address" ? "bg-[#1A3A5C] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              onClick={() => switchMode("address")}
            >
              🔑 Wallet Address
            </button>
          </div>

          {/* ── UPI mode ── */}
          {inputMode === "upi" && (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">
                Search by Phone Number or Name
              </label>

              {selectedContact ? (
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <Avatar contact={selectedContact} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{selectedContact.name}</p>
                    <p className="text-xs text-gray-500">📱 {selectedContact.phone}</p>
                    <p className="text-xs font-mono text-gray-400 truncate">
                      {selectedContact.address.slice(0, 16)}...{selectedContact.address.slice(-8)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-green-600 text-sm">✓</span>
                    <button className="text-xs text-gray-400 hover:text-red-500 px-1" onClick={handleClearContact} title="Clear">✕</button>
                  </div>
                </div>
              ) : (
                <div className="relative" ref={searchRef}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                    <input
                      className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]"
                      placeholder="Type name or 10-digit phone number..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
                    />
                    {searchQuery && (
                      <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs" onClick={() => handleSearch("")}>✕</button>
                    )}
                  </div>

                  {showDropdown && searchResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      {searchResults.map((contact) => (
                        <button
                          key={contact.address}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#EAF0F8] transition-colors text-left"
                          onClick={() => handleSelectContact(contact)}
                        >
                          <Avatar contact={contact} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">{contact.name}</p>
                            <p className="text-xs text-gray-500">📱 {contact.phone}</p>
                          </div>
                          <span className="text-xs text-gray-300 font-mono flex-shrink-0">{contact.address.slice(0, 8)}…</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchQuery.trim() && searchResults.length === 0 && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg text-center">
                      <p className="text-xs text-gray-500">No contact found for "{searchQuery}"</p>
                      <button className="text-xs text-[#1A3A5C] font-medium mt-1 hover:underline" onClick={() => switchMode("address")}>
                        Switch to wallet address input →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {!selectedContact && !searchQuery && (
                <p className="text-xs text-gray-400 mt-1.5">
                  Type a name like "Aarav" or a phone number like "9876543210"
                </p>
              )}
            </div>
          )}

          {/* ── Address mode ── */}
          {inputMode === "address" && (
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Recipient Wallet Address</label>
              <div className="relative">
                <input
                  className={`w-full px-3 py-2 pr-20 border rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C] ${
                    toError ? "border-red-500" : toValid === true ? "border-green-500" : "border-gray-300"
                  }`}
                  placeholder="64-character hex address..."
                  value={toAddress}
                  onChange={(e) => validateAddress(e.target.value.trim())}
                  maxLength={64}
                />
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#1A3A5C] bg-[#EAF0F8] px-2 py-1 rounded"
                  onClick={async () => { const txt = await navigator.clipboard.readText(); validateAddress(txt.trim()); }}
                >
                  Paste
                </button>
              </div>
              {toError && <p className="text-xs text-red-600 mt-1">{toError}</p>}
              {toValid === true && <p className="text-xs text-green-600 mt-1">✓ Address verified on chain</p>}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Amount (INR)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
              <input
                className={`w-full pl-7 pr-16 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C] ${amount && !isAmountValid ? "border-red-500" : "border-gray-300"}`}
                type="number" min="0.01" step="0.01" placeholder="0.00"
                value={amount} onChange={(e) => setAmount(e.target.value)}
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#1A3A5C] bg-[#EAF0F8] px-2 py-1 rounded" onClick={() => setAmount((available / 100).toFixed(2))}>Max</button>
            </div>
            {amount && <p className="text-xs text-gray-500 mt-1">{amountPaise.toLocaleString()} paise</p>}
            {amount && !isAmountValid && amountPaise > 0 && <p className="text-xs text-red-600 mt-1">Exceeds available balance</p>}
          </div>

          {/* Document hash */}
          <div>
            <button className="text-xs text-[#1A3A5C] font-medium flex items-center gap-1 hover:underline" onClick={() => setShowDocHash(!showDocHash)}>
              {showDocHash ? "▼" : "▶"} Attach Document Hash (optional)
            </button>
            {showDocHash && (
              <div className="mt-3 space-y-3 p-4 bg-gray-50 rounded-lg">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-[#C9A84C]" onClick={() => document.getElementById("doc-hash-input")?.click()}>
                  <input id="doc-hash-input" type="file" accept=".pdf,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocFile(f); }} />
                  {isHashingDoc ? <p className="text-sm text-gray-500">Hashing...</p> : docFile ? <p className="text-sm text-green-700">✓ {docFile.name}</p> : <p className="text-sm text-gray-500">Click to select PDF or JSON</p>}
                </div>
                {docHash && (
                  <div>
                    <p className="text-xs text-gray-500">SHA-256 Hash</p>
                    <code className="text-xs font-mono text-[#1A3A5C] break-all">{docHash}</code>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fee */}
          <div className="text-xs text-gray-400 flex justify-between">
            <span>Transaction fee (estimated)</span>
            <span>~1 paise (gas)</span>
          </div>

          {/* Submit */}
          <Button variant="primary" className="w-full" disabled={!canSubmit} onClick={() => setShowPasswordModal(true)}>
            Send INR →
          </Button>

          {successHash && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-sm font-semibold text-green-700">Transaction Submitted!</p>
              <code className="text-xs font-mono text-gray-600 break-all">{successHash}</code>
            </div>
          )}
        </CardContent>
      </Card>

      <PasswordModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSuccess={(hash) => { setSuccessHash(hash); setShowPasswordModal(false); }}
        txFields={txFields}
        summary={{
          type: "Send INR",
          to: recipientAddress,
          amount: amountPaise,
          extra: selectedContact
            ? `To ${selectedContact.name} (${selectedContact.phone})`
            : docHash ? "With document hash" : undefined,
        }}
      />
    </div>
  );
};

export default SendINR;



// /**
//  * USER-02: Send INR Transaction Page
//  */
// import React, { useState } from "react";
// import { Card, CardHeader, CardTitle, CardContent, Button, Input, Address, Badge } from "@/components/ui";
// import { PasswordModal } from "@/components/modals/PasswordModal";
// import { useAppStore } from "@/store";
// import { getBalance } from "@/lib/api";
// import { paiseToCurrency } from "@/lib/utils";
// import { hashFile } from "@/lib/crypto";

// const SendINR: React.FC = () => {
//   const { keystore, balancePaise, blockedPaise } = useAppStore();
//   const available = balancePaise - blockedPaise;

//   const [toAddress, setToAddress] = useState("");
//   const [toError, setToError] = useState("");
//   const [toValid, setToValid] = useState<boolean | null>(null);
//   const [amount, setAmount] = useState("");
//   const [showDocHash, setShowDocHash] = useState(false);
//   const [docFile, setDocFile] = useState<File | null>(null);
//   const [docHash, setDocHash] = useState("");
//   const [isHashingDoc, setIsHashingDoc] = useState(false);
//   const [showPasswordModal, setShowPasswordModal] = useState(false);
//   const [successHash, setSuccessHash] = useState("");

//   const amountPaise = Math.round(parseFloat(amount || "0") * 100);
//   const isAmountValid = amountPaise > 0 && amountPaise <= available;

//   const validateAddress = async (addr: string) => {
//     setToAddress(addr);
//     setToValid(null);
//     setToError("");
//     if (!addr || addr.length !== 64) {
//       if (addr.length > 0) setToError("Address must be 64 hex characters");
//       return;
//     }
//     try {
//       await getBalance(addr);
//       setToValid(true);
//     } catch {
//       setToValid(false);
//       setToError("Address not found on chain");
//     }
//   };

//   const handleDocFile = async (file: File) => {
//     setDocFile(file);
//     setIsHashingDoc(true);
//     const hash = await hashFile(file);
//     setDocHash(hash);
//     setIsHashingDoc(false);
//   };

//   const txFields: Record<string, unknown> = {
//     type: "tnx_sendINR",
//     to: toAddress,
//     amountPaise,
//     ...(docHash ? { meta: { docHash, fileName: docFile?.name || "" } } : {}),
//   };

//   const canSubmit = toValid === true && isAmountValid;

//   return (
//     <div className="max-w-xl mx-auto">
//       <Card>
//         <CardHeader>
//           <CardTitle>Send INR</CardTitle>
//         </CardHeader>
//         <CardContent className="space-y-5">
//           {/* From */}
//           <div>
//             <p className="text-xs text-gray-500 mb-1">From</p>
//             <div className="flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2">
//               <Address value={keystore?.address || ""} />
//               <Badge variant="teal">YOU</Badge>
//             </div>
//           </div>

//           {/* Balance */}
//           <div className="bg-[#EAF0F8] rounded-lg px-4 py-3 flex justify-between">
//             <span className="text-sm text-gray-600">Available Balance</span>
//             <span className="font-bold text-[#1A3A5C]">{paiseToCurrency(available)}</span>
//           </div>

//           {/* To address */}
//           <div>
//             <label className="text-xs font-medium text-gray-700 block mb-1">Recipient Address</label>
//             <div className="relative">
//               <input
//                 className={`w-full px-3 py-2 pr-20 border rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C] ${
//                   toError ? "border-red-500" : toValid === true ? "border-green-500" : "border-gray-300"
//                 }`}
//                 placeholder="64-character hex address..."
//                 value={toAddress}
//                 onChange={(e) => validateAddress(e.target.value.trim())}
//                 maxLength={64}
//               />
//               <button
//                 className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#1A3A5C] bg-[#EAF0F8] px-2 py-1 rounded"
//                 onClick={async () => {
//                   const txt = await navigator.clipboard.readText();
//                   validateAddress(txt.trim());
//                 }}
//               >
//                 Paste
//               </button>
//             </div>
//             {toError && <p className="text-xs text-red-600 mt-1">{toError}</p>}
//             {toValid === true && <p className="text-xs text-green-600 mt-1">✓ Address verified on chain</p>}
//           </div>

//           {/* Amount */}
//           <div>
//             <label className="text-xs font-medium text-gray-700 block mb-1">Amount (INR)</label>
//             <div className="relative">
//               <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
//               <input
//                 className={`w-full pl-7 pr-16 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C] ${
//                   amount && !isAmountValid ? "border-red-500" : "border-gray-300"
//                 }`}
//                 type="number"
//                 min="0.01"
//                 step="0.01"
//                 placeholder="0.00"
//                 value={amount}
//                 onChange={(e) => setAmount(e.target.value)}
//               />
//               <button
//                 className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#1A3A5C] bg-[#EAF0F8] px-2 py-1 rounded"
//                 onClick={() => setAmount((available / 100).toFixed(2))}
//               >
//                 Max
//               </button>
//             </div>
//             {amount && (
//               <p className="text-xs text-gray-500 mt-1">{amountPaise.toLocaleString()} paise</p>
//             )}
//             {amount && !isAmountValid && amountPaise > 0 && (
//               <p className="text-xs text-red-600 mt-1">Exceeds available balance</p>
//             )}
//           </div>

//           {/* Document hash toggle */}
//           <div>
//             <button
//               className="text-xs text-[#1A3A5C] font-medium flex items-center gap-1 hover:underline"
//               onClick={() => setShowDocHash(!showDocHash)}
//             >
//               {showDocHash ? "▼" : "▶"} Attach Document Hash (optional)
//             </button>
//             {showDocHash && (
//               <div className="mt-3 space-y-3 p-4 bg-gray-50 rounded-lg">
//                 <div
//                   className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-[#C9A84C]"
//                   onClick={() => document.getElementById("doc-hash-input")?.click()}
//                 >
//                   <input
//                     id="doc-hash-input"
//                     type="file"
//                     accept=".pdf,.json"
//                     className="hidden"
//                     onChange={(e) => { const f = e.target.files?.[0]; if (f) handleDocFile(f); }}
//                   />
//                   {isHashingDoc ? <p className="text-sm text-gray-500">Hashing...</p> :
//                     docFile ? <p className="text-sm text-green-700">✓ {docFile.name}</p> :
//                     <p className="text-sm text-gray-500">Click to select PDF or JSON</p>
//                   }
//                 </div>
//                 {docHash && (
//                   <div>
//                     <p className="text-xs text-gray-500">SHA-256 Hash</p>
//                     <code className="text-xs font-mono text-[#1A3A5C] break-all">{docHash}</code>
//                   </div>
//                 )}
//               </div>
//             )}
//           </div>

//           {/* Fee estimate */}
//           <div className="text-xs text-gray-400 flex justify-between">
//             <span>Transaction fee (estimated)</span>
//             <span>~1 paise (gas)</span>
//           </div>

//           {/* Submit */}
//           <Button
//             variant="primary"
//             className="w-full"
//             disabled={!canSubmit}
//             onClick={() => setShowPasswordModal(true)}
//           >
//             Send INR →
//           </Button>

//           {successHash && (
//             <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
//               <p className="text-sm font-semibold text-green-700">Transaction Submitted!</p>
//               <code className="text-xs font-mono text-gray-600 break-all">{successHash}</code>
//             </div>
//           )}
//         </CardContent>
//       </Card>

//       <PasswordModal
//         isOpen={showPasswordModal}
//         onClose={() => setShowPasswordModal(false)}
//         onSuccess={(hash) => { setSuccessHash(hash); setShowPasswordModal(false); }}
//         txFields={txFields}
//         summary={{
//           type: "Send INR",
//           to: toAddress,
//           amount: amountPaise,
//           extra: docHash ? `With document hash` : undefined,
//         }}
//       />
//     </div>
//   );
// };

// export default SendINR;
