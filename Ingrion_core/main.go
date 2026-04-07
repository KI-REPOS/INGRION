package main

import (
	"bufio"
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/dgraph-io/badger/v3"
	"github.com/gorilla/mux"
)

// -------------------------
// Constants & globals
// -------------------------

var ForceGenesis bool
var isSyncing bool
var syncActive int32 // atomic: 1 = initiateSync goroutine is actively running

// P2P message types
const (
	MsgHello         = "HELLO"
	MsgMeta          = "META"
	MsgBlock         = "BLOCK"
	MsgGetBlock      = "GETBLOCK"
	MsgGetRange      = "GETRANGE"
	MsgGetState      = "GETSTATE"
	MsgStateSnapshot = "STATESNAP"
	MsgTx            = "TX"
	MsgPing          = "PING" // New: for keep-alive
	MsgPong          = "PONG"
)

const (
	MaxPeers                  = 50
	RetryInterval             = 5 * time.Second
	SyncBatchSize             = 50
	MaxBlocksToKeep           = 10000
	MaxMempoolSize            = 50000
	RPCTimeout                = 30 * time.Second
	MaxMessageSize            = 10 * 1024 * 1024 // 10MB
	SnapshotInterval          = 1000             // blocks
	EmptySlotTimeout          = 3 * time.Second  // time to wait for proposer before skipping
	ValidatorRegistryPrefix   = "vreg_"
	ValidatorStakePrefix      = "vstake_"
	ValidatorLastActivePrefix = "vactive_"
	PeerTimeout               = 5 * time.Minute  // Enhanced: for pruning
	PingInterval              = 30 * time.Second // Enhanced: keep-alive
)

type Address string

var (
	nodeID          string
	privKey         ed25519.PrivateKey
	pubKey          ed25519.PublicKey
	db              *badger.DB
	dataDir         string
	mempool         = make(map[string]Transaction)
	mempoolMutex    sync.RWMutex
	mempoolFilePath string
	peers           = make(map[string]*PeerInfo)
	peersMutex      sync.RWMutex
	genesisConfig   GenesisConfig
	genesisTime     time.Time

	whitelist      = make(map[string]bool)
	whitelistMutex sync.Mutex

	isValidator      bool
	isRegulator      bool
	nodeRole         string
	nodeAddress      string
	currentHeight    atomic.Uint64 // Enhanced: atomic for safety
	lastProposedSlot uint64

	p2pListenAddr string
	publicAddr    string
	rpcListenAddr string
	apiKey        string

	bootstrapAddrs []string

	// Sync state - Enhanced
	syncMutex          sync.Mutex
	syncHeight         uint64
	syncTargetHeight   atomic.Uint64 // Enhanced: Track peer's target height
	lastSnapshotHeight uint64
	pendingBlocks      = make(chan *Block, 1000) // Enhanced: Queue during sync

	// Metrics
	bytesIn            atomic.Uint64
	bytesOut           atomic.Uint64
	peerCount          atomic.Int32
	mempoolSize        atomic.Int32
	blocksSynced       atomic.Uint64
	emptySlots         atomic.Uint64
	txsProcessed       atomic.Uint64
	validatorRotations atomic.Uint64

	// Block proposal tracking
	proposalTimer    *time.Timer
	currentProposer  string
	nextProposerTime time.Time

	// Block processing queue (fixes concurrent races)
	blockQueue = make(chan *Block, 1000) // generous buffer

	// State snapshot
	snapshotMutex sync.RWMutex
	snapshotCache map[string][]byte

	// Logger
	protocolLog  *log.Logger
	consensusLog *log.Logger
	syncLog      *log.Logger
	networkLog   *log.Logger // Enhanced: separate network logger
)

// -------------------------
// Types
// -------------------------

type NodeMeta struct {
	NodeID        string   `json:"nodeId"`
	Stake         int64    `json:"stake"`
	Participation float64  `json:"participation"`
	OverallScore  float64  `json:"overallScore"`
	LastSeen      int64    `json:"lastSeen"`
	LastProposed  uint64   `json:"lastProposed"`
	IsValidator   bool     `json:"isValidator"`
	IsRegulator   bool     `json:"isRegulator"`
	KnownPeers    []string `json:"knownPeers"`
}

type PeerInfo struct {
	Address    string
	NodeID     string
	LastSeen   time.Time
	Meta       NodeMeta
	Connection net.Conn
	Height     uint64
	HeadHash   string
	LastPing   time.Time // Enhanced: track ping time
}

type HelloMessage struct {
	NodeID      string
	Address     string
	Height      uint64
	HeadHash    string
	GenesisHash string
	Timestamp   int64

	StateRoot       string
	ValidatorRoot   string
	FinalizedHeight uint64
	KnownPeers      []string // Enhanced: ensure exchange
}

type GenesisConfig struct {
	ChainID          string    `json:"chainId"`
	GenesisTimestamp int64     `json:"genesisTimestamp"`
	SlotDuration     int       `json:"slotDuration"`
	MaxTxPerBlock    int       `json:"maxTxPerBlock"`
	InitialBalance   int64     `json:"initialBalance"`
	MinStakePaise    int64     `json:"minStakePaise"`
	ProposerCooldown int       `json:"proposerCooldown"`
	GasPerTx         int       `json:"gasPerTx"`
	GenesisHash      string    `json:"genesisHash"`
	Validators       []string  `json:"validators"`
	Regulators       []string  `json:"regulators"`
	InitialAccounts  []Account `json:"initialAccounts"`
}

type Account struct {
	Address       Address          `json:"address"`
	BalancePaise  int64            `json:"balancePaise"`
	BlockedPaise  int64            `json:"blockedPaise"`
	StakePaise    int64            `json:"stakePaise"`
	Role          string           `json:"role"`
	Nonce         uint64           `json:"nonce"`
	Stocks        map[string]int64 `json:"stocks"`
	Participation float64          `json:"participation"`
	OverallScore  float64          `json:"overallScore"`
	LastProposed  uint64           `json:"lastProposed"`
}

type TxType string

const (
	TxSendINR       TxType = "tnx_sendINR"
	TxInitiateStock TxType = "tnx_initiate_stock"
	TxBidStock      TxType = "tnx_bid_stock"
	TxUploadDRHP    TxType = "tnx_upload_drhp"
	TxUploadRHP     TxType = "tnx_upload_rhp"
	TxVoteContract  TxType = "tnx_vote_contract"
	TxNewContract   TxType = "tnx_new_contract"
	TxDividend      TxType = "tnx_dividend"
	TxAllocateIPO   TxType = "tnx_allocate_ipo"
	TxValidatorJoin TxType = "VALIDATOR_JOIN"
	TxValidatorExit TxType = "VALIDATOR_EXIT"
	TxOpenIPO       TxType = "tnx_open_ipo"

	// --- Company Transactions (NEW) ---
	TxUpdateRHP       TxType = "tnx_update_rhp"       // Amend RHP before bidding opens
	TxCancelIPO       TxType = "tnx_cancel_ipo"       // Cancel IPO before bidding window
	TxCorporateAction TxType = "tnx_corporate_action" // Stock split, buyback, bonus shares

	// --- User / Investor Transactions (NEW) ---
	TxTransferStock TxType = "tnx_transfer_stock" // P2P stock transfer after listing
	TxSellStock     TxType = "tnx_sell_stock"     // Sell order on secondary market
	TxBuyStock      TxType = "tnx_buy_stock"      // Buy order on secondary market

	// --- Regulator Transactions (NEW) ---
	TxRejectDRHP      TxType = "tnx_reject_drhp"      // Formally reject a DRHP on-chain
	TxFreezeAccount   TxType = "tnx_freeze_account"   // Freeze a suspicious account
	TxUnfreezeAccount TxType = "tnx_unfreeze_account" // Lift account freeze
	TxFlagAccount     TxType = "tnx_flag_account"     // Flag account for investigation
	TxMandate         TxType = "tnx_mandate"          // Issue regulatory mandate (e.g. trading halt)

	// --- Validator Transactions (NEW) ---
	TxUpdateStake   TxType = "tnx_update_stake"   // Top up or reduce stake without full exit
	TxSlashProposal TxType = "tnx_slash_proposal" // Propose slashing a malicious validator
	TxVoteSlash     TxType = "tnx_vote_slash"     // Vote on a pending slash proposal
)

type Transaction struct {
	Type          TxType            `json:"type"`
	From          Address           `json:"from"`
	To            Address           `json:"to,omitempty"`
	AmountPaise   int64             `json:"amountPaise,omitempty"`
	Nonce         uint64            `json:"nonce"`
	Stock         string            `json:"stock,omitempty"`
	BidPricePaise int64             `json:"bidPricePaise,omitempty"`
	BidShares     int64             `json:"bidShares,omitempty"`
	Category      string            `json:"category,omitempty"`
	RHPHash       string            `json:"rhpHash,omitempty"`
	Meta          map[string]string `json:"meta,omitempty"`
	Timestamp     int64             `json:"timestamp"`
	Sig           string            `json:"sig"`

	Shares      int64  `json:"shares,omitempty"`      // for stock transfer/sell/buy
	PricePaise  int64  `json:"pricePaise,omitempty"`  // secondary market price per share
	Reason      string `json:"reason,omitempty"`      // freeze / flag / reject / mandate reason
	MandateType string `json:"mandateType,omitempty"` // for TxMandate
	ActionType  string `json:"actionType,omitempty"`  // for TxCorporateAction
	Ratio       string `json:"ratio,omitempty"`       // split ratio e.g. "2:1"
	ProposalID  string `json:"proposalId,omitempty"`  // slash proposal reference
}

type BlockHeader struct {
	PrevHash      string `json:"prevHash"`
	Proposer      string `json:"proposer"`
	Height        uint64 `json:"height"`
	TxCount       int    `json:"txCount"`
	Timestamp     int64  `json:"timestamp"`
	GasUsed       int64  `json:"gasUsed"`
	StateRoot     string `json:"stateRoot"`
	ValidatorRoot string `json:"validatorRoot"`
	AllocCount    int    `json:"allocCount"`
	AllocCursor   string `json:"allocCursor,omitempty"`
}

type Block struct {
	Header        BlockHeader           `json:"header"`
	Transactions  []Transaction         `json:"transactions"`
	AllocationOps []AllocationOperation `json:"allocationOps,omitempty"`
	ProposerSig   string                `json:"proposerSig"`
	BlockHash     string                `json:"blockHash"`
}

type ValidatorInfo struct {
	Address      string `json:"address"`
	StakePaise   int64  `json:"stakePaise"`
	JoinedHeight uint64 `json:"joinedHeight"`
	LastActive   uint64 `json:"lastActive"`
	IsActive     bool   `json:"isActive"`
	Score        int64  `json:"score"`
}

type ChainState struct {
	Height          uint64                    `json:"height"`
	HeadHash        string                    `json:"headHash"`
	Validators      []ValidatorInfo           `json:"validators"`
	Accounts        map[string]Account        `json:"accounts"`
	RHPMetadata     map[string]RHPMetadata    `json:"rhpMetadata"`               // ← Changed
	AllocationPlans map[string]AllocationPlan `json:"allocationPlans,omitempty"` // ← New (recommended)
	Timestamp       int64                     `json:"timestamp"`
	GenesisHash     string                    `json:"genesisHash"`
}

type StateSnapshot struct {
	Height          uint64           `json:"height"`
	StateRoot       string           `json:"stateRoot"`
	Accounts        []Account        `json:"accounts"`
	Validators      []ValidatorInfo  `json:"validators"`
	RHPMetadata     []RHPMetadata    `json:"rhpMetadata"`               // ← Changed
	AllocationPlans []AllocationPlan `json:"allocationPlans,omitempty"` // ← New
	Blocks          []Block          `json:"blocks"`
	BlockHash       string           `json:"blockHash"`
	Timestamp       int64            `json:"timestamp"`
}

type Contract struct {
	Name    string `json:"name"`
	Batch   string `json:"batch"`
	Payload string `json:"payload"`
}

// Replace old IPOMetadata with this
type RHPMetadata struct {
	Stock               string `json:"stock"`
	TotalShares         int64  `json:"totalShares"`
	PriceBandUpper      int64  `json:"priceBandUpper"`
	PriceBandLower      int64  `json:"priceBandLower"`
	BiddingWindowBlocks int64  `json:"biddingWindowBlocks"`
	FaceValue           int64  `json:"faceValue"`
	CompanyAddr         string `json:"companyAddr"`

	QIBPercentage    int `json:"qibPercentage"`
	NIBPercentage    int `json:"nibPercentage"`
	RetailPercentage int `json:"retailPercentage"`

	RetailLotSize int64 `json:"retailLotSize"`
	MinRetailBid  int64 `json:"minRetailBid"`
	MaxRetailBid  int64 `json:"maxRetailBid"`

	Status           string `json:"status"`
	BiddingStartSlot uint64 `json:"biddingStartSlot"` // use height
	BiddingEndSlot   uint64 `json:"biddingEndSlot"`
}

type Bid struct {
	From          Address `json:"from"`
	Stock         string  `json:"stock"`
	BidPricePaise int64   `json:"bidPricePaise"`
	BidShares     int64   `json:"bidShares"`
	Category      string  `json:"category"` // "qib", "nib", "retail"
	Timestamp     int64   `json:"timestamp"`
}

// New allocation types (copy exactly from gold)
type AllocationPlan struct {
	Stock          string                   `json:"stock"`
	CutoffPrice    int64                    `json:"cutoffPrice"`
	TotalShares    int64                    `json:"totalShares"`
	Allocated      int64                    `json:"allocated"`
	CategoryQuotas map[string]CategoryQuota `json:"categoryQuotas"`
	Allocations    []AllocationDecision     `json:"allocations"`
	CreatedHeight  uint64                   `json:"createdHeight"`
	Status         string                   `json:"status"`
	Cursor         int                      `json:"cursor"`
}

type CategoryQuota struct {
	ReservedShares  int64 `json:"reservedShares"`
	DemandShares    int64 `json:"demandShares"`
	AllocatedShares int64 `json:"allocatedShares"`
}

type AllocationDecision struct {
	Bidder       string `json:"bidder"`
	Category     string `json:"category"`
	BidPrice     int64  `json:"bidPrice"`
	BidShares    int64  `json:"bidShares"`
	AllocShares  int64  `json:"allocShares"`
	AmountToPay  int64  `json:"amountToPay"`
	RefundAmount int64  `json:"refundAmount"`
	LotteryWin   bool   `json:"lotteryWin,omitempty"`
}

type AllocationOperation struct {
	Stock        string `json:"stock"`
	Bidder       string `json:"bidder"`
	AllocShares  int64  `json:"allocShares"`
	AmountToPay  int64  `json:"amountToPay"`
	RefundAmount int64  `json:"refundAmount"`
	Category     string `json:"category"`
}

type Dividend struct {
	Stock       string `json:"stock"`
	AmountPaise int64  `json:"amountPaise"`
	CompanyAddr string `json:"companyAddr"`
	Timestamp   int64  `json:"timestamp"`
}

type RangeRequest struct {
	Start uint64 `json:"start"`
	End   uint64 `json:"end"`
}

// SlashProposal records a validator slash proposal on-chain.
type SlashProposal struct {
	ProposalID string   `json:"proposalId"`
	Target     string   `json:"target"` // validator address to slash
	Proposer   string   `json:"proposer"`
	Reason     string   `json:"reason"`
	SlashPaise int64    `json:"slashPaise"` // amount to slash
	Votes      []string `json:"votes"`      // addresses that voted yes
	Status     string   `json:"status"`     // "pending", "approved", "rejected"
	Height     uint64   `json:"height"`
}

// Mandate is a regulatory mandate (trading halt, audit, etc.)
type Mandate struct {
	MandateID   string `json:"mandateId"`
	Issuer      string `json:"issuer"`
	Target      string `json:"target,omitempty"` // stock symbol or address, blank = global
	MandateType string `json:"mandateType"`      // "trading_halt", "audit", "freeze_ipo", etc.
	Reason      string `json:"reason"`
	Active      bool   `json:"active"`
	Height      uint64 `json:"height"`
	ExpiresAt   uint64 `json:"expiresAt,omitempty"` // 0 = indefinite
}

// CorporateAction records stock split / buyback / bonus share events.
type CorporateAction struct {
	ActionID   string `json:"actionId"`
	Stock      string `json:"stock"`
	ActionType string `json:"actionType"` // "split", "buyback", "bonus"
	Ratio      string `json:"ratio"`      // e.g. "2:1" for split
	Amount     int64  `json:"amount"`     // for buyback: paise per share
	Announced  uint64 `json:"announced"`  // block height
	Company    string `json:"company"`
}

// FlaggedAccount holds audit flag info for a flagged address.
type FlaggedAccount struct {
	Address   string `json:"address"`
	Reason    string `json:"reason"`
	FlaggedBy string `json:"flaggedBy"`
	Height    uint64 `json:"height"`
	Active    bool   `json:"active"`
}

// -------------------------
// main
// -------------------------

func main() {
	forceGenesis := flag.Bool("forceGenesis", false, "Force genesis node")
	genesisFile := flag.String("genesis", "genesis.json", "Path to genesis config")
	p2pAddr := flag.String("p2p", "0.0.0.0:8080", "P2P listen address (host:port)")
	publicAddrFlag := flag.String("publicAddr", "", "Public P2P address to advertise")
	rpcAddr := flag.String("rpc", "0.0.0.0:8081", "RPC listen address (host:port)")
	peerFile := flag.String("peers", "config_peers.json", "Path to peers config file")
	privHex := flag.String("priv", "", "hex-encoded Ed25519 private key")
	dataDirFlag := flag.String("data", "./data", "Data directory")
	whitelistFile := flag.String("whitelist", "whitelist.json", "Path to whitelist file")
	apiKeyFlag := flag.String("apikey", "", "API key for RPC auth")
	flag.Parse()

	ForceGenesis = *forceGenesis
	isSyncing = !ForceGenesis
	dataDir = *dataDirFlag

	// Setup loggers
	setupLoggers()

	protocolLog.Println("=======================================")
	protocolLog.Println("INGRION BLOCKCHAIN NODE STARTING")
	protocolLog.Println("=======================================")

	// Load key
	if err := loadKeyFromPrivFlag(*privHex); err != nil {
		protocolLog.Fatalf("❌ FAILED to load private key from -priv: %v", err)
	}

	p2pListenAddr = *p2pAddr
	publicAddr = *publicAddrFlag
	rpcListenAddr = *rpcAddr
	apiKey = *apiKeyFlag

	if publicAddr == "" {
		publicAddr = p2pListenAddr
		if strings.HasPrefix(publicAddr, "0.0.0.0") {
			protocolLog.Fatal("❌ publicAddr must be set when binding to 0.0.0.0")
		}
	}

	// FS setup
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		protocolLog.Fatalf("❌ FAILED to create data dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "blocks"), 0o755); err != nil {
		protocolLog.Fatalf("❌ FAILED to create blocks dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "snapshots"), 0o755); err != nil {
		protocolLog.Fatalf("❌ FAILED to create snapshots dir: %v", err)
	}

	mempoolFilePath = filepath.Join(dataDir, "mempool.json")

	// DB
	var err error
	db, err = badger.Open(badger.DefaultOptions(filepath.Join(dataDir, "worlddb")))
	if err != nil {
		protocolLog.Fatalf("❌ FAILED to open BadgerDB: %v", err)
	}
	defer db.Close()

	// Initialize caches
	snapshotCache = make(map[string][]byte)

	// Load configs
	if err := loadGenesisConfig(*genesisFile); err != nil {
		protocolLog.Fatalf("❌ FAILED to load genesis config: %v", err)
	}

	if err := loadPeersConfig(*peerFile); err != nil {
		protocolLog.Printf("⚠️  Failed to load peers config: %v", err)
	}

	if err := loadWhitelist(*whitelistFile); err != nil {
		protocolLog.Printf("⚠️  Failed to load whitelist: %v", err)
	}

	// Initialize state
	if ForceGenesis {
		if err := initializeGenesisState(); err != nil {
			protocolLog.Fatalf("❌ FAILED to initialize genesis state: %v", err)
		}
		isSyncing = false
		protocolLog.Println("✅ Genesis node initialized")
	} else {
		isSyncing = true
		protocolLog.Println("⏳ Join node – entering sync mode")
	}

	// Determine node role
	nodeAddress = hex.EncodeToString(pubKey)
	nodeID = nodeAddress
	isValidator = contains(genesisConfig.Validators, nodeAddress)
	isRegulator = contains(genesisConfig.Regulators, nodeAddress)
	if isRegulator {
		nodeRole = "regulator"
	} else if isValidator {
		nodeRole = "validator"
	} else {
		nodeRole = "user"
	}

	genesisTime = time.Unix(genesisConfig.GenesisTimestamp, 0)

	// Set initial height
	h := getChainHeightFromDB()
	currentHeight.Store(h)

	protocolLog.Printf("✅ Node initialized: address=%s role=%s genesis=%s",
		short(nodeAddress), nodeRole, short(genesisConfig.GenesisHash))
	protocolLog.Printf("📊 Current chain height: %d", h)

	// Load mempool from disk
	if err := loadMempool(mempoolFilePath); err != nil {
		protocolLog.Printf("⚠️  Failed to load mempool: %v", err)
	}

	// Start services
	protocolLog.Println("🚀 Starting services...")
	go startP2PServer(p2pListenAddr)
	go startPeerManager()
	go startRPCServer(rpcListenAddr)
	go startConsensusLoop()
	go startSnapshotManager()
	go startBlockPruner()
	go maintainPeers() // Enhanced: Periodic reconnect/prune
	go processBlocksFromQueue()

	// NOTE: bootstrapPeers() is intentionally NOT called here.
	// startPeerManager() already dials bootstrap addrs on startup and re-dials
	// on the 30-second ticker when peer count is low. Calling bootstrapPeers()
	// concurrently caused double-TCP connections to the same peer, which made
	// the genesis node push every block range twice, flooding the joining node's
	// queue with interleaved blocks that permanently broke continuity checks.

	// CLI blocks the main goroutine
	protocolLog.Println("✅ All services started. Entering CLI mode.")

	startCLI()
}

// -------------------------
// Setup Loggers
// -------------------------

func setupLoggers() {
	// Create logs directory
	logDir := filepath.Join(dataDir, "logs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		log.Fatalf("❌ FAILED to create logs dir: %v", err)
	}

	// Protocol logger (P2P, sync, etc.)
	protoFile, err := os.OpenFile(filepath.Join(logDir, "protocol.log"),
		os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.Fatal(err)
	}
	protocolLog = log.New(protoFile,
		"[PROTOCOL] ", log.Ldate|log.Ltime|log.Lmicroseconds)
	// protocolLog = log.New(io.MultiWriter(os.Stdout, protoFile),
	// 	"[PROTOCOL] ", log.Ldate|log.Ltime|log.Lmicroseconds)

	// Consensus logger (block production, validation)
	consensusFile, err := os.OpenFile(filepath.Join(logDir, "consensus.log"),
		os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.Fatal(err)
	}
	consensusLog = log.New(consensusFile,
		"[CONSENSUS] ", log.Ldate|log.Ltime|log.Lmicroseconds)
	// consensusLog = log.New(io.MultiWriter(os.Stdout, consensusFile),
	// 	"[CONSENSUS] ", log.Ldate|log.Ltime|log.Lmicroseconds)

	// Sync logger (state sync, peer sync)
	syncFile, err := os.OpenFile(filepath.Join(logDir, "sync.log"),
		os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.Fatal(err)
	}
	syncLog = log.New(syncFile,
		"[SYNC] ", log.Ldate|log.Ltime|log.Lmicroseconds)
	// syncLog = log.New(io.MultiWriter(os.Stdout, syncFile),
	// 	"[SYNC] ", log.Ldate|log.Ltime|log.Lmicroseconds)

	// Network logger (peer connections, messages)
	networkFile, err := os.OpenFile(filepath.Join(logDir, "network.log"),
		os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.Fatal(err)
	}
	networkLog = log.New(networkFile,
		"[NETWORK] ", log.Ldate|log.Ltime|log.Lmicroseconds)
	// networkLog = log.New(io.MultiWriter(os.Stdout, networkFile),
	// 	"[NETWORK] ", log.Ldate|log.Ltime|log.Lmicroseconds)
}

// -------------------------
// Key management
// -------------------------

func loadKeyFromPrivFlag(privHex string) error {
	if privHex == "" {
		return fmt.Errorf("missing -priv flag")
	}
	keyBytes, err := hex.DecodeString(privHex)
	if err != nil {
		return fmt.Errorf("invalid priv hex: %v", err)
	}

	switch len(keyBytes) {
	case ed25519.SeedSize:
		privKey = ed25519.NewKeyFromSeed(keyBytes)
		pubKey = privKey.Public().(ed25519.PublicKey)
	case ed25519.PrivateKeySize:
		privKey = ed25519.PrivateKey(keyBytes)
		pubKey = privKey.Public().(ed25519.PublicKey)
	default:
		return fmt.Errorf("invalid private key length: %d (expected 32 or 64 bytes)", len(keyBytes))
	}

	nodeID = hex.EncodeToString(pubKey)
	nodeAddress = nodeID
	protocolLog.Printf("✅ Loaded node key. NodeID: %s", nodeID)
	return nil
}

// -------------------------
// Genesis
// -------------------------

func loadGenesisConfig(genesisFile string) error {
	data, err := os.ReadFile(genesisFile)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, &genesisConfig); err != nil {
		return err
	}

	if genesisConfig.GenesisTimestamp == 0 {
		return fmt.Errorf("genesisTimestamp missing in genesis.json")
	}

	// Generate genesis hash if not provided
	if genesisConfig.GenesisHash == "" {
		hash := sha256.Sum256(data)
		genesisConfig.GenesisHash = hex.EncodeToString(hash[:])
	}

	return nil
}

