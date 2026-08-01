import { useWallet } from "../hooks/useWallet";

export function ConnectWalletButton() {
  const { address, isConnected, isSepoliaNetwork, connect, switchToSepolia, isLoading, error } =
    useWallet();

  if (!isConnected) {
    return (
      <button onClick={connect} disabled={isLoading}>
        {isLoading ? "Connecting..." : "Connect Wallet"}
      </button>
    );
  }

  if (!isSepoliaNetwork) {
    return (
      <button onClick={switchToSepolia} disabled={isLoading}>
        {isLoading ? "Switching..." : "Switch to Sepolia"}
      </button>
    );
  }

  return (
    <div className="chip">
      <span>{address?.substring(0, 6)}...{address?.substring(38)}</span>
      {error && <span className="notice error">{error}</span>}
    </div>
  );
}
