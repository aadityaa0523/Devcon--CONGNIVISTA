# Threshold Tuning

The accept threshold is a fraction of differing bits, exposed as a slider in the UI rather than hardcoded.

That is deliberate. Whether these features can separate two speakers is an **empirical question about the microphone and the room**, not something that can be asserted in advance. The features are coarse by design — see [[Why Voice Only]].

Method:

1. Record yourself several times, note the [[Hamming Distance]] spread
2. Have someone else say the same passphrase, note theirs
3. Set the threshold between the two clusters

If the clusters overlap, the features cannot separate you and the honest response is to say so rather than pick a flattering number. This is why the UI shows raw distances instead of a pass/fail badge.

**Self-consistency is not discrimination.** Scoring 2.1% against yourself proves only that you pass reliably. It says nothing about whether an impostor also passes.

Related: [[Cosine Similarity]], [[Known Limitations]], [[Demo Runbook]]
