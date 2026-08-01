/**
 * Turning wallet and RPC errors into something a person can act on.
 *
 * ethers throws richly structured objects whose `message` is a wall of nested
 * JSON. Surfacing that verbatim tells the user nothing — most of these are not
 * faults at all, just a declined prompt or an empty account.
 */

interface WalletErrorShape {
  code?: string | number;
  shortMessage?: string;
  reason?: string;
  info?: { error?: { code?: number; message?: string } };
  message?: string;
}

/** True when the user simply dismissed the MetaMask prompt. */
export function isUserRejection(err: unknown): boolean {
  const e = err as WalletErrorShape;
  return (
    e?.code === "ACTION_REJECTED" ||
    e?.code === 4001 ||
    e?.info?.error?.code === 4001
  );
}

/**
 * A single readable sentence, with the next step where there is an obvious one.
 */
export function describeTxError(err: unknown): string {
  const e = err as WalletErrorShape;

  if (isUserRejection(err)) {
    return "You rejected the request in MetaMask. Nothing was sent — try again when ready.";
  }

  switch (e?.code) {
    case "INSUFFICIENT_FUNDS":
      return "Not enough Sepolia ETH to cover gas. Top up from a faucet and retry.";
    case "NETWORK_ERROR":
      return "Lost contact with the network. Check your connection and retry.";
    case "UNSUPPORTED_OPERATION":
      return "Wallet is not connected to Sepolia. Switch network and retry.";
    case "NONCE_EXPIRED":
    case "REPLACEMENT_UNDERPRICED":
      return "A previous transaction is still pending. Wait for it to confirm, then retry.";
  }

  // Solidity require() strings arrive as the revert reason — these are written
  // for humans already, so pass them through.
  if (e?.reason) {
    return `The contract rejected this: ${e.reason}`;
  }

  if (e?.shortMessage) return e.shortMessage;

  const message = e?.message ?? String(err);
  // Anything still carrying a JSON payload is noise; keep only the first clause.
  return message.split(/ \(|\{/)[0].trim() || "Something went wrong.";
}

/** Distinguishes a cancelled action from a genuine failure, for styling. */
export function errorTone(err: unknown): "info" | "error" {
  return isUserRejection(err) ? "info" : "error";
}
