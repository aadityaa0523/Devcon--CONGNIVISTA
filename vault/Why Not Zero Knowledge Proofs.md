# Why Not Zero Knowledge Proofs

The original design called for Groth16 proofs: prove the fresh capture is within a threshold distance of the enrolment, without revealing either. That is the correct answer to the problem in [[Privacy Paradox]].

It was cut for time. Writing, testing and deploying a circuit plus verifier is days of work, not hours.

A tempting middle path was also rejected: store the 6-byte binary vector on-chain and compute [[Hamming Distance]] in Solidity. It would genuinely work, and it is only about forty lines. But it **publishes a replayable biometric template** — anyone can read it, and you cannot rotate your voice. That defeats the entire premise.

So the honest position is [[Trust Model]]: the chain records, the client decides. ZK-SNARKs are the natural next step and are listed under [[Known Limitations]].

Related: [[Biometric Commitment]], [[Why The Commitment Gates Nothing]]
