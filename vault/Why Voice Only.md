# Why Voice Only

The original design was multi-modal: voice, motion and touch, 308 dimensions.

Motion and touch were cut because **they do not exist on the demo machine**. `DeviceMotionEvent` does not fire on desktops — there is no accelerometer to read. Touch events do not fire on trackpads. Both would have returned zeros, and zeros padded into a feature vector carry no information while making the vector look impressively large.

Keeping them would have meant demoing from a phone, which drags in HTTPS hosting and MetaMask's mobile in-app browser — a materially different integration, on a deadline.

MFCC extraction was also dropped in favour of simpler features, removing a dependency and reducing risk. See [[Voice Feature Extraction]] for what replaced it, and [[Known Limitations]] for what that costs.

The name is VoxVault. Voice was always the story.

Related: [[Order Statistics Aggregation]], [[Threshold Tuning]]
