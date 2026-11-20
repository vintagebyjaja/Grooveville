# Grooveville Sound Lab — setup

**Create. Produce. Refine.** A private production studio in the Back Office (**Back office › Grooveville Sound Lab**). It runs in the browser with the Web Audio API; project files and recordings are stored privately in your existing R2 bucket under `soundlab/`.

## Access

Founder, plus anyone given **Administrator** or **Producer (Sound Lab)** in the Creative Studio dashboard (Who can use Creative Studio). Publish the `firestore.rules` from this release first (see CREATIVE-STUDIO-SETUP.md).

## What works now

- Multitrack arrangement: audio, drums, 808 and instrument tracks; clips with move, trim, split, duplicate, delete, snap, loop and zoom
- Recording from a microphone or interface with count-in, punch-in inside the loop, takes kept and comped, latency offset
- Step sequencer (16/32 steps, triplets, velocity, rolls, swing, patterns, your own samples) and piano roll
- 808 Lab (glide, pitch envelope, drive, tone, sub, harmonics, your own 808 sample tuned automatically, presets)
- Genre starters: UK Drill, NY Drill, Chicago Drill, Trap, Southern Hip-Hop, Boom Bap, R&B, Southern Soul (original built-in patterns)
- Mixer with EQ, high-pass, compressor, reverb, delay, sidechain, volume automation, limiter, meters (peak, short-term loudness, correlation)
- Monitoring simulations (phone, laptop, car, club, headphones): approximations only, never applied to exports
- Low-End Assist: measures kick/808 overlap, phase and key; it only suggests
- Keyboard-first control: Space bar modes **Play**, **Quick Split** and **Beat Tap** (switch with the ` key or Alt+1/2/3), drum pads on A–K, 808 notes on Z–,, tap tempo, rebindable keys, MIDI keyboards (Chrome/Edge)
- Lyrics with locked lines, versions, syllable counts, line timing; duration presets and section fitting
- Sound DNA (tempo, key, balance; measurements only) and “Create from DNA” (an original pattern)
- Voice DNA: consent record first, founder verification, sample quality and range checks
- Sound Morph: hum/sing → notes, instrument switching with A/B, beat → instrument
- Export: 24/16-bit WAV master, stems zip, MIDI, project backup; loudness and true-peak report
- Release checklist, founder approval, comments at a time position, team access

## Not connected (shown honestly in the app)

- Full-song generation
- Vocal synthesis and voice conversion (will only ever use **Verified** voices)
- Audio timbre transform (recorded audio → another instrument)
- Stem separation of finished mixes
- MP3 encoding: browsers can’t make MP3s. Export the WAV and convert it. Grooveville Music takes MP3, so after the founder approves a song, **Prepare for Grooveville Music** saves the approved WAV master; convert it and upload it in Ent. Studio › Music.

Nothing is posted or published automatically. Writing-assistant use is kept in a private production record inside the project; public credits list people as normal.
