# FFT Implementation

An iterative radix-2 Cooley-Tukey FFT, written by hand in `biometrics.ts`, roughly fifty lines.

Two stages: a bit-reversal permutation, then log2(n) butterfly passes. Operates in place on separate real and imaginary `Float64Array`s. Input is windowed with a cached periodic Hann window first, to reduce spectral leakage at frame boundaries.

Hand-written rather than imported because the intended library, `meyda`, turned out not to exist at the version pinned — see [[Bugs Found]]. Writing it removed a dependency entirely.

Used only by [[Spectral Centroid]].

Related: [[Deterministic Pipeline]], [[Voice Feature Extraction]]
