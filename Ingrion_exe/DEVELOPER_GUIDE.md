# INGRION Desktop Application — Complete Developer Guide
## Based on Blueprint v1.0 | Technology Stack per Section 1.2

---

## 1. Prerequisites

### Required Installations

```bash
# 1. Node.js 18+ (LTS recommended)
https://nodejs.org/

# 2. Rust (stable toolchain)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable

# 3. Tauri CLI v2
npm install -g @tauri-apps/cli@^2

# 4. Windows-specific (for building .exe)
# Install Visual Studio C++ Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Install WebView2 Runtime (usually pre-installed on Windows 10/11)

# Verify all tools:
node --version       # 18+
rustc --version      # 1.77.2+
cargo --version
npm --version
```

---

## 2. Project Setup

```bash
# Navigate to project directory
cd ingrion

# Install npm dependencies
npm install

# Verify Tauri configuration
npx tauri info
```

---

## 3. Development Mode

```bash
# Start the app in development mode (hot-reload)
npm run tauri dev

# This will:
# 1. Start Vite dev server on http://localhost:1420
# 2. Compile Rust backend
# 3. Launch the INGRION desktop window
# 4. Enable hot-reload for frontend changes
```

**First Launch**: The setup wizard will appear since no keystore exists.
Connect to your running INGRION blockchain node, select a role, and enter your private key.

---

## 4. Connecting to Your Blockchain Node

Start your `main.go` node:
```bash
./ingrion-node --rpc 0.0.0.0:4001 --p2p 0.0.0.0:4000 --api-key YOUR_KEY
```

In the Setup Wizard → Step 2:
- **Node URL**: `http://127.0.0.1:4001`
- **API Key**: The key you set with `--api-key`

The app calls `GET /status` to verify connectivity.

---

## 5. Transaction Signing — How It Works

The app exactly mirrors the signing logic from `mega.py`. Field order matches Go's `json.Marshal`:

```
type, from, to, amountPaise, nonce, stock, bidPricePaise, bidShares,
category, rhpHash, meta, timestamp, sig,
shares, pricePaise, reason, mandateType, actionType, ratio, proposalId
```

**Flow** (see `src/lib/crypto.ts → signTransaction()`):
1. Build ordered object with `sig: ""`
2. `JSON.stringify(ordered)` — compact, no spaces
3. `Ed25519.sign(bytes, seed)` → base64 sig
4. Set `sig` field, append post-sig optional fields
5. POST to `/api/submitTx`

---

## 6. Building the Production .exe

```bash
# Build release binary
npm run tauri build

# Output location:
# src-tauri/target/release/bundle/msi/INGRION_1.0.0_x64_en-US.msi  (installer)
# src-tauri/target/release/bundle/nsis/INGRION_1.0.0_x64-setup.exe  (NSIS installer)
# src-tauri/target/release/ingrion.exe  (standalone, but misses WebView2 dependency)
```

Use the **MSI or NSIS installer** for distribution — they bundle WebView2 and all dependencies.

---

## 7. Architecture Overview

```
ingrion/
├── src/
│   ├── components/
│   │   ├── ui/index.tsx          # All reusable UI components
│   │   ├── layout/AppShell.tsx   # Sidebar + TopBar layout
│   │   └── modals/
│   │       ├── PasswordModal.tsx     # Universal tx signing modal
│   │       └── DocumentHashTool.tsx  # COMMON-01 hash tool
│   ├── pages/
│   │   ├── setup/
│   │   │   ├── SetupWizard.tsx   # 5-step first-launch wizard
│   │   │   └── SplashScreen.tsx  # Boot splash screen
│   │   ├── user/       # USER-01 through USER-07
│   │   ├── validator/  # VAL-01 through VAL-05
│   │   ├── regulator/  # REG-01 through REG-06
│   │   ├── company/    # COM-01 through COM-05
│   │   └── common/     # Settings, shared pages
│   ├── lib/
│   │   ├── api.ts      # All RPC calls to blockchain node
│   │   ├── crypto.ts   # Ed25519, AES-256-GCM, PBKDF2, SHA-256
│   │   ├── db.ts       # SQLite operations via Tauri SQL plugin
│   │   ├── keystore.ts # Read/write keystore.json
│   │   ├── sync.ts     # Background block sync service
│   │   └── utils.ts    # Formatting helpers
│   ├── store/index.ts  # Zustand global state
│   ├── types/index.ts  # All TypeScript type definitions
│   └── App.tsx         # Root router with role-based routing
└── src-tauri/
    ├── src/lib.rs      # Rust backend (minimal — plugins do the work)
    └── tauri.conf.json # Window config, plugin config, permissions
```

