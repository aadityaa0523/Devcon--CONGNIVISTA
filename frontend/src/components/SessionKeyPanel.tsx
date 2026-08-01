import React, { useState, useEffect } from "react";
import { useVoxVaultContract } from "../hooks/useVoxVaultContract";
import * as sessionKeyLib from "../lib/sessionKey";
import { ethers } from "ethers";

export function SessionKeyPanel() {
  const { registerSessionKey, isLoading, error, isOwner } = useVoxVaultContract();
  const [sessionKeyStats, setSessionKeyStats] = useState<any>(null);
  const [isEnabling, setIsEnabling] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null);

  // Refresh session key status every second
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = sessionKeyLib.getSessionKeyStats();
      setSessionKeyStats(stats);

      if (!stats.isValid && refreshInterval !== null) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }, 1000);

    setRefreshInterval(interval as any);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  const handleEnableSessionMode = async () => {
    if (!isOwner) {
      setSessionError("Only wallet owner can enable session mode");
      return;
    }

    setIsEnabling(true);
    setSessionError(null);

    try {
      // Generate new session key
      const { wallet, address } = sessionKeyLib.generateSessionKey();

      // Register on-chain (will expire in 30 min from block.timestamp)
      const tx = await registerSessionKey(address);
      if (tx) {
        // Compute expiry: current time + 30 minutes
        const expiryTime = Math.floor(Date.now() / 1000) + 30 * 60;

        // Save session key locally
        sessionKeyLib.saveSessionKey(wallet.privateKey, expiryTime);

        // Refresh status
        const stats = sessionKeyLib.getSessionKeyStats();
        setSessionKeyStats(stats);

        console.log("Session key enabled:", {
          address,
          expiryTime,
          txHash: tx.hash,
        });
      }
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "Failed to enable session mode");
      console.error("Session key error:", err);
    } finally {
      setIsEnabling(false);
    }
  };

  const handleRevokeSessionKey = () => {
    sessionKeyLib.clearSessionKey();
    setSessionKeyStats(sessionKeyLib.getSessionKeyStats());
  };

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc", borderRadius: "8px", marginTop: "20px" }}>
      <h2>Session Keys</h2>

      <p>
        Enable signature-free mode for 30 minutes. After verification, you can execute multiple
        transactions without re-signing.
      </p>

      {!isOwner && <p style={{ color: "orange" }}>Note: Only owner can enable session keys</p>}

      {sessionKeyStats && sessionKeyStats.isValid ? (
        <div style={{
          padding: "15px",
          backgroundColor: "#e3f2fd",
          borderRadius: "8px",
          marginBottom: "15px",
        }}>
          <p><strong style={{ color: "#1976d2" }}>✓ Session Mode Active</strong></p>
          <ul>
            <li>Address: <code>{sessionKeyStats.address?.substring(0, 10)}...</code></li>
            <li>Time Remaining: <strong>{sessionKeyLib.formatSessionKeyExpiry(sessionKeyStats.remainingSeconds)}</strong></li>
            <li>Created: {sessionKeyStats.createdAtTime}</li>
          </ul>
          <p style={{ fontSize: "0.9em", color: "#666" }}>
            Your session key is stored in browser sessionStorage. It will be cleared when you close
            this tab.
          </p>
          <button onClick={handleRevokeSessionKey} style={{ marginTop: "10px", backgroundColor: "#ff9800" }}>
            Revoke Session Key
          </button>
        </div>
      ) : (
        <button
          onClick={handleEnableSessionMode}
          disabled={isEnabling || isLoading || !isOwner}
          style={{ marginBottom: "15px", padding: "10px 20px", fontSize: "1em" }}
        >
          {isEnabling ? "Enabling..." : "Enable Signature-Free Mode"}
        </button>
      )}

      {(error || sessionError) && (
        <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#ffebee", color: "#c62828" }}>
          <p>Error: {sessionError || error}</p>
        </div>
      )}

      <details style={{ marginTop: "20px" }}>
        <summary>How it works</summary>
        <ol>
          <li>Click "Enable Signature-Free Mode"</li>
          <li>A temporary keypair (session key) is generated in your browser</li>
          <li>The session key is registered on-chain with a 30-minute expiry</li>
          <li>For the next 30 minutes, you can execute transactions without signing</li>
          <li>After 30 minutes, the session key expires and you must re-verify</li>
        </ol>
        <p style={{ fontSize: "0.9em", color: "#666" }}>
          <strong>Security Note:</strong> Session keys are ephemeral and stored in sessionStorage
          (cleared on tab close). This is acceptable for testnet only.
        </p>
      </details>
    </div>
  );
}
