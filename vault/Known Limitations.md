# Known Limitations

Stated plainly, because a judge who finds these unmentioned trusts nothing else in the project.

**The commitment gates nothing.** Authorisation is ECDSA signatures; voice decides only what the UI offers. See [[Trust Model]] and [[Why The Commitment Gates Nothing]].

**Match quality is unproven.** Features are coarse by design. Self-consistency measured at 2.1% differing bits, but that is not discrimination — see [[Threshold Tuning]]. No false-accept rate has been measured across a population.

**Guardian privacy ends when a guardian acts.** Hidden until then, public forever after. See [[Guardian Privacy]].

**Speech recognition uploads audio to Google.** Applies only to the [[Liveness Challenge]] digits, but it is a real exception to the privacy claim. See [[Web Speech API]].

**Session keys sit in browser storage.** Readable by any XSS. Testnet-only mitigation. See [[Session Keys]].

**`_invalidateAllSessionKeys` is a no-op.** Invalidating every key on ownership change needs an enumerable set of active keys. Revoke manually for now.

**M-of-N guardians unimplemented.** `guardianThreshold` is fixed at 1 and the UI does not expose confirmations.

**No frontend tests.** See [[Testing Strategy]].

**Motion and touch cut entirely.** See [[Why Voice Only]].

Natural next step: [[Why Not Zero Knowledge Proofs]] — a real circuit would resolve the first limitation and most of the others follow from it.

Related: [[VoxVault Index]]