---

## 8. Completing the Stub Pages

Several pages are scaffolded as stubs. Here's what each needs:

### VAL-02: Staking (`src/pages/validator/ValidatorStaking.tsx`)
```tsx
// Call getStakeRewards(address) for current state
// Tabs: JOIN (VALIDATOR_JOIN tx), UPDATE STAKE (tnx_update_stake), EXIT (VALIDATOR_EXIT)
// All → PasswordModal with appropriate txFields
```

### VAL-03: Slash Proposals (`src/pages/validator/SlashProposals.tsx`)
```tsx
// Call getSlashProposals() for list
// Filter: proposals targeting me vs. proposals I can vote on
// Actions: tnx_vote_slash (proposalId), tnx_slash_proposal (to, amountPaise, reason)
```

### VAL-04: Block Explorer (`src/pages/validator/BlockExplorer.tsx`)
```tsx
// Left: getMempool() every 3s — live pending tx table
// Right: getRecentBlocks() from local DB — click for getBlock(height) detail
// Search: input height → getBlock(h)
```

### VAL-05: Network Peers (`src/pages/validator/NetworkPeers.tsx`)
```tsx
// getStatus() → node info card
// getNetwork() → peers table (address, height, lastSeen, connected)
```

### REG-02: IPO Oversight (`src/pages/regulator/IPOOversight.tsx`)
```tsx
// getAllIPOs() → group by status
// For BIDDING: getIPOBids(stock) → demand curve chart (Recharts)
// Category breakdown table: QIB/NIB/Retail bids vs quota
```

### REG-05: Mandates (`src/pages/regulator/RegulatorMandates.tsx`)
```tsx
// getActiveMandates() → table
// Form: mandateType dropdown + target + reason → tnx_mandate
```

### REG-06: Contracts (`src/pages/regulator/RegulatorContracts.tsx`)
```tsx
// getContracts() → table
// For pending: tnx_vote_contract (meta.name)
// Click row → full payload in scrollable code block
```

### COM-03: Manage IPO (`src/pages/company/ManageIPO.tsx`)
```tsx
// Stock selector → getRHPStatus(stock) → detect current stage
// Stage-aware action panel (see Blueprint Section 7.4)
// tnx_initiate_stock, tnx_open_ipo, tnx_cancel_ipo
```

### COM-04: Post-Listing (`src/pages/company/PostListing.tsx`)
```tsx
// Dividend: tnx_dividend (stock, amountPaise)
// Corporate Action: tnx_corporate_action (stock, actionType, ratio/amount)
// New Contract: tnx_new_contract (meta.name, meta.batch, meta.payload)
```

### COM-05: Shareholders (`src/pages/company/Shareholders.tsx`)
```tsx
// Stock picker → getStockHolders(stock)
// Table: address, shares, %, acquired via
// Export CSV
```

### USER-05: Portfolio (`src/pages/user/Portfolio.tsx`)
```tsx
// getPortfolio(address) → holdings table
// Columns: Stock, Shares, Allocated Price, Current Price, P&L, % Change
// INR summary from getOwnTransactions()
```

---

## 9. Adding the @noble/ed25519 Hash Function

Noble v2 requires a SHA-512 implementation. Add this to your vite.config.ts if you get errors:

```typescript
// vite.config.ts - add this if noble/ed25519 has issues
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [react(), nodePolyfills()],
  // ...
})
```

Or ensure `sha512` from noble is available:
```bash
npm install @noble/hashes
```

Then in `crypto.ts`:
```typescript
import { sha512 } from "@noble/hashes/sha512";
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
```

---

## 10. Local Database Schema

The SQLite database is created automatically at `{AppData}/INGRION/ingrion.db`.

Key tables (see `src/lib/db.ts`):
- `blocks` — full block cache for analytics
- `transactions` — indexed tx history (all roles) + `is_own` flag
- `analytics_daily` — pre-aggregated daily metrics (regulator dashboard)
- `notifications` — in-app notification log
- `hash_history` — last 100 document hashes
- `config` — key-value app settings

---

## 11. Keystore File Format

Stored at `{AppData}/INGRION/keystore.json`:
```json
{
  "version": "1",
  "address": "64-char-hex-pubkey",
  "role": "user|validator|regulator|company",
  "category": "qib|nib|retail|null",
  "encrypted_key": "base64-aes-gcm-ciphertext",
  "salt": "base64-32-byte-salt",
  "iv": "base64-12-byte-nonce",
  "pbkdf2_iterations": 600000,
  "created_at": "2025-02-01T00:00:00.000Z"
}
```

