import { ConnectWalletButton } from "./components/ConnectWalletButton";
import { BiometricPanel } from "./components/BiometricPanel";
import { ChallengePanel } from "./components/ChallengePanel";
import { SessionKeyPanel } from "./components/SessionKeyPanel";
import { RecoveryPanel } from "./components/RecoveryPanel";
import { useVoxVaultContract } from "./hooks/useVoxVaultContract";

const ZERO_HASH = "0x" + "0".repeat(64);

export default function App() {
  const { contractAddress, owner, commitment, isOwner, isConnected, error } =
    useVoxVaultContract();

  const configured =
    !!contractAddress &&
    contractAddress !== "0x0000000000000000000000000000000000000000";

  return (
    <main
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "24px 16px",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.5,
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 4 }}>VoxVault</h1>
        <p style={{ color: "#666", marginTop: 0 }}>
          A smart wallet authorised by your voice. Audio is analysed on this device
          and never uploaded.
        </p>
        <ConnectWalletButton />
      </header>

      {!configured && (
        <p style={warning}>
          <strong>VITE_CONTRACT_ADDRESS is not set.</strong> Copy{" "}
          <code>frontend/.env.example</code> to <code>frontend/.env.local</code> and
          fill in the address from <code>contracts/deployments/sepolia.json</code>.
        </p>
      )}

      {configured && (
        <p style={{ color: "#666", fontSize: "0.9em" }}>
          Vault{" "}
          <a
            href={`https://sepolia.etherscan.io/address/${contractAddress}`}
            target="_blank"
            rel="noreferrer"
          >
            <code>{contractAddress}</code>
          </a>
          {owner && (
            <>
              {" · owner "}
              <code>{owner.slice(0, 10)}…</code>
              {isConnected && !isOwner && " (you are not the owner)"}
            </>
          )}
          {commitment && commitment !== ZERO_HASH && (
            <>
              {" · enrolled "}
              <code>{commitment.slice(0, 10)}…</code>
            </>
          )}
        </p>
      )}

      {error && <p style={warning}>{error}</p>}

      <BiometricPanel />
      <ChallengePanel />
      <SessionKeyPanel />
      <RecoveryPanel />

      <footer style={{ color: "#888", fontSize: "0.85em", marginTop: 32 }}>
        <p>
          <strong>What the chain does and does not enforce.</strong> The on-chain
          commitment is a tamper-evident record that an enrolment happened. It is
          not an access gate: two recordings never hash alike, so no contract
          function compares hashes for equality. Authorisation is enforced by
          ordinary ECDSA signatures — owner or session key. Voice matching happens
          here in the browser and decides what this UI offers to do. Sepolia
          testnet only.
        </p>
      </footer>
    </main>
  );
}

const warning: React.CSSProperties = {
  background: "#fff8e1",
  border: "1px solid #ffe082",
  borderRadius: 6,
  padding: 12,
};
