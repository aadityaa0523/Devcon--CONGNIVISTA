# Deterministic Pipeline

The same audio in must always produce the same vector out. Without that property, enrolment and verification are not comparable and nothing else works.

There is no randomness anywhere in `biometrics.ts`. This is worth stating because an earlier revision filled the feature vector with `Math.random()` as a placeholder — see [[Bugs Found]]. Enrolment and verification could never have matched.

Stages:

1. Record, downmix to mono
2. Peak-normalise — see [[Scale Normalisation]] for why
3. Gate out silence — [[Voice Activity Detection]]
4. Split into 1024-sample frames at 50% overlap
5. Per frame: [[RMS Energy]], [[Zero Crossing Rate]], [[Spectral Centroid]]
6. Collapse via [[Order Statistics Aggregation]]

Related: [[Voice Feature Extraction]], [[Testing Strategy]]
