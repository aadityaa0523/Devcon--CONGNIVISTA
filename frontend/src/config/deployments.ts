/**
 * Deployed VoxVault instances on Sepolia.
 *
 * These are hardcoded rather than required as environment variables because a
 * contract address is not a secret — it is on Etherscan, it is in
 * contracts/deployments/sepolia.json in this repo, and every user reads it off
 * the chain regardless.
 *
 * Making it env-only meant a host that had not been configured shipped a build
 * with `undefined` and silently disabled every control, with nothing on screen
 * to explain why. A public constant with an env override removes that failure
 * mode without giving anything up.
 *
 * VITE_CONTRACT_ADDRESS still wins when set, so anyone deploying their own
 * instance can point at it without editing source.
 */

/** 30-minute sessions, 48-hour recovery timelock. The real configuration. */
export const MAIN_ADDRESS = "0xEaAcab7C3A8771651987FAa0142E1Cef59BFF62B";

/**
 * 2-minute sessions, 3-minute timelock — identical bytecode, different
 * constructor arguments, so the recovery timelock can be waited out live.
 */
export const DEMO_ADDRESS = "0x4e93fAEE4D9A5eFa0a53C21c40e1Cb0605308a29";

export const SEPOLIA_CHAIN_ID = 11155111;

/** Env override if present, otherwise the deployed main instance. */
export function resolveContractAddress(): string {
  const fromEnv = import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined;
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : MAIN_ADDRESS;
}
