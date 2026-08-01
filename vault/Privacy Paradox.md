# Privacy Paradox

Strong authentication wants to know who you are. Privacy wants nobody to know. Existing wallets resolve this badly:

- **Seed phrases** prove nothing about *you* — anyone holding the words is you. Phishable, and a burden to store.
- **Centralised biometrics** work, but a server holding your voiceprint is a breach waiting to happen. You cannot rotate your voice.
- **Social recovery** usually publishes your guardians' addresses, leaking your social graph.

VoxVault's answer is to prove a *match* without publishing the thing being matched. The device keeps the biometric; the chain keeps a commitment. See [[Trust Model]] for how far that actually goes — the honest answer is more limited than the pitch suggests.

Related: [[Biometric Commitment]], [[Guardian Privacy]], [[Why Not Zero Knowledge Proofs]]
