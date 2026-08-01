# Session Keys

One voice authorisation, then transactions with no signing prompts until expiry.

Flow: verify voice, generate a random keypair in the browser, register its address on-chain with an expiry, and **fund it with a small gas float**. That last step is easy to forget — a fresh EOA holds no ether and cannot pay for its own transactions, so registering it alone leaves it unusable.

The key lives in `sessionStorage` rather than `localStorage`, so it is discarded when the tab closes. It is still readable by any XSS, which is acceptable only because this is testnet with a tiny float attached. See [[Known Limitations]].

`execute(to, value, data)` is guarded by `onlyOwnerOrActiveSessionKey` and `nonReentrant`. The vault spends its own balance, so it must be funded separately from the key itself.

Duration is a constructor parameter — 30 minutes on the main instance, 2 minutes on the demo one. See [[Sepolia Deployment]].

Related: [[VoxVault Contract]], [[Trust Model]], [[Demo Runbook]]