func initializeGenesisState() error {
	var initialized bool
	err := db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte("genesis_initialized"))
		if err != nil {
			if err == badger.ErrKeyNotFound {
				return nil
			}
			return err
		}
		return item.Value(func(val []byte) error {
			initialized = string(val) == "true"
			return nil
		})
	})
	if err != nil {
		return err
	}
	if initialized {
		protocolLog.Println("ℹ️  Genesis already initialized")
		return nil
	}

	return db.Update(func(txn *badger.Txn) error {
		protocolLog.Println("=======================================")
		protocolLog.Println("INITIALIZING GENESIS STATE...")
		protocolLog.Println("=======================================")

		// Mark as initialized
		if err := txn.Set([]byte("genesis_initialized"), []byte("true")); err != nil {
			return err
		}

		// Store genesis config
		genesisBytes, _ := json.Marshal(genesisConfig)
		if err := txn.Set([]byte("genesis_config"), genesisBytes); err != nil {
			return err
		}

		// Initialize accounts
		for _, acc := range genesisConfig.InitialAccounts {
			if acc.Stocks == nil {
				acc.Stocks = make(map[string]int64)
			}
			accBytes, err := json.Marshal(acc)
			if err != nil {
				return err
			}
			if err := txn.Set([]byte("account_"+string(acc.Address)), accBytes); err != nil {
				return err
			}
			protocolLog.Printf("  ✅ Initialized account: %s balance=%d", acc.Address, acc.BalancePaise)
		}

		// Initialize genesis validators on-chain
		for _, valAddr := range genesisConfig.Validators {
			validator := ValidatorInfo{
				Address:      valAddr,
				StakePaise:   genesisConfig.MinStakePaise,
				JoinedHeight: 0,
				LastActive:   0,
				IsActive:     true,
				Score:        100,
			}
			valBytes, err := json.Marshal(validator)
			if err != nil {
				return err
			}
			// Store in validator registry
			if err := txn.Set([]byte(ValidatorRegistryPrefix+valAddr), valBytes); err != nil {
				return err
			}
			// Store in active validators list
			if err := txn.Set([]byte("active_validator_"+valAddr), []byte("1")); err != nil {
				return err
			}
			protocolLog.Printf("  ✅ Registered genesis validator: %s", valAddr)
		}

		// Create genesis block
		genesisBlock := Block{
			Header: BlockHeader{
				PrevHash:      "0",
				Proposer:      nodeAddress,
				Height:        0,
				TxCount:       0,
				AllocCount:    0,  // ← ADD
				AllocCursor:   "", // ← ADD
				Timestamp:     genesisConfig.GenesisTimestamp,
				GasUsed:       0,
				StateRoot:     computeStateRoot(txn),
				ValidatorRoot: computeValidatorRoot(txn),
			},
			Transactions:  nil,
			AllocationOps: nil, // ← explicit
		}

		// Sign genesis using same pipeline as normal blocks
		msg := canonicalHeaderBytes(genesisBlock.Header)
		sig := ed25519.Sign(privKey, msg)
		genesisBlock.ProposerSig = base64.StdEncoding.EncodeToString(sig)

		// Compute block hash
		tmp := genesisBlock
		tmp.BlockHash = ""
		tmp.ProposerSig = ""
		b, _ := json.Marshal(tmp)
		hash := sha256.Sum256(b)
		genesisBlock.BlockHash = hex.EncodeToString(hash[:])

		// Store block
		blockBytes, _ := json.Marshal(genesisBlock)
		if err := txn.Set([]byte("block_0"), blockBytes); err != nil {
			return err
		}
		if err := txn.Set([]byte("block_by_hash_"+genesisBlock.BlockHash), []byte("0")); err != nil {
			return err
		}
		if err := txn.Set([]byte("head_block"), []byte(genesisBlock.BlockHash)); err != nil {
			return err
		}
		if err := txn.Set([]byte("current_height"), []byte("0")); err != nil {
			return err
		}

		// Save to file
		if err := saveBlockToFile(genesisBlock, 0); err != nil {
			return err
		}

		// Create initial snapshot
		if err := createStateSnapshot(txn, 0); err != nil {
			return err
		}

		protocolLog.Printf("✅ Genesis block created: hash=%s", short(genesisBlock.BlockHash))
		protocolLog.Println("=======================================")
		protocolLog.Println("GENESIS STATE INITIALIZATION COMPLETE")
		protocolLog.Println("=======================================")
		return nil
	})
}

// -------------------------
// State root computation
// -------------------------

func computeStateRoot(txn *badger.Txn) string {
	var accounts []Account
	it := txn.NewIterator(badger.DefaultIteratorOptions)
	defer it.Close()

	for it.Seek([]byte("account_")); it.ValidForPrefix([]byte("account_")); it.Next() {
		item := it.Item()
		var acc Account
		item.Value(func(v []byte) error {
			json.Unmarshal(v, &acc)
			return nil
		})
		accounts = append(accounts, acc)
	}

	// Sort for deterministic hashing
	sort.Slice(accounts, func(i, j int) bool {
		return string(accounts[i].Address) < string(accounts[j].Address)
	})

	data, _ := json.Marshal(accounts)
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func computeValidatorRoot(txn *badger.Txn) string {
	type kv struct {
		key string
		val []byte
	}

	var entries []kv
	it := txn.NewIterator(badger.DefaultIteratorOptions)
	defer it.Close()

	prefix := []byte(ValidatorRegistryPrefix)

	for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
		item := it.Item()
		k := string(item.Key())

		var raw []byte
		item.Value(func(b []byte) error {
			raw = append([]byte{}, b...)
			return nil
		})

		// Strip non-consensus fields
		var v ValidatorInfo
		json.Unmarshal(raw, &v)
		v.LastActive = 0 // ❗ exclude runtime metadata

		canon, _ := json.Marshal(v)
		entries = append(entries, kv{k, canon})
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].key < entries[j].key
	})

	h := sha256.New()
	for _, e := range entries {
		h.Write([]byte(e.key))
		h.Write(e.val)
	}

	return hex.EncodeToString(h.Sum(nil))
}

// -------------------------
// Validator Registry
// -------------------------

func getActiveValidators() ([]ValidatorInfo, error) {
	var validators []ValidatorInfo
	err := db.View(func(txn *badger.Txn) error {
		it := txn.NewIterator(badger.DefaultIteratorOptions)
		defer it.Close()

		for it.Seek([]byte(ValidatorRegistryPrefix)); it.ValidForPrefix([]byte(ValidatorRegistryPrefix)); it.Next() {
			item := it.Item()
			var val ValidatorInfo
			err := item.Value(func(v []byte) error {
				return json.Unmarshal(v, &val)
			})
			if err != nil {
				continue
			}
			if val.IsActive {
				validators = append(validators, val)
			}
		}
		return nil
	})

	// Deterministic ordering by address
	sort.Slice(validators, func(i, j int) bool {
		return validators[i].Address < validators[j].Address
	})

	return validators, err
}

func getValidatorByHeight(height uint64, proposerIndex uint64) (string, error) {
	validators, err := getActiveValidators()
	if err != nil || len(validators) == 0 {
		return "", fmt.Errorf("no validators available")
	}

	// Deterministic proposer selection based on height
	index := (height + proposerIndex) % uint64(len(validators))
	return validators[index].Address, nil
}

// -------------------------
// P2P Networking - ENHANCED
// -------------------------

func startP2PServer(addr string) {
	l, err := net.Listen("tcp", addr)
	if err != nil {
		protocolLog.Fatalf("❌ FAILED to start P2P server: %v", err)
	}
	defer l.Close()

	networkLog.Printf("✅ P2P server listening on %s", addr)
	protocolLog.Printf("🌐 P2P server listening on %s", addr)

	for {
		conn, err := l.Accept()
		if err != nil {
			networkLog.Printf("⚠️  Failed to accept connection: %v", err)
			continue
		}
		networkLog.Printf("🔌 New connection from %s", conn.RemoteAddr().String())
		go handleP2PConnection(conn)
	}
}

func handleP2PConnection(conn net.Conn) {
	defer func() {
		conn.Close()
		networkLog.Printf("🔌 Connection closed from %s", conn.RemoteAddr().String())
	}()

	remoteAddr := conn.RemoteAddr().String()
	networkLog.Printf("📥 Handling connection from %s", remoteAddr)

	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, MaxMessageSize), MaxMessageSize)

	for scanner.Scan() {
		line := scanner.Text()
		networkLog.Printf("📩 Received %d bytes from %s", len(line), remoteAddr)

		touchPeerByConn(conn)

		if len(line) == 0 {
			continue
		}

		parts := strings.SplitN(line, " ", 2)
		if len(parts) != 2 {
			networkLog.Printf("⚠️  Malformed message from %s: %s", remoteAddr, line[:min(50, len(line))])
			continue
		}

		msgType := parts[0]
		payload := parts[1]
		bytesIn.Add(uint64(len(line)))

		networkLog.Printf("🔍 Message type: %s from %s", msgType, remoteAddr)

		switch msgType {
		case MsgHello:
			networkLog.Printf("🤝 Processing HELLO from %s", remoteAddr)
			handleHello(conn, payload)
		case MsgBlock:
			networkLog.Printf("📦 Processing BLOCK from %s", remoteAddr)
			handleBlockMessage(conn, payload)
		case MsgGetRange:
			networkLog.Printf("📥 Processing GETRANGE from %s", remoteAddr)
			handleGetRange(conn, payload)
		case MsgGetState:
			networkLog.Printf("📊 Processing GETSTATE from %s", remoteAddr)
			handleGetState(conn, payload)
		case MsgTx:
			networkLog.Printf("💸 Processing TX from %s", remoteAddr)
			handleTransaction(conn, payload)
		case MsgStateSnapshot:
			networkLog.Printf("📸 Processing STATESNAP from %s", remoteAddr)
			handleStateSnapshot(conn, payload)
		case MsgPing:
			networkLog.Printf("🏓 Processing PING from %s", remoteAddr)
			sendRawMessage(conn, MsgPong, "")
		case MsgPong:
			networkLog.Printf("🏓 Processing PONG from %s", remoteAddr)
			touchPeerByConn(conn)
		default:
			networkLog.Printf("❓ Unknown message type: %s from %s", msgType, remoteAddr)
		}
	}

	if err := scanner.Err(); err != nil {
		networkLog.Printf("⚠️  Scanner error from %s: %v", remoteAddr, err)
	}
}

func handleHello(conn net.Conn, payload string) {
	var hello HelloMessage
	if err := json.Unmarshal([]byte(payload), &hello); err != nil {
		networkLog.Printf("❌ Invalid HELLO message from %s: %v", conn.RemoteAddr().String(), err)
		return
	}

	// Verify genesis hash matches
	if hello.GenesisHash != genesisConfig.GenesisHash {
		networkLog.Printf("❌ Peer %s has different genesis hash: %s (expected: %s)",
			short(hello.NodeID), short(hello.GenesisHash), short(genesisConfig.GenesisHash))
		return
	}

	// Don't connect to ourselves
	if hello.NodeID == nodeID {
		networkLog.Printf("⚠️  Ignoring connection to self from %s", short(hello.NodeID))
		return
	}

	// Check whether this peer is already known BEFORE updating the map,
	// so we can decide whether to send a HELLO back (preventing infinite loops).
	peersMutex.RLock()
	_, alreadyKnown := peers[hello.NodeID]
	peersMutex.RUnlock()

	// Store peer info
	peersMutex.Lock()
	peers[hello.NodeID] = &PeerInfo{
		Address:    hello.Address,
		NodeID:     hello.NodeID,
		Connection: conn,
		LastSeen:   time.Now(),
		Height:     hello.Height,
		HeadHash:   hello.HeadHash,
	}
	peersMutex.Unlock()

	peerCount.Store(int32(len(peers)))
	networkLog.Printf("✅ Peer connected: %s height=%d addr=%s",
		short(hello.NodeID), hello.Height, hello.Address)

	// ── BIDIRECTIONAL HELLO EXCHANGE (PRIMARY SYNC FIX) ───────────────────────
	// Send our own HELLO back on the first encounter so the remote node registers
	// us as a peer and its handleHello can call initiateSync if it is behind.
	// Without this reply, a joining node that dials us never receives a HELLO,
	// so its handleHello is never invoked, initiateSync is never triggered, and
	// isSyncing stays true forever — freezing consensus indefinitely.
	// The alreadyKnown guard prevents an infinite HELLO ping-pong loop:
	//   round 1 – A→B HELLO, B sends HELLO back (alreadyKnown(A)=false)
	//   round 2 – A receives B's HELLO, A sends HELLO back (alreadyKnown(B)=false)
	//   round 3 – B receives A's HELLO, alreadyKnown(A)=true → NO reply ✓
	if !alreadyKnown {
		sendHelloMessage(conn)
	}

	// Check if we need to sync
	myHeight := getChainHeight()
	if hello.Height > myHeight {
		syncLog.Printf("📈 Peer %s is ahead (their=%d our=%d), initiating sync",
			short(hello.NodeID), hello.Height, myHeight)
		// Run initiateSync in a goroutine so the scanner loop in handleP2PConnection
		// continues to read messages on this connection.  initiateSync sends GETSTATE
		// and then polls for the result; the STATESNAP response comes back over the
		// same conn and must be read by the scanner — if we block here that response
		// never gets dequeued from the TCP buffer and the sync hangs forever.
		go initiateSync(conn, myHeight+1, hello.Height)
	} else if hello.Height+3 < myHeight {
		// Only proactively push blocks to peers that already have some chain state.
		// Fresh joiners (HeadHash == "") have an empty DB and need a state snapshot
		// BEFORE they can apply any blocks — their initiateSync (triggered above by
		// our HELLO reply) will handle that via requestStateSnapshot → GETRANGE.
		// Pushing raw blocks to a state-less joiner causes STATE ROOT MISMATCH on
		// every block and "continuity broken" cascades that permanently stall sync.
		if hello.HeadHash != "" {
			start := hello.Height + 1
			// extra safety: if remote's claimed head hash is unknown to us, start from 0
			if getBlockHash(hello.Height) == "" {
				start = 0
			}
			networkLog.Printf("📤 Offering blocks to peer %s from %d to %d",
				short(hello.NodeID), start, myHeight)
			sendBlockRange(conn, start, myHeight)
		} else {
			networkLog.Printf("ℹ️  Fresh joiner %s (no state) — will sync via initiateSync/snapshot",
				short(hello.NodeID))
		}
	}

	// Share our mempool
	broadcastMempool()
}

// sendHelloMessage sends this node's current HELLO message to conn.
// Used by handleHello to complete the bidirectional HELLO exchange so that
// the remote node's handleHello is triggered and can call initiateSync.
func sendHelloMessage(conn net.Conn) {
	height := getChainHeight()
	headHash := getBlockHash(height)
	finalized := getFinalizedHeight()

	hello := HelloMessage{
		NodeID:          nodeID,
		Address:         publicAddr,
		Height:          height,
		HeadHash:        headHash,
		GenesisHash:     genesisConfig.GenesisHash,
		Timestamp:       time.Now().Unix(),
		StateRoot:       getStateRoot(),
		ValidatorRoot:   getValidatorRoot(),
		FinalizedHeight: finalized,
		KnownPeers:      getKnownPeers(),
	}

	helloBytes, _ := json.Marshal(hello)
	msg := fmt.Sprintf("%s %s\n", MsgHello, string(helloBytes))

	if _, err := conn.Write([]byte(msg)); err != nil {
		networkLog.Printf("⚠️  Failed to send HELLO to %s: %v", conn.RemoteAddr(), err)
		return
	}
	bytesOut.Add(uint64(len(msg)))
	networkLog.Printf("📤 Sent HELLO to %s (height=%d)", conn.RemoteAddr(), height)
}

// Enhanced: initiateSync with better error handling
func initiateSync(conn net.Conn, fromHeight, toHeight uint64) {
	// Use a dedicated atomic flag so this goroutine is not blocked by the
	// startup isSyncing=true sentinel.  isSyncing is set to true before the
	// node finishes booting (to keep consensus paused) but initiateSync itself
	// was never started, so checking isSyncing here always returned "already
	// syncing" and the sync never ran.
	if !atomic.CompareAndSwapInt32(&syncActive, 0, 1) {
		syncLog.Printf("⚠️  Already syncing, ignoring new sync request")
		return
	}
	defer atomic.StoreInt32(&syncActive, 0)

	syncMutex.Lock()
	isSyncing = true
	syncHeight = toHeight
	syncTargetHeight.Store(toHeight)
	syncMutex.Unlock()

	defer func() {
		syncMutex.Lock()
		isSyncing = false
		syncMutex.Unlock()
		syncLog.Printf("🔄 Sync completed for heights %d-%d", fromHeight, toHeight)
	}()

	syncLog.Println("=======================================")
	syncLog.Printf("STARTING SYNC from height %d to %d", fromHeight, toHeight)
	syncLog.Println("=======================================")

	// ---- GENESIS PREFLIGHT (robust) ----
	localH := getChainHeight()
	if localH == 0 && toHeight > 0 {
		syncLog.Printf("🔄 Empty local DB — requesting genesis snapshot before block sync (toHeight=%d)", toHeight)
		requestStateSnapshot(conn, 0)

		// bounded wait for snapshot apply
		deadline := time.Now().Add(10 * time.Second)
		for time.Now().Before(deadline) {
			if getBlockHash(0) != "" {
				syncLog.Printf("✅ Genesis snapshot applied (block_0 present)")
				break
			}
			if getHeadHash() != "" {
				syncLog.Printf("✅ Genesis snapshot applied (head_block present)")
				break
			}
			time.Sleep(100 * time.Millisecond)
		}

		if getBlockHash(0) == "" && getHeadHash() == "" {
			syncLog.Printf("❌ Genesis snapshot not applied in time; aborting sync")
			return
		}
	}

	// First, get a state snapshot if we're far behind
	if fromHeight > SnapshotInterval && (toHeight-fromHeight) > SnapshotInterval {
		syncLog.Printf("📸 Requesting state snapshot at height %d", fromHeight-1)
		requestStateSnapshot(conn, fromHeight-1)
		time.Sleep(2 * time.Second) // Wait for snapshot
	}

	// Then sync blocks
	syncLog.Printf("📦 Syncing blocks %d to %d", fromHeight, toHeight)

	for height := fromHeight; height <= toHeight; height += SyncBatchSize {
		end := height + SyncBatchSize - 1
		if end > toHeight {
			end = toHeight
		}

		syncLog.Printf("🔄 Requesting batch %d:%d", height, end)
		msg := fmt.Sprintf("%s %d:%d\n", MsgGetRange, height, end)
		if _, err := conn.Write([]byte(msg)); err != nil {
			syncLog.Printf("❌ Sync failed at height %d: %v", height, err)
			return
		}
		bytesOut.Add(uint64(len(msg)))

		// wait until block 'end' appears locally (bounded wait)
		deadline := time.Now().Add(15 * time.Second)
		for time.Now().Before(deadline) {
			if getChainHeight() >= end {
				syncLog.Printf("✅ Batch %d:%d applied", height, end)
				break
			}
			time.Sleep(100 * time.Millisecond)
		}
		if getChainHeight() < end {
			syncLog.Printf("❌ Batch %d:%d not applied in time; requesting snapshot", height, end)
			requestStateSnapshot(conn, end)
			return
		}
	}

	// After all batches complete: verify the final state's root matches expectation
	syncLog.Printf("🔍 Verifying final state at height %d...", toHeight)

	err := db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(fmt.Sprintf("block_%d", toHeight)))
		if err != nil {
			return fmt.Errorf("post-sync: block %d not found: %v", toHeight, err)
		}
		var blk Block
		if err := item.Value(func(v []byte) error { return json.Unmarshal(v, &blk) }); err != nil {
			return err
		}
		// compute local state root
		localStateRoot := computeStateRoot(txn)
		if blk.Header.StateRoot != "" && blk.Header.StateRoot != localStateRoot {
			return fmt.Errorf("state root mismatch at height %d: header=%s local=%s",
				toHeight, short(blk.Header.StateRoot), short(localStateRoot))
		}
		return nil
	})

	if err != nil {
		syncLog.Printf("❌ Post-sync verification failed: %v", err)
		requestStateSnapshot(conn, toHeight)
		return
	}

	syncLog.Println("=======================================")
	syncLog.Printf("✅ SYNC COMPLETED and verified up to height %d", toHeight)
	syncLog.Println("=======================================")

	currentHeight.Store(toHeight)
	protocolLog.Printf("✅ CONSENSUS UNFROZEN at height %d", toHeight)
}

func handleGetRange(conn net.Conn, payload string) {
	touchPeerByConn(conn)
	parts := strings.Split(payload, ":")
	if len(parts) != 2 {
		networkLog.Printf("❌ Invalid GETRANGE format from %s: %s", conn.RemoteAddr().String(), payload)
		return
	}

	from, err1 := strconv.ParseUint(parts[0], 10, 64)
	to, err2 := strconv.ParseUint(parts[1], 10, 64)
	if err1 != nil || err2 != nil || from > to {
		networkLog.Printf("❌ Invalid GETRANGE values from %s: %s", conn.RemoteAddr().String(), payload)
		return
	}

	networkLog.Printf("📤 Sending block range %d:%d to %s", from, to, conn.RemoteAddr().String())
	sendBlockRange(conn, from, to)
}

func sendBlockRange(conn net.Conn, from, to uint64) {
	for height := from; height <= to; height++ {
		var blockData []byte

		err := db.View(func(txn *badger.Txn) error {
			key := fmt.Sprintf("block_%d", height)

			item, err := txn.Get([]byte(key))
			if err != nil {
				networkLog.Printf("❌ SENDER MISSING %s", key)
				return err
			}

			return item.Value(func(v []byte) error {
				blockData = append([]byte{}, v...)
				return nil
			})
		})

		if err != nil {
			networkLog.Printf("❌ ABORTING RANGE SEND %d→%d (missing %d)", from, to, height)
			conn.Write([]byte(fmt.Sprintf("%s %d:%d MISSING %d\n", "RANGE_ABORT", from, to, height)))
			return
		}

		networkLog.Printf("➡️  Sending block_%d to %s", height, conn.RemoteAddr())

		msg := fmt.Sprintf("%s %s\n", MsgBlock, string(blockData))
		n, err := conn.Write([]byte(msg))
		if err != nil {
			networkLog.Printf("❌ Failed to send block %d: %v", height, err)
			return
		}
		bytesOut.Add(uint64(n))

		// Rate limiting
		if height%10 == 0 {
			time.Sleep(10 * time.Millisecond)
		}
	}

	networkLog.Printf("✅ Finished sending block range %d:%d to %s", from, to, conn.RemoteAddr().String())
}

func handleGetState(conn net.Conn, payload string) {
	height, err := strconv.ParseUint(payload, 10, 64)
	if err != nil {
		networkLog.Printf("❌ Invalid GETSTATE height from %s: %s", conn.RemoteAddr().String(), payload)
		return
	}

	networkLog.Printf("📤 Sending state snapshot at height %d to %s", height, conn.RemoteAddr().String())

	// Try to get from cache first
	snapshotMutex.RLock()
	cached, ok := snapshotCache[fmt.Sprintf("snapshot_%d", height)]
	snapshotMutex.RUnlock()

	if ok {
		networkLog.Printf("✅ Serving snapshot %d from cache", height)
		msg := fmt.Sprintf("%s %s\n", MsgStateSnapshot, string(cached))
		conn.Write([]byte(msg))
		bytesOut.Add(uint64(len(msg)))
		return
	}

	// Generate snapshot
	var snapshot StateSnapshot
	err = db.View(func(txn *badger.Txn) error {
		return createStateSnapshotAtHeight(txn, height, &snapshot)
	})

	if err != nil {
		networkLog.Printf("❌ Failed to create snapshot at height %d: %v", height, err)
		return
	}

	snapshotBytes, _ := json.Marshal(snapshot)
	msg := fmt.Sprintf("%s %s\n", MsgStateSnapshot, string(snapshotBytes))
	n, err := conn.Write([]byte(msg))
	if err != nil {
		networkLog.Printf("❌ Failed to send snapshot: %v", err)
		return
	}
	bytesOut.Add(uint64(n))
	networkLog.Printf("✅ Sent snapshot %d (%d bytes) to %s", height, n, conn.RemoteAddr().String())
}

func handleStateSnapshot(conn net.Conn, payload string) {
	touchPeerByConn(conn)

	var snapshot StateSnapshot
	if err := json.Unmarshal([]byte(payload), &snapshot); err != nil {
		syncLog.Printf("❌ Invalid snapshot received: %v", err)
		return
	}

	syncLog.Println("=======================================")
	syncLog.Printf("APPLYING STATE SNAPSHOT at height %d", snapshot.Height)
	syncLog.Println("=======================================")

	if err := applyStateSnapshot(snapshot); err != nil {
		syncLog.Printf("❌ Snapshot apply failed: %v", err)
	} else {
		syncLog.Printf("✅ Snapshot applied successfully at height %d", snapshot.Height)

		currentHeight.Store(snapshot.Height)
		lastProposedSlot = snapshot.Height

		syncMutex.Lock()
		isSyncing = false
		syncMutex.Unlock()

		protocolLog.Printf("✅ CONSENSUS UNFROZEN — resuming block sync after snapshot")

		go initiateSync(conn, snapshot.Height+1, syncTargetHeight.Load())
	}
}

func requestStateSnapshot(conn net.Conn, height uint64) {
	msg := fmt.Sprintf("%s %d\n", MsgGetState, height)
	networkLog.Printf("📥 Requesting state snapshot at height %d", height)
	conn.Write([]byte(msg))
	bytesOut.Add(uint64(len(msg)))
}

func handleBlockMessage(conn net.Conn, payload string) {
	touchPeerByConn(conn)

	var block Block
	if err := json.Unmarshal([]byte(payload), &block); err != nil {
		networkLog.Printf("❌ Invalid block message from %s: %v", conn.RemoteAddr(), err)
		return
	}

	height := block.Header.Height
	current := getChainHeight()

	// 🛑 HARD FILTER FIRST (before any queueing)
	// Drop blocks we already have or that are strictly behind the chain tip.
	// NOTE: use `height < current` (strict less-than), NOT `height <= current`.
	// When current==0 and height==0 the joining node has no block_0 stored yet;
	// the old `<=` check silently discarded the genesis block, so every
	// subsequent block failed the prevHash continuity check.
	if hasBlock(height) || height < current {
		networkLog.Printf("⚠️  Ignored duplicate/old block %d", height)
		return
	}

	networkLog.Printf("📦 Received block %d from %s", height, conn.RemoteAddr())

	// Always queue — the queue goroutine handles syncing state
	select {
	case blockQueue <- &block:
		networkLog.Printf("📥 Queued block %d", height)
	default:
		networkLog.Printf("⚠️  Block queue full, dropped block %d", height)
	}
}

func handleTransaction(conn net.Conn, payload string) {
	touchPeerByConn(conn)

	var tx Transaction
	if err := json.Unmarshal([]byte(payload), &tx); err != nil {
		networkLog.Printf("❌ Invalid transaction from %s: %v", conn.RemoteAddr().String(), err)
		return
	}

	networkLog.Printf("💸 Received transaction %s from %s", tx.Type, conn.RemoteAddr().String())

	// Verify and add to mempool
	if err := verifyTransaction(tx); err == nil {
		addTransactionToMempool(tx)
		networkLog.Printf("✅ Added transaction %s to mempool", tx.Type)
	} else {
		networkLog.Printf("❌ Transaction verification failed: %v", err)
	}
}

