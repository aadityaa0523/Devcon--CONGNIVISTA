import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { useVoxVaultContract } from "../hooks/useVoxVaultContract";
import { useBiometricCapture } from "../hooks/useBiometricCapture";
import {
  computeGuardianCommitment,
  generateGuardianSalt,
} from "../lib/contract";

/**
 * Guardian registration and social recovery.
 *
 * Guardians are stored as keccak256(address, salt), never as raw addresses, so a
 * guardian's identity is not exposed by adding them. Note the limit of that
 * claim: the moment a guardian actually calls requestRecovery, their msg.sender
 * is public forever. Hidden until they act, not anonymous.
 */
export function RecoveryPanel() {
  const { recovery, timelock, isOwner, isConnected, send, refresh } =
    useVoxVaultContract();
  const { hasEnrolment, verify } = useBiometricCapture();

  const [guardianAddress, setGuardianAddress] = useState("");
  const [salt, setSalt] = useState("");
  const [proposedOwner, setProposedOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000
    );
    return () => window.clearInterval(id);
  }, []);

  const executableAt =
    recovery?.isActive && timelock !== null
      ? Number(recovery.requestTime) + Number(timelock)
      : null;
  const secondsUntilExecutable = executableAt ? executableAt - now : null;

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      setStatus(label);
      try {
        await fn();
        setStatus(`${label} — done.`);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus(null);
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const addGuardian = () =>
    run("Registering guardian", async () => {
      if (!ethers.isAddress(guardianAddress)) {
        throw new Error("Enter a valid guardian address");
      }
      const useSalt = salt || generateGuardianSalt();
      setSalt(useSalt);
      const commitment = computeGuardianCommitment(guardianAddress, useSalt);
      await send((c) => c.addGuardian(commitment));
    });

  const requestRecovery = () =>
    run("Requesting recovery", async () => {
      if (!ethers.isAddress(proposedOwner)) {
        throw new Error("Enter a valid address for the new owner");
      }
      if (!salt) {
        throw new Error("The guardian's salt is required to prove guardianship");
      }
      await send((c) => c.requestRecovery(proposedOwner, salt));
    });

  const executeRecovery = () =>
    run("Executing recovery", async () => {
      await send((c) => c.executeRecovery());
    });

  const cancelRecovery = () =>
    run("Cancelling recovery", async () => {
      let commitment = ethers.ZeroHash;
      if (hasEnrolment) {
        const outcome = await verify();
        if (!outcome) throw new Error("Voice capture failed");
        if (!outcome.passed) {
          throw new Error(
            `Voice did not match (${(outcome.comparison.normalisedHamming * 100).toFixed(1)}% of bits differ) — refusing to cancel.`
          );
        }
        commitment = outcome.commitment;
      }
      await send((c) => c.cancelRecovery(commitment));
    });

  return (
    <section className="panel panel--recovery">
      <div className="eyebrow"><span className={recovery?.isActive ? "dot live" : "dot"} />Social recovery</div>
      <h2>Guardians and timelock</h2>

      <fieldset disabled={busy || !isConnected || !isOwner}>
        <legend>Register a guardian</legend>
        <div className="row">
          <input
            placeholder="Guardian address"
            value={guardianAddress}
            onChange={(e) => setGuardianAddress(e.target.value)}
            style={{ flex: "2 1 320px" }}
          />
          <button onClick={addGuardian}>Add guardian</button>
        </div>
        {salt && (
          <p className="hint">
            Salt — send this to the guardian privately, they cannot prove
            guardianship without it:
            <br />
            <code style={{ wordBreak: "break-all" }}>{salt}</code>
          </p>
        )}
        <p className="hint">
          Only keccak256(address, salt) is stored. The address itself never appears
          in calldata or storage.
        </p>
      </fieldset>

      <fieldset disabled={busy || !isConnected}>
        <legend>Guardian: open a recovery</legend>
        <div className="row">
          <input
            placeholder="Proposed new owner address"
            value={proposedOwner}
            onChange={(e) => setProposedOwner(e.target.value)}
            style={{ flex: "2 1 320px" }}
          />
          <input
            placeholder="Salt (0x…)"
            value={salt}
            onChange={(e) => setSalt(e.target.value)}
            style={{ flex: "2 1 240px" }}
          />
          <button onClick={requestRecovery}>Request recovery</button>
        </div>
        <p className="hint">
          Run this from the guardian's own wallet — the contract hashes msg.sender
          with the salt to check membership.
        </p>
      </fieldset>

      {recovery?.isActive ? (
        <div className="verdict">
          <p className="verdict-title">Recovery pending</p>
          <p className="hint">
            Proposed owner <code>{recovery.pendingNewOwner}</code>
            <br />
            {secondsUntilExecutable !== null && secondsUntilExecutable > 0
              ? `Executable in ${formatDuration(secondsUntilExecutable)}`
              : "Timelock elapsed — executable now"}
          </p>
          <div className="row">
            <button
              onClick={executeRecovery}
              disabled={
                busy ||
                secondsUntilExecutable === null ||
                secondsUntilExecutable > 0
              }
            >
              Execute recovery
            </button>
            <button onClick={cancelRecovery} disabled={busy || !isOwner}>
              Owner: cancel with voice
            </button>
          </div>
        </div>
      ) : (
        <p className="hint">
          No recovery pending.{" "}
          {timelock !== null &&
            `Timelock on this deployment: ${formatDuration(Number(timelock))}.`}
        </p>
      )}

      {status && <p className="hint">{status}</p>}
      {error && <p className="notice error">{error}</p>}
    </section>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

