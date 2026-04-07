/**
 * INGRION App - Main Router
 */
import React, { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAppStore } from "@/store";
import { keystoreExists, readKeystore, readNodeConfig, defaultConfig } from "@/lib/keystore";
import { getStatus } from "@/lib/api";
import { startSyncService } from "@/lib/sync";
import { getNotifications, getUnreadCount } from "@/lib/db";
import AppShell from "@/components/layout/AppShell";
import SetupWizard from "@/pages/setup/SetupWizard";
import SplashScreen from "@/pages/setup/SplashScreen";
import { Spinner } from "@/components/ui";

// Lazy-load all pages
const UserDashboard = lazy(() => import("@/pages/user/UserDashboard"));
const SendINR = lazy(() => import("@/pages/user/SendINR"));
const IPOBidding = lazy(() => import("@/pages/user/IPOBidding"));
const SecondaryMarket = lazy(() => import("@/pages/user/SecondaryMarket"));
const TxHistory = lazy(() => import("@/pages/user/TxHistory"));
const DRHPBrowser = lazy(() => import("@/pages/user/DRHPBrowser"));
const Portfolio = lazy(() => import("@/pages/user/Portfolio"));

const ValidatorDashboard = lazy(() => import("@/pages/validator/ValidatorDashboard"));
const ValidatorStaking = lazy(() => import("@/pages/validator/ValidatorStaking"));
const SlashProposals = lazy(() => import("@/pages/validator/SlashProposals"));
const BlockExplorer = lazy(() => import("@/pages/validator/BlockExplorer"));
const NetworkPeers = lazy(() => import("@/pages/validator/NetworkPeers"));

const RegulatorDashboard = lazy(() => import("@/pages/regulator/RegulatorDashboard"));
const IPOOversight = lazy(() => import("@/pages/regulator/IPOOversight"));
const RHPReview = lazy(() => import("@/pages/regulator/RHPReview"));
const AccountEnforcement = lazy(() => import("@/pages/regulator/AccountEnforcement"));
const RegulatorMandates = lazy(() => import("@/pages/regulator/RegulatorMandates"));
const RegulatorContracts = lazy(() => import("@/pages/regulator/RegulatorContracts"));

const CompanyDashboard = lazy(() => import("@/pages/company/CompanyDashboard"));
const FileDRHP = lazy(() => import("@/pages/company/FileDRHP"));
const ManageIPO = lazy(() => import("@/pages/company/ManageIPO"));
const PostListing = lazy(() => import("@/pages/company/PostListing"));
const Shareholders = lazy(() => import("@/pages/company/Shareholders"));

const Settings = lazy(() => import("@/pages/common/Settings"));

const PageLoader: React.FC = () => (
  <div className="flex justify-center items-center h-full py-20">
    <Spinner size="lg" />
  </div>
);

