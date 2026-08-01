# Testing Strategy

**37 Hardhat tests**, no frontend tests. Given the time budget, contract correctness was worth more than component coverage — the contract is what holds funds.

Coverage:

- Ownership and access control, including OpenZeppelin's `OwnableUnauthorizedAccount` custom error
- [[Session Keys]]: expiry via `time.increase`, revocation before expiry, and three transactions on a single authorisation
- [[Recovery Timelock]]: travels to just short of the boundary, then just past it
- [[Guardian Privacy]]: right salt, wrong salt, non-guardian — plus an assertion that a raw address is never a valid commitment
- [[Liveness Challenge]]: single-use consumption, stale challenge values, expiry, and logging of failed attempts
- A regression test pinning the `cancelRecovery` fix from [[Bugs Found]]

The tests earned their keep immediately: one caught a live bug in `executeRecovery` that reading the code had missed.

The gap worth naming: no false-accept or false-reject measurement across a population. Only whatever you measure yourself via [[Threshold Tuning]].

Related: [[VoxVault Contract]], [[Known Limitations]]