Key derivation on every transaction:
```
PBKDF2(password, salt, 600000, SHA-256) → 32-byte AES key
AES-256-GCM(aes_key, iv, encrypted_key) → 32-byte Ed25519 seed
Ed25519.sign(tx_json_bytes, seed) → 64-byte signature → base64
```

---

## 12. Design System Reference

### Colors (defined in `tailwind.config.js`)
| Token | Hex | Usage |
|-------|-----|-------|
| `brand-blue-dark` | `#0D1F33` | Sidebar, splash, setup bg |
| `brand-gold` | `#C9A84C` | Logo, active nav, CTA buttons |
| `success-green` | `#2D7D46` | Online status, verified |
| `warning-amber` | `#B7791F` | AML alerts, warnings |
| `danger-red` | `#C0392B` | Errors, freeze, danger |

### Role Colors
| Role | Color |
|------|-------|
| User/Investor | Teal `#0D9488` |
| Validator | Indigo `#4338CA` |
| Regulator | Deep Red `#9B1C1C` |
| Company | Amber `#B45309` |

---

## 13. Common Issues & Solutions

### "Cannot find module @tauri-apps/plugin-sql"
```bash
npm install @tauri-apps/plugin-sql
# Add to Cargo.toml: tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```

### "Failed to fetch" when submitting transactions
- Check node is running: `curl http://127.0.0.1:4001/status`
- Verify API key matches what node was started with
- Check CSP in `tauri.conf.json` allows the node URL

### Transaction rejected with "invalid nonce"
- The app fetches nonce from `GET /api/balance/{address}` and adds 1
- If you submitted multiple tx quickly, nonce may be stale
- Solution: Add a nonce cache/queue for rapid fire submissions

### Ed25519 signature mismatch
- Verify field order matches Go struct exactly (see `mega.py` comments)
- The signing payload uses `sig: ""` (empty string placeholder, NOT omitted)
- JSON must be compact: no spaces, no newlines

### SQLite migration errors
- Delete `{AppData}/INGRION/ingrion.db` to reset
- Schema is recreated automatically on next launch

---

## 14. Deployment Checklist

- [ ] All 30+ pages implemented (check against Blueprint Section 9.1)
- [ ] All 25 transaction types tested (Section 10)
- [ ] Password modal works for every transaction type
- [ ] Background sync service running and populating DB
- [ ] Regulator analytics aggregation running hourly
- [ ] Document hash tool generates matching SHA-256 vs Go's crypto/sha256
- [ ] Setup wizard prevents bypass (close button shows confirmation)
- [ ] Role-based routing blocks unauthorized page access
- [ ] Node offline mode shows cached data banner
- [ ] Windows .exe builds and runs on clean Windows 10/11

---

## 15. File Reference: Transaction Types vs Pages

| Tx Type | Page | Role |
|---------|------|------|
| `tnx_sendINR` | USER-02 | User/Validator/Company |
| `tnx_bid_stock` | USER-03 | User |
| `tnx_buy_stock` | USER-04 | User/Validator |
| `tnx_sell_stock` | USER-04 | User/Validator |
| `tnx_transfer_stock` | USER-04 | User/Validator |
| `tnx_upload_drhp` | COM-02 | Company |
| `tnx_initiate_stock` | COM-03 | Company |
| `tnx_open_ipo` | COM-03 | Company |
| `tnx_cancel_ipo` | COM-03 | Company |
| `tnx_update_rhp` | COM-03 | Company |
| `tnx_dividend` | COM-04 | Company |
| `tnx_corporate_action` | COM-04 | Company |
| `tnx_new_contract` | COM-04 | Company |
| `tnx_upload_rhp` | REG-03 | Regulator |
| `tnx_reject_drhp` | REG-03 | Regulator |
| `tnx_freeze_account` | REG-04 | Regulator |
| `tnx_unfreeze_account` | REG-04 | Regulator |
| `tnx_flag_account` | REG-04 | Regulator |
| `tnx_mandate` | REG-05 | Regulator |
| `tnx_vote_contract` | REG-06 | Regulator |
| `VALIDATOR_JOIN` | VAL-02 | Validator |
| `VALIDATOR_EXIT` | VAL-02 | Validator |
| `tnx_update_stake` | VAL-02 | Validator |
| `tnx_slash_proposal` | VAL-03 | Validator |
| `tnx_vote_slash` | VAL-03 | Validator |

---

*INGRION Desktop Application — Developer Guide v1.0*
*Built with Tauri 2 + React 18 + TypeScript + shadcn/ui + Recharts + Zustand*
