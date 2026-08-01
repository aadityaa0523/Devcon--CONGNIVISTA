# Order Statistics Aggregation

The step that makes the whole approach viable.

Two recordings of the same phrase are never the same length or speed. Frame 40 of one take does not correspond to frame 40 of the next, so any frame-by-frame comparison fails. Dynamic time warping would solve alignment properly but costs hours to implement and debug.

Instead each time series is collapsed into 8 statistics that do not care about ordering or length:

`mean, standard deviation, min, max, median, range, p25, p75`

Applied to each of the three features and to their first differences, giving the 48 dimensions of [[Voice Feature Extraction]]. The delta series is what preserves a little temporal character despite the aggregation.

Related: [[Deterministic Pipeline]], [[Why Voice Only]]
