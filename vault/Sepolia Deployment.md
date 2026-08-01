# Sepolia Deployment

Two instances of **identical bytecode**, both verified on Etherscan.

| Instance | Session key | Recovery timelock | Purpose |
|---|---|---|---|
| main | 30 min | 48 hours | Real configuration |
| demo | 2 min | 3 min | Live demonstration |

The demo instance exists because a 48-hour [[Recovery Timelock]] cannot be waited out on stage, and shipping a separate "demo mode" code path would mean demonstrating something other than what ships. Constructor parameters solve this cleanly — same source, same bytecode, different arguments.

The deploy script writes both addresses to `deployments/sepolia.json`, waits 40 seconds for Etherscan to index the bytecode before attempting verification — verifying immediately after deployment usually fails — and prints retry commands rather than failing the run.

Verified source matters for judging: it lets anyone read the contract, including the [[Trust Model]] note at the top of the file.

Deployment used a key that had never transacted on any mainnet, checked across eight chains before use.

Related: [[VoxVault Contract]], [[Demo Runbook]]