func broadcastBlock(block Block) {
	blockBytes, _ := json.Marshal(block)
	msg := fmt.Sprintf("%s %s\n", MsgBlock, string(blockBytes))

	peersMutex.RLock()
	defer peersMutex.RUnlock()

	sent := 0
	for _, peer := range peers {
		if peer.Connection != nil && time.Since(peer.LastSeen) < PeerTimeout {
			go func(conn net.Conn) {
				if _, err := conn.Write([]byte(msg)); err != nil {
					networkLog.Printf("⚠️  Failed to broadcast block to %s: %v", conn.RemoteAddr().String(), err)
				} else {
					bytesOut.Add(uint64(len(msg)))
				}
			}(peer.Connection)
			sent++
		}
	}

	networkLog.Printf("📤 Broadcasted block %d to %d peers", block.Header.Height, sent)
}

func broadcastTransaction(tx Transaction) {
	txBytes, _ := json.Marshal(tx)
	msg := fmt.Sprintf("%s %s\n", MsgTx, string(txBytes))

	peersMutex.RLock()
	defer peersMutex.RUnlock()

	for _, peer := range peers {
		if peer.Connection != nil && time.Since(peer.LastSeen) < PeerTimeout {
			go func(conn net.Conn) {
				conn.Write([]byte(msg))
				bytesOut.Add(uint64(len(msg)))
			}(peer.Connection)
		}
	}
}

func broadcastMempool() {
	mempoolMutex.RLock()
	defer mempoolMutex.RUnlock()

	count := 0
	for _, tx := range mempool {
		broadcastTransaction(tx)
		count++
		time.Sleep(1 * time.Millisecond) // Rate limiting
	}

	networkLog.Printf("📤 Broadcasted %d transactions from mempool", count)
}

// Enhanced: Drain pending blocks after sync
// Enhanced: Drain pending blocks after sync (simpler, non-requeuing)
func drainPendingBlocks() {
	for {
		// Block until we have a pending block
		b := <-pendingBlocks

		// Wait until sync is finished (non-busy wait)
		for {
			syncMutex.Lock()
			syncing := isSyncing
			syncMutex.Unlock()
			if !syncing {
				break
			}
			time.Sleep(200 * time.Millisecond)
		}

		networkLog.Printf("🔄 Processing pending block %d", b.Header.Height)
		if err := processBlock(*b); err != nil {
			networkLog.Printf("❌ Failed to process pending block %d: %v", b.Header.Height, err)
		} else {
			// Only broadcast if we are not in sync mode (safety)
			syncMutex.Lock()
			syncing := isSyncing
			syncMutex.Unlock()
			if !syncing {
				broadcastBlock(*b)
			}
			networkLog.Printf("✅ Processed pending block %d", b.Header.Height)
		}
	}
}

// Enhanced: sendRawMessage helper
func sendRawMessage(conn net.Conn, msgType, payload string) error {
	msg := fmt.Sprintf("%s %s\n", msgType, payload)
	n, err := conn.Write([]byte(msg))
	if err != nil {
		return err
	}
	bytesOut.Add(uint64(n))
	return nil
}

// -------------------------
// Enhanced Peer Management
// -------------------------

func startPeerManager() {
	// Initial connection to bootstrap nodes
	for _, addr := range bootstrapAddrs {
		if addr != publicAddr {
			networkLog.Printf("🔗 Connecting to bootstrap peer: %s", addr)
			go dialPeer(addr)
		}
		time.Sleep(1 * time.Second) // Stagger connections
	}

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		// Maintain peer connections
		maintainPeerConnections()

		// Try to reconnect to bootstrap nodes if we have few peers
		peersMutex.RLock()
		numPeers := len(peers)
		peersMutex.RUnlock()

		if numPeers < 3 {
			networkLog.Printf("🔁 Low peer count (%d), reconnecting to bootstrap nodes", numPeers)
			for _, addr := range bootstrapAddrs {
				if addr != publicAddr {
					go dialPeer(addr)
				}
			}
		}
	}
}

func dialPeer(addr string) {
	// Deduplicate: skip if we already have a live connection to this address.
	// Without this check, startPeerManager's initial loop and the 30-second
	// reconnect ticker can race and open two connections to the same peer.
	peersMutex.RLock()
	for _, p := range peers {
		if p.Address == addr {
			peersMutex.RUnlock()
			networkLog.Printf("🔁 Skipping dial to %s — already connected", addr)
			return
		}
	}
	peersMutex.RUnlock()

	networkLog.Printf("🔗 Dialing peer: %s", addr)

	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	if err != nil {
		networkLog.Printf("❌ Failed to dial peer %s: %v", addr, err)
		return
	}
	defer conn.Close()

	// Send HELLO
	height := getChainHeight()
	headHash := getBlockHash(height)
	finalized := getFinalizedHeight()

	hello := HelloMessage{
		NodeID:          nodeID,
		Address:         publicAddr,
		Height:          height,
		HeadHash:        headHash,
		GenesisHash:     genesisConfig.GenesisHash,
		Timestamp:       time.Now().Unix(),
		StateRoot:       getStateRoot(),
		ValidatorRoot:   getValidatorRoot(),
		FinalizedHeight: finalized,
		KnownPeers:      getKnownPeers(),
	}

	helloBytes, _ := json.Marshal(hello)
	msg := fmt.Sprintf("%s %s\n", MsgHello, string(helloBytes))

	if _, err := conn.Write([]byte(msg)); err != nil {
		networkLog.Printf("❌ Failed to send HELLO to %s: %v", addr, err)
		return
	}
	bytesOut.Add(uint64(len(msg)))

	// Handle connection
	handleP2PConnection(conn)
}

func getKnownPeers() []string {
	peersMutex.RLock()
	defer peersMutex.RUnlock()

	known := make([]string, 0, len(peers))
	for id := range peers {
		known = append(known, id)
	}
	return known
}

func maintainPeerConnections() {
	peersMutex.Lock()
	defer peersMutex.Unlock()

	now := time.Now()
	toRemove := []string{}

	for nodeID, peer := range peers {
		if now.Sub(peer.LastSeen) > PeerTimeout {
			if peer.Connection != nil {
				peer.Connection.Close()
			}
			toRemove = append(toRemove, nodeID)
			networkLog.Printf("🗑️  Removed stale peer: %s (last seen: %v)", short(nodeID), peer.LastSeen)
		}
	}

	for _, nodeID := range toRemove {
		delete(peers, nodeID)
	}

	peerCount.Store(int32(len(peers)))
}

// Enhanced: maintainPeers with ping/pong
func maintainPeers() {
	ticker := time.NewTicker(PingInterval)
	defer ticker.Stop()

	for range ticker.C {
		peersMutex.RLock()
		for id, peer := range peers {
			if peer.Connection != nil && time.Since(peer.LastPing) > PingInterval {
				go func(conn net.Conn, peerID string) {
					if err := sendRawMessage(conn, MsgPing, ""); err != nil {
						networkLog.Printf("⚠️  Ping failed to %s: %v", short(peerID), err)
					} else {
						peer.LastPing = time.Now()
					}
				}(peer.Connection, id)
			}
		}
		peersMutex.RUnlock()
	}
}

func bootstrapPeers() {
	for _, addr := range bootstrapAddrs {
		if addr != publicAddr {
			go dialPeer(addr)
			time.Sleep(500 * time.Millisecond) // Stagger
		}
	}
}

// -------------------------
// Consensus Loop
// -------------------------

func startConsensusLoop() {
	// Wait a bit for P2P connections
	time.Sleep(3 * time.Second)

	consensusLog.Println("=======================================")
	consensusLog.Println("STARTING CONSENSUS LOOP")
	consensusLog.Println("=======================================")

	for {
		if isSyncing {
			consensusLog.Printf("⏳ Consensus paused (syncing: %v)", isSyncing)
			time.Sleep(1 * time.Second)
			continue
		}

		height := getChainHeight() + 1
		consensusLog.Printf("🔄 Processing height %d", height)

		waitForNextSlot(height)

		// Get proposer for next height
		proposer, err := getValidatorByHeight(height, 0)
		if err != nil {
			consensusLog.Printf("❌ Failed to get proposer for height %d: %v", height, err)
			time.Sleep(1 * time.Second)
			continue
		}

		currentProposer = proposer
		consensusLog.Printf("👑 Height %d: proposer=%s (we are %s)", height, short(proposer), short(nodeAddress))

		if proposer == nodeAddress && isValidator {
			// We are the proposer
			consensusLog.Printf("🎯 We are proposer for height %d", height)
			proposeBlock(height)
			// If proposeBlock failed the block wasn't committed; back off so we
			// don't busy-loop hammering the same height in a tight spin.
			if getChainHeight()+1 == height {
				time.Sleep(500 * time.Millisecond)
			}
		} else {
			// Wait for proposer to produce block
			waitForBlock(height)
		}
	}
}

func proposeBlock(height uint64) {
	if hasBlock(height) {
		consensusLog.Printf("ℹ️  Block %d already exists", height)
		return
	}

	prevHash := getBlockHash(height - 1)
	if height > 0 && prevHash == "" {
		consensusLog.Printf("❌ Missing previous block for height %d", height)
		return
	}

	// Copy mempool txs
	var allTxs []Transaction
	mempoolMutex.Lock()
	for _, tx := range mempool {
		allTxs = append(allTxs, tx)
	}
	mempoolMutex.Unlock()

	// Build safe tx list
	txs := selectExecutableTxs(allTxs, genesisConfig.MaxTxPerBlock)

	// === PHASE 2: Get batched allocation operations to execute in this block ===
	allocationOps, nextCursor := getAllocationOperationsForBlock()

	// if len(txs) == 0 && len(allocationOps) == 0 {
	// 	consensusLog.Printf("ℹ️  No executable txs for block %d", height)
	// }

	block, err := buildAndSignBlock(height, prevHash, txs, allocationOps, nextCursor)
	if err != nil {
		consensusLog.Printf("❌ Failed to build block %d: %v", height, err)
		return
	}

	// SYNCHRONOUS commit — consensus loop cannot advance until this returns
	if err := processBlock(block); err != nil {
		consensusLog.Printf("❌ Failed to commit block %d: %v", height, err)
		// Remove bid txs for stocks no longer in bidding phase from mempool,
		// so the next proposal doesn't include them and fail again.
		purgeStaleBidTxsFromMempool()
		return
	}

	select {
	case blockQueue <- &block:
		consensusLog.Printf("📤 Proposed block %d queued", height)
	default:
		consensusLog.Printf("⚠️  Block queue full, failed to propose block %d", height)
	}

	consensusLog.Printf("✅ Block %d accepted | txs=%d | allocOps=%d | hash=%s",
		block.Header.Height,
		len(block.Transactions),
		len(block.AllocationOps),
		short(block.BlockHash))

	lastProposedSlot = height
}

func selectExecutableTxs(all []Transaction, limit int) []Transaction {
	type accTxs struct {
		acc   Account
		txs   []Transaction
		nonce uint64
	}

	// Build set of stocks currently in bidding phase so we can drop stale
	// bid txns before they ever reach processTransactions and cause a commit
	// failure that stalls the chain.
	biddingStocks := make(map[string]bool)
	_ = db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("rhp_"), func(k, v []byte) error {
			var rhp RHPMetadata
			if err := json.Unmarshal(v, &rhp); err != nil {
				return nil
			}
			if rhp.Status == "bidding" {
				biddingStocks[rhp.Stock] = true
			}
			return nil
		})
	})

	group := make(map[Address]*accTxs)

	// Load accounts (skip bid txns for non-bidding stocks immediately)
	db.View(func(txn *badger.Txn) error {
		for _, tx := range all {
			// Drop stale bid txns at selection time — prevents commit failures
			// that stall the chain when the bidding window closes mid-mempool.
			if tx.Type == TxBidStock && !biddingStocks[tx.Stock] {
				continue
			}
			if _, ok := group[tx.From]; ok {
				continue
			}
			acc, err := getAccount(txn, tx.From)
			if err != nil {
				continue
			}
			group[tx.From] = &accTxs{
				acc:   acc,
				nonce: acc.Nonce,
			}
		}
		return nil
	})

	// Group txs (skip stale bid txns here too, in case sender was already loaded)
	for _, tx := range all {
		if tx.Type == TxBidStock && !biddingStocks[tx.Stock] {
			continue
		}
		if g, ok := group[tx.From]; ok {
			g.txs = append(g.txs, tx)
		}
	}

	// Sort each sender’s txs by nonce
	for _, g := range group {
		sort.Slice(g.txs, func(i, j int) bool {
			return g.txs[i].Nonce < g.txs[j].Nonce
		})
	}

	// Select only contiguous nonces
	var result []Transaction
	for _, g := range group {
		for _, tx := range g.txs {
			if tx.Nonce != g.nonce+1 {
				break
			}
			result = append(result, tx)
			g.nonce++
			if len(result) >= limit {
				return result
			}
		}
	}

	return result
}

// purgeStaleBidTxsFromMempool removes tnx_bid_stock transactions from the
// mempool for any stock whose RHP is no longer in "bidding" status.
// Called after a block commit failure so the proposer does not endlessly
// re-include bids that will always be rejected by processTransactions.
func purgeStaleBidTxsFromMempool() {
	nonBidding := make(map[string]bool)
	_ = db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("rhp_"), func(k, v []byte) error {
			var rhp RHPMetadata
			if err := json.Unmarshal(v, &rhp); err != nil {
				return nil
			}
			if rhp.Status != "bidding" {
				nonBidding[rhp.Stock] = true
			}
			return nil
		})
	})
	if len(nonBidding) == 0 {
		return
	}
	mempoolMutex.Lock()
	defer mempoolMutex.Unlock()
	purged := 0
	for id, tx := range mempool {
		if tx.Type == TxBidStock && nonBidding[tx.Stock] {
			delete(mempool, id)
			mempoolSize.Add(-1)
			purged++
		}
	}
	if purged > 0 {
		consensusLog.Printf("🧹 Purged %d stale bid txs from mempool (IPO no longer in bidding phase)", purged)
	}
}

func shouldFinalizeIPOAllocation() bool {
	var needsFinalization bool
	_ = db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("rhp_"), func(k, v []byte) error {
			var rhp RHPMetadata
			if err := json.Unmarshal(v, &rhp); err != nil {
				return nil
			}
			if rhp.Status == "bidding" && currentHeight.Load() > rhp.BiddingEndSlot {
				needsFinalization = true
			}
			return nil
		})
	})
	return needsFinalization
}

func finalizeIPOAllocation() error {
	return db.Update(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("rhp_"), func(k, v []byte) error {
			var rhp RHPMetadata
			if err := json.Unmarshal(v, &rhp); err != nil {
				return nil
			}

			if rhp.Status != "bidding" || currentHeight.Load() <= rhp.BiddingEndSlot {
				return nil
			}

			consensusLog.Printf("Finalizing IPO allocation for %s", rhp.Stock)

			// Collect all bids
			var bids []Bid
			bidPrefix := []byte("bid_" + rhp.Stock + "_")
			_ = iteratePrefix(txn, bidPrefix, func(k, v []byte) error {
				var b Bid
				json.Unmarshal(v, &b)
				bids = append(bids, b)
				return nil
			})

			if len(bids) == 0 {
				rhp.Status = "completed"
				b, _ := json.Marshal(rhp)
				return txn.Set([]byte("rhp_"+rhp.Stock), b)
			}

			// Compute single global cutoff price (SEBI book-building: all bids aggregated)
			categoryQuotas := calculateCategoryQuotas(rhp)
			qibBids, nibBids, retailBids := categorizeBids(bids)

			cutoffPrice := computeGlobalCutoffPrice(rhp, bids)

			allocations := calculateAllocations(rhp, cutoffPrice, categoryQuotas, qibBids, nibBids, retailBids)

			// Populate demand and allocated share counts into category quotas
			categoryQuotas = populateCategoryQuotaStats(categoryQuotas, bids, allocations)

			// Create allocation plan
			plan := AllocationPlan{
				Stock:          rhp.Stock,
				CutoffPrice:    cutoffPrice,
				TotalShares:    rhp.TotalShares,
				Allocated:      0,
				CategoryQuotas: categoryQuotas,
				Allocations:    allocations,
				CreatedHeight:  currentHeight.Load(),
				Status:         "pending",
				Cursor:         0,
			}

			for _, a := range allocations {
				plan.Allocated += a.AllocShares
			}

			planBytes, _ := json.Marshal(plan)
			txn.Set([]byte("alloc_plan_"+rhp.Stock), planBytes)

			// Mark RHP as allocating
			rhp.Status = "allocating"
			rhpBytes, _ := json.Marshal(rhp)
			txn.Set([]byte("rhp_"+rhp.Stock), rhpBytes)

			return nil
		})
	})
}

// shouldFinalizeIPOAllocationAtHeight checks using the block's height (deterministic)
//
//	func shouldFinalizeIPOAllocationAtHeight(height uint64) bool {
//		var needsFinalization bool
//		_ = db.View(func(txn *badger.Txn) error {
//			return iteratePrefix(txn, []byte("rhp_"), func(k, v []byte) error {
//				var rhp RHPMetadata
//				if err := json.Unmarshal(v, &rhp); err != nil {
//					return nil
//				}
//				if rhp.Status == "bidding" && height > rhp.BiddingEndSlot {
//					needsFinalization = true
//				}
//				return nil
//			})
//		})
//		return needsFinalization
//	}
func shouldFinalizeIPOAllocationAtHeight(txn *badger.Txn, height uint64) bool {
	needsFinalization := false
	_ = iteratePrefix(txn, []byte("rhp_"), func(k, v []byte) error {
		var rhp RHPMetadata
		if err := json.Unmarshal(v, &rhp); err != nil {
			return nil
		}
		if rhp.Status == "bidding" && height > rhp.BiddingEndSlot {
			needsFinalization = true
		}
		return nil
	})
	return needsFinalization
}

// finalizeIPOAllocationAtHeight is the height-aware version
// func finalizeIPOAllocationAtHeight(height uint64) error {
// 	return db.Update(func(txn *badger.Txn) error {
// 		return iteratePrefix(txn, []byte("rhp_"), func(k, v []byte) error {
// 			var rhp RHPMetadata
// 			if err := json.Unmarshal(v, &rhp); err != nil {
// 				return nil
// 			}

// 			// Only finalize if still in bidding and the block height has passed the end slot
// 			if rhp.Status != "bidding" || height <= rhp.BiddingEndSlot {
// 				return nil
// 			}

// 			// Collect all bids
// 			var bids []Bid
// 			bidPrefix := []byte("bid_" + rhp.Stock + "_")
// 			_ = iteratePrefix(txn, bidPrefix, func(k, v []byte) error {
// 				var b Bid
// 				json.Unmarshal(v, &b)
// 				bids = append(bids, b)
// 				return nil
// 			})

// 			if len(bids) == 0 {
// 				rhp.Status = "completed"
// 				b, _ := json.Marshal(rhp)
// 				return txn.Set([]byte("rhp_"+rhp.Stock), b)
// 			}

// 			// Phase 1: Compute single global cutoff + category allocations
// 			cutoffPrice := computeGlobalCutoffPrice(rhp, bids)
// 			categoryQuotas := calculateCategoryQuotas(rhp)
// 			qibBids, nibBids, retailBids := categorizeBids(bids)

// 			allocations := calculateAllocations(rhp, cutoffPrice, categoryQuotas, qibBids, nibBids, retailBids)

// 			// Create allocation plan
// 			plan := AllocationPlan{
// 				Stock:          rhp.Stock,
// 				CutoffPrice:    cutoffPrice,
// 				TotalShares:    rhp.TotalShares,
// 				Allocated:      0,
// 				CategoryQuotas: categoryQuotas,
// 				Allocations:    allocations,
// 				CreatedHeight:  currentHeight.Load(),
// 				Status:         "pending",
// 				Cursor:         0,
// 			}

// 			for _, a := range allocations {
// 				plan.Allocated += a.AllocShares
// 			}

// 			planBytes, _ := json.Marshal(plan)
// 			txn.Set([]byte("alloc_plan_"+rhp.Stock), planBytes)

// 			// Mark RHP as allocating
// 			rhp.Status = "allocating"
// 			rhpBytes, _ := json.Marshal(rhp)
// 			txn.Set([]byte("rhp_"+rhp.Stock), rhpBytes)

//				return nil
//			})
//		})
//	}
func finalizeIPOAllocationAtHeight(txn *badger.Txn, height uint64) error {
	// Step 1: Identify which RHPs need finalization (read-only scan, no writes yet)
	// We collect everything we need BEFORE opening any write iterators
	type rhpToFinalize struct {
		key []byte
		rhp RHPMetadata
	}
	var toFinalize []rhpToFinalize

	// This is the ONLY iterator open at this point
	if err := iteratePrefix(txn, []byte("rhp_"), func(k, v []byte) error {
		var rhp RHPMetadata
		if err := json.Unmarshal(v, &rhp); err != nil {
			return nil
		}
		if rhp.Status == "bidding" && height > rhp.BiddingEndSlot {
			toFinalize = append(toFinalize, rhpToFinalize{
				key: append([]byte{}, k...), // copy key
				rhp: rhp,
			})
		}
		return nil
	}); err != nil {
		return err
	}
	// ← Iterator 1 is now CLOSED (iteratePrefix defers it.Close())

	// Step 2: For each RHP, collect bids in a SEPARATE read (iterator fully closed above)
	for _, entry := range toFinalize {
		rhp := entry.rhp
		consensusLog.Printf("Finalizing IPO allocation for %s at height %d", rhp.Stock, height)

		// Collect all bids — Iterator 2 opens and closes cleanly (Iterator 1 is gone)
		var bids []Bid
		if err := iteratePrefix(txn, []byte("bid_"+rhp.Stock+"_"), func(bk, bv []byte) error {
			var b Bid
			if err := json.Unmarshal(bv, &b); err == nil {
				bids = append(bids, b)
			}
			return nil
		}); err != nil {
			return err
		}
		// ← Iterator 2 is now CLOSED

		// Step 3: Compute allocations (pure CPU, no DB — fine inside write txn)
		if len(bids) == 0 {
			rhp.Status = "completed"
			b, _ := json.Marshal(rhp)
			if err := txn.Set(entry.key, b); err != nil {
				return err
			}
			continue
		}

		categoryQuotas := calculateCategoryQuotas(rhp)
		qibBids, nibBids, retailBids := categorizeBids(bids)

		cutoffPrice := computeGlobalCutoffPrice(rhp, bids)

		allocations := calculateAllocations(rhp, cutoffPrice, categoryQuotas, qibBids, nibBids, retailBids)

		// Populate demand and allocated share counts into category quotas
		categoryQuotas = populateCategoryQuotaStats(categoryQuotas, bids, allocations)

		var totalAllocated int64
		for _, a := range allocations {
			totalAllocated += a.AllocShares
		}

		plan := AllocationPlan{
			Stock:          rhp.Stock,
			CutoffPrice:    cutoffPrice,
			TotalShares:    rhp.TotalShares,
			Allocated:      totalAllocated,
			CategoryQuotas: categoryQuotas,
			Allocations:    allocations,
			CreatedHeight:  height,
			Status:         "pending",
			Cursor:         0,
		}

		planBytes, _ := json.Marshal(plan)
		if err := txn.Set([]byte("alloc_plan_"+rhp.Stock), planBytes); err != nil {
			return err
		}

		// Seed the mutable execution-state keys (separate from the immutable plan blob).
		if err := txn.Set([]byte("alloc_cursor_"+rhp.Stock), []byte("0")); err != nil {
			return err
		}
		if err := txn.Set([]byte("alloc_status_"+rhp.Stock), []byte("pending")); err != nil {
			return err
		}
		// Store plan length as a tiny key so processAllocationOperation never
		// needs to deserialize the full Allocations slice just to check completion.
		if err := txn.Set([]byte("alloc_len_"+rhp.Stock), []byte(strconv.Itoa(len(allocations)))); err != nil {
			return err
		}

		rhp.Status = "allocating"
		rhpBytes, _ := json.Marshal(rhp)
		// Step 4: Write to rhp_ key — safe now because NO iterator is open
		if err := txn.Set(entry.key, rhpBytes); err != nil {
			return err
		}
	}
	return nil
}

func waitForBlock(height uint64) {
	timeout := time.After(time.Duration(genesisConfig.SlotDuration) * time.Second)

	for {
		select {
		case <-timeout:
			consensusLog.Printf("⏰ Timeout waiting for block %d", height)
			emptySlots.Add(1)
			consensusLog.Printf("⚠️ Empty slot %d — advancing", height)
			return
		default:
			if hasBlock(height) {
				consensusLog.Printf("✅ Height %d committed", height)
				return
			}
			time.Sleep(150 * time.Millisecond)
		}
	}
}

func buildAndSignBlock(height uint64, prevHash string, txs []Transaction, allocationOps []AllocationOperation, allocCursor string) (Block, error) {
	header := BlockHeader{
		PrevHash:      prevHash,
		Proposer:      nodeAddress,
		Height:        height,
		TxCount:       len(txs),
		AllocCount:    len(allocationOps), // ← NEW
		AllocCursor:   allocCursor,
		Timestamp:     time.Now().Unix(),
		GasUsed:       0,  // filled later in processBlock
		StateRoot:     "", // filled later
		ValidatorRoot: "", // optional
	}

	block := Block{
		Header:        header,
		Transactions:  txs,
		AllocationOps: allocationOps, // ← NEW
	}

	// Canonical block hash (no state mutation)
	tmp := block
	tmp.BlockHash = ""
	tmp.ProposerSig = ""

	bytes, err := json.Marshal(tmp)
	if err != nil {
		return Block{}, err
	}

	h := sha256.Sum256(bytes)
	block.BlockHash = hex.EncodeToString(h[:])

	sig := ed25519.Sign(privKey, canonicalHeaderBytes(block.Header))
	block.ProposerSig = base64.StdEncoding.EncodeToString(sig)

	return block, nil
}

func canonicalHeaderBytes(h BlockHeader) []byte {
	buf := new(bytes.Buffer)

	binary.Write(buf, binary.BigEndian, h.Height)
	buf.WriteString(h.PrevHash)
	buf.WriteString(h.Proposer)
	binary.Write(buf, binary.BigEndian, h.Timestamp)
	binary.Write(buf, binary.BigEndian, int64(h.TxCount))

	binary.Write(buf, binary.BigEndian, int64(h.AllocCount))
	buf.WriteString(h.AllocCursor)

	return buf.Bytes()
}

