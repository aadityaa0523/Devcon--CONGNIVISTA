# Scale Normalisation

Two separate normalisations, for two separate problems.

**Peak normalisation of the audio**, before extraction: scale so the loudest sample is 1.0. Without it, [[RMS Energy]] features track how far you sat from the microphone rather than how you sound.

**Per-dimension scaling of the vector**, before any quantisation or distance computation. The dimensions live on wildly different scales — [[RMS Energy]] and [[Zero Crossing Rate]] in [0,1], [[Spectral Centroid]] in the thousands of hertz. Fixed divisors bring them onto comparable ground.

This second one is easy to overlook and quietly fatal. Mean-threshold [[Quantisation]] over raw values is decided almost entirely by the centroid dimensions; every other dimension falls below the mean and the binary vector carries almost no information.

Divisors are constants, not fitted to data, which keeps the [[Deterministic Pipeline]] deterministic.

Related: [[Hamming Distance]], [[Cosine Similarity]]
