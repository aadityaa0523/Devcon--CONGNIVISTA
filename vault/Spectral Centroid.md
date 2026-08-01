# Spectral Centroid

The centre of mass of the magnitude spectrum, in hertz. Perceptually, the **brightness** of a sound.

`centroid = sum(f_k * magnitude_k) / sum(magnitude_k)`

The only one of the three features that needs a frequency-domain transform, which is why the project carries its own [[FFT Implementation]].

It carries the most identity information of the three, because it reflects vocal tract shape. It is also the reason [[Scale Normalisation]] exists: centroid values run to thousands of hertz while [[RMS Energy]] and [[Zero Crossing Rate]] sit between 0 and 1, so without rescaling it would dominate every distance computation.

Related: [[Voice Feature Extraction]], [[Quantisation]]
