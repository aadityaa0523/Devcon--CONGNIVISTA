import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { useVoxVaultContract } from "../hooks/useVoxVaultContract";
import { useBiometricCapture } from "../hooks/useBiometricCapture";
import {
  clearSessionKey,
  formatSessionKeyExpiry,
  generateSessionKey,
  getSessionKeyRemainingTime,
  getSessionKeySigner,
  loadSessionKey,
  saveSessionKey,
} from "../lib/sessionKey";
import { getVoxVaultContract } from "../lib/contract";

/** Gas float sent to the session key so it can pay for its own transactions. */
const SESSION_KEY_GAS_FUNDING = "0.003";

/**
 * One authorisation, then transactions without further signing prompts.
 *
 * The session key is a plain EOA generated in this tab. It holds no value beyond
 * a small gas float and expires on-chain, so compromising it costs at most
 * whatever the vault holds until expiry — which is why this is testnet-only.
 */
export function SessionKeyPanel() {
  const { contract, contractAddress, isOwner, isConnected, send, refresh } =
    useVoxVaultContract();
  const { hasEnrolment, verify } = useBiometricCapture();

  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [txHashes, setTxHashes] = useState<string[]>([]);

  useEffect(() => {
    const tick = () => setRemaining(getSessionKeyRemainingTime());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const isActive = remaining > 0;

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (hasEnrolment) {
        setStatus("Verify your voice to authorise the session…");
        const outcome = await verify();
        if (!outcome) {
          setBusy(false);
          return;
        }
        if (!outcome.passed) {
          setError(
            `Voice did not match (${(outcome.comparison.normalisedHamming * 100).toFixed(1)}% of bits differ). Session not authorised.`
          );
          setBusy(false);
          return;
        }
      }

      const { wallet, address } = generateSessionKey();

      setStatus("Registering the session key on-chain…");
      await send((c) => c.registerSessionKey(address));

      // A brand-new EOA has no ether and cannot pay gas, so front it a float.
      setStatus("Funding the session key for gas…");
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const fundTx = await signer.sendTransaction({
        to: address,
        value: ethers.parseEther(SESSION_KEY_GAS_FUNDING),
      });
      await fundTx.wait();

      const duration = await contract!.sessionKeyDuration();
      saveSessionKey(
        wallet.privateKey,
        Math.floor(Date.now() / 1000) + Number(duration)
      );
      setRemaining(getSessionKeyRemainingTime());
      setStatus("Session active — transactions below need no further signing.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }, [contract, hasEnrolment, send, verify]);

  const spend = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      if (!ethers.isAddress(recipient)) {
        throw new Error("Enter a valid recipient address");
      }
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const keySigner = getSessionKeySigner(provider);
      if (!keySigner) {
        throw new Error("No active session key — enable session mode first.");
      }

      // Signed by the session key, so MetaMask never prompts.
      const vault = getVoxVaultContract(contractAddress, keySigner);
      const tx = await vault.execute(
        recipient,
        ethers.parseEther(amount),
        "0x"
      );
      const receipt = await tx.wait();
      setTxHashes((prev) => [tx.hash, ...prev]);
      setStatus(`Sent in block ${receipt?.blockNumber} with no signing prompt.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [amount, contractAddress, recipient, refresh]);

  const fundVault = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const signer = await provider.getSigner();
      const tx = await signer.sendTransaction({
        to: contractAddress,
        value: ethers.parseEther("0.01"),
      });
      await tx.wait();
      setStatus("Vault funded with 0.01 ETH.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [contractAddress]);

  const stored = loadSessionKey();

  return (
    <section style={panel}>
      <h2>Session keys</h2>
      <p style={muted}>
        Authorise once with your voice, then transact without further signing until
        the key expires on-chain.
      </p>

      {isActive && stored ? (
        <div style={{ ...box, borderLeft: "4px solid #1565c0" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>
            Active — {formatSessionKeyExpiry(remaining)} remaining
          </p>
          <p style={muted}>
            Key <code>{stored.address.slice(0, 10)}…</code>, held in sessionStorage
            and discarded when this tab closes.
          </p>
          <button
            onClick={() => {
              clearSessionKey();
              setRemaining(0);
            }}
            disabled={busy}
          >
            End session
          </button>
        </div>
      ) : (
        <button onClick={enable} disabled={busy || !isConnected || !isOwner}>
          {busy ? "Working…" : "Authorise with voice, enable 30-minute session"}
        </button>
      )}

      {!isOwner && isConnected && (
        <p style={muted}>Connect as the contract owner to manage session keys.</p>
      )}

      <fieldset style={box} disabled={!isActive || busy}>
        <legend>Spend without signing</legend>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            placeholder="Recipient address"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            style={{ flex: "2 1 320px" }}
          />
          <input
            placeholder="ETH"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ flex: "1 1 80px" }}
          />
          <button onClick={spend}>Send</button>
        </div>
        <p style={muted}>
          The vault spends its own balance, so fund it first.{" "}
          <button onClick={fundVault} disabled={busy || !isConnected}>
            Fund vault 0.01 ETH
          </button>
        </p>
      </fieldset>

      {txHashes.length > 0 && (
        <div style={box}>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {txHashes.length} transaction{txHashes.length === 1 ? "" : "s"} on one
            authorisation
          </p>
          <ul style={muted}>
            {txHashes.map((hash) => (
              <li key={hash}>
                <a
                  href={`https://sepolia.etherscan.io/tx/${hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {hash.slice(0, 18)}…
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status && <p style={muted}>{status}</p>}
      {error && <p style={{ color: "#c62828" }}>{error}</p>}
    </section>
  );
}

const panel: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};
const box: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 6,
  padding: 12,
  marginTop: 12,
};
const muted: React.CSSProperties = { color: "#666", fontSize: "0.9em" };
