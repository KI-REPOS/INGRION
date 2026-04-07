/**
 * COMMON-02: Settings Page
 */
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Badge, Address } from "@/components/ui";
import { useAppStore } from "@/store";
import { testConnection } from "@/lib/api";
import { writeNodeConfig } from "@/lib/keystore";
import { decryptKey, encryptKey, derivePublicKey } from "@/lib/crypto";

const Settings: React.FC = () => {
  const { keystore, config, setConfig, nodeOnline, nodeStatus } = useAppStore();
  const [nodeUrl, setNodeUrl] = useState(config?.node.url || "http://127.0.0.1:4001");
  const [apiKey, setApiKey] = useState(config?.node.apiKey || "");
  const [showApiKey, setShowApiKey] = useState(false);
  const [testState, setTestState] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [testError, setTestError] = useState("");

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pwChangeState, setPwChangeState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [pwError, setPwError] = useState("");

  // Show address
  const [showAddressPassword, setShowAddressPassword] = useState("");
  const [derivedAddress, setDerivedAddress] = useState("");
  const [showAddressError, setShowAddressError] = useState("");

  const handleTestSave = async () => {
    setTestState("testing");
    setTestError("");
    try {
      await testConnection(nodeUrl, apiKey);
      const newConfig = { ...config!, node: { ...config!.node, url: nodeUrl, apiKey } };
      await writeNodeConfig({ url: nodeUrl, apiKey });
      setConfig(newConfig);
      setTestState("success");
    } catch (e) {
      setTestError((e as Error).message);
      setTestState("error");
    }
  };

  const handleChangePassword = async () => {
    if (!keystore) return;
    if (newPassword !== confirmNewPassword) { setPwError("Passwords do not match"); return; }
    if (newPassword.length < 12) { setPwError("New password must be at least 12 characters"); return; }
    setPwChangeState("loading");
    try {
      const seed = await decryptKey(keystore.encrypted_key, keystore.salt, keystore.iv, currentPassword, keystore.pbkdf2_iterations);
      const { salt, iv, encrypted_key } = await encryptKey(seed, newPassword);
      const { writeKeystore } = await import("@/lib/keystore");
      await writeKeystore({ ...keystore, encrypted_key, salt, iv });
      setPwChangeState("success");
      setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword("");
    } catch {
      setPwError("Current password is incorrect");
      setPwChangeState("error");
    }
  };

  const handleShowAddress = async () => {
    if (!keystore) return;
    try {
      const seed = await decryptKey(keystore.encrypted_key, keystore.salt, keystore.iv, showAddressPassword, keystore.pbkdf2_iterations);
      const addr = await derivePublicKey(seed);
      setDerivedAddress(addr);
      setShowAddressError("");
    } catch {
      setShowAddressError("Incorrect password");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Node Settings */}
      <Card>
        <CardHeader><CardTitle>Node Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Node RPC URL"
            value={nodeUrl}
            onChange={(e) => { setNodeUrl(e.target.value); setTestState("idle"); }}
          />
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                className="w-full px-3 py-2 pr-16 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestState("idle"); }}
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" onClick={() => setShowApiKey(!showApiKey)}>
                {showApiKey ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleTestSave} loading={testState === "testing"}>
              Test & Save
            </Button>
            {testState === "success" && <span className="text-green-600 text-sm">✓ Saved</span>}
            {testState === "error" && <span className="text-red-600 text-xs">{testError}</span>}
          </div>
          {/* Current node info */}
          <div className="bg-[#EAF0F8] rounded p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <Badge variant={nodeOnline ? "green" : "red"}>{nodeOnline ? "Online" : "Offline"}</Badge>
            </div>
            {nodeStatus && (
              <>
                <div className="flex justify-between"><span className="text-gray-500">Chain ID</span><span className="font-mono text-xs">{nodeStatus.chainId}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Block Height</span><span className="font-bold">#{nodeStatus.height.toLocaleString()}</span></div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Account Info (Read-Only) */}
      <Card>
        <CardHeader><CardTitle>Account Info</CardTitle></CardHeader>
        <CardContent>
          <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4">
            <p className="text-xs text-amber-800">Identity cannot be changed after setup</p>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Address</span>
              <Address value={keystore?.address || ""} />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Role</span>
              <Badge variant={keystore?.role === "user" ? "teal" : keystore?.role === "validator" ? "indigo" : keystore?.role === "regulator" ? "red" : "amber"}>
                {keystore?.role?.toUpperCase()}
              </Badge>
            </div>
            {keystore?.category && (
              <div className="flex justify-between">
                <span className="text-gray-500">Category</span>
                <span className="font-semibold">{keystore.category.toUpperCase()}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader><CardTitle>Security</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {/* Change Password */}
          <div>
            <h3 className="text-sm font-semibold text-[#1A3A5C] mb-3">Change Password</h3>
            <div className="space-y-3">
              <Input label="Current Password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              <Input label="New Password (min 12 chars)" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <Input label="Confirm New Password" type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} />
              {pwError && <p className="text-xs text-red-600">{pwError}</p>}
              {pwChangeState === "success" && <p className="text-xs text-green-600">✓ Password changed successfully</p>}
              <Button
                variant="secondary"
                loading={pwChangeState === "loading"}
                disabled={!currentPassword || !newPassword || !confirmNewPassword}
                onClick={handleChangePassword}
              >
                Change Password
              </Button>
            </div>
          </div>

          {/* Show Address */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-[#1A3A5C] mb-3">Verify Address</h3>
            <div className="flex gap-3">
              <input
                type="password"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]"
                placeholder="Enter password to derive address..."
                value={showAddressPassword}
                onChange={(e) => setShowAddressPassword(e.target.value)}
              />
              <Button variant="secondary" onClick={handleShowAddress}>Show</Button>
            </div>
            {showAddressError && <p className="text-xs text-red-600 mt-1">{showAddressError}</p>}
            {derivedAddress && (
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded">
                <p className="text-xs text-gray-500">Derived Address</p>
                <code className="text-xs font-mono text-green-700 break-all">{derivedAddress}</code>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* UI Preferences */}
      <Card>
        <CardHeader><CardTitle>UI Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-gray-500">Light / Dark / System</p>
            </div>
            <select
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none"
              value={config?.theme || "dark"}
              onChange={(e) => config && setConfig({ ...config, theme: e.target.value as "light" | "dark" | "system" })}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-Refresh Interval</p>
              <p className="text-xs text-gray-500">Block sync polling</p>
            </div>
            <select
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none"
              value={config?.refreshInterval || 10}
              onChange={(e) => config && setConfig({ ...config, refreshInterval: Number(e.target.value) as 5 | 10 | 30 })}
            >
              <option value="5">5 seconds</option>
              <option value="10">10 seconds</option>
              <option value="30">30 seconds</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Large Transfer Threshold</p>
              <p className="text-xs text-gray-500">AML alert threshold (INR)</p>
            </div>
            <input
              type="number"
              className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none"
              value={config?.largeTransferThreshold || 10000}
              onChange={(e) => config && setConfig({ ...config, largeTransferThreshold: Number(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
