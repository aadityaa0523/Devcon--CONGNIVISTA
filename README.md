# VoxVault: Privacy-First Voiceprint Smart Wallet

A privacy-preserving smart wallet that uses multi-modal behavioral biometrics (voice + motion + touch) for authentication, proving your identity without revealing your biometric data.

**Built with:** Hardhat • Ethers.js • React • TensorFlow.js + Meyda • Sepolia Testnet

---

## 🎯 Quick Start

### Prerequisites

- Node.js v20+ (or use `nvm use` to switch from `.nvmrc`)
- MetaMask browser extension
- Sepolia testnet ETH from a [faucet](https://www.alchemy.com/faucets/ethereum-sepolia)

### Installation

```bash
# Install dependencies (both frontend and contracts workspaces)
npm install

# Copy .env files and fill in your keys
cp contracts/.env.example contracts/.env
cp frontend/.env.example frontend/.env.local

# Compile smart contracts
npm run compile -w contracts

# Start frontend dev server
npm run dev -w frontend
```

---

## 🏗️ Project Structure

```
voxvault/
├── contracts/              # Solidity smart contracts
│   ├── contracts/VoxVault.sol
│   ├── scripts/deploy.ts
│   └── test/VoxVault.test.ts
├── frontend/               # React + TypeScript UI
│   ├── src/lib/            # Core libraries
│   │   ├── wallet.ts       # MetaMask integration
│   │   ├── biometrics.ts   # Voice/motion/touch capture
│   │   ├── quantization.ts # Feature compression
│   │   ├── hashing.ts      # SHA-256 commitment
│   │   ├── contract.ts     # Smart contract interaction
│   │   └── sessionKey.ts   # Session key management
│   └── src/components/     # React UI (skeleton, styling deferred)
└── scripts/                # Utility scripts
    └── copy-abi.mjs        # ABI copying (post-compile hook)
```

---

## 🔄 Development Workflow

### Phase 1: Smart Contract Core

```bash
# Compile contracts
npm run compile -w contracts

# Run tests
npm run test -w contracts

# Deploy to Sepolia
export SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
export PRIVATE_KEY=0x...
export OWNER_ADDRESS=0x...
npm run deploy -w contracts
```

### Phase 2-5: Frontend Integration

```bash
# Start dev server
npm run dev -w frontend

# Build for production
npm run build -w frontend

# Verify contract on Etherscan
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

---

## 🔐 Smart Contract Design

### VoxVault.sol

**Core Features:**
- **Biometric Commitment:** Stores SHA-256 hash of enrolled biometric (voice + motion + touch)
- **Session Keys:** One voice verification enables 30 minutes of signature-free transactions
- **Social Recovery:** Guardian-triggered recovery with 48-hour timelock
- **Guardian Privacy:** Commitments stored as `keccak256(guardianAddr, salt)` to keep addresses off calldata

**Key Functions:**
- `registerBiometric(bytes32 commitmentHash)` — Enroll biometric
- `reVerifyBiometric(bytes32 freshCommitmentHash)` — Check if re-captured sample matches
- `registerSessionKey(address sessionKeyAddr)` — Enable signature-free mode for 30 min
- `execute(address to, uint256 value, bytes data)` — Execute transaction via session key
- `requestRecovery(address proposedNewOwner, bytes32 salt)` — Guardian initiates recovery
- `cancelRecovery(bytes32 commitmentHash)` — Owner cancels with biometric re-verification

**Constructor Parameters (tunable for demo):**
- `sessionKeyDuration` — Default 30 minutes; can be 1 minute for live demo
- `recoveryTimelock` — Default 48 hours; use 2 minutes for local testing

---

## 📱 Frontend Libraries

### `lib/wallet.ts`
- `connectWallet()` — MetaMask connection + Sepolia network switch
- `listenForAccountChanges()` — React to account/network changes

### `lib/biometrics.ts`
- `captureVoiceSample()` — Microphone audio → Meyda MFCC extraction
- `captureMotionSample()` — Accelerometer/gyro → statistical features
- `captureTouchSample()` — Touch pressure/timing → feature stats
- `buildFeatureVector()` — Concatenates into 308-dimensional vector

### `lib/quantization.ts`
- `quantizeToInt8()` — 4x compression (4 bytes → 1 byte per dimension)
- `quantizeToBinary()` — 32x compression (1 bit per dimension)
- `hammingDistance()` — Fuzzy matching for re-verification

### `lib/hashing.ts`
- `sha256Commitment()` — Ethers.js-based SHA-256 (browser-compatible)
- `verifyExactMatch()` — Compare hashes (fragile; use Hamming distance client-side first)

### `lib/sessionKey.ts`
- `generateSessionKey()` — Create ephemeral keypair
- `saveSessionKey()` — Store in `sessionStorage` (cleared on tab close)
- `isSessionKeyValid()` — Check expiry

### `lib/contract.ts`
- Typed wrappers for all VoxVault contract functions
- Returns `ethers.Contract` instances

---

## ⚠️ Known Limitations & Trade-offs

### 1. **Biometric Hash Fragility**
- On-chain stores SHA-256 hash of biometric features
- **Problem:** Any noise in re-capture changes hash completely (cryptographic brittleness)
- **Why:** Full zero-knowledge proofs (Groth16) are out of scope for a hackathon
- **Mitigation:** Client-side Hamming distance matching on binary-quantized vectors gates whether UI attempts on-chain verification. Real access control via MetaMask EOA signature, not biometric.
- **Narrative:** "Commitment/audit artifact, not a cryptographic access gate"

### 2. **Guardian Anonymity is Partial**
- Commitments stored as `keccak256(guardianAddr, salt)` — hides identity until they act
- **Problem:** Once guardian calls `requestRecovery()`, their `msg.sender` is permanently public on-chain
- **Why:** True sender anonymity requires relayer infrastructure (out of scope)
- **Narrative:** "Guardian identities hidden until the guardian acts"

### 3. **Session Key Private Keys in `sessionStorage`**
- Stored in browser memory, vulnerable to XSS
- **Why:** Testnet demo with no real value; tradeoff for UX
- **Mitigation:** Uses `sessionStorage` (not `localStorage`); cleared on tab close
- **Narrative:** "Acceptable only for testnet demo wallet; production should use hardware wallet / secure enclave"

### 4. **48-hour Timelock Impossible to Demo Live**
- Constructor parameter approach: deploy a "demo" instance with `recoveryTimelock = 2 minutes`
- Local testing uses `hardhat-network-helpers` `time.increase()` to simulate timelock
- **Demo Strategy:** Show request → cancel live; show request → wait → execute via recorded clip or local network

### 5. **Touch Events Not Reliable on Laptop Trackpads**
- Most laptop trackpads/mice don't fire `touchstart` events
- **Mitigation:** Feature-detect `'ontouchstart' in window`; fall back to pointer events or mark as unavailable
- **Demo:** Use a touchscreen device (tablet/phone) if possible

---

## 🚀 Deployment

### Local Testing

```bash
# Start Hardhat local network (terminal 1)
npx hardhat node -w contracts

# Deploy to local (terminal 2)
npm run deploy:local -w contracts

# Update frontend .env.local with deployed address
VITE_CONTRACT_ADDRESS=0x...

# Start frontend (terminal 3)
npm run dev -w frontend
```

### Sepolia Testnet

```bash
# Set environment variables
export SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
export PRIVATE_KEY=0x...
export OWNER_ADDRESS=0x...
export ETHERSCAN_API_KEY=YOUR_ETHERSCAN_KEY

# Deploy
npm run deploy -w contracts

# Update frontend .env.local and build
VITE_CONTRACT_ADDRESS=<deployed_address> npm run build -w frontend

# Deploy to Vercel / Netlify
git push origin main
```

### Vercel Deployment

1. Connect repo to Vercel
2. **Root Directory:** `./`
3. **Install Command:** `npm install`
4. **Build Command:** `npm run build -w frontend`
5. **Output Directory:** `frontend/dist`
6. **Env Vars:** Set `VITE_CONTRACT_ADDRESS`, `VITE_SEPOLIA_CHAIN_ID` in Vercel dashboard

---

## 📋 Testing

```bash
# Run all contract tests
npm run test -w contracts

# Tests cover:
# - Ownership transfer
# - Biometric registration + re-verification
# - Session key expiry (via time-travel)
# - Recovery timelock (via time-travel)
# - Guardian privacy (no raw addresses in calldata)
```

---

## 🎬 Demo Script (6-Beat Structure)

1. **Introduction (30s):** Problem: Web3 wallets leak identity. Solution: VoxVault proves you without telling who you are.
2. **Enrollment (30s):** Speak + touch screen → commitment stored on-chain.
3. **Verification (30s):** Re-verify biometric locally without revealing voice.
4. **Session Keys (30s):** "Enable 30-min free mode" → 3 transactions without signing.
5. **Recovery (30s):** Guardian requests recovery → owner cancels with voice verification (request → cancel live; execute-after-timelock as recorded/local clip).
6. **Conclusion (30s):** Privacy guarantee, tech stack, future work.

---

## 🔮 Future Enhancements

- **ZK-SNARKs for Fuzzy Matching:** Prove biometric match within threshold without revealing score
- **Ephemeral Addresses:** One-time verification addresses for unlinkability
- **Revocation Registry:** Decentralized way to invalidate compromised signatures
- **Multi-Chain Support:** Ethereum, Polygon, Base
- **Mobile App:** Native iOS/Android with secure enclave
- **DID Integration:** W3C Decentralized Identifiers

---

## 📚 References

- [Ethers.js Documentation](https://docs.ethers.org/)
- [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts)
- [ERC-4337 Account Abstraction](https://eips.ethereum.org/EIPS/eip-4337)
- [Meyda: Web Audio Feature Extraction](https://github.com/meyda/meyda)
- [Sepolia Faucet](https://www.alchemy.com/faucets/ethereum-sepolia)

---

## 🙏 Acknowledgments

Built with ❤️ for Ethereum Build Sprint NIT Trichy

- Entros Protocol (inspiration for privacy-preserving biometrics)
- Ethereum Foundation (ERC-4337 standard)
- Safe (account abstraction infrastructure)
