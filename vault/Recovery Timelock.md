# Recovery Timelock

The delay between a guardian opening a recovery and it becoming executable. 48 hours on the main deployment.

It exists to defeat guardian collusion or a compromised guardian key. It buys the real owner time to notice and cancel.

A 48-hour wait cannot be demonstrated live, and that drove a specific design decision: the timelock is a **constructor parameter**, not a constant. That allows a second deployment with a 3-minute timelock from **identical bytecode**, so the live demo shows the same code that ships rather than a special demo path. See [[Sepolia Deployment]].

Locally, tests travel through the boundary with `time.increase` — one just short of the deadline expecting a revert, one just past it expecting success. See [[Testing Strategy]].

Related: [[Social Recovery]], [[Demo Runbook]]
