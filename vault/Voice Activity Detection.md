# Voice Activity Detection

An energy gate. Frames whose [[RMS Energy]] falls below 12% of the loudest frame are discarded before any statistics are computed.

Without it, [[Order Statistics Aggregation]] would describe how much silence surrounded the phrase rather than how the phrase was spoken — and silence varies enormously between takes.

The threshold is a tunable constant. Too tight and captures fail with "almost no speech detected"; too loose and room tone pollutes the statistics. A healthy capture reports around 70-80 voiced frames.

Related: [[Deterministic Pipeline]], [[Threshold Tuning]]
