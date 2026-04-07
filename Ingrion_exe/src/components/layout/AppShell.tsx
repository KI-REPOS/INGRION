/**
 * INGRION Application Shell
 * Persistent layout: Left Sidebar + Top Bar + Content Area
 */
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutGrid, ArrowUp, BarChart3, ArrowLeftRight, Briefcase,
  FileText, Clock, Settings, Server, Lock, Gavel, Box, Network,
  LineChart, Layers, Inbox, Shield, Scale, Building, Users,
  Rocket, Bell, Search, RefreshCw, Hash
} from "lucide-react";
import { useAppStore } from "@/store";
import { getBalance, getStatus } from "@/lib/api";
import { paiseToCurrency, formatAddress } from "@/lib/utils";
import { DocumentHashTool } from "@/components/modals/DocumentHashTool";
import type { Role } from "@/types";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

function getNavItems(role: Role): NavItem[] {
  const shared = {
    sendINR: { label: "Send INR", icon: <ArrowUp size={16} />, path: "/send-inr" },
    drhpBrowser: { label: "DRHP/RHP Browser", icon: <FileText size={16} />, path: "/drhp-browser" },
    txHistory: { label: "Tx History", icon: <Clock size={16} />, path: "/tx-history" },
    secondaryMarket: { label: "Secondary Market", icon: <ArrowLeftRight size={16} />, path: "/secondary-market" },
    blockExplorer: { label: "Block Explorer", icon: <Box size={16} />, path: "/block-explorer" },
  };

  switch (role) {
    case "user":
      return [
        { label: "Dashboard", icon: <LayoutGrid size={16} />, path: "/dashboard" },
        shared.sendINR,
        { label: "IPO — Open Bids", icon: <BarChart3 size={16} />, path: "/ipo-bidding" },
        shared.secondaryMarket,
        { label: "My Portfolio", icon: <Briefcase size={16} />, path: "/portfolio" },
        shared.drhpBrowser,
        shared.txHistory,
      ];

    case "validator":
      return [
        { label: "Validator Dashboard", icon: <Server size={16} />, path: "/dashboard" },
        { label: "Staking", icon: <Lock size={16} />, path: "/staking" },
        { label: "Slash Proposals", icon: <Gavel size={16} />, path: "/slash-proposals" },
        shared.blockExplorer,
        { label: "Network & Peers", icon: <Network size={16} />, path: "/network" },
        shared.sendINR,
        shared.secondaryMarket,
        shared.drhpBrowser,
        shared.txHistory,
      ];

    case "regulator":
      return [
        { label: "Analytics Dashboard", icon: <LineChart size={16} />, path: "/dashboard" },
        { label: "IPO Oversight", icon: <Layers size={16} />, path: "/ipo-oversight" },
        { label: "RHP Review Queue", icon: <Inbox size={16} />, path: "/rhp-review" },
        { label: "Account Enforcement", icon: <Shield size={16} />, path: "/enforcement" },
        { label: "Mandates", icon: <Scale size={16} />, path: "/mandates" },
        { label: "Contracts", icon: <FileText size={16} />, path: "/contracts" },
        shared.drhpBrowser,
        shared.txHistory,
        shared.blockExplorer,
      ];

    case "company":
      return [
        { label: "Company Dashboard", icon: <Building size={16} />, path: "/dashboard" },
        { label: "File DRHP", icon: <ArrowUp size={16} />, path: "/file-drhp" },
        { label: "Manage IPO", icon: <Rocket size={16} />, path: "/manage-ipo" },
        { label: "Post-Listing Actions", icon: <BarChart3 size={16} />, path: "/post-listing" },
        { label: "Shareholder Register", icon: <Users size={16} />, path: "/shareholders" },
        shared.drhpBrowser,
        shared.sendINR,
        shared.txHistory,
      ];

    default:
      return [];
  }
}

function getRoleColor(role: Role): string {
  const colors = { user: "#0D9488", validator: "#4338CA", regulator: "#9B1C1C", company: "#B45309" };
  return colors[role] || "#6B7280";
}