// -------------------------
// Block Processing
// -------------------------
func processBlock(block Block) error {
	consensusLog.Printf("🔍 Processing block %d", block.Header.Height)

	// ---- FINALITY GUARD ----
	finalized := getFinalizedHeight()
	if block.Header.Height <= finalized {
		existing := getBlockHash(block.Header.Height)
		if existing != "" && existing != block.BlockHash {
			return fmt.Errorf("attempt to reorg finalized block %d", block.Header.Height)
		}
	}

	// Already have this block
	if hasBlock(block.Header.Height) {
		consensusLog.Printf("ℹ️  Block %d already exists", block.Header.Height)
		return nil
	}

	// ---- CONTINUITY ----
	if block.Header.Height > 0 {
		prevHash := getBlockHash(block.Header.Height - 1)
		if prevHash != block.Header.PrevHash {
			return fmt.Errorf("block continuity broken at height %d", block.Header.Height)
		}
	}

	// ---- VERIFY SIGNATURE & TXS & HASH ----
	if err := verifyBlock(block); err != nil {
		return fmt.Errorf("block verification failed: %v", err)
	}

	return db.Update(func(txn *badger.Txn) error {
		// === PHASE 1: Execute allocation operations ===
		// Each op now charges gas to the company
		var allocGas int64
		for _, op := range block.AllocationOps {
			if err := processAllocationOperation(txn, op); err != nil {
				return fmt.Errorf("failed to process allocation op: %v", err)
			}
			allocGas += int64(genesisConfig.GasPerTx) // add gas used by this op
		}

		// === PHASE 2: Execute normal transactions (including tnx_bid_stock) ===
		// IMPORTANT: This MUST run before IPO finalization below.
		// Bid transactions check rhp.Status == "bidding"; if we finalized first,
		// the status would already be "allocating" and every bid tx would fail.
		gasUsed, err := processTransactions(txn, block.Transactions, Address(block.Header.Proposer))
		if err != nil {
			return fmt.Errorf("failed to process transactions: %v", err)
		}
		gasUsed += allocGas // include gas from allocation ops in total gas used
		block.Header.GasUsed = gasUsed

		// === PHASE 3: DETERMINISTIC IPO FINALIZATION ===
		// Runs AFTER processTransactions so bids are applied while RHP is still
		// "bidding". Finalization then atomically promotes status to "allocating".
		// Guaranteed to happen exactly once per block on every node.
		if shouldFinalizeIPOAllocationAtHeight(txn, block.Header.Height) {
			if err := finalizeIPOAllocationAtHeight(txn, block.Header.Height); err != nil {
				return fmt.Errorf("IPO finalization failed in block %d: %v", block.Header.Height, err)
			}
			consensusLog.Printf("✅ IPO allocation plans finalized at height %d", block.Header.Height)
		}

		// ---- UPDATE VALIDATOR ACTIVITY ----
		if block.Header.Proposer != "genesis" {
			valKey := ValidatorRegistryPrefix + block.Header.Proposer
			if item, err := txn.Get([]byte(valKey)); err == nil {
				var val ValidatorInfo
				_ = item.Value(func(v []byte) error { return json.Unmarshal(v, &val) })
				// update LastActive in DB so computeValidatorRoot sees same view as proposer
				val.LastActive = block.Header.Height
				if valBytes, err := json.Marshal(val); err == nil {
					_ = txn.Set([]byte(valKey), valBytes)
				}
			}
		}

		// ---- COMPUTE LOCAL ROOTS AFTER we executed TXs and updated validator activity ----
		localStateRoot := computeStateRoot(txn)
		localValRoot := computeValidatorRoot(txn)

		// Handle empty roots from proposer
		if block.Header.StateRoot == "" || block.Header.ValidatorRoot == "" {
			// If the block came from *us* (we are proposer) we can canonicalize it
			if block.Header.Proposer == nodeAddress {
				block.Header.StateRoot = localStateRoot
				block.Header.ValidatorRoot = localValRoot

				// recompute block hash
				tmp := block
				tmp.BlockHash = ""
				tmp.ProposerSig = ""
				b, _ := json.Marshal(tmp)
				h := sha256.Sum256(b)
				block.BlockHash = hex.EncodeToString(h[:])
				consensusLog.Printf("🔧 Filled empty roots for our block %d", block.Header.Height)
			} else {
				// remote proposer sent block with empty roots
				return fmt.Errorf("incoming block %d has empty state/validator roots from remote proposer", block.Header.Height)
			}
		} else {
			// header has roots — verify they match our local computation
			if block.Header.StateRoot != localStateRoot {
				return fmt.Errorf("STATE ROOT MISMATCH at height %d", block.Header.Height)
			}
			if block.Header.ValidatorRoot != localValRoot {
				return fmt.Errorf("VALIDATOR ROOT MISMATCH at height %d", block.Header.Height)
			}
		}

		// ---- STORE BLOCK ----
		blockBytes, _ := json.Marshal(block)
		if err := txn.Set([]byte(fmt.Sprintf("block_%d", block.Header.Height)), blockBytes); err != nil {
			return err
		}

		// Hash index
		if err := txn.Set([]byte("block_by_hash_"+block.BlockHash),
			[]byte(strconv.FormatUint(block.Header.Height, 10))); err != nil {
			return err
		}

		// ---- CANONICAL HEAD ADVANCE ----
		cur := getChainHeight()
		if block.Header.Height > cur || isSyncing {
			txn.Set([]byte("head_block"), []byte(block.BlockHash))
			txn.Set([]byte("current_height"),
				[]byte(strconv.FormatUint(block.Header.Height, 10)))

			// remove txs from mempool only if we're not in sync mode
			if !isSyncing {
				removeTxsFromMempool(block.Transactions)
			}

			txsProcessed.Add(uint64(len(block.Transactions)))
			currentHeight.Store(block.Header.Height)
			consensusLog.Printf("📈 Finalized height now %d", block.Header.Height)
		}

		saveBlockToFile(block, block.Header.Height)

		consensusLog.Printf("✅ Block %d accepted hash=%s txs=%d gas=%d",
			block.Header.Height, short(block.BlockHash), len(block.Transactions), gasUsed)

		return nil
	})
}

func verifyBlock(block Block) error {
	// Verify block hash
	tmp := block
	tmp.BlockHash = ""
	tmp.ProposerSig = ""
	b, err := json.Marshal(tmp)
	if err != nil {
		return err
	}
	hash := sha256.Sum256(b)
	if hex.EncodeToString(hash[:]) != block.BlockHash {
		return fmt.Errorf("block hash mismatch")
	}

	// Verify proposer signature
	sig, err := base64.StdEncoding.DecodeString(block.ProposerSig)
	if err != nil {
		return fmt.Errorf("invalid signature encoding: %v", err)
	}

	pubKeyBytes, err := hex.DecodeString(block.Header.Proposer)
	if err != nil {
		return fmt.Errorf("invalid proposer pubkey: %v", err)
	}

	if !ed25519.Verify(pubKeyBytes, canonicalHeaderBytes(block.Header), sig) {
		return fmt.Errorf("invalid proposer signature")
	}

	// Verify transactions
	for _, tx := range block.Transactions {
		if err := verifyTransaction(tx); err != nil {
			return fmt.Errorf("invalid transaction: %v", err)
		}
	}

	// Verify allocation operations
	for _, op := range block.AllocationOps {
		if op.Stock == "" || op.Bidder == "" {
			return fmt.Errorf("invalid allocation operation: missing stock or bidder")
		}
		// AllocShares == 0 is valid for refund-only ops (e.g. retail lottery losers)
		// but we must have either shares or a refund — a no-op is invalid
		if op.AllocShares < 0 {
			return fmt.Errorf("invalid allocation operation: negative shares")
		}
		if op.AmountToPay < 0 || op.RefundAmount < 0 {
			return fmt.Errorf("invalid allocation operation: negative amounts")
		}
		if op.AllocShares == 0 && op.RefundAmount == 0 {
			return fmt.Errorf("invalid allocation operation: zero shares and zero refund")
		}
	}

	// Count match
	if block.Header.AllocCount != len(block.AllocationOps) {
		return fmt.Errorf("alloc count mismatch in header")
	}

	return nil
}

// -------------------------
// Transaction Processing (from original main.go)
// -------------------------

func addTransactionToMempool(tx Transaction) {
	mempoolMutex.Lock()
	defer mempoolMutex.Unlock()

	// Check mempool size
	if len(mempool) >= MaxMempoolSize {
		// Remove oldest transaction
		for k := range mempool {
			delete(mempool, k)
			break
		}
	}

	// Add transaction
	txKey := fmt.Sprintf("%s_%d", tx.From, tx.Nonce)
	mempool[txKey] = tx

	mempoolSize.Store(int32(len(mempool)))

	// Save to disk periodically
	go saveMempool(mempoolFilePath)

	// Broadcast to peers
	broadcastTransaction(tx)
}

func removeTxsFromMempool(txs []Transaction) {
	mempoolMutex.Lock()
	defer mempoolMutex.Unlock()

	for _, tx := range txs {
		txKey := fmt.Sprintf("%s_%d", tx.From, tx.Nonce)
		delete(mempool, txKey)
	}

	mempoolSize.Store(int32(len(mempool)))

	go saveMempool(mempoolFilePath)
}

func verifyTransaction(tx Transaction) error {
	if !isWhitelisted(string(tx.From)) {
		return fmt.Errorf("sender not whitelisted")
	}

	// Get sender account
	var senderAcc Account
	err := db.View(func(txn *badger.Txn) error {
		acc, err := getAccount(txn, tx.From)
		if err != nil {
			return err
		}
		senderAcc = acc
		return nil
	})
	if err != nil {
		return fmt.Errorf("sender account not found: %v", err)
	}

	// nonce
	if tx.Nonce <= senderAcc.Nonce {
		return fmt.Errorf("nonce too low")
	}

	// signature
	txCopy := tx
	txCopy.Sig = ""
	txBytes, err := json.Marshal(txCopy)
	if err != nil {
		return fmt.Errorf("failed to marshal tx: %v", err)
	}
	sig, err := base64.StdEncoding.DecodeString(tx.Sig)
	if err != nil {
		return fmt.Errorf("failed to decode sig: %v", err)
	}
	pubKeyBytes, err := hex.DecodeString(string(tx.From))
	if err != nil {
		return fmt.Errorf("failed to decode pubkey: %v", err)
	}
	if !ed25519.Verify(pubKeyBytes, txBytes, sig) {
		return fmt.Errorf("invalid signature")
	}

	// type-specific
	switch tx.Type {
	case TxSendINR:
		if tx.To == "" || tx.AmountPaise <= 0 {
			return fmt.Errorf("invalid transfer tx")
		}
	case TxInitiateStock:
		if tx.Stock == "" || tx.RHPHash == "" {
			return fmt.Errorf("invalid IPO initiation tx")
		}
	case TxBidStock:
		if tx.Stock == "" || tx.BidPricePaise <= 0 || tx.BidShares <= 0 || tx.Category == "" {
			return fmt.Errorf("invalid bid tx")
		}
	case TxUploadDRHP:
		if tx.Stock == "" || tx.Meta == nil || tx.Meta["payload"] == "" {
			return fmt.Errorf("invalid DRHP upload tx")
		}
	case TxUploadRHP:
		if tx.Stock == "" || tx.Meta == nil || tx.Meta["payload"] == "" {
			return fmt.Errorf("invalid RHP upload tx")
		}
	case TxVoteContract:
		if tx.Meta == nil || tx.Meta["name"] == "" {
			return fmt.Errorf("invalid vote tx")
		}
	case TxNewContract:
		if tx.Meta == nil || tx.Meta["name"] == "" || tx.Meta["batch"] == "" || tx.Meta["payload"] == "" {
			return fmt.Errorf("invalid contract tx")
		}
	case TxDividend:
		if tx.Stock == "" || tx.AmountPaise <= 0 {
			return fmt.Errorf("invalid dividend tx")
		}
	case TxAllocateIPO:
		if tx.Stock == "" {
			return fmt.Errorf("invalid allocate IPO tx")
		}
	case TxValidatorJoin:
		if tx.AmountPaise < genesisConfig.MinStakePaise {
			return fmt.Errorf("insufficient stake to become validator")
		}
	case TxValidatorExit:
		// always allowed
	case TxOpenIPO:
		if tx.Stock == "" {
			return fmt.Errorf("invalid open IPO tx")
		}
		// new tnx
	case TxUpdateRHP:
		if tx.Stock == "" || tx.Meta == nil || tx.Meta["payload"] == "" {
			return fmt.Errorf("update_rhp requires stock and meta.payload (JSON RHP fields)")
		}
	case TxCancelIPO:
		if tx.Stock == "" {
			return fmt.Errorf("cancel_ipo requires stock symbol")
		}
	case TxCorporateAction:
		if tx.Stock == "" || tx.ActionType == "" {
			return fmt.Errorf("corporate_action requires stock and actionType")
		}
		if tx.ActionType == "split" && tx.Ratio == "" {
			return fmt.Errorf("split corporate_action requires ratio")
		}
	case TxTransferStock:
		if tx.To == "" || tx.Stock == "" || tx.Shares <= 0 {
			return fmt.Errorf("transfer_stock requires To, Stock, Shares > 0")
		}
	case TxSellStock:
		if tx.Stock == "" || tx.Shares <= 0 || tx.PricePaise <= 0 {
			return fmt.Errorf("sell_stock requires Stock, Shares, PricePaise > 0")
		}
	case TxBuyStock:
		if tx.Stock == "" || tx.Shares <= 0 || tx.PricePaise <= 0 {
			return fmt.Errorf("buy_stock requires Stock, Shares, PricePaise > 0")
		}
	case TxRejectDRHP:
		if tx.Stock == "" || tx.Reason == "" {
			return fmt.Errorf("reject_drhp requires Stock and Reason")
		}
	case TxFreezeAccount:
		if tx.To == "" || tx.Reason == "" {
			return fmt.Errorf("freeze_account requires To address and Reason")
		}
	case TxUnfreezeAccount:
		if tx.To == "" {
			return fmt.Errorf("unfreeze_account requires To address")
		}
	case TxFlagAccount:
		if tx.To == "" || tx.Reason == "" {
			return fmt.Errorf("flag_account requires To address and Reason")
		}
	case TxMandate:
		if tx.MandateType == "" || tx.Reason == "" {
			return fmt.Errorf("mandate requires MandateType and Reason")
		}
	case TxUpdateStake:
		if tx.AmountPaise == 0 {
			return fmt.Errorf("update_stake requires non-zero AmountPaise (positive = top up, negative = reduce)")
		}
	case TxSlashProposal:
		if tx.To == "" || tx.AmountPaise <= 0 || tx.Reason == "" {
			return fmt.Errorf("slash_proposal requires To (target), AmountPaise, Reason")
		}
	case TxVoteSlash:
		if tx.ProposalID == "" {
			return fmt.Errorf("vote_slash requires ProposalID")
		}
	default:
		return fmt.Errorf("unknown tx type: %s", tx.Type)
	}
	return nil
}

func processTransactions(txn *badger.Txn, txs []Transaction, proposer Address) (int64, error) {
	totalGas := int64(0)

	tempNonce := make(map[Address]uint64)

	for _, tx := range txs {
		gas, err := processTransaction(txn, tx, proposer, tempNonce)
		if err != nil {
			return 0, err
		}
		totalGas += gas
	}

	return totalGas, nil
}

