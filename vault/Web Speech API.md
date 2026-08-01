# Web Speech API

Browser-native speech recognition, used only by the [[Liveness Challenge]] to check the spoken number.

**Chromium only in practice.** Firefox does not implement it, so the UI feature-detects and degrades to "challenge not confirmed" rather than failing outright.

Two awkward details shaped the implementation:

**Transcription must run concurrently with recording.** The API only consumes live microphone input — it cannot be fed a decoded `AudioBuffer` after the fact. So the recorder and the recogniser open the microphone at the same time, which Chromium permits.

**Spoken numbers arrive in unpredictable forms.** "4829" might come back as digits, as "four eight two nine", or as "forty eight twenty nine". The parser handles all three, and keeps every alternative the recogniser offers, since digits often land in a lower-ranked reading rather than the top one.

**Privacy exception:** Chrome uploads audio to Google to transcribe. Only the challenge digits matter for that check, but it is a genuine departure from "nothing leaves the device" and applies to this feature alone. Disclosed in the UI and README rather than glossed over. See [[Known Limitations]].

Related: [[Trust Model]], [[Deterministic Pipeline]]
