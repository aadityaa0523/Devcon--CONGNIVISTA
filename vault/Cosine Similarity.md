# Cosine Similarity

The cosine of the angle between two scale-normalised feature vectors, in [-1, 1]. Higher is more similar.

Computed on the full-precision floats rather than the binary form, so it throws away nothing and discriminates better than [[Hamming Distance]]. On the same real-hardware test that gave 2.1% Hamming, cosine similarity was **0.9788**.

Shown alongside Hamming in the UI: Hamming demonstrates that the compressed representation still carries signal, cosine is the better matcher. Displaying both is also a small honesty measure — a single pass/fail badge would hide how close the call actually was.

Related: [[Quantisation]], [[Threshold Tuning]], [[Scale Normalisation]]