const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { keystore, nodeOnline, nodeStatus, balancePaise, setBalance, setNodeStatus, notifications, unreadCount } = useAppStore();
  const [showHashTool, setShowHashTool] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const role = keystore?.role as Role;
  const address = keystore?.address || "";
  const navItems = getNavItems(role);

  const refreshBalance = useCallback(async () => {
    if (!address) return;
    try {
      const acc = await getBalance(address);
      setBalance(acc.balancePaise, acc.blockedPaise, acc.nonce);
    } catch { /* ignore */ }
  }, [address, setBalance]);

  const refreshNode = useCallback(async () => {
    try {
      const status = await getStatus();
      setNodeStatus(status, true);
    } catch {
      setNodeStatus(null, false);
    }
  }, [setNodeStatus]);

  useEffect(() => {
    refreshBalance();
    refreshNode();
    const interval = setInterval(() => {
      refreshBalance();
      refreshNode();
    }, 10000);
    return () => clearInterval(interval);
  }, [refreshBalance, refreshNode]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refreshBalance(), refreshNode()]);
    setIsRefreshing(false);
  };

  const isActivePath = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  const roleColor = getRoleColor(role);
  const roleName = role?.toUpperCase() || "";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#F0F4FA" }}>
      {/* ---- Sidebar ---- */}
      <aside
        className="flex flex-col w-[220px] flex-shrink-0 text-white overflow-y-auto"
        style={{ background: "#0D1F33" }}
      >
        {/* Logo + Role */}
        <div className="px-4 pt-5 pb-4 border-b border-white/10">
          <div className="text-xl font-bold tracking-wider" style={{ color: "#C9A84C" }}>INGRION</div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-semibold"
              style={{ background: roleColor, color: "white" }}
            >
              {roleName}
            </span>
          </div>
          {keystore?.category && (
            <span className="text-xs text-gray-400 mt-1 block">{keystore.category.toUpperCase()}</span>
          )}
        </div>

        {/* Address + Balance */}
        <div className="px-4 py-3 border-b border-white/10">
          <p
            className="font-mono text-xs cursor-pointer hover:opacity-80"
            style={{ color: "#C9A84C" }}
            onClick={() => navigator.clipboard.writeText(address)}
            title="Click to copy"
          >
            {formatAddress(address)}
          </p>
          <p className="text-white font-bold text-sm mt-1">{paiseToCurrency(balancePaise)}</p>
          <p className="text-gray-400 text-xs">Available: {paiseToCurrency(balancePaise - (useAppStore.getState().blockedPaise || 0))}</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3">
          {navItems.map((item) => {
            const active = isActivePath(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all text-left ${
                  active
                    ? "text-white bg-white/10 border-l-2 border-[#C9A84C]"
                    : "text-gray-300 hover:bg-white/10 hover:text-white"
                }`}
                style={active ? { paddingLeft: "14px" } : {}}
              >
                <span className={active ? "text-[#C9A84C]" : ""}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom: Settings + Node Status */}
        <div className="border-t border-white/10">
          {/* Hash Tool */}
          <button
            onClick={() => setShowHashTool(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-white/10 hover:text-white"
          >
            <Hash size={16} />
            Document Hash
          </button>

          {/* Settings */}
          <button
            onClick={() => navigate("/settings")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all ${
              location.pathname === "/settings"
                ? "text-white bg-white/10 border-l-2 border-[#C9A84C]"
                : "text-gray-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Settings size={16} />
            Settings
          </button>

          {/* Node Status */}
          <div className="px-4 py-3 border-t border-white/10">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${nodeOnline ? "bg-green-400" : "bg-red-400"}`} />
              <span className="text-xs text-gray-400">
                {nodeOnline ? "Node Online" : "Offline"}
              </span>
            </div>
            {nodeStatus && (
              <p className="text-xs text-gray-500 mt-1">Block: #{nodeStatus.height.toLocaleString()}</p>
            )}
          </div>
        </div>
      </aside>

      {/* ---- Main Area ---- */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header
          className="flex items-center justify-between px-6 h-[52px] flex-shrink-0 border-b border-gray-200"
          style={{ background: "#1A2B42" }}
        >
          {/* Page title */}
          <h1 className="text-white font-semibold text-sm">
            {navItems.find((n) => isActivePath(n.path))?.label || "INGRION"}
          </h1>

          {/* Search */}
          <div className="flex items-center gap-2 flex-1 max-w-sm mx-6">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full pl-8 pr-3 py-1.5 bg-white/10 text-white placeholder-gray-400 rounded-md text-xs border border-white/20 focus:outline-none focus:ring-1 focus:ring-[#C9A84C]"
                placeholder="Search addresses, tx, stocks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-4">
            {/* Block height chip */}
            {nodeStatus && (
              <div className="text-xs text-[#C9A84C] font-mono bg-white/10 px-2 py-1 rounded">
                #{nodeStatus.height.toLocaleString()}
              </div>
            )}

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              className={`text-gray-300 hover:text-white transition-colors ${isRefreshing ? "animate-spin" : ""}`}
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative text-gray-300 hover:text-white"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#C9A84C] text-[#0D1F33] rounded-full text-xs flex items-center justify-center font-bold">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification dropdown */}
              {showNotifications && (
                <div className="absolute right-0 top-8 w-80 bg-white border border-gray-200 rounded-lg shadow-xl z-40">
                  <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-800 text-sm">Notifications</h3>
                    <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-center text-gray-500 text-sm py-6">No notifications</p>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${!n.isRead ? "bg-blue-50" : ""}`}>
                          <p className="text-sm font-medium text-gray-800">{n.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Role avatar */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: roleColor }}
            >
              {roleName[0]}
            </div>
          </div>
        </header>

        {/* Offline banner */}
        {!nodeOnline && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-xs text-amber-800 flex items-center gap-2">
            <span>⚠️</span>
            <span>Node Offline — Showing Cached Data</span>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>

      {/* Document Hash Tool Modal */}
      <DocumentHashTool
        isOpen={showHashTool}
        onClose={() => setShowHashTool(false)}
      />
    </div>
  );
};

export default AppShell;
