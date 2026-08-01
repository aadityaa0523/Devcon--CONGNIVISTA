# Voice Feature Extraction

Produces a **48-dimensional** vector from roughly three seconds of speech.

Three per-frame features — [[RMS Energy]], [[Zero Crossing Rate]], [[Spectral Centroid]] — each yielding a time series across frames. Each series, plus its frame-to-frame first difference, is collapsed into 8 order statistics.

`3 features x 2 series x 8 statistics = 48 dimensions`

These are far coarser than the MFCCs or speaker embeddings production systems use. That was a deliberate trade — see [[Why Voice Only]]. The consequence is that match quality is unproven and must be measured per-device, which is what [[Threshold Tuning]] is for.

Related: [[Deterministic Pipeline]], [[Order Statistics Aggregation]], [[Quantisation]]
