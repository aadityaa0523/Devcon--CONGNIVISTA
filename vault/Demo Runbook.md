# Demo Runbook

Chrome or Edge only — Firefox has no [[Web Speech API]]. Fund the vault **before** recording; an out-of-gas revert on camera is the classic way to lose a demo.

**1. Connect** — show the verified contract on Etherscan. Source is published, judges can read the [[Trust Model]] note in the source itself.

**2. Enrol** — say the passphrase. Only a 32-byte hash leaves the device. Expand the compression panel: 192 bytes to 6 bytes. See [[Quantisation]].

**3. Verify** — say it again. Show the [[Hamming Distance]] and [[Cosine Similarity]] numbers. Then deliver the honest line: *the chain records the attempt, the browser makes the decision.* Saying this yourself is far stronger than being asked.

**4. Liveness challenge** — the showpiece. Request a challenge, read the four digits aloud with the passphrase, watch both ticks resolve. **Then answer it again and let it fail** — that demonstrates single-use replay protection, which is the part the chain genuinely enforces. See [[Liveness Challenge]].

**5. Session keys** — authorise once, then send three transfers with no signing prompt. See [[Session Keys]].

**6. Recovery** — add a guardian (show the salt, explain [[Guardian Privacy]]), request from a second account, cancel with voice. Switch the frontend to the demo instance first so the [[Recovery Timelock]] is 3 minutes rather than 48 hours. See [[Sepolia Deployment]].

Needs a **second funded Sepolia account** for the guardian role, since `requestRecovery` hashes `msg.sender`.

Related: [[VoxVault Index]], [[Known Limitations]]
