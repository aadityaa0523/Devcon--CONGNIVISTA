# Biometric Commitment

A SHA-256 hash of the INT8-quantised feature vector, published on-chain as a `bytes32`.

Computed with `ethers.sha256` rather than Node's `crypto`, which does not bundle into a browser build under Vite without a polyfill.

The commitment is an **audit artifact**, not an access gate — this is the crux of [[Trust Model]] and the reasoning is in [[Why The Commitment Gates Nothing]]. It proves an enrolment happened at a point in time and cannot be altered afterwards. It does not, and cannot, verify a later capture.

When answering a [[Liveness Challenge]] the commitment binds the challenge number too, so identical audio answering different challenges produces unrelated hashes.

Related: [[Quantisation]], [[VoxVault Contract]]
