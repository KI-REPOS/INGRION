/**
 * INGRION Setup Wizard - 5-step onboarding flow
 * SETUP-1: Disclaimer
 * SETUP-2: Node Configuration
 * SETUP-3: Role & Category
 * SETUP-4: Private Key & Encryption
 * SETUP-5: Confirmation & Summary
 */
import React, { useState } from "react";
import { Button, Input, Badge, Spinner } from "@/components/ui";
import { testConnection } from "@/lib/api";
import { derivePublicKey, encryptKey, passwordStrength, validateHexKey } from "@/lib/crypto";
import { writeKeystore, writeNodeConfig, defaultConfig } from "@/lib/keystore";
import { useAppStore } from "@/store";
import type { Role, Category, Keystore, NodeStatus } from "@/types";

const TOTAL_STEPS = 5;
const DISCLAIMER_TEXT = `INGRION BLOCKCHAIN PLATFORM — LEGAL DISCLAIMER

1. This software interacts with a live blockchain network. All transactions submitted through this application are permanent and irreversible. Once confirmed on-chain, transactions cannot be undone, reversed, or modified.

2. PRIVATE KEY SECURITY IS SOLELY YOUR RESPONSIBILITY. Your Ed25519 private key is the only credential that authorises transactions from your account. INGRION stores only an encrypted copy on your device. If you lose your password or private key, access to your account and all associated assets will be permanently lost. INGRION cannot recover your key.

3. This application does not constitute financial advice. Nothing in this software should be interpreted as investment advice, financial guidance, or a recommendation to buy, sell, or hold any asset. You are solely responsible for your investment decisions.

4. This software must only be used on authorised INGRION nodes. Connecting to unauthorised or malicious nodes may result in data loss, incorrect balances, or security breaches.

5. THE OPERATOR OF THIS NODE IS SOLELY LIABLE for compliance with all applicable securities laws, financial regulations, and AML/KYC requirements in their jurisdiction. INGRION provides tools but does not guarantee regulatory compliance.

6. This software is provided "as is" without warranty of any kind, express or implied. Use at your own risk.

By checking the box below, you acknowledge that you have read, understood, and agree to these terms.`;

interface SetupWizardProps {
  onComplete: () => void;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const { setKeystore, setConfig } = useAppStore();

