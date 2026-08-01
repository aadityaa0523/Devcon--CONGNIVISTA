import { ConnectWalletButton } from "./components/ConnectWalletButton";
import { BiometricPanel } from "./components/BiometricPanel";
import { ChallengePanel } from "./components/ChallengePanel";
import { SessionKeyPanel } from "./components/SessionKeyPanel";
import { RecoveryPanel } from "./components/RecoveryPanel";
import { VoiceOrb, type OrbState } from "./components/VoiceOrb";
import { BiometricProvider, useBiometrics } from "./hooks/BiometricContext";
import { useVoxVaultContract } from "./hooks/useVoxVaultContract";

const ZERO_HASH = "0x" + "0".repeat(64);

export default function App() {
  return (
    <BiometricProvider>
      <Dashboard />
    </BiometricProvider>
  );
}

function Dashboard() {
  const { contractAddress, owner, commitment, isOwner, isConnected, error } =
    useVoxVaultContract();
  const { isCapturing, level, lastOutcome } = useBiometrics();

  const configured =
    !!contractAddress &&
    contractAddress !== "0x0000000000000000000000000000000000000000";

  // The orb mirrors the most recent thing that happened, so the hero always
  // reflects real state rather than looping decoratively.
  const orbState: OrbState = isCapturing
    ? "listening"
    : lastOutcome
      ? lastOutcome.passed
        ? "verified"
        : "failed"
      : "idle";

  return (
    <main className="shell">
      <header className="masthead">
        <VoiceOrb state={orbState} level={level} size={264} />
        <h1 className="wordmark">
          Prove it's you.
          <br />
          <em>Reveal nothing.</em>
        </h1>
        <p className="tagline">
          A smart wallet authorised by your voice. Audio is analysed on this
          device and never uploaded.
        </p>
        <div className="chipbar">
          <ConnectWalletButton />
          {configured && (
            <a
              className="chip"
              href={`https://sepolia.etherscan.io/address/${contractAddress}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="dot" />
              {contractAddress.slice(0, 6)}…{contractAddress.slice(-4)}
            </a>
          )}
          {commitment && commitment !== ZERO_HASH && (
            <span className="chip">enrolled {commitment.slice(0, 10)}…</span>
          )}
          {isConnected && owner && !isOwner && (
            <span className="chip">not the owner</span>
          )}
        </div>
      </header>

      {!configured && (
        <p className="notice warn">
          <strong>VITE_CONTRACT_ADDRESS is not set.</strong> Copy{" "}
          <code>frontend/.env.example</code> to <code>frontend/.env.local</code>{" "}
          and fill in the address from{" "}
          <code>contracts/deployments/sepolia.json</code>.
        </p>
      )}

      {error && <p className="notice error">{error}</p>}

      <div className="grid">
        <div className="span-7">
          <BiometricPanel />
        </div>
        <div className="span-5">
          <ChallengePanel />
        </div>
        <div className="span-5">
          <SessionKeyPanel />
        </div>
        <div className="span-7">
          <RecoveryPanel />
        </div>
      </div>

      <footer className="footnote">
        <strong>What the chain does and does not enforce.</strong> The on-chain
        commitment is a tamper-evident record that an enrolment happened. It is
        not an access gate: two recordings never hash alike, so no contract
        function compares hashes for equality. Authorisation is enforced by
        ordinary ECDSA signatures — owner or session key. Voice matching happens
        here in the browser and decides what this UI offers to do. Sepolia
        testnet only.
      </footer>
    </main>
  );
}
