# Guardian Privacy

Guardians are stored as `keccak256(abi.encodePacked(address, salt))`, never as raw addresses.

The naive `mapping(address => bool)` does not leak through storage, but calling `addGuardian(address)` puts the address into **public calldata forever**. That is the real leak, and it publishes your social graph to anyone reading the chain.

With commitments, the owner generates a random salt client-side and shares it with the guardian out-of-band. To act, the guardian supplies the salt and the contract re-hashes `msg.sender` to check membership. Without the salt, guardianship cannot be proven — there is a test for exactly that case, using a genuine guardian presenting the wrong salt.

**The limit of the claim:** the moment a guardian calls `requestRecovery`, their `msg.sender` is on-chain forever. This is "hidden until they act", not anonymity. True sender anonymity would need a relayer or meta-transaction layer, which is out of scope.

Stating that limit plainly matters more than the feature itself — see [[Trust Model]].

Related: [[Social Recovery]], [[Known Limitations]], [[Testing Strategy]]