func processTransaction(txn *badger.Txn, tx Transaction, proposer Address, tempNonce map[Address]uint64) (int64, error) {
	senderAcc, err := getAccount(txn, tx.From)
	if err != nil {
		return 0, err
	}

	currentNonce := senderAcc.Nonce
	if n, ok := tempNonce[tx.From]; ok {
		currentNonce = n
	}

	if tx.Nonce != currentNonce+1 {
		return 0, fmt.Errorf("invalid nonce on apply")
	}

	proposerAcc, err := getAccount(txn, proposer)
	if err != nil {
		proposerAcc = Account{
			Address: proposer,
			Role:    "validator",
			Stocks:  make(map[string]int64),
		}
	}

	gas := int64(genesisConfig.GasPerTx)
	if gas < 0 {
		gas = 0
	}

	switch tx.Type {
	case TxSendINR:
		err = processSendINR(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxInitiateStock:
		err = processInitiateStock(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxBidStock:
		err = processBidStock(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxUploadDRHP:
		err = processUploadDRHP(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxUploadRHP:
		err = processUploadRHP(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxVoteContract:
		err = processVoteContract(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxNewContract:
		err = processNewContract(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxDividend:
		err = processDividend(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxValidatorJoin:
		err = processValidatorJoin(txn, tx, &senderAcc)
	case TxValidatorExit:
		err = processValidatorExit(txn, tx, &senderAcc)
	case TxOpenIPO:
		err = processOpenIPO(txn, tx, &senderAcc, &proposerAcc, gas)

	case TxUpdateRHP:
		err = processUpdateRHP(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxCancelIPO:
		err = processCancelIPO(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxCorporateAction:
		err = processCorporateAction(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxTransferStock:
		err = processTransferStock(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxSellStock:
		err = processSellStock(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxBuyStock:
		err = processBuyStock(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxRejectDRHP:
		err = processRejectDRHP(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxFreezeAccount:
		err = processFreezeAccount(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxUnfreezeAccount:
		err = processUnfreezeAccount(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxFlagAccount:
		err = processFlagAccount(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxMandate:
		err = processMandate(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxUpdateStake:
		err = processUpdateStake(txn, tx, &senderAcc)
	case TxSlashProposal:
		err = processSlashProposal(txn, tx, &senderAcc, &proposerAcc, gas)
	case TxVoteSlash:
		err = processVoteSlash(txn, tx, &senderAcc, &proposerAcc, gas)
	default:
		return 0, fmt.Errorf("unknown tx type: %s", tx.Type)
	}

	if err != nil {
		return 0, err
	}

	// Update nonce tracking
	senderAcc.Nonce = tx.Nonce
	tempNonce[tx.From] = tx.Nonce

	if err := updateAccount(txn, senderAcc); err != nil {
		return 0, err
	}
	if err := updateAccount(txn, proposerAcc); err != nil {
		return 0, err
	}

	return gas, nil
}

// Transaction type handlers (unchanged from original main.go)
func processSendINR(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	total := tx.AmountPaise + gas
	if senderAcc.BalancePaise-senderAcc.BlockedPaise < total {
		return fmt.Errorf("insufficient balance")
	}
	recipientAcc, err := getAccount(txn, tx.To)
	if err != nil {
		recipientAcc = Account{
			Address:      tx.To,
			BalancePaise: 0,
			BlockedPaise: 0,
			StakePaise:   0,
			Role:         "user",
			Nonce:        0,
			Stocks:       make(map[string]int64),
		}
	}
	senderAcc.BalancePaise -= total
	senderAcc.Nonce++
	recipientAcc.BalancePaise += tx.AmountPaise
	proposerAcc.BalancePaise += gas

	if err := updateAccount(txn, *senderAcc); err != nil {
		return err
	}
	if err := updateAccount(txn, recipientAcc); err != nil {
		return err
	}
	return nil
}

func processOpenIPO(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	// Load RHP (regulator-approved parameters)
	var rhp RHPMetadata
	item, err := txn.Get([]byte("rhp_" + tx.Stock))
	if err != nil {
		return fmt.Errorf("RHP not found for stock %s", tx.Stock)
	}
	if err := item.Value(func(val []byte) error {
		return json.Unmarshal(val, &rhp)
	}); err != nil {
		return err
	}

	if rhp.Status != "pending" {
		return fmt.Errorf("IPO already opened or completed")
	}
	if rhp.CompanyAddr != string(tx.From) {
		return fmt.Errorf("only the IPO company can open bidding")
	}

	// Company must lock funds at upper price band × total shares
	requiredLock := rhp.PriceBandUpper * rhp.TotalShares
	if senderAcc.BalancePaise-senderAcc.BlockedPaise < requiredLock+gas {
		return fmt.Errorf("insufficient balance for IPO lock + gas")
	}

	// Open the bidding window
	rhp.Status = "bidding"
	rhp.BiddingStartSlot = currentHeight.Load() + 1
	rhp.BiddingEndSlot = currentHeight.Load() + uint64(rhp.BiddingWindowBlocks)

	rhpBytes, err := json.Marshal(rhp)
	if err != nil {
		return err
	}
	if err := txn.Set([]byte("rhp_"+tx.Stock), rhpBytes); err != nil {
		return err
	}

	// Lock company funds + pay gas
	senderAcc.BlockedPaise += requiredLock
	senderAcc.BalancePaise -= gas
	senderAcc.BalancePaise -= requiredLock
	senderAcc.Nonce++
	proposerAcc.BalancePaise += gas

	return updateAccount(txn, *senderAcc)
}

func processInitiateStock(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "company" {
		return fmt.Errorf("only company can initiate stock")
	}
	if tx.Stock == "" || tx.RHPHash == "" {
		return fmt.Errorf("stock symbol and RHP hash are required")
	}

	// Minimal registration - RHP will contain full details
	if err := txn.Set([]byte("stock_"+tx.Stock), []byte(tx.RHPHash)); err != nil {
		return err
	}

	// Gas handling
	if senderAcc.BalancePaise-senderAcc.BlockedPaise < gas {
		return fmt.Errorf("insufficient balance for gas")
	}
	senderAcc.BalancePaise -= gas
	senderAcc.Nonce++
	proposerAcc.BalancePaise += gas

	return updateAccount(txn, *senderAcc)
}

func processBidStock(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	// Load RHP (Regulator's source of truth) instead of old IPOMetadata
	var rhp RHPMetadata
	item, err := txn.Get([]byte("rhp_" + tx.Stock))
	if err != nil {
		return fmt.Errorf("RHP not found for stock %s - regulator must approve IPO first", tx.Stock)
	}
	if err := item.Value(func(val []byte) error {
		return json.Unmarshal(val, &rhp)
	}); err != nil {
		return err
	}

	if rhp.Status != "bidding" {
		return fmt.Errorf("IPO not in bidding phase")
	}
	if currentHeight.Load() < rhp.BiddingStartSlot || currentHeight.Load() > rhp.BiddingEndSlot {
		return fmt.Errorf("bidding window closed")
	}

	// Price band validation
	if tx.BidPricePaise < rhp.PriceBandLower || tx.BidPricePaise > rhp.PriceBandUpper {
		return fmt.Errorf("bid price outside allowed band [%d, %d]",
			rhp.PriceBandLower, rhp.PriceBandUpper)
	}

	// Category must be valid
	if tx.Category != "qib" && tx.Category != "nib" && tx.Category != "retail" {
		return fmt.Errorf("invalid category: must be qib, nib, or retail")
	}

	// Retail-specific rules (very important)
	if tx.Category == "retail" {
		if rhp.RetailLotSize > 0 && tx.BidShares%rhp.RetailLotSize != 0 {
			return fmt.Errorf("retail bid must be in multiples of lot size %d", rhp.RetailLotSize)
		}
		if tx.BidShares < rhp.MinRetailBid {
			return fmt.Errorf("retail bid below minimum %d", rhp.MinRetailBid)
		}
		if rhp.MaxRetailBid > 0 && tx.BidShares > rhp.MaxRetailBid {
			return fmt.Errorf("retail bid above maximum %d", rhp.MaxRetailBid)
		}
	}

	bidAmount := tx.BidPricePaise * tx.BidShares
	total := bidAmount + gas
	if senderAcc.BalancePaise-senderAcc.BlockedPaise < total {
		return fmt.Errorf("insufficient balance for bid + gas")
	}

	// Store the bid (this stays the same)
	bid := Bid{
		From:          tx.From,
		Stock:         tx.Stock,
		BidPricePaise: tx.BidPricePaise,
		BidShares:     tx.BidShares,
		Category:      tx.Category,
		Timestamp:     tx.Timestamp,
	}
	bb, err := json.Marshal(bid)
	if err != nil {
		return err
	}
	bKey := fmt.Sprintf("bid_%s_%s_%d", tx.Stock, tx.From, tx.Timestamp)
	if err := txn.Set([]byte(bKey), bb); err != nil {
		return err
	}

	// Block bidder funds (unchanged)
	senderAcc.BlockedPaise += bidAmount
	senderAcc.BalancePaise -= gas
	senderAcc.Nonce++
	proposerAcc.BalancePaise += gas

	return updateAccount(txn, *senderAcc)
}

func processUploadDRHP(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "company" {
		return fmt.Errorf("only company can upload DRHP")
	}
	payload := tx.Meta["payload"]
	if payload == "" {
		return fmt.Errorf("empty DRHP payload")
	}

	// Inject companyAddr (tx.From) into the payload so the regulator can
	// identify which company filed this DRHP and populate RHP correctly.
	var payloadMap map[string]interface{}
	if err := json.Unmarshal([]byte(payload), &payloadMap); err != nil {
		return fmt.Errorf("invalid DRHP payload JSON: %v", err)
	}
	payloadMap["companyAddr"] = string(tx.From)
	enriched, err := json.Marshal(payloadMap)
	if err != nil {
		return err
	}

	if err := txn.Set([]byte("drhp_"+tx.Stock), enriched); err != nil {
		return err
	}
	if senderAcc.BalancePaise-senderAcc.BlockedPaise < gas {
		return fmt.Errorf("insufficient balance for gas")
	}
	senderAcc.BalancePaise -= gas
	senderAcc.Nonce++
	proposerAcc.BalancePaise += gas
	return updateAccount(txn, *senderAcc)
}

func processUploadRHP(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "regulator" {
		return fmt.Errorf("only regulator can upload RHP")
	}

	payload := tx.Meta["payload"]
	if payload == "" {
		return fmt.Errorf("empty RHP payload")
	}

	// === CRITICAL: Parse and validate structured RHP metadata ===
	var rhp RHPMetadata
	if err := json.Unmarshal([]byte(payload), &rhp); err != nil {
		return fmt.Errorf("invalid RHP metadata JSON: %v", err)
	}

	// Strong validation (this was missing in your current version)
	if rhp.TotalShares <= 0 {
		return fmt.Errorf("total shares must be positive")
	}
	if rhp.PriceBandUpper <= rhp.PriceBandLower {
		return fmt.Errorf("price band upper must be greater than lower")
	}
	if rhp.BiddingWindowBlocks <= 0 {
		return fmt.Errorf("bidding window blocks must be positive")
	}
	if rhp.QIBPercentage+rhp.NIBPercentage+rhp.RetailPercentage != 100 {
		return fmt.Errorf("category percentages must sum to 100")
	}
	if rhp.RetailPercentage > 0 && rhp.RetailLotSize <= 0 {
		return fmt.Errorf("retail lot size must be positive when retail percentage > 0")
	}

	// Set defaults and ensure consistency
	rhp.Status = "pending"
	rhp.Stock = tx.Stock // enforce key matches stock symbol

	// If companyAddr wasn't set in the payload, read it from the stored DRHP
	if rhp.CompanyAddr == "" {
		if item, err := txn.Get([]byte("drhp_" + tx.Stock)); err == nil {
			item.Value(func(v []byte) error {
				var drhpMap map[string]interface{}
				if json.Unmarshal(v, &drhpMap) == nil {
					if ca, ok := drhpMap["companyAddr"].(string); ok {
						rhp.CompanyAddr = ca
					}
				}
				return nil
			})
		}
	}

	rhpBytes, err := json.Marshal(rhp)
	if err != nil {
		return err
	}

	if err := txn.Set([]byte("rhp_"+tx.Stock), rhpBytes); err != nil {
		return err
	}

	// Gas handling
	if senderAcc.BalancePaise-senderAcc.BlockedPaise < gas {
		return fmt.Errorf("insufficient balance for gas")
	}

	senderAcc.BalancePaise -= gas
	senderAcc.Nonce++
	proposerAcc.BalancePaise += gas

	return updateAccount(txn, *senderAcc)
}

func processVoteContract(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "regulator" {
		return fmt.Errorf("only regulator can vote")
	}
	name := tx.Meta["name"]
	if name == "" {
		return fmt.Errorf("missing contract name")
	}
	key := fmt.Sprintf("vote_%s_%s", name, tx.From)
	if err := txn.Set([]byte(key), []byte("1")); err != nil {
		return err
	}
	if senderAcc.BalancePaise-senderAcc.BlockedPaise < gas {
		return fmt.Errorf("insufficient balance for gas")
	}
	senderAcc.BalancePaise -= gas
	senderAcc.Nonce++
	proposerAcc.BalancePaise += gas
	return updateAccount(txn, *senderAcc)
}

func processNewContract(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	name := tx.Meta["name"]
	batch := tx.Meta["batch"]
	payload := tx.Meta["payload"]
	if name == "" || batch == "" || payload == "" {
		return fmt.Errorf("invalid contract meta")
	}
	c := Contract{Name: name, Batch: batch, Payload: payload}
	b, err := json.Marshal(c)
	if err != nil {
		return err
	}
	key := fmt.Sprintf("contract_%s_%s", name, batch)
	if err := txn.Set([]byte(key), b); err != nil {
		return err
	}
	if senderAcc.BalancePaise-senderAcc.BlockedPaise < gas {
		return fmt.Errorf("insufficient balance for gas")
	}
	senderAcc.BalancePaise -= gas
	senderAcc.Nonce++
	proposerAcc.BalancePaise += gas
	return updateAccount(txn, *senderAcc)
}

func processDividend(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "company" {
		return fmt.Errorf("only company can pay dividends")
	}
	if senderAcc.BalancePaise-senderAcc.BlockedPaise < tx.AmountPaise+gas {
		return fmt.Errorf("insufficient balance for dividend + gas")
	}

	var holders []Account
	var totalShares int64
	err := iteratePrefix(txn, []byte("account_"), func(k, v []byte) error {
		var acc Account
		if err := json.Unmarshal(v, &acc); err != nil {
			return err
		}
		sh := acc.Stocks[tx.Stock]
		if sh > 0 {
			holders = append(holders, acc)
			totalShares += sh
		}
		return nil
	})
	if err != nil {
		return err
	}
	if totalShares == 0 {
		return fmt.Errorf("no holders for stock")
	}

	divPerShare := tx.AmountPaise / totalShares
	if divPerShare <= 0 {
		return fmt.Errorf("dividend too small for distribution")
	}

	senderAcc.BalancePaise -= tx.AmountPaise + gas
	senderAcc.Nonce++
	proposerAcc.BalancePaise += gas

	if err := updateAccount(txn, *senderAcc); err != nil {
		return err
	}
	for _, h := range holders {
		sh := h.Stocks[tx.Stock]
		h.BalancePaise += sh * divPerShare
		if err := updateAccount(txn, h); err != nil {
			return err
		}
	}

	d := Dividend{
		Stock:       tx.Stock,
		AmountPaise: tx.AmountPaise,
		CompanyAddr: string(tx.From),
		Timestamp:   tx.Timestamp,
	}
	b, err := json.Marshal(d)
	if err != nil {
		return err
	}
	key := fmt.Sprintf("dividend_%s_%d", tx.Stock, tx.Timestamp)
	if err := txn.Set([]byte(key), b); err != nil {
		return err
	}

	return nil
}

func computeGlobalCutoffPrice(rhp RHPMetadata, bids []Bid) int64 {
	priceDemand := make(map[int64]int64)
	for _, bid := range bids {
		priceDemand[bid.BidPricePaise] += bid.BidShares
	}

	prices := make([]int64, 0, len(priceDemand))
	for p := range priceDemand {
		prices = append(prices, p)
	}
	sort.Slice(prices, func(i, j int) bool { return prices[i] > prices[j] })

	var cumulative int64
	for _, price := range prices {
		cumulative += priceDemand[price]
		if cumulative >= rhp.TotalShares {
			return price
		}
	}

	// Undersubscribed → lowest price with demand
	if len(prices) > 0 {
		return prices[len(prices)-1]
	}
	return 0
}

func calculateCategoryQuotas(rhp RHPMetadata) map[string]CategoryQuota {
	quotas := make(map[string]CategoryQuota)

	qibShares := (rhp.TotalShares * int64(rhp.QIBPercentage)) / 100
	quotas["qib"] = CategoryQuota{ReservedShares: qibShares}

	nibShares := (rhp.TotalShares * int64(rhp.NIBPercentage)) / 100
	quotas["nib"] = CategoryQuota{ReservedShares: nibShares}

	retailShares := rhp.TotalShares - qibShares - nibShares
	quotas["retail"] = CategoryQuota{ReservedShares: retailShares}

	return quotas
}

// populateCategoryQuotaStats fills DemandShares and AllocatedShares in the
// quotas map by summing over the completed allocation decisions.
func populateCategoryQuotaStats(quotas map[string]CategoryQuota, bids []Bid, allocations []AllocationDecision) map[string]CategoryQuota {
	// Sum demand (all bids) per category
	for _, b := range bids {
		cat := b.Category
		q := quotas[cat]
		q.DemandShares += b.BidShares
		quotas[cat] = q
	}
	// Sum allocated shares per category
	for _, a := range allocations {
		cat := a.Category
		q := quotas[cat]
		q.AllocatedShares += a.AllocShares
		quotas[cat] = q
	}
	return quotas
}

func categorizeBids(bids []Bid) (qibBids, nibBids, retailBids []Bid) {
	for _, bid := range bids {
		switch bid.Category {
		case "qib":
			qibBids = append(qibBids, bid)
		case "nib":
			nibBids = append(nibBids, bid)
		case "retail":
			retailBids = append(retailBids, bid)
		}
	}
	return
}

func calculateAllocations(rhp RHPMetadata, cutoffPrice int64, quotas map[string]CategoryQuota,
	qibBids, nibBids, retailBids []Bid) []AllocationDecision {

	var allocations []AllocationDecision

	// Single global cutoff price applies to ALL categories.
	// SEBI book-building: demand from all investors across all categories is
	// aggregated price-wise. The cutoff is the lowest price at which total
	// cumulative demand >= total shares. Every bid at or above cutoff qualifies.
	// cutoffPrice is already computed by computeGlobalCutoffPrice() before this call.

	validRetail := filterValidRetailBids(retailBids, rhp)

	var qibAllocated, nibAllocated, retailAllocated int64

	if len(qibBids) > 0 {
		qibAllocs := allocateProRata(qibBids, cutoffPrice, quotas["qib"].ReservedShares, "qib")
		for _, a := range qibAllocs {
			qibAllocated += a.AllocShares
		}
		allocations = append(allocations, qibAllocs...)
	}
	if len(nibBids) > 0 {
		nibAllocs := allocateProRata(nibBids, cutoffPrice, quotas["nib"].ReservedShares, "nib")
		for _, a := range nibAllocs {
			nibAllocated += a.AllocShares
		}
		allocations = append(allocations, nibAllocs...)
	}
	if len(validRetail) > 0 && rhp.RetailLotSize > 0 {
		retailAllocs := allocateRetailLottery(validRetail, cutoffPrice, quotas["retail"].ReservedShares, rhp.RetailLotSize, currentHeight.Load())
		for _, a := range retailAllocs {
			retailAllocated += a.AllocShares
		}
		allocations = append(allocations, retailAllocs...)
	}

	// Spillover — unused quota from undersubscribed categories flows to oversubscribed ones.
	// Priority: QIB > NIB > Retail.
	qibUnused := quotas["qib"].ReservedShares - qibAllocated
	nibUnused := quotas["nib"].ReservedShares - nibAllocated
	retailUnused := quotas["retail"].ReservedShares - retailAllocated

	if qibUnused+nibUnused+retailUnused <= 0 {
		return allocations
	}

	if qibAllocated >= quotas["qib"].ReservedShares && len(qibBids) > 0 {
		surplus := nibUnused + retailUnused
		if surplus > 0 {
			extra := allocateProRataSpillover(qibBids, cutoffPrice, surplus, "qib", allocations)
			for _, a := range extra {
				qibAllocated += a.AllocShares
			}
			allocations = append(allocations, extra...)
			nibUnused = 0
			retailUnused = 0
		}
	}

	if nibAllocated >= quotas["nib"].ReservedShares && len(nibBids) > 0 {
		surplus := qibUnused + retailUnused
		if surplus > 0 {
			extra := allocateProRataSpillover(nibBids, cutoffPrice, surplus, "nib", allocations)
			for _, a := range extra {
				nibAllocated += a.AllocShares
			}
			allocations = append(allocations, extra...)
			qibUnused = 0
			retailUnused = 0
		}
	}

	if retailAllocated >= quotas["retail"].ReservedShares && len(validRetail) > 0 && rhp.RetailLotSize > 0 {
		surplus := qibUnused + nibUnused
		if surplus > 0 {
			surplus = (surplus / rhp.RetailLotSize) * rhp.RetailLotSize
			if surplus > 0 {
				extra := allocateRetailLotterySpillover(validRetail, cutoffPrice, surplus, rhp.RetailLotSize, currentHeight.Load(), allocations)
				allocations = append(allocations, extra...)
			}
		}
	}

	return allocations
}

// allocateProRataSpillover distributes surplus shares pro-rata to bidders in a category
// who were cut short due to oversubscription, using existing allocations to determine shortfall.
func allocateProRataSpillover(bids []Bid, cutoffPrice int64, surplus int64, category string, existing []AllocationDecision) []AllocationDecision {
	// Build a map of already-allocated shares per bidder
	alreadyAlloc := make(map[string]int64)
	for _, a := range existing {
		if a.Category == category {
			alreadyAlloc[a.Bidder] += a.AllocShares
		}
	}

	// Eligible bidders who were cut short
	var shortfall []Bid
	var totalShortfall int64
	for _, bid := range bids {
		if bid.BidPricePaise < cutoffPrice {
			continue
		}
		got := alreadyAlloc[string(bid.From)]
		if got < bid.BidShares {
			shortage := bid.BidShares - got
			shortfall = append(shortfall, Bid{
				From:          bid.From,
				BidShares:     shortage,
				BidPricePaise: bid.BidPricePaise,
				Category:      bid.Category,
				Timestamp:     bid.Timestamp,
			})
			totalShortfall += shortage
		}
	}

	if len(shortfall) == 0 || totalShortfall == 0 {
		return nil
	}

	return allocateProRata(shortfall, cutoffPrice, surplus, category)
}

// allocateRetailLotterySpillover gives additional lots to retail bidders who lost the first lottery.
func allocateRetailLotterySpillover(bids []Bid, cutoffPrice int64, surplus int64, lotSize int64, seedHeight uint64, existing []AllocationDecision) []AllocationDecision {
	// Find bidders who already won a lot
	winners := make(map[string]bool)
	for _, a := range existing {
		if a.Category == "retail" && a.LotteryWin {
			winners[a.Bidder] = true
		}
	}

	// Eligible non-winners only (1 lot per applicant total)
	var losers []Bid
	for _, bid := range bids {
		if bid.BidPricePaise >= cutoffPrice && !winners[string(bid.From)] {
			losers = append(losers, bid)
		}
	}

	if len(losers) == 0 {
		return nil
	}

	// Re-run lottery on losers with the surplus lots
	extraLots := surplus / lotSize
	if extraLots <= 0 {
		return nil
	}

	sort.Slice(losers, func(i, j int) bool {
		return string(losers[i].From) < string(losers[j].From)
	})

	var result []AllocationDecision
	var lotsGiven int64
	// Use a different seed so the second lottery differs from the first
	altSeed := seedHeight + 1

	for _, bid := range losers {
		if lotsGiven >= extraLots {
			break
		}
		h := sha256.Sum256([]byte(fmt.Sprintf("%s%d%d%s", bid.From, altSeed, bid.Timestamp, "spillover")))
		if h[0]%2 == 0 {
			amountToPay := lotSize * cutoffPrice
			refundAmount := (bid.BidPricePaise * bid.BidShares) - amountToPay
			if refundAmount < 0 {
				refundAmount = 0
			}
			result = append(result, AllocationDecision{
				Bidder:       string(bid.From),
				Category:     "retail",
				BidPrice:     bid.BidPricePaise,
				BidShares:    bid.BidShares,
				AllocShares:  lotSize,
				AmountToPay:  amountToPay,
				RefundAmount: refundAmount,
				LotteryWin:   true,
			})
			lotsGiven++
		}
	}
	return result
}

func allocateProRata(bids []Bid, cutoffPrice int64, reservedShares int64, category string) []AllocationDecision {
	var allocations []AllocationDecision
	var eligible []Bid
	var totalEligible int64

	// Filter bids that meet or exceed the cutoff price
	for _, bid := range bids {
		if bid.BidPricePaise >= cutoffPrice {
			eligible = append(eligible, bid)
			totalEligible += bid.BidShares
		}
	}

	if totalEligible == 0 {
		return allocations
	}

	oversubscribed := totalEligible > reservedShares
	var totalAllocated int64

	for _, bid := range eligible {
		var allocShares int64

		if !oversubscribed {
			// Undersubscribed — everyone gets exactly what they bid
			allocShares = bid.BidShares
		} else {
			// Oversubscribed — pro-rata, capped to remaining quota
			remaining := reservedShares - totalAllocated
			if remaining <= 0 {
				break
			}
			allocShares = (bid.BidShares * reservedShares) / totalEligible
			if allocShares > bid.BidShares {
				allocShares = bid.BidShares
			}
			if allocShares > remaining {
				allocShares = remaining
			}
			if allocShares <= 0 {
				continue
			}
		}

		totalAllocated += allocShares
		amountToPay := allocShares * cutoffPrice
		refundAmount := (bid.BidPricePaise * bid.BidShares) - amountToPay
		if refundAmount < 0 {
			refundAmount = 0
		}

		allocations = append(allocations, AllocationDecision{
			Bidder:       string(bid.From),
			Category:     category,
			BidPrice:     bid.BidPricePaise,
			BidShares:    bid.BidShares,
			AllocShares:  allocShares,
			AmountToPay:  amountToPay,
			RefundAmount: refundAmount,
		})
	}
	return allocations
}
func allocateRetailLottery(bids []Bid, cutoffPrice int64, reservedShares int64, lotSize int64, seedHeight uint64) []AllocationDecision {
	var allocations []AllocationDecision

	availableLots := reservedShares / lotSize
	if availableLots <= 0 {
		return allocations
	}

	// Separate eligible (at/above cutoff) from ineligible (below cutoff)
	var eligible, ineligible []Bid
	for _, bid := range bids {
		if bid.BidPricePaise >= cutoffPrice {
			eligible = append(eligible, bid)
		} else {
			ineligible = append(ineligible, bid)
		}
	}

	// Ineligible bidders get a full refund (price too low)
	for _, bid := range ineligible {
		allocations = append(allocations, AllocationDecision{
			Bidder:       string(bid.From),
			Category:     "retail",
			BidPrice:     bid.BidPricePaise,
			BidShares:    bid.BidShares,
			AllocShares:  0,
			AmountToPay:  0,
			RefundAmount: bid.BidPricePaise * bid.BidShares,
			LotteryWin:   false,
		})
	}

	if len(eligible) == 0 {
		return allocations
	}

	// If applicants ≤ available lots → everyone gets exactly 1 lot (no need for lottery)
	// If applicants > available lots → lottery determines who gets a lot, but we MUST
	// exhaust ALL available lots. We do multiple passes until all lots are distributed.

	// Deterministic sort by address for reproducibility
	sort.Slice(eligible, func(i, j int) bool {
		return string(eligible[i].From) < string(eligible[j].From)
	})

	// Track which bidders have already won to enforce 1-lot-per-applicant rule
	wonBidders := make(map[string]bool)
	var lotsAllocated int64

	// Pass 1: lottery-based selection (50% hash win condition)
	for _, bid := range eligible {
		if lotsAllocated >= availableLots {
			break
		}
		h := sha256.Sum256([]byte(fmt.Sprintf("%s%d%d", bid.From, seedHeight, bid.Timestamp)))
		if h[0]%2 == 0 {
			wonBidders[string(bid.From)] = true
			lotsAllocated++
		}
	}

	// Pass 2: if lots remain (hash misses left gaps), greedily fill from non-winners
	if lotsAllocated < availableLots {
		for _, bid := range eligible {
			if lotsAllocated >= availableLots {
				break
			}
			if !wonBidders[string(bid.From)] {
				wonBidders[string(bid.From)] = true
				lotsAllocated++
			}
		}
	}

	// Build AllocationDecision for every eligible bidder
	for _, bid := range eligible {
		won := wonBidders[string(bid.From)]
		var allocShares int64
		if won {
			allocShares = lotSize
		}
		amountToPay := allocShares * cutoffPrice
		refundAmount := (bid.BidPricePaise * bid.BidShares) - amountToPay
		if refundAmount < 0 {
			refundAmount = 0
		}
		allocations = append(allocations, AllocationDecision{
			Bidder:       string(bid.From),
			Category:     "retail",
			BidPrice:     bid.BidPricePaise,
			BidShares:    bid.BidShares,
			AllocShares:  allocShares,
			AmountToPay:  amountToPay,
			RefundAmount: refundAmount,
			LotteryWin:   won,
		})
	}
	return allocations
}

func filterValidRetailBids(bids []Bid, rhp RHPMetadata) []Bid {
	var valid []Bid
	for _, bid := range bids {
		if bid.Category != "retail" {
			continue
		}
		if rhp.RetailLotSize > 0 && bid.BidShares%rhp.RetailLotSize != 0 {
			continue
		}
		if bid.BidShares < rhp.MinRetailBid {
			continue
		}
		if rhp.MaxRetailBid > 0 && bid.BidShares > rhp.MaxRetailBid {
			continue
		}
		valid = append(valid, bid)
	}
	return valid
}

func getAllocationOperationsForBlock() ([]AllocationOperation, string) {
	var ops []AllocationOperation
	var nextCursor string

	_ = db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("alloc_plan_"), func(k, v []byte) error {
			var plan AllocationPlan
			if err := json.Unmarshal(v, &plan); err != nil {
				return nil
			}

			// Read status from its own tiny key instead of the plan blob.
			statusKey := []byte("alloc_status_" + plan.Stock)
			statusItem, err := txn.Get(statusKey)
			if err != nil {
				// No status key means this plan predates the new architecture;
				// fall back to plan.Status for backward compatibility.
				if plan.Status != "pending" && plan.Status != "executing" {
					return nil
				}
			} else {
				var status string
				statusItem.Value(func(sv []byte) error {
					status = string(sv)
					return nil
				})
				if status != "pending" && status != "executing" {
					return nil
				}
			}

			// Read cursor from its own tiny key instead of the plan blob.
			var start int
			cursorKey := []byte("alloc_cursor_" + plan.Stock)
			cursorItem, err := txn.Get(cursorKey)
			if err == nil {
				cursorItem.Value(func(cv []byte) error {
					start, _ = strconv.Atoi(string(cv))
					return nil
				})
			}
			// If cursorKey missing (old data), start defaults to 0 — safe.

			end := start + 100 // Max 100 allocations per block (adjust as needed)
			if end > len(plan.Allocations) {
				end = len(plan.Allocations)
			}

			batchAdded := 0
			for i := start; i < end; i++ {
				a := plan.Allocations[i]
				// Skip entries with nothing to do (0 alloc AND 0 refund)
				if a.AllocShares == 0 && a.RefundAmount == 0 {
					batchAdded++ // still advance cursor past them
					continue
				}
				ops = append(ops, AllocationOperation{
					Stock:        plan.Stock,
					Bidder:       a.Bidder,
					AllocShares:  a.AllocShares,
					AmountToPay:  a.AmountToPay,
					RefundAmount: a.RefundAmount,
					Category:     a.Category,
				})
				batchAdded++
			}

			// Record next cursor position for the block header.
			if batchAdded > 0 {
				nextCursor = fmt.Sprintf("%s:%d", plan.Stock, start+batchAdded)
			}
			return nil
		})
	})

	return ops, nextCursor
}

// processAllocationOperation now charges gas to the COMPANY (as requested)
func processAllocationOperation(txn *badger.Txn, op AllocationOperation) error {
	// 1. Load RHP to find the company
	var rhp RHPMetadata
	item, err := txn.Get([]byte("rhp_" + op.Stock))
	if err != nil {
		return fmt.Errorf("RHP not found for stock %s: %v", op.Stock, err)
	}
	if err := item.Value(func(v []byte) error {
		return json.Unmarshal(v, &rhp)
	}); err != nil {
		return fmt.Errorf("failed to unmarshal RHP: %v", err)
	}

	companyAddr := Address(rhp.CompanyAddr)

	// 2. Load company account
	companyAcc, err := getAccount(txn, companyAddr)
	if err != nil {
		// Create if not exists (rare, but safe)
		companyAcc = Account{
			Address:      companyAddr,
			BalancePaise: 0,
			Role:         "company",
			Stocks:       make(map[string]int64),
		}
	}

	// 3. Calculate and charge gas (same as normal txs)
	gas := int64(genesisConfig.GasPerTx)
	if gas < 0 {
		gas = 0
	}

	if companyAcc.BalancePaise < gas {
		return fmt.Errorf("company %s has insufficient balance to pay gas for allocation op (need %d, has %d)",
			companyAddr, gas, companyAcc.BalancePaise)
	}

	companyAcc.BalancePaise -= gas

	// 4. Rest of the original logic (unchanged)
	bidderAcc, err := getAccount(txn, Address(op.Bidder))
	if err != nil {
		return fmt.Errorf("bidder account not found: %v", err)
	}

	// originalBlocked = bidPrice * bidShares (what was locked during processBidStock).
	// op.RefundAmount must be >= 0; if somehow negative (old data), clamp to 0.
	if op.RefundAmount < 0 {
		op.RefundAmount = 0
	}
	originalBlocked := op.AmountToPay + op.RefundAmount
	bidderAcc.BlockedPaise -= originalBlocked
	if bidderAcc.BlockedPaise < 0 {
		bidderAcc.BlockedPaise = 0 // safety floor — never let blocked go negative
	}
	bidderAcc.BalancePaise += op.RefundAmount

	if bidderAcc.Stocks == nil {
		bidderAcc.Stocks = make(map[string]int64)
	}
	bidderAcc.Stocks[op.Stock] += op.AllocShares

	if err := updateAccount(txn, bidderAcc); err != nil {
		return fmt.Errorf("failed to update bidder: %v", err)
	}

	companyAcc.BalancePaise += op.AmountToPay // company receives payment

	if err := updateAccount(txn, companyAcc); err != nil {
		return fmt.Errorf("failed to update company: %v", err)
	}

	// 5. Advance cursor — write only tiny keys, never rewrite the full plan blob.
	cursorKey := []byte("alloc_cursor_" + op.Stock)
	statusKey := []byte("alloc_status_" + op.Stock)

	// Read current cursor.
	var cursor int
	cursorItem, err := txn.Get(cursorKey)
	if err == nil {
		cursorItem.Value(func(v []byte) error {
			cursor, _ = strconv.Atoi(string(v))
			return nil
		})
	}

	// Increment and persist — 5 bytes at most.
	cursor++
	if err := txn.Set(cursorKey, []byte(strconv.Itoa(cursor))); err != nil {
		return fmt.Errorf("failed to write alloc cursor: %v", err)
	}

	// Check completion: we need the plan length, but we do NOT unmarshal
	// the Allocations slice — we only need the top-level length field.
	// To avoid deserializing the huge slice, store length once at finalization
	// as alloc_len_<stock>. If that key is missing (old plans), fall back to
	// a full unmarshal (only happens on legacy data, not hot path).
	planLenKey := []byte("alloc_len_" + op.Stock)
	var planLen int
	lenItem, err := txn.Get(planLenKey)
	if err == nil {
		lenItem.Value(func(v []byte) error {
			planLen, _ = strconv.Atoi(string(v))
			return nil
		})
	} else {
		// Fallback: unmarshal full plan to get length (old data path only).
		planItem, err := txn.Get([]byte("alloc_plan_" + op.Stock))
		if err != nil {
			return fmt.Errorf("allocation plan not found: %v", err)
		}
		var plan AllocationPlan
		if err := planItem.Value(func(v []byte) error {
			return json.Unmarshal(v, &plan)
		}); err != nil {
			return fmt.Errorf("failed to unmarshal plan: %v", err)
		}
		planLen = len(plan.Allocations)
	}

	if cursor >= planLen {
		if err := txn.Set(statusKey, []byte("completed")); err != nil {
			return fmt.Errorf("failed to write alloc status: %v", err)
		}
		rhp.Status = "completed"
		rhpBytes, _ := json.Marshal(rhp)
		if err := txn.Set([]byte("rhp_"+op.Stock), rhpBytes); err != nil {
			return fmt.Errorf("failed to write RHP on completion: %v", err)
		}
	} else {
		if err := txn.Set(statusKey, []byte("executing")); err != nil {
			return fmt.Errorf("failed to write alloc status: %v", err)
		}
	}

	return nil
}

func processValidatorJoin(txn *badger.Txn, tx Transaction, acc *Account) error {
	if acc.BalancePaise < tx.AmountPaise {
		return fmt.Errorf("insufficient balance for staking")
	}

	// lock stake
	acc.BalancePaise -= tx.AmountPaise
	acc.StakePaise += tx.AmountPaise
	acc.Role = "validator"
	acc.Nonce++

	//info
	info := ValidatorInfo{
		Address:      string(acc.Address),
		StakePaise:   acc.StakePaise,
		JoinedHeight: currentHeight.Load(),
		IsActive:     true,
	}

	buf, _ := json.Marshal(info)

	// register on chain
	if err := txn.Set([]byte("vreg_"+string(acc.Address)), buf); err != nil {
		return err
	}

	return updateAccount(txn, *acc)
}

func processValidatorExit(txn *badger.Txn, tx Transaction, acc *Account) error {
	if acc.StakePaise == 0 {
		return fmt.Errorf("not a validator")
	}

	acc.BalancePaise += acc.StakePaise
	acc.StakePaise = 0
	acc.Role = "user"
	acc.Nonce++

	key := []byte("vreg_" + string(acc.Address))

	item, err := txn.Get(key)
	if err != nil {
		return fmt.Errorf("not an active validator")
	}

	var info ValidatorInfo
	item.Value(func(v []byte) error {
		return json.Unmarshal(v, &info)
	})

	info.IsActive = false

	buf, _ := json.Marshal(info)

	// unregister
	if err := txn.Set(key, buf); err != nil {
		return err
	}

	return updateAccount(txn, *acc)
}

// -------------------------
// New TNX
// -------------------------

// isTradingMandated checks the DB for an active trading-halt mandate on stock.
func isTradingMandated(txn *badger.Txn, stock string) bool {
	key := "mandate_halt_" + stock
	_, err := txn.Get([]byte(key))
	return err == nil
}

// isAccountFrozen returns true if the account has an active freeze record.
func isAccountFrozen(txn *badger.Txn, addr Address) bool {
	_, err := txn.Get([]byte("freeze_" + string(addr)))
	return err == nil
}

// chargeGas deducts gas from sender, credits proposer. Returns error if insufficient.
func chargeGas(sender, proposer *Account, gas int64) error {
	avail := sender.BalancePaise - sender.BlockedPaise
	if avail < gas {
		return fmt.Errorf("insufficient balance for gas")
	}
	sender.BalancePaise -= gas
	proposer.BalancePaise += gas
	return nil
}

// ─── Company Transactions ────────────────────────────────────────────────────

// processUpdateRHP allows a company to amend RHP fields before bidding opens.
// Only fields present in meta["payload"] JSON are overwritten.
func processUpdateRHP(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "company" {
		return fmt.Errorf("only company can update RHP")
	}

	// Load existing RHP
	item, err := txn.Get([]byte("rhp_" + tx.Stock))
	if err != nil {
		return fmt.Errorf("RHP not found for stock %s — upload RHP first", tx.Stock)
	}
	var rhp RHPMetadata
	if err := item.Value(func(v []byte) error {
		return json.Unmarshal(v, &rhp)
	}); err != nil {
		return err
	}

	// Cannot amend once bidding is open or closed
	if rhp.Status == "bidding" || rhp.Status == "closed" || rhp.Status == "allocated" {
		return fmt.Errorf("cannot update RHP: IPO status is '%s'", rhp.Status)
	}

	// Ensure company owns this stock
	if rhp.CompanyAddr != "" && rhp.CompanyAddr != string(tx.From) {
		return fmt.Errorf("not the issuing company for stock %s", tx.Stock)
	}

	// Merge patch: only override fields present in payload
	var patch map[string]interface{}
	if err := json.Unmarshal([]byte(tx.Meta["payload"]), &patch); err != nil {
		return fmt.Errorf("invalid RHP patch JSON: %v", err)
	}

	// Re-serialise current RHP, apply patch, deserialise back (safe field-level merge)
	cur, _ := json.Marshal(rhp)
	var curMap map[string]interface{}
	json.Unmarshal(cur, &curMap)
	for k, v := range patch {
		curMap[k] = v
	}
	merged, _ := json.Marshal(curMap)
	if err := json.Unmarshal(merged, &rhp); err != nil {
		return fmt.Errorf("RHP patch produced invalid structure: %v", err)
	}

	// Re-validate key constraints
	if rhp.PriceBandUpper <= rhp.PriceBandLower {
		return fmt.Errorf("price band upper must be greater than lower")
	}
	if rhp.QIBPercentage+rhp.NIBPercentage+rhp.RetailPercentage != 100 {
		return fmt.Errorf("category percentages must sum to 100")
	}

	rhpBytes, _ := json.Marshal(rhp)
	if err := txn.Set([]byte("rhp_"+tx.Stock), rhpBytes); err != nil {
		return err
	}

	if err := chargeGas(senderAcc, proposerAcc, gas); err != nil {
		return err
	}
	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// processCancelIPO cancels an IPO before the bidding window opens.
func processCancelIPO(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "company" {
		return fmt.Errorf("only company can cancel IPO")
	}

	item, err := txn.Get([]byte("rhp_" + tx.Stock))
	if err != nil {
		return fmt.Errorf("RHP not found for stock %s", tx.Stock)
	}
	var rhp RHPMetadata
	if err := item.Value(func(v []byte) error { return json.Unmarshal(v, &rhp) }); err != nil {
		return err
	}

	if rhp.CompanyAddr != "" && rhp.CompanyAddr != string(tx.From) {
		return fmt.Errorf("not the issuing company for stock %s", tx.Stock)
	}
	if rhp.Status == "bidding" {
		return fmt.Errorf("cannot cancel: bidding window already open")
	}
	if rhp.Status == "closed" || rhp.Status == "allocated" {
		return fmt.Errorf("cannot cancel: IPO already %s", rhp.Status)
	}

	rhp.Status = "cancelled"
	rhpBytes, _ := json.Marshal(rhp)
	if err := txn.Set([]byte("rhp_"+tx.Stock), rhpBytes); err != nil {
		return err
	}

	if err := chargeGas(senderAcc, proposerAcc, gas); err != nil {
		return err
	}
	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// processCorporateAction records a stock split, buyback, or bonus share event.
// It stores the action on-chain; actual share adjustments may be handled by
// a subsequent allocation pass or off-chain engine depending on action type.
func processCorporateAction(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "company" {
		return fmt.Errorf("only company can issue corporate actions")
	}
	validActions := map[string]bool{"split": true, "buyback": true, "bonus": true}
	if !validActions[tx.ActionType] {
		return fmt.Errorf("invalid actionType: must be split, buyback, or bonus")
	}

	action := CorporateAction{
		ActionID:   fmt.Sprintf("ca_%s_%d", tx.Stock, tx.Timestamp),
		Stock:      tx.Stock,
		ActionType: tx.ActionType,
		Ratio:      tx.Ratio,
		Amount:     tx.AmountPaise,
		Announced:  currentHeight.Load(),
		Company:    string(tx.From),
	}
	b, _ := json.Marshal(action)
	key := fmt.Sprintf("corpaction_%s_%d", tx.Stock, tx.Timestamp)
	if err := txn.Set([]byte(key), b); err != nil {
		return err
	}

	if err := chargeGas(senderAcc, proposerAcc, gas); err != nil {
		return err
	}
	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// ─── User / Investor Transactions ────────────────────────────────────────────

// processTransferStock performs a P2P stock transfer between two whitelisted addresses.
func processTransferStock(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if isAccountFrozen(txn, tx.From) {
		return fmt.Errorf("sender account is frozen")
	}
	if isTradingMandated(txn, tx.Stock) {
		return fmt.Errorf("trading halted for %s by regulatory mandate", tx.Stock)
	}
	if senderAcc.Stocks == nil || senderAcc.Stocks[tx.Stock] < tx.Shares {
		return fmt.Errorf("insufficient stock: have %d shares of %s, need %d",
			senderAcc.Stocks[tx.Stock], tx.Stock, tx.Shares)
	}
	if err := chargeGas(senderAcc, proposerAcc, gas); err != nil {
		return err
	}

	receiver, err := getAccount(txn, tx.To)
	if err != nil {
		// Create bare account if not found (they must be whitelisted to receive)
		receiver = Account{Address: tx.To, Role: "user", Stocks: make(map[string]int64)}
	}
	if receiver.Stocks == nil {
		receiver.Stocks = make(map[string]int64)
	}

	senderAcc.Stocks[tx.Stock] -= tx.Shares
	receiver.Stocks[tx.Stock] += tx.Shares

	if err := updateAccount(txn, receiver); err != nil {
		return err
	}
	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// processSellStock places a sell on the secondary market.
// In this implementation a direct settlement model is used: the seller
// records the offer on-chain; a matching buy will clear it.
// NOTE: For a full order book, integrate a matching engine here.
func processSellStock(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if isAccountFrozen(txn, tx.From) {
		return fmt.Errorf("seller account is frozen")
	}
	if isTradingMandated(txn, tx.Stock) {
		return fmt.Errorf("trading halted for %s", tx.Stock)
	}
	if senderAcc.Stocks == nil || senderAcc.Stocks[tx.Stock] < tx.Shares {
		return fmt.Errorf("insufficient shares to sell: have %d, need %d",
			senderAcc.Stocks[tx.Stock], tx.Shares)
	}
	if err := chargeGas(senderAcc, proposerAcc, gas); err != nil {
		return err
	}

	// Lock shares while sell order is live
	senderAcc.Stocks[tx.Stock] -= tx.Shares
	// Store open sell order
	order := map[string]interface{}{
		"seller":     string(tx.From),
		"stock":      tx.Stock,
		"shares":     tx.Shares,
		"pricePaise": tx.PricePaise,
		"timestamp":  tx.Timestamp,
		"status":     "open",
	}
	b, _ := json.Marshal(order)
	orderKey := fmt.Sprintf("sellorder_%s_%s_%d", tx.Stock, tx.From, tx.Timestamp)
	if err := txn.Set([]byte(orderKey), b); err != nil {
		return err
	}

	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// processBuyStock settles a buy against the cheapest open sell order for the stock.
// If no sell order is available at or below PricePaise, the tx fails.
func processBuyStock(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if isAccountFrozen(txn, tx.From) {
		return fmt.Errorf("buyer account is frozen")
	}
	if isTradingMandated(txn, tx.Stock) {
		return fmt.Errorf("trading halted for %s", tx.Stock)
	}

	// Find the best (cheapest) open sell order
	type sellOrder struct {
		Key        string
		Seller     string
		Shares     int64
		PricePaise int64
	}
	var best *sellOrder
	prefix := []byte("sellorder_" + tx.Stock + "_")
	iteratePrefix(txn, prefix, func(k, v []byte) error {
		var o map[string]interface{}
		if json.Unmarshal(v, &o) != nil {
			return nil
		}
		if o["status"] != "open" {
			return nil
		}
		p := int64(o["pricePaise"].(float64))
		s := int64(o["shares"].(float64))
		if p <= tx.PricePaise && s >= tx.Shares {
			if best == nil || p < best.PricePaise {
				best = &sellOrder{
					Key:        string(k),
					Seller:     o["seller"].(string),
					Shares:     s,
					PricePaise: p,
				}
			}
		}
		return nil
	})

	if best == nil {
		return fmt.Errorf("no open sell order for %s at or below %d paise/share",
			tx.Stock, tx.PricePaise)
	}

	cost := best.PricePaise * tx.Shares
	total := cost + gas
	avail := senderAcc.BalancePaise - senderAcc.BlockedPaise
	if avail < total {
		return fmt.Errorf("insufficient balance: need %d paise, have %d available", total, avail)
	}

	// Credit seller
	seller, err := getAccount(txn, Address(best.Seller))
	if err != nil {
		return fmt.Errorf("seller account not found: %v", err)
	}
	seller.BalancePaise += cost
	if err := updateAccount(txn, seller); err != nil {
		return err
	}

	// Debit buyer, credit shares
	senderAcc.BalancePaise -= total
	proposerAcc.BalancePaise += gas
	if senderAcc.Stocks == nil {
		senderAcc.Stocks = make(map[string]int64)
	}
	senderAcc.Stocks[tx.Stock] += tx.Shares

	// Update or close the sell order
	var orderData map[string]interface{}
	item, _ := txn.Get([]byte(best.Key))
	item.Value(func(v []byte) error { return json.Unmarshal(v, &orderData) })
	remaining := best.Shares - tx.Shares
	if remaining <= 0 {
		orderData["status"] = "filled"
	} else {
		orderData["shares"] = remaining
	}
	b, _ := json.Marshal(orderData)
	if err := txn.Set([]byte(best.Key), b); err != nil {
		return err
	}

	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// ─── Regulator Transactions ───────────────────────────────────────────────────

// processRejectDRHP formally rejects a DRHP on-chain with a reason code.
func processRejectDRHP(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "regulator" {
		return fmt.Errorf("only regulator can reject DRHP")
	}
	// Confirm DRHP exists
	if _, err := txn.Get([]byte("drhp_" + tx.Stock)); err != nil {
		return fmt.Errorf("no DRHP found for stock %s", tx.Stock)
	}

	type DRHPRejection struct {
		Stock      string `json:"stock"`
		RejectedBy string `json:"rejectedBy"`
		Reason     string `json:"reason"`
		Height     uint64 `json:"height"`
	}
	rej := DRHPRejection{
		Stock:      tx.Stock,
		RejectedBy: string(tx.From),
		Reason:     tx.Reason,
		Height:     currentHeight.Load(),
	}
	b, _ := json.Marshal(rej)
	if err := txn.Set([]byte("drhp_rejected_"+tx.Stock), b); err != nil {
		return err
	}

	// If there is an RHP in pending state, also mark it
	if item, err := txn.Get([]byte("rhp_" + tx.Stock)); err == nil {
		var rhp RHPMetadata
		item.Value(func(v []byte) error { return json.Unmarshal(v, &rhp) })
		if rhp.Status == "pending" {
			rhp.Status = "drhp_rejected"
			rhpBytes, _ := json.Marshal(rhp)
			txn.Set([]byte("rhp_"+tx.Stock), rhpBytes)
		}
	}

	if err := chargeGas(senderAcc, proposerAcc, gas); err != nil {
		return err
	}
	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// processFreezeAccount freezes all outgoing transactions for a target address.
func processFreezeAccount(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "regulator" {
		return fmt.Errorf("only regulator can freeze accounts")
	}
	type FreezeRecord struct {
		Address  string `json:"address"`
		Reason   string `json:"reason"`
		FrozenBy string `json:"frozenBy"`
		Height   uint64 `json:"height"`
	}
	rec := FreezeRecord{
		Address:  string(tx.To),
		Reason:   tx.Reason,
		FrozenBy: string(tx.From),
		Height:   currentHeight.Load(),
	}
	b, _ := json.Marshal(rec)
	if err := txn.Set([]byte("freeze_"+string(tx.To)), b); err != nil {
		return err
	}
	if err := chargeGas(senderAcc, proposerAcc, gas); err != nil {
		return err
	}
	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// processUnfreezeAccount lifts a freeze from a previously frozen account.
func processUnfreezeAccount(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "regulator" {
		return fmt.Errorf("only regulator can unfreeze accounts")
	}
	if err := txn.Delete([]byte("freeze_" + string(tx.To))); err != nil {
		return fmt.Errorf("account %s is not frozen", tx.To)
	}
	if err := chargeGas(senderAcc, proposerAcc, gas); err != nil {
		return err
	}
	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// processFlagAccount flags an account for investigation (visible on-chain, non-blocking).
func processFlagAccount(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "regulator" {
		return fmt.Errorf("only regulator can flag accounts")
	}
	flag := FlaggedAccount{
		Address:   string(tx.To),
		Reason:    tx.Reason,
		FlaggedBy: string(tx.From),
		Height:    currentHeight.Load(),
		Active:    true,
	}
	b, _ := json.Marshal(flag)
	if err := txn.Set([]byte("flag_"+string(tx.To)), b); err != nil {
		return err
	}
	if err := chargeGas(senderAcc, proposerAcc, gas); err != nil {
		return err
	}
	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// processMandate issues a regulatory mandate (trading halt, audit order, etc.).
// Trading halt: MandateType="trading_halt", Stock field = symbol to halt.
// Other types: stored as general mandate records.
func processMandate(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.Role != "regulator" {
		return fmt.Errorf("only regulator can issue mandates")
	}

	mandateID := fmt.Sprintf("mandate_%s_%d", tx.MandateType, tx.Timestamp)
	mandate := Mandate{
		MandateID:   mandateID,
		Issuer:      string(tx.From),
		Target:      tx.Stock, // stock symbol for trading_halt, or address for others
		MandateType: tx.MandateType,
		Reason:      tx.Reason,
		Active:      true,
		Height:      currentHeight.Load(),
	}
	if tx.Meta != nil {
		if exp, ok := tx.Meta["expiresAt"]; ok {
			expVal, _ := strconv.ParseUint(exp, 10, 64)
			mandate.ExpiresAt = expVal
		}
	}

	b, _ := json.Marshal(mandate)
	if err := txn.Set([]byte(mandateID), b); err != nil {
		return err
	}

	// For trading_halt, write a fast-check key used by isTradingMandated()
	if tx.MandateType == "trading_halt" && tx.Stock != "" {
		if err := txn.Set([]byte("mandate_halt_"+tx.Stock), []byte(mandateID)); err != nil {
			return err
		}
	}

	if err := chargeGas(senderAcc, proposerAcc, gas); err != nil {
		return err
	}
	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// ─── Validator Transactions ───────────────────────────────────────────────────

// processUpdateStake lets a validator top up (AmountPaise > 0) or reduce (< 0) stake
// without a full VALIDATOR_EXIT + VALIDATOR_JOIN cycle.
func processUpdateStake(txn *badger.Txn, tx Transaction, acc *Account) error {
	if acc.StakePaise == 0 {
		return fmt.Errorf("not an active validator; use VALIDATOR_JOIN first")
	}

	if tx.AmountPaise > 0 {
		// Top up
		if acc.BalancePaise < tx.AmountPaise {
			return fmt.Errorf("insufficient balance for stake top-up")
		}
		acc.BalancePaise -= tx.AmountPaise
		acc.StakePaise += tx.AmountPaise
	} else {
		// Reduce (AmountPaise is negative, so add to get reduction amount)
		reduce := -tx.AmountPaise
		if acc.StakePaise-reduce < genesisConfig.MinStakePaise {
			return fmt.Errorf("cannot reduce below minimum stake of %d paise", genesisConfig.MinStakePaise)
		}
		acc.StakePaise -= reduce
		acc.BalancePaise += reduce
	}

	// Update validator registry entry
	item, err := txn.Get([]byte("vreg_" + string(acc.Address)))
	if err != nil {
		return fmt.Errorf("validator registration not found")
	}
	var info ValidatorInfo
	item.Value(func(v []byte) error { return json.Unmarshal(v, &info) })
	info.StakePaise = acc.StakePaise

	buf, _ := json.Marshal(info)
	if err := txn.Set([]byte("vreg_"+string(acc.Address)), buf); err != nil {
		return err
	}

	acc.Nonce++
	return updateAccount(txn, *acc)
}

// processSlashProposal records a slash proposal against a misbehaving validator.
func processSlashProposal(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.StakePaise == 0 {
		return fmt.Errorf("only active validators can propose slashes")
	}

	// Confirm target is an active validator
	if _, err := txn.Get([]byte("vreg_" + string(tx.To))); err != nil {
		return fmt.Errorf("target %s is not a registered validator", tx.To)
	}

	proposal := SlashProposal{
		ProposalID: fmt.Sprintf("slash_%s_%d", tx.To, tx.Timestamp),
		Target:     string(tx.To),
		Proposer:   string(tx.From),
		Reason:     tx.Reason,
		SlashPaise: tx.AmountPaise,
		Votes:      []string{string(tx.From)}, // proposer auto-votes yes
		Status:     "pending",
		Height:     currentHeight.Load(),
	}
	b, _ := json.Marshal(proposal)
	if err := txn.Set([]byte(proposal.ProposalID), b); err != nil {
		return err
	}

	if err := chargeGas(senderAcc, proposerAcc, gas); err != nil {
		return err
	}
	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// processVoteSlash casts a vote on an active slash proposal.
// If 2/3+ of active validators have voted yes, the slash is executed immediately.
func processVoteSlash(txn *badger.Txn, tx Transaction, senderAcc, proposerAcc *Account, gas int64) error {
	if senderAcc.StakePaise == 0 {
		return fmt.Errorf("only active validators can vote on slash proposals")
	}

	item, err := txn.Get([]byte(tx.ProposalID))
	if err != nil {
		return fmt.Errorf("slash proposal %s not found", tx.ProposalID)
	}
	var proposal SlashProposal
	if err := item.Value(func(v []byte) error { return json.Unmarshal(v, &proposal) }); err != nil {
		return err
	}
	if proposal.Status != "pending" {
		return fmt.Errorf("proposal %s is already %s", tx.ProposalID, proposal.Status)
	}

	// Check not double-voting
	for _, v := range proposal.Votes {
		if v == string(tx.From) {
			return fmt.Errorf("already voted on proposal %s", tx.ProposalID)
		}
	}
	proposal.Votes = append(proposal.Votes, string(tx.From))

	// Count active validators for quorum
	var totalValidators int64
	iteratePrefix(txn, []byte("vreg_"), func(k, v []byte) error {
		var info ValidatorInfo
		if json.Unmarshal(v, &info) == nil && info.IsActive {
			totalValidators++
		}
		return nil
	})

	// 2/3 supermajority required
	if totalValidators > 0 && int64(len(proposal.Votes))*3 >= totalValidators*2 {
		proposal.Status = "approved"
		// Execute slash: deduct from target validator's stake
		targetAcc, err := getAccount(txn, Address(proposal.Target))
		if err == nil {
			slash := proposal.SlashPaise
			if slash > targetAcc.StakePaise {
				slash = targetAcc.StakePaise
			}
			targetAcc.StakePaise -= slash
			if targetAcc.StakePaise < genesisConfig.MinStakePaise {
				targetAcc.Role = "user"
				// Deactivate in vreg
				if vitem, verr := txn.Get([]byte("vreg_" + proposal.Target)); verr == nil {
					var info ValidatorInfo
					vitem.Value(func(v []byte) error { return json.Unmarshal(v, &info) })
					info.IsActive = false
					info.StakePaise = targetAcc.StakePaise
					buf, _ := json.Marshal(info)
					txn.Set([]byte("vreg_"+proposal.Target), buf)
				}
			}
			updateAccount(txn, targetAcc)
		}
	}

	b, _ := json.Marshal(proposal)
	if err := txn.Set([]byte(tx.ProposalID), b); err != nil {
		return err
	}

	if err := chargeGas(senderAcc, proposerAcc, gas); err != nil {
		return err
	}
	senderAcc.Nonce++
	return updateAccount(txn, *senderAcc)
}

// IPO allocation engine

// -------------------------
// IPO orderbook + cutoff
// -------------------------

// -------------------------
// Accounts
// -------------------------

func getAccount(txn *badger.Txn, address Address) (Account, error) {
	var acc Account
	item, err := txn.Get([]byte("account_" + string(address)))
	if err != nil {
		return acc, err
	}
	err = item.Value(func(val []byte) error {
		return json.Unmarshal(val, &acc)
	})
	if acc.Stocks == nil {
		acc.Stocks = make(map[string]int64)
	}
	return acc, err
}

func updateAccount(txn *badger.Txn, acc Account) error {
	if acc.Stocks == nil {
		acc.Stocks = make(map[string]int64)
	}
	b, err := json.Marshal(acc)
	if err != nil {
		return err
	}
	return txn.Set([]byte("account_"+string(acc.Address)), b)
}

// -------------------------
// State Snapshot Management
// -------------------------

func startSnapshotManager() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		height := getChainHeight()

		// Verify block exists before snapshot
		if !hasBlock(height) {
			continue
		}

		if height-lastSnapshotHeight >= SnapshotInterval {
			syncLog.Printf("📸 Creating snapshot at height %d", height)
			createSnapshot(height)
			lastSnapshotHeight = height
		}

		cleanSnapshotCache()
	}
}

func createSnapshot(height uint64) {
	var snapshot StateSnapshot
	err := db.Update(func(txn *badger.Txn) error {
		return createStateSnapshotAtHeight(txn, height, &snapshot)
	})

	if err != nil {
		syncLog.Printf("❌ Failed to create snapshot at height %d: %v", height, err)
		return
	}

	// Cache snapshot
	snapshotBytes, _ := json.Marshal(snapshot)
	snapshotKey := fmt.Sprintf("snapshot_%d", height)

	snapshotMutex.Lock()
	snapshotCache[snapshotKey] = snapshotBytes
	snapshotMutex.Unlock()

	// Save to file
	snapshotFile := filepath.Join(dataDir, "snapshots", fmt.Sprintf("snapshot_%d.json", height))
	os.WriteFile(snapshotFile, snapshotBytes, 0644)

	syncLog.Printf("✅ Created snapshot at height %d", height)
}

func createStateSnapshot(txn *badger.Txn, height uint64) error {
	var snapshot StateSnapshot
	return createStateSnapshotAtHeight(txn, height, &snapshot)
}

func createStateSnapshotAtHeight(txn *badger.Txn, height uint64, snapshot *StateSnapshot) error {
	var blocks []Block

	// Load all blocks
	for i := uint64(0); i <= height; i++ {
		key := fmt.Sprintf("block_%d", i)
		item, err := txn.Get([]byte(key))
		if err != nil {
			return fmt.Errorf("snapshot missing block %s: %v", key, err)
		}

		var blk Block
		if err := item.Value(func(v []byte) error {
			return json.Unmarshal(v, &blk)
		}); err != nil {
			return fmt.Errorf("failed to unmarshal block %d: %v", i, err)
		}

		if blk.Header.Height != i {
			return fmt.Errorf("snapshot chain corruption at height %d", i)
		}

		blocks = append(blocks, blk)
	}

	// Accounts
	accounts := make(map[string]Account)
	{
		it := txn.NewIterator(badger.DefaultIteratorOptions)
		defer it.Close()
		for it.Seek([]byte("account_")); it.ValidForPrefix([]byte("account_")); it.Next() {
			var acc Account
			if err := it.Item().Value(func(v []byte) error {
				return json.Unmarshal(v, &acc)
			}); err != nil {
				continue // skip corrupt account
			}
			accounts[string(acc.Address)] = acc
		}
	}

	// Validators
	var validators []ValidatorInfo
	{
		it := txn.NewIterator(badger.DefaultIteratorOptions)
		defer it.Close()
		for it.Seek([]byte(ValidatorRegistryPrefix)); it.ValidForPrefix([]byte(ValidatorRegistryPrefix)); it.Next() {
			var val ValidatorInfo
			if err := it.Item().Value(func(v []byte) error {
				return json.Unmarshal(v, &val)
			}); err != nil {
				continue
			}
			if val.IsActive {
				validators = append(validators, val)
			}
		}
	}
	sort.Slice(validators, func(i, j int) bool {
		return validators[i].Address < validators[j].Address
	})

	// RHPMetadata
	var rhpList []RHPMetadata
	{
		it := txn.NewIterator(badger.DefaultIteratorOptions)
		defer it.Close()
		for it.Seek([]byte("rhp_")); it.ValidForPrefix([]byte("rhp_")); it.Next() {
			var r RHPMetadata
			if err := it.Item().Value(func(v []byte) error {
				return json.Unmarshal(v, &r)
			}); err != nil {
				continue
			}
			rhpList = append(rhpList, r)
		}
	}

	// AllocationPlans
	var planList []AllocationPlan
	{
		it := txn.NewIterator(badger.DefaultIteratorOptions)
		defer it.Close()
		for it.Seek([]byte("alloc_plan_")); it.ValidForPrefix([]byte("alloc_plan_")); it.Next() {
			var p AllocationPlan
			if err := it.Item().Value(func(v []byte) error {
				return json.Unmarshal(v, &p)
			}); err != nil {
				continue
			}
			planList = append(planList, p)
		}
	}

	// Final snapshot build
	snapshot.Height = height
	snapshot.Blocks = blocks
	if len(blocks) > 0 {
		snapshot.BlockHash = blocks[len(blocks)-1].BlockHash
		snapshot.Timestamp = blocks[len(blocks)-1].Header.Timestamp
	}

	var accountList []Account
	for _, a := range accounts {
		accountList = append(accountList, a)
	}
	snapshot.Accounts = accountList
	snapshot.Validators = validators
	snapshot.RHPMetadata = rhpList
	snapshot.AllocationPlans = planList

	return nil
}

func applyStateSnapshot(snapshot StateSnapshot) error {
	return db.Update(func(txn *badger.Txn) error {
		syncLog.Println("=======================================")
		syncLog.Println("APPLYING STATE SNAPSHOT")
		syncLog.Println("=======================================")

		if len(snapshot.Blocks) == 0 {
			return fmt.Errorf("empty snapshot — refusing to apply")
		}

		syncLog.Println("🔍 PRE-SNAPSHOT BLOCK AUDIT")
		itAudit := txn.NewIterator(badger.DefaultIteratorOptions)
		for itAudit.Seek([]byte("block_")); itAudit.ValidForPrefix([]byte("block_")); itAudit.Next() {
			syncLog.Printf("  PRE HAS %s", string(itAudit.Item().Key()))
		}
		itAudit.Close()

		syncLog.Printf("🔄 Applying snapshot at height %d", snapshot.Height)

		// WIPE old data
		for _, prefix := range [][]byte{
			[]byte("block_"),
			[]byte("block_by_hash_"),
			[]byte(ValidatorRegistryPrefix),
			[]byte("rhp_"),
			[]byte("alloc_plan_"),
		} {
			it := txn.NewIterator(badger.DefaultIteratorOptions)
			for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
				txn.Delete(it.Item().Key())
			}
			it.Close()
		}

		// Restore blocks
		for _, b := range snapshot.Blocks {
			buf, err := json.Marshal(b)
			if err != nil {
				return err
			}
			key := fmt.Sprintf("block_%d", b.Header.Height)
			if err := txn.Set([]byte(key), buf); err != nil {
				return err
			}

			hashKey := fmt.Sprintf("block_by_hash_%s", b.BlockHash)
			if err := txn.Set([]byte(hashKey), []byte(strconv.FormatUint(b.Header.Height, 10))); err != nil {
				return err
			}
		}

		// Restore accounts
		for _, acc := range snapshot.Accounts {
			updateAccount(txn, acc)
		}

		// Restore validators
		for _, v := range snapshot.Validators {
			buf, _ := json.Marshal(v)
			txn.Set([]byte(ValidatorRegistryPrefix+v.Address), buf)
			txn.Set([]byte("active_validator_"+v.Address), []byte("1"))
		}

		// Restore RHPMetadata
		for _, r := range snapshot.RHPMetadata {
			b, err := json.Marshal(r)
			if err != nil {
				return err
			}
			txn.Set([]byte("rhp_"+r.Stock), b)
		}

		// Restore AllocationPlans
		for _, p := range snapshot.AllocationPlans {
			b, err := json.Marshal(p)
			if err != nil {
				return err
			}
			txn.Set([]byte("alloc_plan_"+p.Stock), b)
		}

		// Set head
		head := snapshot.Blocks[len(snapshot.Blocks)-1]
		txn.Set([]byte("head_block"), []byte(head.BlockHash))
		txn.Set([]byte("current_height"), []byte(strconv.FormatUint(snapshot.Height, 10)))

		syncLog.Printf("✅ SNAPSHOT REBUILD COMPLETE — HEAD RESET TO %d", snapshot.Height)

		// POST audit
		syncLog.Println("🔍 POST-SNAPSHOT BLOCK AUDIT")
		itAudit = txn.NewIterator(badger.DefaultIteratorOptions)
		for itAudit.Seek([]byte("block_")); itAudit.ValidForPrefix([]byte("block_")); itAudit.Next() {
			syncLog.Printf("  POST HAS %s", string(itAudit.Item().Key()))
		}
		itAudit.Close()

		// State root verification
		computed := computeStateRoot(txn)
		expected := snapshot.Blocks[len(snapshot.Blocks)-1].Header.StateRoot

		if expected != "" && computed != expected {
			return fmt.Errorf("SNAPSHOT STATE ROOT MISMATCH expected=%s computed=%s",
				short(expected), short(computed))
		}

		syncLog.Printf("✅ SNAPSHOT STATE ROOT VERIFIED %s", short(computed))
		syncLog.Println("=======================================")
		syncLog.Println("SNAPSHOT APPLICATION COMPLETE")
		syncLog.Println("=======================================")

		return nil
	})
}

func cleanSnapshotCache() {
	snapshotMutex.Lock()
	defer snapshotMutex.Unlock()

	currentHeight := getChainHeight()
	keepHeight := currentHeight - (SnapshotInterval * 10) // Keep last 10 snapshots

	for key := range snapshotCache {
		parts := strings.Split(key, "_")
		if len(parts) != 2 {
			delete(snapshotCache, key)
			continue
		}

		height, err := strconv.ParseUint(parts[1], 10, 64)
		if err != nil || height < keepHeight {
			delete(snapshotCache, key)
		}
	}
}

// processBlocksFromQueue is the single point of truth for applying blocks.
// All paths (P2P, consensus, sync) now send here.
func processBlocksFromQueue() {
	for block := range blockQueue {
		height := block.Header.Height

		// Early rejection (same as before)
		if height <= getChainHeight() && hasBlock(height) {
			continue
		}

		if err := processBlock(*block); err != nil {
			networkLog.Printf("❌ Failed to process block %d from queue: %v", height, err)

			// Optional: trigger snapshot recovery on root mismatch
			if strings.Contains(err.Error(), "ROOT MISMATCH") ||
				strings.Contains(err.Error(), "empty state") {
				// You can broadcast a request or handle per-peer
			}
		} else {
			blocksSynced.Add(1)
			networkLog.Printf("✅ Applied block %d from queue", height)

			// Only broadcast if we are fully synced (prevents storms)
			syncMutex.Lock()
			syncing := isSyncing
			syncMutex.Unlock()
			if !syncing {
				broadcastBlock(*block)
			}
			if block.Header.Proposer == nodeAddress {
				lastProposedSlot = height
			}
		}
	}
}

// -------------------------
// RPC Server
// -------------------------

func startRPCServer(addr string) {
	r := mux.NewRouter()

	// Public endpoints
	r.HandleFunc("/status", handleStatus).Methods("GET")
	r.HandleFunc("/metrics", handleMetrics).Methods("GET")
	r.HandleFunc("/network", handleNetworkInfo).Methods("GET")
	r.HandleFunc("/validators", handleValidators).Methods("GET")

	// Protected endpoints
	api := r.PathPrefix("/api").Subrouter()
	api.Use(authMiddleware)
	api.HandleFunc("/peers", handleAPIPeers).Methods("GET")
	api.HandleFunc("/latest", handleAPILatest).Methods("GET")
	api.HandleFunc("/block/{height}", handleAPIGetBlock).Methods("GET")
	api.HandleFunc("/submitTx", handleAPISubmitTx).Methods("POST")
	api.HandleFunc("/balance/{address}", handleAPIBalance).Methods("GET")
	api.HandleFunc("/mempool", handleAPIMempool).Methods("GET")
	api.HandleFunc("/proposer", handleAPIProposer).Methods("GET")
	api.HandleFunc("/snapshot/{height}", handleAPISnapshot).Methods("GET")
	api.HandleFunc("/chain", handleAPIChain).Methods("GET")

	// ── All-roles authenticated endpoints ──────────────────────────────────────
	// IMPORTANT: Literal routes (/ipo/active, /ipo/all, /rhp/all) must be
	// registered BEFORE wildcard routes (/ipo/{stock}, /rhp/{stock}/status)
	// on the SAME subrouter so gorilla mux matches them correctly.
	api.HandleFunc("/ipo/active", handleAPIIPOActive).Methods("GET")
	api.HandleFunc("/ipo/all", handleAPIIPOAll).Methods("GET")        // literal before wildcard
	api.HandleFunc("/ipo/{stock}", handleAPIIPODetail).Methods("GET") // wildcard after
	api.HandleFunc("/account/txhistory/{address}", handleAPITxHistory).Methods("GET")
	api.HandleFunc("/stocks/portfolio/{address}", handleAPIPortfolio).Methods("GET")
	api.HandleFunc("/stocks/price/{stock}", handleAPIStockPrice).Methods("GET")
	api.HandleFunc("/allocation/{stock}", handleAPIAllocation).Methods("GET")
	api.HandleFunc("/dividend/{stock}", handleAPIDividend).Methods("GET")

	// RHP/DRHP endpoints — accessible by all authenticated roles ──────────────
	api.HandleFunc("/rhp/all", handleAPIRHPAll).Methods("GET")               // literal
	api.HandleFunc("/rhp/pending", handleAPIRHPPending).Methods("GET")       // literal
	api.HandleFunc("/drhp/pending", handleAPIDRHPPending).Methods("GET")     // literal
	api.HandleFunc("/rhp/{stock}/status", handleAPIRHPStatus).Methods("GET") // wildcard

	// Company + Regulator endpoints ────────────────────────────────────────────
	corpReg := r.PathPrefix("/api").Subrouter()
	corpReg.Use(authMiddleware)
	corpReg.Use(roleMiddleware("company", "regulator"))
	corpReg.HandleFunc("/ipo-live/{stock}", handleAPIIPOLive).Methods("GET")
	corpReg.HandleFunc("/ipo/{stock}/bids", handleAPIIPOBids).Methods("GET")
	corpReg.HandleFunc("/stocks/holders/{stock}", handleAPIStockHolders).Methods("GET")

	// Regulator-only endpoints ─────────────────────────────────────────────────
	reg := r.PathPrefix("/api").Subrouter()
	reg.Use(authMiddleware)
	reg.Use(roleMiddleware("regulator"))
	reg.HandleFunc("/contracts", handleAPIContracts).Methods("GET")
	reg.HandleFunc("/frozen-accounts", handleAPIFrozenAccounts).Methods("GET")
	reg.HandleFunc("/audit/{address}", handleAPIAudit).Methods("GET")
	reg.HandleFunc("/mandate/active", handleAPIMandates).Methods("GET")
	reg.HandleFunc("/stocks/holders/{stock}", handleAPIStockHolders).Methods("GET")
	reg.HandleFunc("/account/txhistory/{address}", handleAPITxHistory).Methods("GET")

	// Validator endpoints ───────────────────────────────────────────────────────
	api.HandleFunc("/validator/{address}/score", handleAPIValidatorScore).Methods("GET")
	api.HandleFunc("/validator/{address}/history", handleAPIValidatorHistory).Methods("GET")
	api.HandleFunc("/slash/proposals", handleAPISlashProposals).Methods("GET")
	api.HandleFunc("/stake/rewards/{address}", handleAPIStakeRewards).Methods("GET")

	protocolLog.Printf("🌐 RPC listening on %s", addr)
	// log.Fatal(http.ListenAndServe(addr, r))
	log.Fatal(http.ListenAndServe(addr, enableCORS(r)))
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	height := getChainHeight()
	headHash := getBlockHash(height)

	status := map[string]interface{}{
		"nodeId":       nodeAddress,
		"role":         nodeRole,
		"height":       height,
		"headHash":     headHash,
		"peers":        peerCount.Load(),
		"mempool":      mempoolSize.Load(),
		"uptime":       time.Since(genesisTime).String(),
		"blocksSynced": blocksSynced.Load(),
		"txsProcessed": txsProcessed.Load(),
		"emptySlots":   emptySlots.Load(),
		"publicAddr":   publicAddr,
		"listenAddr":   p2pListenAddr,
		"genesisTime":  genesisTime.Unix(),
		"genesisHash":  genesisConfig.GenesisHash,
		"chainId":      genesisConfig.ChainID,
		"isSyncing":    isSyncing,
		"syncHeight":   syncTargetHeight.Load(),
	}
	json.NewEncoder(w).Encode(status)
}

func handleMetrics(w http.ResponseWriter, r *http.Request) {
	metrics := map[string]interface{}{
		"bytes_in":            bytesIn.Load(),
		"bytes_out":           bytesOut.Load(),
		"peer_count":          peerCount.Load(),
		"mempool_size":        mempoolSize.Load(),
		"blocks_synced":       blocksSynced.Load(),
		"current_height":      getChainHeight(),
		"last_proposed":       lastProposedSlot,
		"empty_slots":         emptySlots.Load(),
		"txs_processed":       txsProcessed.Load(),
		"validator_rotations": validatorRotations.Load(),
		"snapshots_cached":    len(snapshotCache),
	}
	json.NewEncoder(w).Encode(metrics)
}

func handleNetworkInfo(w http.ResponseWriter, r *http.Request) {
	peersMutex.RLock()
	peerList := make([]map[string]interface{}, 0, len(peers))
	for _, peer := range peers {
		peerList = append(peerList, map[string]interface{}{
			"nodeId":   peer.NodeID,
			"address":  peer.Address,
			"height":   peer.Height,
			"headHash": peer.HeadHash,
			"lastSeen": peer.LastSeen,
		})
	}
	peersMutex.RUnlock()

	validators, _ := getActiveValidators()

	info := map[string]interface{}{
		"totalPeers":       len(peerList),
		"peers":            peerList,
		"activeValidators": len(validators),
		"validators":       validators,
		"bootstrapNodes":   bootstrapAddrs,
		"networkId":        genesisConfig.ChainID,
	}
	json.NewEncoder(w).Encode(info)
}

func handleValidators(w http.ResponseWriter, r *http.Request) {
	validators, err := getActiveValidators()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Get next proposer
	nextHeight := getChainHeight() + 1
	nextProposer, _ := getValidatorByHeight(nextHeight, 0)

	response := map[string]interface{}{
		"validators":      validators,
		"total":           len(validators),
		"minStake":        genesisConfig.MinStakePaise,
		"nextHeight":      nextHeight,
		"nextProposer":    nextProposer,
		"currentProposer": currentProposer,
	}
	json.NewEncoder(w).Encode(response)
}

func handleAPIPeers(w http.ResponseWriter, r *http.Request) {
	peersMutex.RLock()
	addrs := make([]string, 0, len(peers))
	for _, p := range peers {
		if p.Address != "" {
			addrs = append(addrs, p.Address)
		}
	}
	peersMutex.RUnlock()
	json.NewEncoder(w).Encode(addrs)
}

func handleAPILatest(w http.ResponseWriter, r *http.Request) {
	height := getChainHeight()
	var block Block
	err := db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(fmt.Sprintf("block_%d", height)))
		if err != nil {
			return err
		}
		return item.Value(func(v []byte) error {
			return json.Unmarshal(v, &block)
		})
	})
	if err != nil {
		http.Error(w, "block not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(block)
}

func handleAPIGetBlock(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	heightStr := vars["height"]
	height, err := strconv.ParseUint(heightStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid height", http.StatusBadRequest)
		return
	}

	var data []byte
	err = db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(fmt.Sprintf("block_%d", height)))
		if err != nil {
			return err
		}
		return item.Value(func(v []byte) error {
			data = append([]byte{}, v...)
			return nil
		})
	})
	if err != nil {
		http.Error(w, "block not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func handleAPISubmitTx(w http.ResponseWriter, r *http.Request) {
	var tx Transaction
	if err := json.NewDecoder(r.Body).Decode(&tx); err != nil {
		http.Error(w, "invalid tx json", http.StatusBadRequest)
		return
	}

	// Set timestamp if not provided
	if tx.Timestamp == 0 {
		tx.Timestamp = time.Now().Unix()
	}

	if err := verifyTransaction(tx); err != nil {
		http.Error(w, "tx verification failed: "+err.Error(), http.StatusBadRequest)
		return
	}

	addTransactionToMempool(tx)

	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{
		"status": "accepted",
		"txHash": computeTxHash(tx),
	})
}

func handleAPIBalance(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	addr := Address(vars["address"])
	var acc Account
	err := db.View(func(txn *badger.Txn) error {
		a, err := getAccount(txn, addr)
		if err != nil {
			return err
		}
		acc = a
		return nil
	})
	if err != nil {
		http.Error(w, "account not found", http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(acc)
}

func handleAPIMempool(w http.ResponseWriter, r *http.Request) {
	mempoolMutex.RLock()
	txs := make([]Transaction, 0, len(mempool))
	for _, tx := range mempool {
		txs = append(txs, tx)
	}
	mempoolMutex.RUnlock()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"count":        len(txs),
		"transactions": txs,
	})
}

func handleAPIProposer(w http.ResponseWriter, r *http.Request) {
	height := getChainHeight()
	nextHeight := height + 1

	nextProposer, err := getValidatorByHeight(nextHeight, 0)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"currentHeight":    height,
		"nextHeight":       nextHeight,
		"nextProposer":     nextProposer,
		"nextProposerTime": nextProposerTime,
		"isUs":             nextProposer == nodeAddress,
		"ourRole":          nodeRole,
	}
	json.NewEncoder(w).Encode(response)
}

func handleAPISnapshot(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	heightStr := vars["height"]
	height, err := strconv.ParseUint(heightStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid height", http.StatusBadRequest)
		return
	}

	// Try cache first
	snapshotMutex.RLock()
	cached, ok := snapshotCache[fmt.Sprintf("snapshot_%d", height)]
	snapshotMutex.RUnlock()

	if ok {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}

	// Generate snapshot
	var snapshot StateSnapshot
	err = db.View(func(txn *badger.Txn) error {
		return createStateSnapshotAtHeight(txn, height, &snapshot)
	})

	if err != nil {
		http.Error(w, "snapshot not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(snapshot)
}

func handleAPIChain(w http.ResponseWriter, r *http.Request) {
	height := getChainHeight()

	// Get last 10 blocks
	var blocks []Block
	for i := height; i > 0 && i > height-10; i-- {
		var block Block
		err := db.View(func(txn *badger.Txn) error {
			item, err := txn.Get([]byte(fmt.Sprintf("block_%d", i)))
			if err != nil {
				return err
			}
			return item.Value(func(v []byte) error {
				return json.Unmarshal(v, &block)
			})
		})
		if err == nil {
			blocks = append(blocks, block)
		}
	}

	response := map[string]interface{}{
		"height":      height,
		"blocks":      blocks,
		"totalBlocks": height + 1,
	}
	json.NewEncoder(w).Encode(response)
}

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if apiKey == "" {
			next.ServeHTTP(w, r)
			return
		}
		key := r.Header.Get("X-API-Key")
		if key != apiKey {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func enableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-API-Key, X-Caller-Address")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// ─── roleMiddleware  ───────────────────────
func roleMiddleware(roles ...string) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			callerAddr := r.Header.Get("X-Caller-Address")
			if callerAddr == "" {
				http.Error(w, "X-Caller-Address header required", http.StatusUnauthorized)
				return
			}
			callerRole := ""
			db.View(func(txn *badger.Txn) error {
				acc, err := getAccount(txn, Address(callerAddr))
				if err == nil {
					callerRole = acc.Role
				}
				return nil
			})
			for _, allowed := range roles {
				if callerRole == allowed {
					next.ServeHTTP(w, r)
					return
				}
			}
			http.Error(w, fmt.Sprintf("forbidden: requires role %v, caller has '%s'", roles, callerRole), http.StatusForbidden)
		})
	}
}

// ─── Shared helper ────────────────────────────────────────────────────────────

func jsonResp(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// ─── User RPCs (NEW) ──────────────────────────────────────────────────────────

// GET /api/ipo/active
// Lists all IPOs currently in bidding phase.
func handleAPIIPOActive(w http.ResponseWriter, r *http.Request) {
	var active []RHPMetadata
	db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("rhp_"), func(k, v []byte) error {
			var rhp RHPMetadata
			if json.Unmarshal(v, &rhp) == nil && rhp.Status == "bidding" {
				active = append(active, rhp)
			}
			return nil
		})
	})
	if active == nil {
		active = []RHPMetadata{}
	}
	jsonResp(w, map[string]interface{}{"count": len(active), "ipos": active})
}

// GET /api/ipo/{stock}
// Detailed IPO info: price band, window, lot size from RHP.
func handleAPIIPODetail(w http.ResponseWriter, r *http.Request) {
	stock := mux.Vars(r)["stock"]
	var rhp RHPMetadata
	err := db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte("rhp_" + stock))
		if err != nil {
			return err
		}
		return item.Value(func(v []byte) error { return json.Unmarshal(v, &rhp) })
	})
	if err != nil {
		http.Error(w, "IPO not found", http.StatusNotFound)
		return
	}
	jsonResp(w, rhp)
}

// GET /api/account/txhistory/{address}?page=0&limit=50
// Paginated transaction history for an address (scans all blocks).
func handleAPITxHistory(w http.ResponseWriter, r *http.Request) {
	addr := mux.Vars(r)["address"]
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")
	page, _ := strconv.Atoi(pageStr)
	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	var matched []Transaction
	height := getChainHeight()
	for h := height; h >= 1 && uint64(h) >= 1; h-- {
		var block Block
		err := db.View(func(txn *badger.Txn) error {
			item, err := txn.Get([]byte(fmt.Sprintf("block_%d", h)))
			if err != nil {
				return err
			}
			return item.Value(func(v []byte) error { return json.Unmarshal(v, &block) })
		})
		if err != nil {
			continue
		}
		for _, tx := range block.Transactions {
			if string(tx.From) == addr || string(tx.To) == addr {
				matched = append(matched, tx)
			}
		}
		if h == 0 {
			break
		}
	}

	start := page * limit
	end := start + limit
	if start > len(matched) {
		start = len(matched)
	}
	if end > len(matched) {
		end = len(matched)
	}

	jsonResp(w, map[string]interface{}{
		"address": addr,
		"total":   len(matched),
		"page":    page,
		"limit":   limit,
		"txs":     matched[start:end],
	})
}

// GET /api/stocks/portfolio/{address}
// Stock holdings summary for an address.
func handleAPIPortfolio(w http.ResponseWriter, r *http.Request) {
	addr := Address(mux.Vars(r)["address"])
	var acc Account
	err := db.View(func(txn *badger.Txn) error {
		var e error
		acc, e = getAccount(txn, addr)
		return e
	})
	if err != nil {
		http.Error(w, "account not found", http.StatusNotFound)
		return
	}
	if acc.Stocks == nil {
		acc.Stocks = make(map[string]int64)
	}
	jsonResp(w, map[string]interface{}{
		"address":      acc.Address,
		"balancePaise": acc.BalancePaise,
		"blockedPaise": acc.BlockedPaise,
		"stocks":       acc.Stocks,
	})
}

// GET /api/stocks/price/{stock}
// Latest market price for a listed stock (last settled trade price).
func handleAPIStockPrice(w http.ResponseWriter, r *http.Request) {
	stock := mux.Vars(r)["stock"]
	var lastPrice int64
	var lastHeight uint64
	db.View(func(txn *badger.Txn) error {
		if item, err := txn.Get([]byte("lastprice_" + stock)); err == nil {
			item.Value(func(v []byte) error {
				lastPrice, _ = strconv.ParseInt(string(v), 10, 64)
				return nil
			})
		}
		if item, err := txn.Get([]byte("lastprice_height_" + stock)); err == nil {
			item.Value(func(v []byte) error {
				lastHeight, _ = strconv.ParseUint(string(v), 10, 64)
				return nil
			})
		}
		return nil
	})
	jsonResp(w, map[string]interface{}{
		"stock":      stock,
		"pricePaise": lastPrice,
		"atHeight":   lastHeight,
	})
}

// GET /api/allocation/{stock}
// IPO allocation result after bidding closes.
func handleAPIAllocation(w http.ResponseWriter, r *http.Request) {
	stock := mux.Vars(r)["stock"]
	var plan AllocationPlan
	err := db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte("alloc_plan_" + stock))
		if err != nil {
			return err
		}
		return item.Value(func(v []byte) error { return json.Unmarshal(v, &plan) })
	})
	if err != nil {
		http.Error(w, "allocation not found", http.StatusNotFound)
		return
	}
	jsonResp(w, plan)
}

// GET /api/dividend/{stock}
// Dividend history for a stock.
func handleAPIDividend(w http.ResponseWriter, r *http.Request) {
	stock := mux.Vars(r)["stock"]
	var dividends []Dividend
	db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("dividend_"+stock+"_"), func(k, v []byte) error {
			var d Dividend
			if json.Unmarshal(v, &d) == nil {
				dividends = append(dividends, d)
			}
			return nil
		})
	})
	if dividends == nil {
		dividends = []Dividend{}
	}
	jsonResp(w, map[string]interface{}{"stock": stock, "dividends": dividends})
}

// ─── Company RPCs (NEW) ───────────────────────────────────────────────────────

// GET /api/ipo-live/{stock}
// Live IPO status: phase, bids received, blocks remaining — company & regulator only.
// Role check: caller must pass X-Caller-Address header with a company or regulator address.
func handleAPIIPOLive(w http.ResponseWriter, r *http.Request) {
	stock := mux.Vars(r)["stock"]

	var rhp RHPMetadata
	var bidsReceived int64
	err := db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte("rhp_" + stock))
		if err != nil {
			return err
		}
		if err := item.Value(func(v []byte) error { return json.Unmarshal(v, &rhp) }); err != nil {
			return err
		}
		// Count confirmed bids
		return iteratePrefix(txn, []byte("bid_"+stock+"_"), func(k, v []byte) error {
			bidsReceived++
			return nil
		})
	})
	if err != nil {
		http.Error(w, "IPO not found", http.StatusNotFound)
		return
	}

	// Count live mempool bids
	mempoolMutex.RLock()
	for _, tx := range mempool {
		if tx.Type == TxBidStock && tx.Stock == stock {
			bidsReceived++
		}
	}
	mempoolMutex.RUnlock()

	currentSlot := currentHeight.Load()
	var blocksRemaining int64
	if rhp.BiddingEndSlot > currentSlot {
		blocksRemaining = int64(rhp.BiddingEndSlot - currentSlot)
	}

	jsonResp(w, map[string]interface{}{
		"stock":           stock,
		"phase":           rhp.Status,
		"bidsReceived":    bidsReceived,
		"priceBandLower":  rhp.PriceBandLower,
		"priceBandUpper":  rhp.PriceBandUpper,
		"blocksRemaining": blocksRemaining,
		"biddingEndSlot":  rhp.BiddingEndSlot,
	})
}

// GET /api/ipo/{stock}/bids
// Full bid orderbook with demand curve by category — company & regulator only.
func handleAPIIPOBids(w http.ResponseWriter, r *http.Request) {
	stock := mux.Vars(r)["stock"]

	type BidSummary struct {
		Category    string           `json:"category"`
		TotalBids   int              `json:"totalBids"`
		TotalShares int64            `json:"totalShares"`
		DemandCurve map[string]int64 `json:"demandCurve"` // price → cumulative shares
	}

	categories := map[string]*BidSummary{
		"qib":    {Category: "qib", DemandCurve: make(map[string]int64)},
		"nib":    {Category: "nib", DemandCurve: make(map[string]int64)},
		"retail": {Category: "retail", DemandCurve: make(map[string]int64)},
	}

	db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("bid_"+stock+"_"), func(k, v []byte) error {
			var bid Bid
			if json.Unmarshal(v, &bid) != nil {
				return nil
			}
			cat := categories[bid.Category]
			if cat == nil {
				return nil
			}
			cat.TotalBids++
			cat.TotalShares += bid.BidShares
			pKey := strconv.FormatInt(bid.BidPricePaise, 10)
			cat.DemandCurve[pKey] += bid.BidShares
			return nil
		})
	})

	result := make([]*BidSummary, 0, 3)
	for _, c := range []string{"qib", "nib", "retail"} {
		result = append(result, categories[c])
	}
	jsonResp(w, map[string]interface{}{"stock": stock, "categories": result})
}

// GET /api/stocks/holders/{stock}
// Full shareholder list with share counts — company & regulator only.
func handleAPIStockHolders(w http.ResponseWriter, r *http.Request) {
	stock := mux.Vars(r)["stock"]

	type Holder struct {
		Address string `json:"address"`
		Shares  int64  `json:"shares"`
	}
	var holders []Holder
	var totalShares int64

	db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("account_"), func(k, v []byte) error {
			var acc Account
			if json.Unmarshal(v, &acc) != nil {
				return nil
			}
			if shares := acc.Stocks[stock]; shares > 0 {
				holders = append(holders, Holder{Address: string(acc.Address), Shares: shares})
				totalShares += shares
			}
			return nil
		})
	})
	if holders == nil {
		holders = []Holder{}
	}
	jsonResp(w, map[string]interface{}{
		"stock":       stock,
		"totalShares": totalShares,
		"holderCount": len(holders),
		"holders":     holders,
	})
}

