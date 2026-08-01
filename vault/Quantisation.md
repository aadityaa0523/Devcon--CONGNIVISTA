# Quantisation

Compressing the 48-dimensional float vector, both to shrink what gets hashed and to make comparison cheap.

| Form | Size | Reduction |
|---|---|---|
| float32 | 192 bytes | — |
| INT8 min-max | 48 bytes | 4x |
| binary (1 bit/dim) | 6 bytes | 32x |

Binary quantisation records, per dimension, whether it sits above the vector's own mean. That collapses 48 dimensions into 6 bytes and still carries enough signal to compute [[Hamming Distance]].

Critically, every path applies [[Scale Normalisation]] first. Without it the mean is dominated by [[Spectral Centroid]] and the binary vector discards almost everything else.

The on-chain [[Biometric Commitment]] hashes the INT8 form, which retains more signal — the hash is 32 bytes either way.

Related: [[Cosine Similarity]], [[Voice Feature Extraction]]
