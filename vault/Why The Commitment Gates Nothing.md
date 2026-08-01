# Why The Commitment Gates Nothing

Two recordings of the same voice never produce identical feature vectors. Microphone noise, distance, room tone and speaking speed all vary. So their SHA-256 hashes never match.

Any on-chain check of the form `require(freshHash == storedHash)` therefore has exactly two possible outcomes:

1. It **always reverts**, because a genuine capture never reproduces the stored hash.
2. It "passes" only because the caller read the stored value — which is public chain state — and handed it straight back. That authenticates nothing at all.

An early revision of the contract gated `cancelRecovery` on precisely this check. The consequence was severe: the owner could **never** have stopped a malicious recovery. See [[Bugs Found]].

The fix was to remove the check and let `onlyOwner` do the work it was always actually doing. Fuzzy matching moved entirely client-side, using [[Hamming Distance]] over the binary-quantised vector.

Related: [[Trust Model]], [[Biometric Commitment]], [[Why Not Zero Knowledge Proofs]]