// GET /api/rhp/all
// All RHPs regardless of status — accessible by all authenticated roles (user, company, regulator).
func handleAPIRHPAll(w http.ResponseWriter, r *http.Request) {
	var all []RHPMetadata
	db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("rhp_"), func(k, v []byte) error {
			var rhp RHPMetadata
			if json.Unmarshal(v, &rhp) == nil {
				all = append(all, rhp)
			}
			return nil
		})
	})
	if all == nil {
		all = []RHPMetadata{}
	}
	jsonResp(w, map[string]interface{}{"count": len(all), "rhps": all})
}

// GET /api/rhp/{stock}/status
// Full RHP details — accessible by all authenticated roles.
func handleAPIRHPStatus(w http.ResponseWriter, r *http.Request) {
	stock := mux.Vars(r)["stock"]
	var rhp RHPMetadata
	err := db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte("rhp_" + stock))
		if err != nil {
			return err
		}
		return item.Value(func(v []byte) error { return json.Unmarshal(v, &rhp) })
	})
	if err != nil {
		http.Error(w, "RHP not found", http.StatusNotFound)
		return
	}
	// Return full RHPMetadata so all UI fields are populated
	jsonResp(w, rhp)
}

// ─── Regulator RPCs (NEW) ─────────────────────────────────────────────────────

