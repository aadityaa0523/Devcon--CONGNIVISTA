# RMS Energy

Root-mean-square amplitude of a frame — how loud it is.

`rms = sqrt( mean( sample^2 ) )`

Cheapest of the three features and the one [[Voice Activity Detection]] gates on. On its own it says little about identity, since loudness depends mostly on microphone distance — which is exactly why [[Scale Normalisation]] peak-normalises before extraction.

Its value is in the *contour*: how energy rises and falls across a phrase is a personal trait, captured by taking [[Order Statistics Aggregation]] over the deltas rather than the raw values.

Related: [[Voice Feature Extraction]], [[Zero Crossing Rate]], [[Spectral Centroid]]
