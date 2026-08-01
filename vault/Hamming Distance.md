# Hamming Distance

The number of differing bits between two binary-quantised vectors. With 48 dimensions there are 48 bits to compare, so the distance is reported both raw and as a percentage.

This is the metric the accept/reject decision uses, and the one shown in the UI. It is chosen for the demo narrative as much as for accuracy: it is what survives the 32x compression described in [[Quantisation]], which makes the compression story concrete rather than abstract.

Measured on real hardware, two recordings of the same speaker came in at **1/48 bits — 2.1% differing**. Consistency is not the same as discrimination though; see [[Threshold Tuning]].

[[Cosine Similarity]] discriminates better and is displayed alongside.

Related: [[Trust Model]], [[Scale Normalisation]]
