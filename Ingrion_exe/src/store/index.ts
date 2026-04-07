/**
 * INGRION Global State Store (Zustand)
 */
import { create } from "zustand";
import type { Keystore, AppConfig, NodeStatus, Notification, Role } from "@/types";

interface AppState {
  // Setup state
  isSetupComplete: boolean;
  setSetupComplete: (v: boolean) => void;

  // Identity
  keystore: Keystore | null;
  setKeystore: (k: Keystore | null) => void;

  // Config
  config: AppConfig | null;
  setConfig: (c: AppConfig) => void;

  // Node status
  nodeStatus: NodeStatus | null;
  nodeOnline: boolean;
  setNodeStatus: (s: NodeStatus | null, online: boolean) => void;

  // Balance (live)
  balancePaise: number;
  blockedPaise: number;
  nonce: number;
  setBalance: (balance: number, blocked: number, nonce: number) => void;

  // Notifications
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Notification) => void;
  markRead: (id: string) => void;
  setNotifications: (ns: Notification[], unread: number) => void;

  // UI state
  currentPage: string;
  setCurrentPage: (page: string) => void;
  theme: "light" | "dark" | "system";
  setTheme: (t: "light" | "dark" | "system") => void;

  // Derived helpers
  role: Role | null;
  address: string | null;
}

export const useAppStore = create<AppState>((set, get) => ({
  isSetupComplete: false,
  setSetupComplete: (v) => set({ isSetupComplete: v }),

  keystore: null,
  setKeystore: (k) =>
    set({
      keystore: k,
      role: k?.role ?? null,
      address: k?.address ?? null,
    }),

  config: null,
  setConfig: (c) => set({ config: c }),

  nodeStatus: null,
  nodeOnline: false,
  setNodeStatus: (s, online) => set({ nodeStatus: s, nodeOnline: online }),

  balancePaise: 0,
  blockedPaise: 0,
  nonce: 0,
  setBalance: (balance, blocked, nonce) =>
    set({ balancePaise: balance, blockedPaise: blocked, nonce }),

  notifications: [],
  unreadCount: 0,
  addNotification: (n) =>
    set((s) => ({
      notifications: [n, ...s.notifications].slice(0, 20),
      unreadCount: s.unreadCount + 1,
    })),
  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    })),
  setNotifications: (ns, unread) =>
    set({ notifications: ns, unreadCount: unread }),

  currentPage: "dashboard",
  setCurrentPage: (page) => set({ currentPage: page }),

  theme: "dark",
  setTheme: (t) => set({ theme: t }),

  role: null,
  address: null,
}));
