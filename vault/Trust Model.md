# Trust Model

The single most important note in this vault, because it is where most biometric-wallet projects quietly overclaim.

**What the chain enforces:** ownership via ECDSA signatures, session key expiry, guardian membership via salted hashes, recovery timelocks, and single-use liveness challenges.

**What the chain does not enforce:** that the voice was yours. There is no audio on-chain and no distance computation in Solidity. Voice matching happens in the browser and decides what the UI is willing to attempt.

So the biometric is a **client-side gate**, and the on-chain commitment is an **audit artifact** — tamper-evident proof that an enrolment happened and that verification attempts were made.

This is not a shortcut that could be tidied up later; it follows from [[Why The Commitment Gates Nothing]]. The alternative was rejected deliberately — see [[Why Not Zero Knowledge Proofs]].

Related: [[Biometric Commitment]], [[Liveness Challenge]], [[Known Limitations]]
