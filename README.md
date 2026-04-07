<div align="center">

<img src="https://img.shields.io/badge/INGRION-Blockchain%20Capital%20Markets-C9A84C?style=for-the-badge&logoColor=white" alt="INGRION" />

# INGRION
### Blockchain-Powered Capital Markets & Identity Platform

**A fully decentralised, KYC-enforced financial ecosystem — IPOs, stock exchanges, regulatory enforcement, and daily banking — built on a custom Delegated Proof-of-Stake blockchain written entirely from scratch in Go.**

<br/>

[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat-square&logo=go&logoColor=white)](https://golang.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org)
[![Rust](https://img.shields.io/badge/Rust-Tauri-CE422B?style=flat-square&logo=rust&logoColor=white)](https://tauri.app)
[![Django](https://img.shields.io/badge/Django-REST-092E20?style=flat-square&logo=django&logoColor=white)](https://www.django-rest-framework.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

<br/>

> *"Finance should be transparent by design, not by promise."*

<br/>

[📖 Whitepaper](./ingrion-whitepaper.pdf) · [🖥️ Download App](./ingrion.exe) · [🏛️ Gov Archive](./National_Identity_Archive) · [🌐 Web Portal](./Ingrion_Web) · [⛓️ Blockchain Core](./Ingrion_core) · [💻 Desktop App](./Ingrion_exe)

</div>

---

## 📋 Table of Contents

- [The Problem](#-the-problem)
- [Key Market Failures — By The Numbers](#-key-market-failures--by-the-numbers)
- [Our Solution](#-our-solution)
- [Ecosystem Overview](#-ecosystem-overview)
- [Sub-Project Breakdown](#-sub-project-breakdown)
  - [1. National Identity Archive (Gov Archive)](#1--national-identity-archive--gov-archive)
  - [2. INGRION Web Portal](#2--ingrion-web-portal)
  - [3. INGRION Blockchain Core Node](#3--ingrion-blockchain-core-node)
  - [4. INGRION Desktop Application](#4--ingrion-desktop-application)
- [The Complete User Journey](#-the-complete-user-journey)
- [Security Architecture](#-security-architecture)
- [Transaction Types](#-transaction-types--22-native-tx-types)
- [Consensus Mechanism](#-consensus-mechanism--delegated-proof-of-stake)
- [Role System](#-role-system)
- [Technology Stack](#-technology-stack)
- [Getting Started](#-getting-started)
- [Team](#-team)

---

## 🔥 The Problem

Traditional financial systems — including IPOs, stock exchanges, and daily banking — are built on **centralised trust**. This trust is routinely broken.

Every stage of the capital markets pipeline suffers from the same structural flaws:

| Stage | Problem |
|-------|---------|
| **KYC & Identity** | Paper-based verification is slow, forged, and siloed. No single source of truth. |
| **IPO Filing** | DRHP/RHP documents are filed off-chain — opaque, not auditable by the public in real time. |
| **Bidding** | Oversubscription is often artificial. QIB demand is manipulated to create FOMO retail buying. |
| **Share Allocation** | Allocation logic is invisible. Preferential allotment to institutions goes unchallenged. |
| **Secondary Market** | Trades settle through intermediaries — clearing houses and demat custodians add delays and fees. |
| **Regulatory Oversight** | Enforcement is reactive. By the time regulators act, damage is already done. |
| **P2P Transfers** | Constrained by banking hours, intermediaries, and settlement delays. |
| **Corporate Actions** | Dividends, buybacks, and stock splits are manual, slow, and error-prone. |

The result: **a financial system that serves the powerful at the expense of retail participants and public trust.**

INGRION replaces every one of these choke-points with **cryptographically guaranteed, on-chain logic** — transparent, deterministic, and immune to behind-the-scenes manipulation.

---

## 📊 Key Market Failures — By The Numbers

These are not theoretical risks. These are documented failures in the Indian capital market in recent years:

<br/>

<div align="center">

| # | Issue | Data Point | Source |
|---|-------|-----------|--------|
| 1 | **IPO Underpricing** | Indian IPOs average **14.4% first-day returns** — indicating systematic mispricing and undervaluation that benefits institutional flippers over companies raising capital. | EY |
| 2 | **Artificial Oversubscription** | In FY24, QIBs oversubscribed IPOs by an average of **81× (up from 31× in FY23)** — suggesting coordinated demand creation to inflate retail enthusiasm. | KPMG |
| 3 | **Exchange Data Misuse** | NSE paid **₹40.35 crore** to settle a case involving indirect sharing of confidential company data with a third-party vendor — a direct breach of market integrity. | Business Standard |
| 4 | **Predatory Banking Fees** | Six domestic investment banks charged fees as high as **15% of funds raised** on small IPOs — far above the 1–3% global standard — exploiting smaller issuers. | Reuters |
| 5 | **Derivative Manipulation** | On January 17, 2024, Bank Nifty options saw **$1.26 trillion in turnover** — 350× the $3.6 billion underlying stock trades — a clear signal of manipulation. | Public Market Data |

</div>

<br/>

> **Each of these failures has a single root cause: opacity.** When no one can audit the system in real time, manipulation is not just possible — it's profitable.
>
> INGRION makes opacity **structurally impossible** by moving every financial action on-chain.

---

## ✅ Our Solution

INGRION is not a DeFi wrapper around an existing chain. It is a **purpose-built financial blockchain ecosystem** with four tightly integrated components:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        INGRION ECOSYSTEM                                  │
│                                                                            │
│   ┌─────────────────┐          ┌─────────────────┐                        │
│   │  National        │  KYC     │  INGRION         │  Download             │
│   │  Identity        │ ──────►  │  Web Portal      │ ─────────►  Desktop   │
│   │  Archive         │  Link    │  (KYC Bridge)    │  Token                │  App
│   │  (Gov Website)   │          │                  │                        │
│   └─────────────────┘          └─────────────────┘                        │
│            │                            │                                  │
│            │  Citizen Auth              │  KYC Approval                    │
│            ▼                            ▼                                  │
│   ┌────────────────────────────────────────────────────────────────────┐  │
│   │                  INGRION BLOCKCHAIN NODE (Go)                       │  │
│   │  DPoS Consensus · Ed25519 · BadgerDB · 22 Tx Types · P2P TCP       │  │
│   └────────────────────────────────────────────────────────────────────┘  │
│            ▲                            ▲                                  │
│            │  Transactions              │  Block Validation                │
│            │                            │                                  │
│   ┌─────────────────┐          ┌─────────────────┐                        │
│   │  INGRION         │          │  Validator /     │                        │
│   │  Desktop App     │          │  Regulator       │                        │
│   │  (Rust + React)  │          │  Nodes (Go)      │                        │
│   └─────────────────┘          └─────────────────┘                        │
└──────────────────────────────────────────────────────────────────────────┘
```

**All financial state lives on-chain.** No centralised database holds balances, IPO metadata, share registries, or RHP documents. Every action is a transaction. Every transaction is a block. Every block is public and immutable.

---

## 🗺️ Ecosystem Overview

| Sub-Project | Tech Stack | Role |
|-------------|------------|------|
| [`National_Identity_Archive`](./National_Identity_Archive) | Django · Python · SQLite | Government KYC portal — citizen registration, Aadhaar-linked identity, facial biometrics, admin approval |
| [`Ingrion_Web`](./Ingrion_Web) | Django · Python · SQLite | KYC verification bridge — validates Gov API link, cross-checks biometrics, issues secure download tokens |
| [`Ingrion_core`](./Ingrion_core) | Go · BadgerDB · TCP | Full DPoS blockchain node — consensus engine, P2P network, mempool, all transaction types |
| [`Ingrion_exe`](./Ingrion_exe) | Rust · Tauri · React · TypeScript | Cross-platform desktop app — 4 role-based UIs (User, Validator, Regulator, Company) |

---

## 🔬 Sub-Project Breakdown

### 1. 🏛️ National Identity Archive — Gov Archive

> **The government-side KYC portal. The entry point for every INGRION participant.**

The National Identity Archive (NIA) is the authoritative identity provider for the INGRION ecosystem. Citizens cannot participate in the blockchain without first being verified here.

#### What It Does

- **Citizen Registration** — Pre-seeded accounts linked to 12-digit Aadhaar numbers. Citizens set up their passwords and upload a profile photo during onboarding.
- **Facial Biometric Enrollment** — The citizen's face is captured via webcam and stored as a **Base64-encoded embedding vector** — not the raw image. This vector is later used for cosine-similarity matching during INGRION KYC.
- **Ed25519 Public Key Storage** — When INGRION begins the KYC process, it submits the citizen's blockchain public key. NIA stores this permanently. The **private key never leaves the citizen's device — ever.**
- **Admin Review Panel** — Government officials (AdminUser) review submitted KYC forms and approve or reject them. Approvals trigger the generation of a signed API verification link.
- **API Verify Link Generation** — On approval, the citizen receives a unique API URL. This link is the cryptographic proof of identity that INGRION will validate. **This link is the bridge between the government identity system and the blockchain.**
- **HMAC-Signed Callbacks** — When INGRION sends a verification request, NIA responds via HMAC-SHA256 signed callbacks, preventing forged approvals.

#### Data Model Highlights

```python
class CitizenUser(models.Model):
    aadhaar_number       # 12-digit unique, indexed
    name, dob, address   # Pre-seeded from government records
    password_hash        # SHA-256 — plaintext never stored
    profile_photo        # Uploaded during registration
    facial_embedding_b64 # Base64 embedding vector (not raw image)
    public_key_b64       # Ed25519 public key from INGRION

class AdminUser(models.Model):
    username, department # Government official identity
    password_hash        # SHA-256

class AuthToken(models.Model):
    token                # 64-char hex, 12-hour TTL
    citizen / admin      # Polymorphic FK — one or the other
```

#### Security Properties

- Token-based session auth (12-hour expiry, no JWT complexity)
- Cosine similarity matching for biometric verification
- HMAC-SHA256 shared secret for all API callbacks
- SHA-256 password hashing — no plaintext ever stored or transmitted

---

### 2. 🌐 INGRION Web Portal

> **The KYC bridge and application download gateway. The citizen's first touchpoint with the blockchain.**

The INGRION Web Portal sits between the Government Archive and the desktop application. It has three core responsibilities:

#### A. KYC Verification Bridge

When a citizen pastes their Government API verify link:

1. The portal extracts the `archive_link`, `public_key_b64`, `password_hash`, and `facial_embedding_b64` from the submission.
2. It POSTs this data to the Government Archive's verify endpoint.
3. The Government Archive checks identity, matches the facial embedding, and returns an HMAC-signed callback to INGRION.
4. INGRION validates the HMAC signature before updating the KYC status.
5. On approval, a **time-limited, single-use download token** is generated and associated with the KYC submission.

```
KYC Flow:
  User pastes API link
      ↓
  INGRION submits to Gov Archive (POST with facial embedding + public key)
      ↓
  Gov Archive validates → HMAC-signed callback → INGRION
      ↓
  KYC Status: APPROVED → Download token generated
      ↓
  User can now download the desktop application
```

**Rate limiting:** 5 KYC submissions per hour per IP — prevents abuse and bot attacks.

#### B. Secure App Download

The download system is intentionally gated:

- Download tokens are issued **only** after KYC approval — no token, no download.
- Tokens are **single-use** — once consumed, they cannot be reused.
- Tokens have a configurable expiry — stale tokens auto-renew on status poll.
- The `DownloadToken` model maintains a foreign key to `KYCSubmission` — full audit trail of who downloaded what and when.

This means it is **cryptographically impossible** for an unverified citizen to obtain the INGRION application through this portal.

#### C. DRHP / Whitepaper Browser

- Fetches company DRHP and RHP filings from the blockchain.
- Hash-verifies document integrity against the on-chain hash stored at submission time.
- Fully public — any visitor can inspect filings without authentication.
- Provides direct links to on-chain RHP status (pending, approved, bidding, listed).

#### KYC Status Machine

```
PENDING → SUBMITTED → APPROVED → (download token generated)
                    ↘ REJECTED
       ↘ FAILED (Gov Archive unreachable)
```

#### Audit Trail

Every Government callback — successful or not — is logged in `GovernmentCallbackLog` with:
- Raw payload (JSON)
- HMAC validity flag
- Source IP
- Processing timestamp

---

### 3. ⛓️ INGRION Blockchain Core Node

> **The heart of the ecosystem. A full Delegated Proof-of-Stake blockchain written entirely in Go — no EVM, no Solidity, no framework.**

This is not a fork. This is not built on Ethereum or Cosmos. Every line of the consensus engine, P2P network, mempool, block structure, state machine, and transaction processor was written from scratch.

#### Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    INGRION CORE NODE                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Consensus   │  │  P2P Network │  │  RPC / REST API   │  │
│  │  Engine      │  │  (TCP)       │  │  (Gorilla Mux)    │  │
│  │  (DPoS)      │  │  50 peers    │  │  API-Key gated    │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
│         │                 │                    │              │
│         ▼                 ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  State Machine                           │  │
│  │  Accounts · Balances · Stakes · IPO Metadata · RHPs     │  │
│  └─────────────────────────────────────────────────────────┘  │
│         │                                                      │
│         ▼                                                      │
│  ┌──────────────┐  ┌──────────────┐                           │
│  │  BadgerDB    │  │  Mempool     │                           │
│  │  (Embedded   │  │  (50,000 tx  │                           │
│  │   KV Store)  │  │   capacity)  │                           │
│  └──────────────┘  └──────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

#### P2P Network

| Property | Value |
|----------|-------|
| Transport | Raw TCP |
| Max Peers | 50 |
| Message Types | `HELLO`, `META`, `BLOCK`, `GETBLOCK`, `GETRANGE`, `GETSTATE`, `STATESNAP`, `TX`, `PING`, `PONG` |
| Sync Batch Size | 50 blocks/batch |
| Max Message Size | 10 MB |
| Keep-Alive | PING every 30 seconds |
| Peer Timeout | 5 minutes (pruned if silent) |
| Max Mempool | 50,000 transactions |
| Snapshot Interval | Every 1,000 blocks |

#### Block Structure

```go
type Block struct {
    Height        uint64
    PrevHash      string
    Proposer      string          // Ed25519 address of block proposer
    Timestamp     int64
    StateRoot     string          // Merkle-like state commitment
    ValidatorRoot string
    Transactions  []Transaction
    Signature     string          // Ed25519 signature of proposer
    BlockHash     string
}
```

#### Account Model

```go
type Account struct {
    Address      Address          // Ed25519-derived
    BalancePaise int64            // Native token (INR paise)
    BlockedPaise int64            // Funds locked in bids / escrow
    StakePaise   int64            // Validator stake
    Role         string           // user | validator | regulator | company
    Nonce        uint64           // Replay protection
    IsFrozen     bool             // Regulator enforcement flag
    Holdings     map[string]int64 // Stock symbol → share count
}
```

#### State Persistence

All state is persisted in **BadgerDB**, an embedded key-value store:
- Account state under `acc_<address>` keys
- RHP/IPO metadata under `rhp_<symbol>` keys
- Validator registry under `vreg_<address>` and `vstake_<address>` keys
- State snapshots every 1,000 blocks for fast peer sync
- All writes are **atomic transactions** — partial state is impossible

---

### 4. 💻 INGRION Desktop Application

> **The citizen's window into the blockchain. A cross-platform native app built with Rust (Tauri) and React/TypeScript.**

The desktop application is the primary user interface for all blockchain interactions. It connects to a local INGRION Go node and provides a rich, role-aware UI.

#### Role-Based Interface

The application detects the user's role from their keystore and renders a completely different navigation and feature set:

<details>
<summary><strong>👤 User Role</strong> — Retail Investor</summary>

| Screen | Description |
|--------|-------------|
| **Dashboard** | Portfolio overview, balance, recent activity |
| **IPO Bidding** | Browse open IPOs, place bids, view bid status |
| **Secondary Market** | Buy and sell listed shares with live order book |
| **Portfolio** | Holdings, unrealised P&L, stock details |
| **Transaction History** | Full on-chain transaction log with filters |
| **Send INR** | P2P native token transfer |
| **DRHP Browser** | Read company filings before bidding |

</details>

<details>
<summary><strong>⚡ Validator Role</strong> — Network Participant</summary>

| Screen | Description |
|--------|-------------|
| **Validator Dashboard** | Block production stats, uptime, rewards earned |
| **Staking** | Top up or reduce stake, view minimum stake requirements |
| **Slash Proposals** | View, raise, and vote on slash proposals against bad actors |
| **Block Explorer** | Inspect any block — transactions, state roots, proposer info |
| **Network Peers** | Live peer list with connection status and block heights |
| **Send INR** | Native token transfers |

</details>

<details>
<summary><strong>⚖️ Regulator Role</strong> — Market Authority</summary>

| Screen | Description |
|--------|-------------|
| **Regulator Dashboard** | System-wide market overview |
| **IPO Oversight** | Monitor all active and pending IPOs |
| **RHP Review** | Approve or reject Draft Red Herring Prospectus filings |
| **Account Enforcement** | Freeze, unfreeze, or flag suspicious accounts |
| **Regulatory Mandates** | Issue trading halts, audits, and freeze-IPO mandates |
| **Contracts** | View and vote on active regulatory smart contracts |
| **Block Explorer** | Full chain visibility |

</details>

<details>
<summary><strong>🏢 Company Role</strong> — Issuer</summary>

| Screen | Description |
|--------|-------------|
| **Company Dashboard** | Fundraising progress, shareholder count, treasury |
| **File DRHP** | Submit Draft Red Herring Prospectus on-chain |
| **Manage IPO** | Set price band, lot size, open/close dates |
| **Post Listing** | Announce listing after allocation |
| **Shareholders** | View complete on-chain shareholder registry |
| **Dividend Dispatch** | Trigger on-chain dividend distribution to all holders |

</details>

#### Application Bootstrap Flow

```
App starts
    ↓
Check for local keystore file
    ├── Not found → Setup Wizard (generate Ed25519 keypair, KYC, role selection)
    └── Found → Read keystore
          ↓
    Connect to local INGRION Go node (default: http://127.0.0.1:4001)
          ↓
    Splash screen (shows block height, node status)
          ↓
    Start background sync service
          ↓
    Role-aware dashboard rendered
```

#### Key Design Decisions

- **Zero custody**: The Ed25519 private key exists only in the encrypted local keystore. The app never sends it anywhere.
- **Local node required**: The app communicates with a locally running Go node via REST API. This keeps the user's transactions and data local.
- **Offline-capable reads**: State cached locally via IndexedDB — the app degrades gracefully when the node is offline.
- **Document hash verification**: The `DocumentHashTool` component verifies DRHP file integrity against on-chain hashes before displaying content.

---

## 🛤️ The Complete User Journey

```
Step 1 — Register on Gov Archive
  ├── Visit the National Identity Archive website
  ├── Log in with Aadhaar number + password
  ├── Upload profile photo and capture facial embedding (webcam)
  └── Submit KYC form to a government official for review

Step 2 — Government KYC Approval
  ├── Admin (government official) reviews the submission
  ├── Verifies identity against Aadhaar records
  └── Approves the KYC → API verify link generated

Step 3 — Copy the API Verify Link
  └── The citizen copies the unique signed API URL from the Gov Archive portal

Step 4 — Verify on INGRION Web
  ├── Visit the INGRION website
  ├── Paste the API verify link
  ├── INGRION submits the link + facial embedding to the Gov Archive
  ├── Gov Archive validates → HMAC-signed callback → INGRION confirms
  └── KYC status: APPROVED

Step 5 — Download the Desktop Application
  ├── A single-use, time-limited download token is issued
  ├── Citizen downloads the INGRION desktop app
  └── Token is consumed — cannot be reused

Step 6 — Setup the Desktop App
  ├── First launch triggers the Setup Wizard
  ├── App generates a new Ed25519 keypair
  ├── Keypair is encrypted and stored in the local keystore
  ├── User selects their role (User / Validator / Company)
  └── App connects to the local INGRION Go node

Step 7 — Participate in the Blockchain
  ├── Browse open IPOs → Place bids
  ├── Receive share allocation (automatic, on-chain, deterministic)
  ├── Trade on the secondary market
  ├── Send and receive INR (native token)
  ├── View portfolio and transaction history
  └── (If Validator) Propose/vote on blocks and slash proposals
```

---

## 🔐 Security Architecture

INGRION was designed with a **zero-trust, zero-custody** security model. The following guarantees hold at every layer:

### Cryptographic Layer

| Guarantee | Implementation |
|-----------|---------------|
| **Ed25519 Key Pairs** | Every participant generates a keypair locally. Private key **never leaves the device** — not during KYC, not during transactions, never. |
| **Transaction Signing** | Every transaction is signed with the sender's Ed25519 private key. The node verifies the signature against the public key stored on-chain before accepting the transaction. |
| **Block Signing** | The proposer signs each block they produce. All peers verify this signature before applying the block to their state. |
| **HMAC-SHA256 Callbacks** | All Government Archive → INGRION callbacks are signed with a shared HMAC secret. Any callback with an invalid signature is rejected and logged. |
| **SHA-256 Document Hashing** | DRHP and RHP documents are SHA-256 hashed before submission. The hash is stored on-chain — any file tampering is immediately detectable. |

### Identity Layer

| Guarantee | Implementation |
|-----------|---------------|
| **Biometric Cross-Verification** | Facial embedding captured at Gov Archive and again at INGRION KYC. Cosine similarity comparison prevents impersonation even with a valid Aadhaar number. |
| **Whitelist-Gated Network** | Only public keys that have passed the full KYC pipeline are whitelisted to submit transactions. No anonymous participation. |
| **No Private Key Storage — Anywhere** | The Government Archive stores `public_key_b64` only. INGRION website stores `public_key_b64` only. The desktop app stores the encrypted private key locally only. |

### State Layer

| Guarantee | Implementation |
|-----------|---------------|
| **Atomic DB Commits** | All state transitions in BadgerDB are wrapped in atomic transactions. A block either fully applies or fully rolls back. |
| **Nonce-Based Replay Protection** | Every account has a monotonically increasing nonce. Replaying an old signed transaction fails because the nonce no longer matches. |
| **Deterministic IPO Allocation** | IPO share allocation is triggered at a specific block height and executed by every node independently — no admin intervention, no discretion. |
| **Regulator-Only Enforcement Txs** | `tnx_freeze_account`, `tnx_mandate`, `tnx_reject_drhp` can only be submitted by addresses with the `regulator` role, enforced at the transaction validation layer. |

---

## 📜 Transaction Types — 22 Native Tx Types

INGRION implements **22 native transaction types**, each covering a specific financial or governance action:

### 💸 Financial Transactions

| Tx Type | Description |
|---------|-------------|
| `tnx_sendINR` | Native token (INR paise) peer-to-peer transfer |

### 📈 IPO Lifecycle

| Tx Type | Description |
|---------|-------------|
| `tnx_initiate_stock` | Company initiates a new stock / IPO round |
| `tnx_upload_drhp` | Company files a Draft Red Herring Prospectus on-chain |
| `tnx_upload_rhp` | Company uploads the final Red Herring Prospectus |
| `tnx_update_rhp` | Amend RHP before the bidding window opens |
| `tnx_open_ipo` | Formally open the IPO for public bidding |
| `tnx_bid_stock` | Retail investor places a bid during the IPO window |
| `tnx_allocate_ipo` | Consensus-triggered automatic share allocation at close |
| `tnx_cancel_ipo` | Company cancels IPO before bidding opens |

### 📊 Secondary Market

| Tx Type | Description |
|---------|-------------|
| `tnx_sell_stock` | Post a sell order on the secondary market |
| `tnx_buy_stock` | Match and execute a buy order on the secondary market |
| `tnx_transfer_stock` | Direct P2P share transfer between two accounts |

### 🏢 Corporate Actions

| Tx Type | Description |
|---------|-------------|
| `tnx_dividend` | Company distributes dividends to all shareholders on-chain |
| `tnx_corporate_action` | Stock splits, buybacks, bonus shares |
| `tnx_post_listing` | Announce official listing after IPO allocation |

### ⚖️ Regulatory Transactions (Regulator-Only)

| Tx Type | Description |
|---------|-------------|
| `tnx_vote_contract` | Regulator votes on a proposed smart contract |
| `tnx_new_contract` | Regulator proposes a new regulatory contract |
| `tnx_reject_drhp` | Formally reject a DRHP filing on-chain |
| `tnx_freeze_account` | Freeze a suspicious account — blocks all outgoing transactions |
| `tnx_unfreeze_account` | Lift a previously issued account freeze |
| `tnx_flag_account` | Flag an account for investigation (non-freezing) |
| `tnx_mandate` | Issue a regulatory mandate (trading halt, audit order, IPO freeze) |

### ⚡ Validator Governance

| Tx Type | Description |
|---------|-------------|
| `VALIDATOR_JOIN` | Node registers as a validator with initial stake |
| `VALIDATOR_EXIT` | Validator gracefully exits the validator set |
| `tnx_update_stake` | Top up or reduce stake without full exit/re-entry |
| `tnx_slash_proposal` | Propose slashing a validator for malicious behaviour |
| `tnx_vote_slash` | Vote on a pending slash proposal (majority required) |

---

## ⛏️ Consensus Mechanism — Delegated Proof-of-Stake

INGRION uses a custom **Delegated Proof-of-Stake (DPoS)** consensus mechanism designed for a permissioned-identity financial network:

### Proposer Selection

```
Proposer weight = f(stake_amount, participation_rate, overall_score)
```

- Validators are ranked by a weighted score incorporating stake, historical participation, and uptime.
- A **proposer cooldown** prevents any single validator from proposing consecutive blocks — preventing monopolistic control.
- If the selected proposer fails to produce a block within **3 seconds**, the slot is skipped and the next proposer takes over. The chain **never halts** due to a single offline node.

### Block Production

1. Consensus loop calculates the expected proposer for the current height.
2. If this node is the proposer: collect pending transactions from mempool → build block → sign with Ed25519 → broadcast to all peers.
3. All peer nodes verify the block signature and apply it atomically to their state.
4. Height advances. Repeat.

### IPO Allocation (Consensus-Triggered)

IPO share allocation is **deterministic** — it does not require any administrator action:

- When an IPO's RHP reaches its closing block height, **every node independently** identifies the IPO as ready for allocation.
- Each node runs the allocation algorithm (pro-rata or lottery) against the collected bids.
- The result is identical on every node — the allocation is a function of on-chain state, not off-chain decisions.
- Allocated shares appear in shareholder accounts atomically. Unallocated bid amounts are refunded to `BalancePaise`.

### Slashing

Validators that behave maliciously (double-signing, prolonged absence) can be slashed through an on-chain proposal system:
1. Any validator raises a `tnx_slash_proposal` with evidence and a `slashPaise` amount.
2. Other validators vote via `tnx_vote_slash`.
3. If a majority threshold is reached, the slash is executed — stake is reduced and the validator may be removed from the active set.

---

## 👥 Role System

| Role | On-Chain Designation | Capabilities |
|------|---------------------|--------------|
| **User** | `role: "user"` | Send INR · Bid in IPOs · Trade secondary market · Hold shares |
| **Validator** | `role: "validator"` | All User capabilities + Propose/validate blocks · Stake management · Slash voting |
| **Regulator** | `role: "regulator"` | Review/approve DRHPs · Freeze accounts · Issue mandates · Vote on contracts |
| **Company** | `role: "company"` | File DRHP/RHP · Manage IPO · Distribute dividends · View shareholders |

Role membership is defined in `genesis.json` — `validators[]` and `regulators[]` arrays specify the initial set. Companies and users are onboarded through the KYC pipeline post-genesis.

---

## 🛠️ Technology Stack

```
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND / CLIENT                                                    │
│  React 18 · TypeScript · Tailwind CSS · Recharts · React Router      │
│  Tauri (Rust) — cross-platform native shell                           │
│  Vite — build tooling                                                 │
├─────────────────────────────────────────────────────────────────────┤
│  WEB BACKENDS                                                         │
│  Django 5 · Django REST Framework · Python 3.13                      │
│  SQLite (dev) / PostgreSQL (prod)                                    │
│  Token auth · HMAC-SHA256 · Rate throttling (djangorestframework)    │
├─────────────────────────────────────────────────────────────────────┤
│  BLOCKCHAIN NODE                                                      │
│  Go 1.21+ · BadgerDB v3 (embedded KV store)                         │
│  Gorilla Mux (HTTP router) · net/http · crypto/ed25519               │
│  encoding/json · sync/atomic · goroutines + channels                 │
├─────────────────────────────────────────────────────────────────────┤
│  CRYPTOGRAPHY                                                         │
│  Ed25519 — key generation, signing, verification                     │
│  SHA-256 — document hashing, password hashing                        │
│  HMAC-SHA256 — API callback authentication                           │
│  Base64 — embedding and key encoding                                 │
├─────────────────────────────────────────────────────────────────────┤
│  BIOMETRICS                                                           │
│  Facial embedding vectors (Base64 encoded)                           │
│  Cosine similarity — identity cross-verification                     │
├─────────────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE                                                       │
│  TCP P2P (up to 50 peers) · REST RPC (API-key gated)                │
│  BadgerDB snapshots · Goroutine-safe mempool                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- Go 1.21+
- Python 3.13+
- Node.js 20+
- Rust + Cargo (for desktop app)
- [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)

---

### 1. Run the National Identity Archive (Gov Archive)

```bash
cd National_Identity_Archive/backend

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env — set SECRET_KEY, ALLOWED_HOSTS, INGRION_CALLBACK_HMAC_SECRET

# Apply migrations
python manage.py migrate

# Seed demo citizens and admin accounts
python manage.py seed_db

# Start the server
python manage.py runserver 0.0.0.0:8000
```

**Gov Archive will be available at:** `http://localhost:8000`

---

### 2. Run the INGRION Web Portal

```bash
cd Ingrion_Web/backend

# Install dependencies
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Edit .env — set GOVERNMENT_ARCHIVE_BASE_URL, GOVERNMENT_CALLBACK_HMAC_SECRET

# Apply migrations
python manage.py migrate

# Start the server
python manage.py runserver 0.0.0.0:8001
```

**INGRION Web will be available at:** `http://localhost:8001`

---

### 3. Run the Blockchain Node

```bash
cd Ingrion_core

# Install dependencies
go mod download

# Run the genesis node (first node — creates the chain)
go run main.go \
  --forceGenesis \
  --genesis genesis.json \
  --peers config_peers.json \
  --p2p :4000 \
  --rpc :4001 \
  --priv <your-ed25519-private-key-hex>

# Run additional nodes (point to the genesis peer)
go run main.go \
  --genesis genesis.json \
  --peers config_peers.json \
  --p2p :4002 \
  --rpc :4003 \
  --priv <another-key-hex>
```

**Node RPC will be available at:** `http://localhost:4001`

---

### 4. Run the Desktop Application

```bash
cd Ingrion_exe

# Install frontend dependencies
npm install

# Development mode (connects to local node at http://127.0.0.1:4001)
npm run tauri dev

# Build distributable
npm run tauri build
```

> **Or download the pre-built binary:** [`ingrion.exe`](./ingrion.exe)

---

### Genesis Configuration

The `genesis.json` file defines the initial chain state:

```json
{
  "chainId": "ingrion-mainnet-1",
  "genesisTimestamp": 1700000000,
  "slotDuration": 5,
  "maxTxPerBlock": 500,
  "initialBalance": 1000000000,
  "minStakePaise": 10000000,
  "proposerCooldown": 3,
  "gasPerTx": 1000,
  "validators": ["<validator-address-1>", "<validator-address-2>"],
  "regulators": ["<regulator-address>"],
  "initialAccounts": [...]
}
```

---

## 📁 Repository Structure

```
INGRION/
│
├── National_Identity_Archive/          # Government KYC Portal
│   ├── backend/
│   │   ├── gov_project/
│   │   │   ├── apps/
│   │   │   │   ├── accounts/           # CitizenUser, AdminUser, AuthToken models
│   │   │   │   │   ├── models.py
│   │   │   │   │   ├── views.py        # Login, KYC approval, facial embedding
│   │   │   │   │   └── authentication.py
│   │   │   │   └── archive/            # Document storage
│   │   │   └── settings.py
│   │   └── gov_archive.db
│   └── .env.example
│
├── Ingrion_Web/                        # KYC Bridge & Download Portal
│   ├── backend/
│   │   ├── ingrion_project/
│   │   │   └── apps/
│   │   │       ├── kyc/                # KYCSubmission, GovernmentCallbackLog
│   │   │       │   ├── models.py
│   │   │       │   ├── views.py        # Submit, status poll, HMAC callback
│   │   │       │   └── serializers.py
│   │   │       ├── downloads/          # DownloadToken model & gated download
│   │   │       └── whitepaper/         # DRHP browser endpoints
│   │   └── db.sqlite3
│   └── .env.example
│
├── Ingrion_core/                       # Go Blockchain Node
│   ├── main.go                         # 6,600+ lines — full node in one file
│   ├── genesis.json                    # Chain genesis configuration
│   ├── config_peers.json               # Bootstrap peer list
│   └── whitelist.json                  # Whitelisted public keys
│
├── Ingrion_exe/                        # Desktop Application (Rust + React)
│   ├── src/
│   │   ├── App.tsx                     # Main router + role detection
│   │   ├── pages/
│   │   │   ├── user/                   # Dashboard, IPOBidding, SecondaryMarket, Portfolio
│   │   │   ├── validator/              # ValidatorDashboard, Staking, SlashProposals, BlockExplorer
│   │   │   ├── regulator/              # RegulatorDashboard, IPOOversight, RHPReview, Enforcement
│   │   │   ├── company/                # CompanyDashboard, FileDRHP, ManageIPO, Shareholders
│   │   │   └── common/                 # Settings, TxHistory, DRHPBrowser
│   │   ├── components/
│   │   │   ├── layout/AppShell.tsx     # Navigation, notifications, role-aware sidebar
│   │   │   └── modals/DocumentHashTool.tsx
│   │   └── lib/
│   │       ├── api.ts                  # Node RPC client
│   │       ├── keystore.ts             # Ed25519 keystore management
│   │       ├── sync.ts                 # Background sync service
│   │       └── db.ts                   # Local notification store
│   ├── Cargo.toml                      # Rust / Tauri configuration
│   └── dist/                           # Built frontend assets
│
├── ingrion-whitepaper.pdf              # Full technical whitepaper
└── ingrion.exe                         # Pre-built Windows executable
```

---

## 👨‍💻 Team

<div align="center">

| | Name | Role in Project |
|--|------|----------------|
| 🧠 | **Kiran** | National Identity Archive (Gov KYC Portal) — Django backend, biometric enrollment, admin approval flow |
| 🌐 | **Shreyaas** | INGRION Web Portal — KYC verification bridge, download token system, DRHP browser |
| 💻 | **Kirthick** | INGRION Desktop App — Rust/Tauri shell, React UI, all 4 role dashboards, keystore management |
| ⛓️ | **Thirumal** | INGRION Blockchain Core — Go node, DPoS consensus, P2P network, all 22 transaction types, state machine |

</div>

---

## 📄 Whitepaper

For a deep technical specification of the consensus mechanism, transaction semantics, cryptographic primitives, and economic model, read the full whitepaper:

**[📖 ingrion-whitepaper.pdf](./ingrion-whitepaper.pdf)**

---

## ⚠️ Disclaimer

INGRION is a research and academic project. The `ingrion.exe` binary and blockchain node are intended for demonstration and evaluation purposes. This is not production financial software and should not be used for real monetary transactions.

---

<div align="center">

**INGRION** — *Finance, made transparent by design.*

Built with ❤️ by Kiran · Shreyaas · Kirthick · Thirumal

[![Go](https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white)](https://golang.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org)
[![Rust](https://img.shields.io/badge/Rust-CE422B?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)

</div>
