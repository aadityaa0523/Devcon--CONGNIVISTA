# VoxVault Contract

`VoxVault.sol`, Solidity 0.8.24, inheriting OpenZeppelin `Ownable` and `ReentrancyGuard`.

Constructor takes `(owner, sessionKeyDuration, recoveryTimelock, guardianCommitments)`. Taking the owner explicitly rather than defaulting to `msg.sender` means a disposable burner key can deploy on behalf of a real account — and it makes the two-instance trick in [[Sepolia Deployment]] possible.

Surface:

- [[Biometric Commitment]] — `registerBiometric`, `recordVerificationAttempt`
- [[Liveness Challenge]] — `issueChallenge`, `answerChallenge`
- [[Session Keys]] — `registerSessionKey`, `revokeSessionKey`, `execute`
- [[Social Recovery]] — `addGuardian`, `requestRecovery`, `confirmRecovery`, `executeRecovery`, `cancelRecovery`

Durations are constructor parameters rather than constants, which is what allows a short-timelock instance for live demos without touching the source.

Related: [[Testing Strategy]], [[Trust Model]]
