# Bugs Found

Nothing in this project had ever compiled or executed at first. Making it run surfaced several defects, two of them serious.

**The biometric was a random number generator.** The MFCC vector was filled with `Math.random()` as a placeholder. Enrolment and verification could never have matched — not "unreliably", but structurally never. Replaced by the [[Deterministic Pipeline]].

**`cancelRecovery` could never succeed.** It required an exact match between the fresh capture hash and the stored one, which no genuine recording can produce. The owner would have been permanently unable to stop a malicious recovery — the single flow the demo depended on. Reasoning in [[Why The Commitment Gates Nothing]]; there is now a regression test.

**`executeRecovery` emitted the zero address.** The event fired *after* `_clearRecoveryState()` had already zeroed `pendingNewOwner`, so ownership transferred correctly but the event announced the wrong owner. Anything indexing those events would have received garbage. Caught by a test, not by reading the code.

**`meyda@^6.3.0` does not exist.** The pinned version was fabricated, and it silently aborted every `npm install` — silently because the output was piped through `tail`, which discarded the non-zero exit code. The same pipe-swallows-exit-code mistake also produced false reports that git pushes had succeeded when nothing had left the machine.

**Miscellaneous:** `ReentrancyGuard` moved to `utils/` in OpenZeppelin 5.x; Solidity has no modifier overriding, so a redeclared `onlyOwner` was a compile error; `ethers.Wallet.fromPrivateKey` is not an ethers v6 API.

The lesson worth keeping: **code that has never run is not "done"**, however good it looks.

Related: [[Testing Strategy]], [[Deterministic Pipeline]], [[Social Recovery]]
