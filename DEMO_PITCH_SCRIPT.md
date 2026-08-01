# VoxVault — 3-minute demo script

Every claim below is one the shipped code can back up. Nothing here describes a
feature that does not exist.

**Before you record:** Chrome or Edge (Firefox has no Web Speech API), MetaMask on
Sepolia as the owner account, vault funded via **Fund vault 0.01 ETH**, and a
second funded account ready if you are showing recovery. Enrol once as a dry run
so the first take is not your first attempt.

---

## 0:00 — 0:25 · The problem

> "Every wallet today makes you choose. Seed phrases prove nothing about *you* —
> whoever holds the words is you. Biometrics work, but they put your voiceprint on
> somebody's server, and unlike a password you cannot rotate your voice."

> "VoxVault takes a third path: prove a match, without ever publishing the thing
> being matched."

**On screen:** the orb, idle. The tagline — *Prove it's you. Reveal nothing.*

---

## 0:25 — 1:00 · Enrol

Click **Enrol**, say your passphrase.

> "Three seconds of audio. The browser splits it into overlapping frames and
> measures three things per frame — energy, zero-crossing rate, and spectral
> centroid, over an FFT we wrote by hand. Those collapse into 48 numbers."

Point at the heatmap as it appears.

> "That is the actual vector. Underneath, the same vector at one bit per
> dimension — 192 bytes down to six."

Approve the MetaMask prompt.

> "What goes on-chain is a 32-byte hash. Not the audio. Not the vector."

**On screen:** orb blooming with your voice, heatmap populating, commitment hash
appearing.

---

## 1:00 — 1:25 · Verify, and the honest bit

Click **Verify**, say it again.

> "Two percent of bits differ. Cosine similarity, 0.98."

Then say this — do not skip it:

> "And here is what the chain does *not* do. Two recordings never hash alike, so
> no contract function compares hashes for equality. If it did, it would either
> always fail, or 'pass' only because you read the stored value off the public
> chain and handed it back — which proves nothing. The matching happens here, in
> the browser. What the chain holds is a tamper-evident record that enrolment
> happened."

> "We show the raw distance and the threshold slider rather than a green tick,
> because whether this separates two people is an empirical question about the
> microphone and the room — and we have not measured it across a population."

**Why say this:** a judge who spots it themselves stops believing everything else.
Said first, it reads as engineering judgement.

---

## 1:25 — 2:05 · Liveness challenge *(the centrepiece)*

Click **Request a challenge**. A four-digit number fills the panel.

> "The contract just generated that number. To answer, I have to say it out loud —
> along with my passphrase."

Click **Answer challenge**, say the passphrase then the digits individually.

> "Two independent checks: the voice matches enrolment, and I said today's number.
> A recording made before that number existed cannot contain it."

**Then the part that lands.** Click **Answer challenge** again.

> "And it is single-use. The contract cleared it the moment it was consumed. This
> reverts — that is the replay protection, and it is the part the chain genuinely
> enforces, not something we are asking you to take on trust."

**On screen:** giant digits, countdown ring, the live transcript, both ticks
resolving, then the revert.

---

## 2:05 — 2:35 · Session keys

Click **Authorise with voice**, approve both prompts.

> "One verification registers a throwaway keypair on-chain with a 30-minute
> expiry. It also gets a small gas float — a fresh account cannot pay for its own
> transactions, which most implementations forget."

Send three transfers.

> "Three transactions. No signing prompt on any of them. The key expires on-chain;
> nobody has to trust that we forgot it."

**On screen:** countdown ring draining, transactions stacking up.

---

## 2:35 — 2:50 · Recovery *(if time allows)*

> "Guardians are stored as a hash of their address and a private salt — so adding
> a guardian does not publish who they are. They prove membership by supplying the
> salt when they act."

> "A guardian can start a recovery. A 48-hour timelock delays it, and the owner
> can cancel with their voice in the meantime. The owner always outranks the
> guardians."

If demonstrating live, switch to the demo instance first — 3-minute timelock
instead of 48 hours.

---

## 2:50 — 3:00 · Close

> "Two contracts on Sepolia, both verified — you can read the source, including
> the comment explaining exactly what the commitment does and does not prove.
> 37 tests. One of them exists because an earlier version made recovery
> impossible to cancel, and a test caught it."

> "Zero-knowledge proofs are the obvious next step. We did not have days. What we
> have instead is a system that is honest about where the trust actually sits."

---

## Shot checklist

- [ ] Orb idle, tagline visible
- [ ] Enrol — orb reacting to voice, heatmap filling
- [ ] Compression figures (192 → 48 → 6 bytes)
- [ ] Verify — Hamming and cosine on screen
- [ ] Challenge digits large and legible
- [ ] Both ticks resolving
- [ ] **Second answer attempt reverting**
- [ ] Three transfers, no MetaMask popup
- [ ] Etherscan page showing verified source
- [ ] Repo URL and contract address on the closing frame

## Recording notes

- **Rehearse the second challenge attempt.** It is the strongest beat and the
  easiest to fumble — the button disables once consumed, so request a fresh
  challenge, answer it, then try to answer the same one again.
- **Speak the digits individually** — "four, eight, two, nine", not "forty-eight
  twenty-nine". The parser handles both, but individually transcribes far more
  reliably.
- Do not screen-share with `.env` open.
- If the mic sounds quiet, watch the amplitude meter under "Listening" — a flat
  bar means it is not picking you up.

## Questions you will be asked

**"Could I just record your voice and replay it?"**
Against plain verification, yes — and that is why the liveness challenge exists.
You cannot know today's number in advance.

**"Does it ever reject anyone?"**
We have not measured false-accept across a population, which is why the threshold
is exposed rather than hidden. Self-consistency is 2.1% differing bits. That is an
honest limitation, and it is in the README.

**"Why not zero-knowledge proofs?"**
They are the correct answer and they are days of work. We also rejected storing
the vector on-chain for on-chain matching — it works, but it publishes a
replayable biometric template, which defeats the point.

**"So what does the blockchain actually add?"**
Session key expiry, the recovery timelock, guardian membership, and single-use
challenge consumption are all enforced on-chain. The biometric is the client-side
gate. We do not claim otherwise.

---

## Devfolio submission text

VoxVault is a smart wallet authorised by your voice. Audio is analysed entirely in
the browser — three seconds of speech becomes a 48-dimensional feature vector via
a hand-written FFT, compressed 32× to six bytes, and only a SHA-256 commitment
reaches the chain.

A liveness challenge defeats replayed recordings: the contract issues a four-digit
number you must speak aloud, and it is single-use and time-limited on-chain. One
verification unlocks 30 minutes of signature-free transactions through an
expiring session key. Social recovery stores guardians as salted hashes, so adding
one does not publish their address, behind a 48-hour timelock the owner can
cancel.

We are explicit about the trust model: the on-chain commitment is a tamper-evident
record, not an access gate — two recordings never hash alike, so no contract
function compares them. Authorisation is ECDSA; the voice gates the client. That
trade-off is documented at the top of the contract source.

Sepolia, both instances verified. 37 tests.
