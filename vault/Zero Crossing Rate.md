# Zero Crossing Rate

How often the waveform changes sign within a frame, normalised by frame length.

Cheap to compute and needs no FFT. It correlates loosely with pitch, and separates **voiced** sounds (vowels — low ZCR, periodic) from **unvoiced** ones (fricatives like /s/ and /f/ — high ZCR, noise-like).

For a fixed passphrase the pattern of voiced and unvoiced segments is quite personal, which is why it earns a place alongside [[RMS Energy]] and [[Spectral Centroid]].

Related: [[Voice Feature Extraction]], [[Deterministic Pipeline]]