// GET /api/drhp/pending
// Lists all submitted DRHPs that haven't been approved (no final RHP) or explicitly rejected.
// Accessible by company and regulator roles.
func handleAPIDRHPPending(w http.ResponseWriter, r *http.Request) {
	type DRHPEntry struct {
		Stock       string `json:"stock"`
		CompanyAddr string `json:"companyAddr"`
		Payload     string `json:"payload"`   // raw JSON string stored by processUploadDRHP
		RHPStatus   string `json:"rhpStatus"` // "" | "pending" | "bidding" | etc.
		Rejected    bool   `json:"rejected"`
	}

	var entries []DRHPEntry
	db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("drhp_"), func(k, v []byte) error {
			stock := strings.TrimPrefix(string(k), "drhp_")
			// Skip rejection records stored under drhp_rejected_
			if strings.HasPrefix(stock, "rejected_") {
				return nil
			}

			entry := DRHPEntry{
				Stock:   stock,
				Payload: string(v),
			}

			// Read companyAddr from enriched DRHP payload (set by processUploadDRHP)
			var payloadMap map[string]interface{}
			if json.Unmarshal(v, &payloadMap) == nil {
				if ca, ok := payloadMap["companyAddr"].(string); ok {
					entry.CompanyAddr = ca
				}
			}

			// Cross-reference RHP status
			if item, err := txn.Get([]byte("rhp_" + stock)); err == nil {
				var rhp RHPMetadata
				item.Value(func(rv []byte) error { return json.Unmarshal(rv, &rhp) })
				entry.RHPStatus = rhp.Status
				// RHP's CompanyAddr takes precedence if set
				if rhp.CompanyAddr != "" {
					entry.CompanyAddr = rhp.CompanyAddr
				}
			}

			// Check if explicitly rejected
			if _, err := txn.Get([]byte("drhp_rejected_" + stock)); err == nil {
				entry.Rejected = true
			}

			entries = append(entries, entry)
			return nil
		})
	})

	if entries == nil {
		entries = []DRHPEntry{}
	}
	jsonResp(w, map[string]interface{}{"count": len(entries), "drhps": entries})
}