  // Step 1 state
  const [disclaimerScrolled, setDisclaimerScrolled] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);

  // Step 2 state
  const [nodeUrl, setNodeUrl] = useState("http://127.0.0.1:4001");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionState, setConnectionState] = useState<"idle" | "testing" | "success" | "failed">("idle");
  const [nodeStatusResult, setNodeStatusResult] = useState<NodeStatus | null>(null);
  const [nodeError, setNodeError] = useState("");

  // Step 3 state
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category>(null);

  // Step 4 state
  const [privateKey, setPrivateKey] = useState("");
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [derivedAddress, setDerivedAddress] = useState("");
  const [keyError, setKeyError] = useState("");
  const [onChainRole, setOnChainRole] = useState<string | null>(null);
  const [onChainBalance, setOnChainBalance] = useState<number | null>(null);
  const [onChainNonce, setOnChainNonce] = useState<number>(0);
  const [onChainError, setOnChainError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [keyUnderstood, setKeyUnderstood] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [keystoreResult, setKeystoreResult] = useState<Keystore | null>(null);

  // Step 5
  const [isLaunching, setIsLaunching] = useState(false);

  const strength = passwordStrength(password);
  const strengthColors = {
    weak: "bg-red-500",
    fair: "bg-amber-500",
    strong: "bg-blue-500",
    very_strong: "bg-green-500",
  };
  const strengthWidths = { weak: "25%", fair: "50%", strong: "75%", very_strong: "100%" };

  // ---- Step 2: Test Connection ----
  const handleTestConnection = async () => {
    setConnectionState("testing");
    setNodeError("");
    try {
      const status = await testConnection(nodeUrl, apiKey);
      setNodeStatusResult(status);
      setConnectionState("success");
    } catch (e) {
      setConnectionState("failed");
      setNodeError((e as Error).message || "Connection failed");
    }
  };

  // ---- Step 4: Derive address on key change ----
  const handleKeyChange = async (hex: string) => {
    setPrivateKey(hex);
    setKeyError("");
    setDerivedAddress("");
    setOnChainRole(null);
    setOnChainError("");

    if (validateHexKey(hex)) {
      try {
        const addr = await derivePublicKey(hex);
        setDerivedAddress(addr);
        // Verify on-chain
        setIsVerifying(true);
        try {
          // Use apiKey directly — store config not yet saved during setup
          const resp = await fetch(`${nodeUrl}/api/balance/${addr}`, {
            headers: { "X-API-Key": apiKey, "X-Caller-Address": addr },
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const acc = await resp.json();
          setOnChainRole(acc.role);
          setOnChainBalance(acc.balancePaise);
          setOnChainNonce(acc.nonce);
          if (acc.role !== selectedRole) {
            setOnChainError(`On-chain role is "${acc.role}" but you selected "${selectedRole}". Go back to fix this.`);
          }
        } catch (e) {
          setOnChainError("Address not found on chain or node unreachable.");
        } finally {
          setIsVerifying(false);
        }
      } catch {
        setKeyError("Invalid private key format.");
        setIsVerifying(false);
      }
    } else if (hex.length > 0) {
      setKeyError("Private key must be 64 hex characters (32 bytes).");
    }
  };

  // ---- Step 4: Encrypt ----
  const handleEncrypt = async () => {
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (password.length < 12) {
      setPasswordError("Password must be at least 12 characters.");
      return;
    }
    setIsEncrypting(true);
    try {
      const { salt, iv, encrypted_key } = await encryptKey(privateKey, password);
      const ks: Keystore = {
        version: "1",
        address: derivedAddress,
        role: selectedRole!,
        category: selectedRole === "user" ? selectedCategory : null,
        encrypted_key,
        salt,
        iv,
        pbkdf2_iterations: 600000,
        created_at: new Date().toISOString(),
      };
      setKeystoreResult(ks);
      setStep(5);
    } catch (e) {
      setPasswordError((e as Error).message);
    } finally {
      setIsEncrypting(false);
    }
  };

  // ---- Step 5: Launch ----
  const handleLaunch = async () => {
    if (!keystoreResult) return;
    setIsLaunching(true);

    const config = {
      ...defaultConfig(),
      node: { url: nodeUrl, apiKey },
    };

    await writeKeystore(keystoreResult);
    await writeNodeConfig({ url: nodeUrl, apiKey });

    setKeystore(keystoreResult);
    setConfig(config);

    setTimeout(() => {
      setIsLaunching(false);
      onComplete();
    }, 2000);
  };

  const roles = [
    { id: "user" as Role, name: "User / Investor", desc: "Trade stocks, participate in IPOs, transfer INR and shares.", icon: "📊", color: "#0D9488" },
    { id: "validator" as Role, name: "Validator", desc: "Operate a validator node, propose blocks, manage stake, vote on slashing.", icon: "🛡️", color: "#4338CA" },
    { id: "regulator" as Role, name: "Regulator", desc: "Oversee IPO filings, freeze accounts, issue mandates, access full analytics.", icon: "⚖️", color: "#9B1C1C" },
    { id: "company" as Role, name: "Company", desc: "File DRHPs, manage IPO lifecycle, issue dividends and corporate actions.", icon: "🏢", color: "#B45309" },
  ];

  const categories = [
    { id: "qib" as Category, label: "QIB", desc: "Qualified Institutional Bidder (40% quota)" },
    { id: "nib" as Category, label: "NIB", desc: "Non-Institutional Bidder (30% quota)" },
    { id: "retail" as Category, label: "Retail", desc: "Retail Investor (30% quota, lot-size constrained)" },
  ];

  const canProceed: Record<number, boolean> = {
    1: disclaimerAccepted,
    2: connectionState === "success",
    3: selectedRole !== null && (selectedRole !== "user" || selectedCategory !== null),
    4: !!(derivedAddress && !onChainError && password && confirmPassword === password && password.length >= 12 && keyUnderstood && keystoreResult === null),
    5: true,
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#0D1F33" }}>
      {/* Logo */}
      <div className="mb-8 text-center">
        <h1 className="text-5xl font-bold tracking-widest" style={{ color: "#C9A84C" }}>INGRION</h1>
        <p className="text-gray-400 text-sm mt-2">Permissioned Capital Markets Blockchain</p>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center gap-2 mb-8">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
          <React.Fragment key={s}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                s < step ? "bg-[#C9A84C] text-[#0D1F33]" :
                s === step ? "bg-[#C9A84C] text-[#0D1F33] ring-2 ring-[#F0D98A]" :
                "bg-white/10 text-gray-400"
              }`}
            >
              {s < step ? "✓" : s}
            </div>
            {s < TOTAL_STEPS && (
              <div className={`w-12 h-0.5 ${s < step ? "bg-[#C9A84C]" : "bg-white/10"}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        {/* ---- STEP 1: Disclaimer ---- */}
        {step === 1 && (
          <>
            <div className="px-8 py-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-[#1A3A5C]">Welcome to INGRION</h2>
              <p className="text-sm text-gray-500 mt-1">Step 1 of 5 — Legal Disclaimer</p>
            </div>
            <div className="px-8 py-6">
              <div
                className="h-64 overflow-y-auto bg-gray-50 rounded-lg p-4 text-xs text-gray-600 leading-relaxed whitespace-pre-wrap font-mono border border-gray-200"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 5) {
                    setDisclaimerScrolled(true);
                  }
                }}
              >
                {DISCLAIMER_TEXT}
              </div>
              {!disclaimerScrolled && (
                <p className="text-xs text-amber-600 mt-2">⚑ Scroll to the bottom of the disclaimer before accepting.</p>
              )}
              <label className={`flex items-center gap-3 mt-4 cursor-pointer ${!disclaimerScrolled ? "opacity-40 pointer-events-none" : ""}`}>
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[#C9A84C]"
                  checked={disclaimerAccepted}
                  onChange={(e) => setDisclaimerAccepted(e.target.checked)}
                  disabled={!disclaimerScrolled}
                />
                <span className="text-sm text-gray-700">I have read and accept the above disclaimer</span>
              </label>
            </div>
            <div className="px-8 py-4 border-t border-gray-100 flex justify-end">
              <Button variant="primary" disabled={!canProceed[1]} onClick={() => setStep(2)}>
                Continue →
              </Button>
            </div>
          </>
        )}

        {/* ---- STEP 2: Node Configuration ---- */}
        {step === 2 && (
          <>
            <div className="px-8 py-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-[#1A3A5C]">Connect to INGRION Node</h2>
              <p className="text-sm text-gray-500 mt-1">Step 2 of 5 — Node Configuration</p>
            </div>
            <div className="px-8 py-6 space-y-5">
              <Input
                label="Node RPC URL"
                value={nodeUrl}
                onChange={(e) => { setNodeUrl(e.target.value); setConnectionState("idle"); }}
                placeholder="http://127.0.0.1:4001"
              />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]"
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setConnectionState("idle"); }}
                    placeholder="Enter API key"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <Button variant="secondary" onClick={handleTestConnection} loading={connectionState === "testing"}>
                Test Connection
              </Button>

              {connectionState === "success" && nodeStatusResult && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-green-600 font-bold text-lg">✓</span>
                    <span className="font-semibold text-green-700">Connected Successfully</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Chain ID:</span> <span className="font-mono">{nodeStatusResult.chainId}</span></div>
                    <div><span className="text-gray-500">Height:</span> <span className="font-bold">#{nodeStatusResult.height}</span></div>
                    <div><span className="text-gray-500">Validators:</span> {nodeStatusResult.validatorCount}</div>
                    <div><span className="text-gray-500">Peers:</span> {nodeStatusResult.peersCount}</div>
                  </div>
                </div>
              )}

              {connectionState === "failed" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">⚠️ {nodeError || "Connection failed. Check URL and API key."}</p>
                </div>
              )}
            </div>
            <div className="px-8 py-4 border-t border-gray-100 flex justify-between">
              <Button variant="secondary" onClick={() => setStep(1)}>← Back</Button>
              <Button variant="primary" disabled={!canProceed[2]} onClick={() => setStep(3)}>Next →</Button>
            </div>
          </>
        )}

        {/* ---- STEP 3: Role & Category ---- */}
        {step === 3 && (
          <>
            <div className="px-8 py-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-[#1A3A5C]">Select Your Role</h2>
              <p className="text-sm text-gray-500 mt-1">Step 3 of 5 — This cannot be changed after setup.</p>
            </div>
            <div className="px-8 py-6">
              <div className="grid grid-cols-2 gap-3">
                {roles.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => { setSelectedRole(r.id); if (r.id !== "user") setSelectedCategory(null); }}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      selectedRole === r.id
                        ? "border-[#C9A84C] bg-[#EAF0F8]"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="text-2xl mb-2">{r.icon}</div>
                    <p className="font-bold text-sm" style={{ color: selectedRole === r.id ? r.color : "#1A3A5C" }}>{r.name}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{r.desc}</p>
                  </button>
                ))}
              </div>

              {/* Category for User role */}
              {selectedRole === "user" && (
                <div className="mt-5 p-4 bg-[#EAF0F8] rounded-xl animate-fade-in">
                  <p className="text-sm font-semibold text-[#1A3A5C] mb-3">Bidder Category (permanent)</p>
                  <div className="flex gap-3">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedCategory(c.id)}
                        className={`flex-1 p-3 rounded-lg border-2 text-center transition-all ${
                          selectedCategory === c.id
                            ? "border-[#C9A84C] bg-white"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                        title={c.desc}
                      >
                        <p className="font-bold text-sm text-[#1A3A5C]">{c.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{c.desc.split("(")[0].trim()}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-8 py-4 border-t border-gray-100 flex justify-between">
              <Button variant="secondary" onClick={() => setStep(2)}>← Back</Button>
              <Button variant="primary" disabled={!canProceed[3]} onClick={() => setStep(4)}>Next →</Button>
            </div>
          </>
        )}

        {/* ---- STEP 4: Private Key & Encryption ---- */}
        {step === 4 && (
          <>
            <div className="px-8 py-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-[#1A3A5C]">Secure Your Private Key</h2>
              <p className="text-sm text-gray-500 mt-1">Step 4 of 5 — Your key is encrypted locally. Never stored in plain text.</p>
            </div>
            <div className="px-8 py-6 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">
                  ⚠️ <strong>Your private key authorises ALL transactions.</strong> Never share it. If lost, it cannot be recovered from this application.
                </p>
              </div>

              {/* Private Key Input */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Private Key (64-char hex)</label>
                <div className="relative">
                  <input
                    type={showPrivateKey ? "text" : "password"}
                    className={`w-full px-3 py-2 pr-16 border rounded-md text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C] ${keyError ? "border-red-500" : "border-gray-300"}`}
                    value={privateKey}
                    onChange={(e) => handleKeyChange(e.target.value.trim())}
                    placeholder="Paste your 64-character hex private key..."
                    maxLength={64}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                  >
                    {showPrivateKey ? "Hide" : "Show"}
                  </button>
                </div>
                {keyError && <p className="text-xs text-red-600">{keyError}</p>}
              </div>

              {/* Derived Address */}
              {isVerifying && (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Spinner size="sm" /> Verifying on-chain...
                </div>
              )}
              {derivedAddress && !isVerifying && (
                <div className="space-y-2">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Your Address</p>
                    <p className="font-mono text-xs text-green-700 break-all">{derivedAddress}</p>
                  </div>
                  {onChainRole && !onChainError && (
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="teal">Role: {onChainRole}</Badge>
                      {onChainBalance !== null && (
                        <span className="text-gray-600">Balance: {(onChainBalance / 100).toFixed(2)} INR</span>
                      )}
                    </div>
                  )}
                  {onChainError && (
                    <div className="bg-red-50 border border-red-200 rounded p-2">
                      <p className="text-xs text-red-700">{onChainError}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Password */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Encryption Password (min. 12 characters)</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password..."
                />
                {password && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${strengthColors[strength]}`}
                        style={{ width: strengthWidths[strength] }}
                      />
                    </div>
                    <span className={`text-xs font-medium capitalize ${strength === "weak" ? "text-red-600" : strength === "fair" ? "text-amber-600" : "text-green-600"}`}>
                      {strength.replace("_", " ")}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Confirm Password</label>
                <input
                  type="password"
                  className={`w-full px-3 py-2 border rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C] ${
                    confirmPassword && confirmPassword !== password ? "border-red-500" : "border-gray-300"
                  }`}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password..."
                />
                {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
              </div>

              {/* Understanding checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 mt-0.5 accent-[#C9A84C]"
                  checked={keyUnderstood}
                  onChange={(e) => setKeyUnderstood(e.target.checked)}
                />
                <span className="text-xs text-gray-600">
                  I understand this password cannot be recovered. If I forget it, I must re-setup the application and import my private key again.
                </span>
              </label>
            </div>
            <div className="px-8 py-4 border-t border-gray-100 flex justify-between">
              <Button variant="secondary" onClick={() => setStep(3)}>← Back</Button>
              <Button
                variant="primary"
                loading={isEncrypting}
                disabled={
                  !derivedAddress || !!onChainError || !password ||
                  confirmPassword !== password || password.length < 12 || !keyUnderstood
                }
                onClick={handleEncrypt}
              >
                Encrypt & Continue →
              </Button>
            </div>
          </>
        )}

        {/* ---- STEP 5: Confirmation ---- */}
        {step === 5 && keystoreResult && (
          <>
            <div className="px-8 py-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-[#1A3A5C]">Setup Complete</h2>
              <p className="text-sm text-gray-500 mt-1">Step 5 of 5 — Review your configuration</p>
            </div>
            <div className="px-8 py-6 space-y-5">
              {/* Summary card */}
              <div className="bg-[#EAF0F8] rounded-xl p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Address</p>
                    <p className="font-mono text-xs text-[#1A3A5C] break-all mt-0.5">{keystoreResult.address}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Role</p>
                    <p className="font-semibold mt-0.5">{keystoreResult.role.toUpperCase()}</p>
                  </div>
                  {keystoreResult.category && (
                    <div>
                      <p className="text-xs text-gray-500">Category</p>
                      <p className="font-semibold mt-0.5">{keystoreResult.category.toUpperCase()}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500">Node URL</p>
                    <p className="font-mono text-xs mt-0.5">{nodeUrl}</p>
                  </div>
                  {nodeStatusResult && (
                    <>
                      <div>
                        <p className="text-xs text-gray-500">Chain ID</p>
                        <p className="font-mono text-xs mt-0.5">{nodeStatusResult.chainId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Current Block</p>
                        <p className="font-bold mt-0.5">#{nodeStatusResult.height}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Security checklist */}
              <div className="space-y-2">
                {[
                  "Private key is AES-256-GCM encrypted",
                  "Encryption password is NOT stored in this application",
                  "Configuration cannot be changed after launch",
                  "Keystore saved to AppData/INGRION/keystore.json",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="text-green-600">✓</span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="px-8 py-4 border-t border-gray-100 flex justify-between">
              <Button variant="secondary" onClick={() => { setStep(4); setKeystoreResult(null); }}>← Back</Button>
              <Button
                variant="primary"
                size="lg"
                loading={isLaunching}
                onClick={handleLaunch}
                className="min-w-48"
              >
                {isLaunching ? "Launching INGRION..." : "🚀 Launch INGRION"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SetupWizard;
