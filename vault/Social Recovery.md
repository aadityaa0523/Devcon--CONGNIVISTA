# Social Recovery

Guardians can move ownership if you lose access, delayed long enough for you to stop them.

1. A guardian calls `requestRecovery(newOwner, salt)`, proving membership via [[Guardian Privacy]]
2. A [[Recovery Timelock]] must elapse
3. Anyone may then call `executeRecovery`
4. During the wait, the owner may `cancelRecovery`

Cancellation is authorised by `onlyOwner` — a real signature. The client requires a passing voice match before it will offer the action, and passes its verdict through for the audit log, but the contract does not gate on it. An earlier revision did, which made cancellation impossible; see [[Bugs Found]].

The owner's ability to override guardians is the whole point of the design. Guardians propose, the owner disposes.

MVP ships with a threshold of one guardian. `confirmRecovery` and `guardianThreshold` exist in the contract for M-of-N but are not exposed in the UI; see [[Known Limitations]].

Related: [[VoxVault Contract]], [[Trust Model]]