// GET /api/ipo/all
// All IPOs regardless of status (active, pending, closed) — regulator only.
func handleAPIIPOAll(w http.ResponseWriter, r *http.Request) {
	var all []RHPMetadata
	db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("rhp_"), func(k, v []byte) error {
			var rhp RHPMetadata
			if json.Unmarshal(v, &rhp) == nil {
				all = append(all, rhp)
			}
			return nil
		})
	})
	if all == nil {
		all = []RHPMetadata{}
	}
	jsonResp(w, map[string]interface{}{"count": len(all), "ipos": all})
}

// GET /api/rhp/pending
// RHPs awaiting regulatory review — regulator only.
func handleAPIRHPPending(w http.ResponseWriter, r *http.Request) {
	var pending []RHPMetadata
	db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("rhp_"), func(k, v []byte) error {
			var rhp RHPMetadata
			if json.Unmarshal(v, &rhp) == nil && rhp.Status == "pending" {
				pending = append(pending, rhp)
			}
			return nil
		})
	})
	if pending == nil {
		pending = []RHPMetadata{}
	}
	jsonResp(w, map[string]interface{}{"count": len(pending), "rhps": pending})
}

// GET /api/contracts
// All regulatory contracts: pending, approved, rejected — regulator only.
func handleAPIContracts(w http.ResponseWriter, r *http.Request) {
	var contracts []Contract
	db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("contract_"), func(k, v []byte) error {
			var c Contract
			if json.Unmarshal(v, &c) == nil {
				contracts = append(contracts, c)
			}
			return nil
		})
	})
	if contracts == nil {
		contracts = []Contract{}
	}
	jsonResp(w, map[string]interface{}{"count": len(contracts), "contracts": contracts})
}

// GET /api/frozen-accounts
// List of all currently frozen accounts — regulator only.
func handleAPIFrozenAccounts(w http.ResponseWriter, r *http.Request) {
	type FreezeRecord struct {
		Address  string `json:"address"`
		Reason   string `json:"reason"`
		FrozenBy string `json:"frozenBy"`
		Height   uint64 `json:"height"`
	}
	var frozen []FreezeRecord
	db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("freeze_"), func(k, v []byte) error {
			var rec FreezeRecord
			if json.Unmarshal(v, &rec) == nil {
				frozen = append(frozen, rec)
			}
			return nil
		})
	})
	if frozen == nil {
		frozen = []FreezeRecord{}
	}
	jsonResp(w, map[string]interface{}{"count": len(frozen), "frozen": frozen})
}

// GET /api/audit/{address}
// Full on-chain audit trail for any address: tx history + freeze + flag status.
func handleAPIAudit(w http.ResponseWriter, r *http.Request) {
	addr := mux.Vars(r)["address"]

	var acc Account
	var freezeRec, flagRec json.RawMessage
	db.View(func(txn *badger.Txn) error {
		acc, _ = getAccount(txn, Address(addr))
		if item, err := txn.Get([]byte("freeze_" + addr)); err == nil {
			item.Value(func(v []byte) error { freezeRec = json.RawMessage(v); return nil })
		}
		if item, err := txn.Get([]byte("flag_" + addr)); err == nil {
			item.Value(func(v []byte) error { flagRec = json.RawMessage(v); return nil })
		}
		return nil
	})

	// Collect all tx where addr is from or to (last 500 blocks for performance)
	var txs []Transaction
	height := getChainHeight()
	start := uint64(0)
	if height > 500 {
		start = height - 500
	}
	for h := height; h > start; h-- {
		var block Block
		db.View(func(txn *badger.Txn) error {
			item, err := txn.Get([]byte(fmt.Sprintf("block_%d", h)))
			if err != nil {
				return err
			}
			return item.Value(func(v []byte) error { return json.Unmarshal(v, &block) })
		})
		for _, tx := range block.Transactions {
			if string(tx.From) == addr || string(tx.To) == addr {
				txs = append(txs, tx)
			}
		}
		if h == 0 {
			break
		}
	}

	jsonResp(w, map[string]interface{}{
		"address":      addr,
		"account":      acc,
		"isFrozen":     freezeRec != nil,
		"freezeRecord": freezeRec,
		"isFlagged":    flagRec != nil,
		"flagRecord":   flagRec,
		"txCount":      len(txs),
		"txs":          txs,
	})
}

// GET /api/mandate/active
// All currently active mandates — regulator only.
func handleAPIMandates(w http.ResponseWriter, r *http.Request) {
	var mandates []Mandate
	db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("mandate_"), func(k, v []byte) error {
			// Skip fast-check keys (mandate_halt_<stock>)
			key := string(k)
			if strings.HasPrefix(key, "mandate_halt_") {
				return nil
			}
			var m Mandate
			if json.Unmarshal(v, &m) == nil && m.Active {
				mandates = append(mandates, m)
			}
			return nil
		})
	})
	if mandates == nil {
		mandates = []Mandate{}
	}
	jsonResp(w, map[string]interface{}{"count": len(mandates), "mandates": mandates})
}

// ─── Validator RPCs (NEW) ─────────────────────────────────────────────────────

// GET /api/validator/{address}/score
// Own participation score, uptime, slash history for a validator.
func handleAPIValidatorScore(w http.ResponseWriter, r *http.Request) {
	addr := mux.Vars(r)["address"]
	var info ValidatorInfo
	err := db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte("vreg_" + addr))
		if err != nil {
			return err
		}
		return item.Value(func(v []byte) error { return json.Unmarshal(v, &info) })
	})
	if err != nil {
		http.Error(w, "validator not found", http.StatusNotFound)
		return
	}
	jsonResp(w, info)
}

// GET /api/validator/{address}/history
// Block proposal history for a validator.
func handleAPIValidatorHistory(w http.ResponseWriter, r *http.Request) {
	addr := mux.Vars(r)["address"]
	var proposed []uint64
	height := getChainHeight()
	// Scan last 1000 blocks
	scanFrom := uint64(0)
	if height > 1000 {
		scanFrom = height - 1000
	}
	for h := scanFrom; h <= height; h++ {
		var block Block
		db.View(func(txn *badger.Txn) error {
			item, err := txn.Get([]byte(fmt.Sprintf("block_%d", h)))
			if err != nil {
				return err
			}
			return item.Value(func(v []byte) error { return json.Unmarshal(v, &block) })
		})
		if block.Header.Proposer == addr {
			proposed = append(proposed, h)
		}
	}
	jsonResp(w, map[string]interface{}{
		"address":        addr,
		"proposedBlocks": proposed,
		"proposedCount":  len(proposed),
		"scanedHeight":   height,
	})
}

// GET /api/slash/proposals
// Active slash proposals requiring votes.
func handleAPISlashProposals(w http.ResponseWriter, r *http.Request) {
	var proposals []SlashProposal
	db.View(func(txn *badger.Txn) error {
		return iteratePrefix(txn, []byte("slash_"), func(k, v []byte) error {
			var p SlashProposal
			if json.Unmarshal(v, &p) == nil && p.Status == "pending" {
				proposals = append(proposals, p)
			}
			return nil
		})
	})
	if proposals == nil {
		proposals = []SlashProposal{}
	}
	jsonResp(w, map[string]interface{}{"count": len(proposals), "proposals": proposals})
}

// GET /api/stake/rewards/{address}
// Accumulated staking rewards — gas fees collected while proposing blocks.
func handleAPIStakeRewards(w http.ResponseWriter, r *http.Request) {
	addr := Address(mux.Vars(r)["address"])
	var acc Account
	err := db.View(func(txn *badger.Txn) error {
		var e error
		acc, e = getAccount(txn, addr)
		return e
	})
	if err != nil {
		http.Error(w, "account not found", http.StatusNotFound)
		return
	}
	jsonResp(w, map[string]interface{}{
		"address":       acc.Address,
		"stakePaise":    acc.StakePaise,
		"balancePaise":  acc.BalancePaise,
		"role":          acc.Role,
		"score":         acc.OverallScore,
		"participation": acc.Participation,
	})
}

// -------------------------
// Helper Functions
// -------------------------

func getChainHeight() uint64 {
	// First check the atomic counter (fast path)
	if h := currentHeight.Load(); h > 0 {
		return h
	}

	// Fall back to database
	return getChainHeightFromDB()
}

func getChainHeightFromDB() uint64 {
	var height uint64
	db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte("current_height"))
		if err != nil {
			return nil
		}
		item.Value(func(v []byte) error {
			h, err := strconv.ParseUint(string(v), 10, 64)
			if err == nil {
				height = h
			}
			return nil
		})
		return nil
	})
	return height
}

func getBlockHash(height uint64) string {
	var hash string
	db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(fmt.Sprintf("block_%d", height)))
		if err != nil {
			return nil
		}
		item.Value(func(v []byte) error {
			var block Block
			if json.Unmarshal(v, &block) == nil {
				hash = block.BlockHash
			}
			return nil
		})
		return nil
	})
	return hash
}

func getStateRoot() string {
	height := getChainHeight()
	var stateRoot string
	db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(fmt.Sprintf("block_%d", height)))
		if err != nil {
			return nil
		}
		item.Value(func(v []byte) error {
			var block Block
			if json.Unmarshal(v, &block) == nil {
				stateRoot = block.Header.StateRoot
			}
			return nil
		})
		return nil
	})
	return stateRoot
}

func getValidatorRoot() string {
	height := getChainHeight()
	var validatorRoot string
	db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(fmt.Sprintf("block_%d", height)))
		if err != nil {
			return nil
		}
		item.Value(func(v []byte) error {
			var block Block
			if json.Unmarshal(v, &block) == nil {
				validatorRoot = block.Header.ValidatorRoot
			}
			return nil
		})
		return nil
	})
	return validatorRoot
}

func hasBlock(height uint64) bool {
	exists := false
	db.View(func(txn *badger.Txn) error {
		_, err := txn.Get([]byte(fmt.Sprintf("block_%d", height)))
		exists = err == nil
		return nil
	})
	return exists
}

func computeTxHash(tx Transaction) string {
	tmp := tx
	tmp.Sig = ""
	txBytes, _ := json.Marshal(tmp)
	hash := sha256.Sum256(txBytes)
	return hex.EncodeToString(hash[:])
}

// -------------------------
// Whitelist
// -------------------------

func loadWhitelist(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			whitelist = make(map[string]bool)
			return saveWhitelist(path)
		}
		return err
	}
	var addrs []string
	if err := json.Unmarshal(data, &addrs); err != nil {
		return err
	}
	whitelistMutex.Lock()
	defer whitelistMutex.Unlock()
	whitelist = make(map[string]bool)
	for _, a := range addrs {
		whitelist[a] = true
	}
	return nil
}

func saveWhitelist(path string) error {
	whitelistMutex.Lock()
	defer whitelistMutex.Unlock()
	addrs := make([]string, 0, len(whitelist))
	for a := range whitelist {
		addrs = append(addrs, a)
	}
	data, err := json.MarshalIndent(addrs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func isWhitelisted(addr string) bool {
	whitelistMutex.Lock()
	defer whitelistMutex.Unlock()
	return whitelist[addr]
}

// -------------------------
// Peers config
// -------------------------

func loadPeersConfig(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return json.Unmarshal(data, &bootstrapAddrs)
}

// -------------------------
// Mempool persistence
// -------------------------

func loadMempool(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			mempool = make(map[string]Transaction)
			return saveMempool(path)
		}
		return err
	}
	var loaded []Transaction
	if err := json.Unmarshal(data, &loaded); err != nil {
		return err
	}
	mempoolMutex.Lock()
	mempool = make(map[string]Transaction)
	for _, tx := range loaded {
		txKey := fmt.Sprintf("%s_%d", tx.From, tx.Nonce)
		mempool[txKey] = tx
	}
	mempoolSize.Store(int32(len(mempool)))
	mempoolMutex.Unlock()
	return nil
}

func saveMempool(path string) error {
	mempoolMutex.Lock()
	defer mempoolMutex.Unlock()

	txs := make([]Transaction, 0, len(mempool))
	for _, tx := range mempool {
		txs = append(txs, tx)
	}

	data, err := json.MarshalIndent(txs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// -------------------------
// Block persistence
// -------------------------

func saveBlockToFile(block Block, height uint64) error {
	data, err := json.MarshalIndent(block, "", "  ")
	if err != nil {
		return err
	}

	blocksDir := filepath.Join(dataDir, "blocks")
	if err := os.MkdirAll(blocksDir, 0o755); err != nil {
		return err
	}

	fname := filepath.Join(blocksDir, fmt.Sprintf("block_%d.json", height))
	return os.WriteFile(fname, data, 0o644)
}

func startBlockPruner() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		pruneOldBlocks()
	}
}

func pruneOldBlocks() {
	height := getChainHeight()
	if height > MaxBlocksToKeep {
		pruneFrom := height - MaxBlocksToKeep
		db.Update(func(txn *badger.Txn) error {
			for h := uint64(0); h < pruneFrom; h++ {
				key := []byte(fmt.Sprintf("block_%d", h))
				txn.Delete(key)
				// Also delete from filesystem
				fname := filepath.Join(dataDir, "blocks", fmt.Sprintf("block_%d.json", h))
				os.Remove(fname)
			}
			return nil
		})
	}
}

// -------------------------
// CLI (enhanced)
// -------------------------

func startCLI() {
	reader := bufio.NewReader(os.Stdin)
	fmt.Println("=======================================")
	fmt.Println("INGRION BLOCKCHAIN CLI")
	fmt.Println("=======================================")
	fmt.Println("Type 'help' for commands")

	for {
		fmt.Print("ingrion> ")
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				return
			}
			protocolLog.Printf("CLI read error: %v", err)
			continue
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.SplitN(line, " ", 2)
		cmd := parts[0]
		arg := ""
		if len(parts) > 1 {
			arg = strings.TrimSpace(parts[1])
		}

		switch cmd {
		case "status":
			height := getChainHeight()
			validators, _ := getActiveValidators()
			fmt.Printf("📊 Node: %s role=%s height=%d\n", short(nodeAddress), nodeRole, height)
			fmt.Printf("👥 Peers: %d Mempool: %d Validators: %d\n",
				peerCount.Load(), mempoolSize.Load(), len(validators))
			fmt.Printf("🔄 Syncing: %v Target: %d\n", isSyncing, syncTargetHeight.Load())

		case "peers":
			peersMutex.RLock()
			if len(peers) == 0 {
				fmt.Println("👥 No peers connected")
			} else {
				fmt.Printf("👥 Connected peers (%d):\n", len(peers))
				for nodeID, pi := range peers {
					status := "❌ OFFLINE"
					if pi.Connection != nil && time.Since(pi.LastSeen) < PeerTimeout {
						status = "✅ CONNECTED"
					}
					fmt.Printf("  %s addr=%s height=%d status=%s lastSeen=%v\n",
						short(nodeID), pi.Address, pi.Height, status, pi.LastSeen.Format("15:04:05"))
				}
			}
			peersMutex.RUnlock()

		case "validators":
			validators, err := getActiveValidators()
			if err != nil {
				fmt.Printf("❌ Error: %v\n", err)
				continue
			}
			fmt.Printf("👑 Active Validators (%d):\n", len(validators))
			for i, v := range validators {
				nextProposer, _ := getValidatorByHeight(getChainHeight()+1, uint64(i))
				marker := ""
				if v.Address == currentProposer {
					marker = " [CURRENT]"
				} else if v.Address == nextProposer {
					marker = " [NEXT]"
				}
				fmt.Printf("  %s stake=%d active=%v%s\n",
					short(v.Address), v.StakePaise, v.IsActive, marker)
			}

		case "mempool":
			mempoolMutex.RLock()
			fmt.Printf("💸 Mempool size: %d\n", len(mempool))
			count := 0
			for _, tx := range mempool {
				if count >= 10 {
					break
				}
				fmt.Printf("  %s from=%s nonce=%d\n",
					tx.Type, tx.From[:16], tx.Nonce)
				count++
			}
			mempoolMutex.RUnlock()

		case "block":
			if arg == "" {
				fmt.Println("❌ usage: block <height>")
				continue
			}
			height, err := strconv.ParseUint(arg, 10, 64)
			if err != nil {
				fmt.Println("❌ invalid height")
				continue
			}
			var block Block
			err = db.View(func(txn *badger.Txn) error {
				item, err := txn.Get([]byte(fmt.Sprintf("block_%d", height)))
				if err != nil {
					return err
				}
				return item.Value(func(v []byte) error {
					return json.Unmarshal(v, &block)
				})
			})
			if err != nil {
				fmt.Printf("❌ Block not found: %v\n", err)
				continue
			}
			fmt.Printf("📦 Block %d: hash=%s proposer=%s txs=%d\n",
				height, short(block.BlockHash), short(block.Header.Proposer), block.Header.TxCount)

		case "sync":
			fmt.Printf("🔄 Syncing: %v Height: %d/%d Pending blocks: %d\n",
				isSyncing, getChainHeight(), syncTargetHeight.Load(), len(blockQueue))

		case "whitelist":
			if arg == "" {
				fmt.Println("❌ usage: whitelist <address>")
				continue
			}
			addToWhitelist(arg)
			fmt.Println("✅ added to whitelist:", arg)
			saveWhitelist("whitelist.json")

		case "propose":
			if !isValidator {
				fmt.Println("❌ Not a validator")
				continue
			}
			height := getChainHeight() + 1
			go proposeBlock(height)
			fmt.Printf("🎯 Proposing block at height %d\n", height)

		case "help":
			fmt.Println("Commands:")
			fmt.Println("  status          - Show node status")
			fmt.Println("  peers           - List connected peers")
			fmt.Println("  validators      - List active validators")
			fmt.Println("  mempool         - Show mempool transactions")
			fmt.Println("  block <height>  - Show block info")
			fmt.Println("  sync            - Show sync status")
			fmt.Println("  whitelist <addr>- Add address to whitelist")
			fmt.Println("  propose         - Manually propose block (validator only)")
			fmt.Println("  exit/quit       - Exit CLI")

		case "exit", "quit":
			fmt.Println("👋 bye")
			return

		default:
			fmt.Println("❌ Unknown command. Type 'help' for commands.")
		}
	}
}

// -------------------------
// Helper functions
// -------------------------

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func iteratePrefix(txn *badger.Txn, prefix []byte, fn func(k, v []byte) error) error {
	it := txn.NewIterator(badger.DefaultIteratorOptions)
	defer it.Close()
	for it.Seek(prefix); it.ValidForPrefix(prefix); it.Next() {
		item := it.Item()
		k := item.KeyCopy(nil)
		v, err := item.ValueCopy(nil)
		if err != nil {
			return err
		}
		if err := fn(k, v); err != nil {
			return err
		}
	}
	return nil
}

func addToWhitelist(addr string) {
	whitelistMutex.Lock()
	whitelist[addr] = true
	whitelistMutex.Unlock()
}

func getFinalizedHeight() uint64 {
	h := getChainHeight()
	if h > 3 {
		return h - 3
	}
	return 0
}

func waitForNextSlot(height uint64) {
	slotTime := time.Duration(genesisConfig.SlotDuration) * time.Second
	target := genesisTime.Add(time.Duration(height) * slotTime)

	now := time.Now()
	if now.Before(target) {
		wait := target.Sub(now)
		consensusLog.Printf(
			"⏳ SLOT LOCK: height=%d waiting %s (genesis=%s, now=%s)",
			height,
			wait.Round(time.Second),
			genesisTime.Format(time.RFC3339),
			now.Format(time.RFC3339),
		)
		time.Sleep(target.Sub(now))
	}
}

func touchPeerByConn(conn net.Conn) {
	if conn == nil {
		return
	}
	addr := conn.RemoteAddr().String()
	peersMutex.Lock()
	defer peersMutex.Unlock()
	for nodeID, p := range peers {
		if p == nil {
			continue
		}
		if p.Connection != nil && p.Connection.RemoteAddr().String() == addr {
			p.LastSeen = time.Now()
			peers[nodeID] = p
			peerCount.Store(int32(len(peers)))
			return
		}
	}
}

func short(s string) string {
	if len(s) == 0 {
		return "<nil>"
	}
	if len(s) <= 16 {
		return s
	}
	return s[:16]
}

func getHeadHash() string {
	var h string
	_ = db.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte("head_block"))
		if err != nil {
			return nil
		}
		_ = item.Value(func(v []byte) error {
			h = string(v)
			return nil
		})
		return nil
	})
	return h
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