const App: React.FC = () => {
  const { setKeystore, setConfig, setNodeStatus, setSetupComplete, keystore, setNotifications } = useAppStore();
  const [appState, setAppState] = useState<"loading" | "setup" | "splash" | "ready">("loading");
  const [nodeOnline, setNodeOnline] = useState(false);
  const [blockHeight, setBlockHeight] = useState<number | undefined>();
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        console.log("[INGRION] Starting init...");

        let exists = false;
        try {
          exists = await keystoreExists();
          console.log("[INGRION] keystoreExists:", exists);
        } catch (e) {
          console.warn("[INGRION] keystoreExists failed (probably first run):", e);
          exists = false;
        }

        if (!exists) {
          console.log("[INGRION] No keystore → setup");
          setAppState("setup");
          return;
        }

        const ks = await readKeystore();
        console.log("[INGRION] readKeystore:", ks ? "ok" : "null");
        if (!ks) { setAppState("setup"); return; }

        const nodeConfig = await readNodeConfig();
        const cfg = { ...defaultConfig(), node: { url: nodeConfig.url || "http://127.0.0.1:4001", apiKey: nodeConfig.apiKey || "" } };
        setKeystore(ks);
        setConfig(cfg);

        setAppState("splash");

        try {
          const status = await getStatus();
          setNodeStatus(status, true);
          setNodeOnline(true);
          setBlockHeight(status.height);
          console.log("[INGRION] Node online, height:", status.height);
        } catch (e) {
          console.warn("[INGRION] Node offline:", e);
          setNodeStatus(null, false);
        }

        try {
          const ns = await getNotifications();
          const unread = await getUnreadCount();
          setNotifications(ns, unread);
        } catch (e) {
          console.warn("[INGRION] DB notifications failed:", e);
        }

        try {
          startSyncService(ks.address);
        } catch (e) {
          console.warn("[INGRION] Sync start failed:", e);
        }

        setTimeout(() => {
          setSetupComplete(true);
          setAppState("ready");
          console.log("[INGRION] App ready");
        }, 1500);

      } catch (e) {
        console.error("[INGRION] Init error:", e);
        setInitError(String(e));
        setAppState("setup");
      }
    };
    init();
  }, []);

  const handleSetupComplete = async () => {
    setAppState("splash");
    try {
      const ks = await readKeystore();
      const nodeConfig = await readNodeConfig();
      if (ks) {
        const cfg = { ...defaultConfig(), node: { url: nodeConfig.url || "", apiKey: nodeConfig.apiKey || "" } };
        setKeystore(ks);
        setConfig(cfg);
        try {
          const status = await getStatus();
          setNodeStatus(status, true);
          setNodeOnline(true);
          setBlockHeight(status.height);
        } catch {
          setNodeStatus(null, false);
        }
        startSyncService(ks.address);
      }
    } catch (e) {
      console.error("[INGRION] Post-setup init error:", e);
    }
    setTimeout(() => {
      setSetupComplete(true);
      setAppState("ready");
    }, 1500);
  };

  // Loading state
  if (appState === "loading") {
    return (
      <div style={{ background: "#0D1F33", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <h1 style={{ color: "#C9A84C", fontSize: 36, fontWeight: "bold", letterSpacing: 6, marginBottom: 24 }}>INGRION</h1>
        <div style={{ color: "#aaa", fontSize: 14 }}>Initializing...</div>
      </div>
    );
  }

  // Init error
  if (initError) {
    return (
      <div style={{ background: "#0D1F33", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", padding: 40 }}>
        <h1 style={{ color: "#C9A84C", fontSize: 24, marginBottom: 16 }}>Startup Error</h1>
        <pre style={{ background: "#1a2b42", color: "#ff6b6b", padding: 24, borderRadius: 8, maxWidth: 700, whiteSpace: "pre-wrap" }}>{initError}</pre>
        <button onClick={() => window.location.reload()} style={{ marginTop: 20, background: "#C9A84C", color: "#0D1F33", border: "none", padding: "10px 24px", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}>Reload</button>
      </div>
    );
  }

  if (appState === "setup") {
    return <SetupWizard onComplete={handleSetupComplete} />;
  }

  if (appState === "splash") {
    return <SplashScreen nodeOnline={nodeOnline} blockHeight={blockHeight} onDone={() => {}} />;
  }

  const role = keystore?.role;

  return (
    <BrowserRouter>
      <AppShell>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/settings" element={<Settings />} />
            <Route path="/tx-history" element={<TxHistory />} />
            <Route path="/drhp-browser" element={<DRHPBrowser />} />

            {(role === "user" || role === "validator" || role === "company") && (
              <Route path="/send-inr" element={<SendINR />} />
            )}
            {(role === "user" || role === "validator") && (
              <Route path="/secondary-market" element={<SecondaryMarket />} />
            )}
            {role === "user" && (
              <>
                <Route path="/dashboard" element={<UserDashboard />} />
                <Route path="/ipo-bidding" element={<IPOBidding />} />
                <Route path="/portfolio" element={<Portfolio />} />
              </>
            )}
            {role === "validator" && (
              <>
                <Route path="/dashboard" element={<ValidatorDashboard />} />
                <Route path="/staking" element={<ValidatorStaking />} />
                <Route path="/slash-proposals" element={<SlashProposals />} />
                <Route path="/block-explorer" element={<BlockExplorer />} />
                <Route path="/network" element={<NetworkPeers />} />
              </>
            )}
            {role === "regulator" && (
              <>
                <Route path="/dashboard" element={<RegulatorDashboard />} />
                <Route path="/ipo-oversight" element={<IPOOversight />} />
                <Route path="/rhp-review" element={<RHPReview />} />
                <Route path="/enforcement" element={<AccountEnforcement />} />
                <Route path="/mandates" element={<RegulatorMandates />} />
                <Route path="/contracts" element={<RegulatorContracts />} />
                <Route path="/block-explorer" element={<BlockExplorer />} />
              </>
            )}
            {role === "company" && (
              <>
                <Route path="/dashboard" element={<CompanyDashboard />} />
                <Route path="/file-drhp" element={<FileDRHP />} />
                <Route path="/manage-ipo" element={<ManageIPO />} />
                <Route path="/post-listing" element={<PostListing />} />
                <Route path="/shareholders" element={<Shareholders />} />
              </>
            )}

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </BrowserRouter>
  );
};

export default App;
