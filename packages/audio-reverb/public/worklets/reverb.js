/* global modularAV */
/**
 * A mono algorithmic reverb, run by the core's effect host: eight damped comb
 * filters side by side, then four allpass filters in a row. The delay lengths
 * are Freeverb's (Jezar at Dreampoint, public domain), scaled to the context.
 *
 * Decay is the only length a setting can give. Each comb's feedback comes from
 * it, so no setting can ring past the 3 s tail the module declares. Damping
 * only shortens that.
 */

/** Samples at 44.1 kHz. */
const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASSES = [556, 441, 341, 225];
const ALLPASS_FEEDBACK = 0.5;
const TUNED_RATE = 44_100;
const MIN_DECAY = 0.1;
const MAX_DECAY = 3;
/** The allpasses smear the end a little: the combs finish this much early. */
const DECAY_MARGIN = 0.93;
/** Brightness 1 leaves the loop open; 0 is this much of a low-pass. */
const MAX_DAMPING = 0.6;
/** Keeps speech clear of `KNEE`, at about 0.9 at its loudest. */
const HEADROOM = 0.5;
/** A held note on a comb's resonance reaches 5: above this it bends to 1. */
const KNEE = 0.8;
const BEND = 1 - KNEE;

const inRange = (value, min, max, otherwise) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : otherwise;

const bent = (sample) => {
  const size = Math.abs(sample);
  if (size <= KNEE) return sample;
  return Math.sign(sample) * (KNEE + BEND * Math.tanh((size - KNEE) / BEND));
};

const line = (samples, rate) => ({
  buffer: new Float32Array(
    Math.max(1, Math.round((samples * rate) / TUNED_RATE)),
  ),
  at: 0,
  low: 0,
  feedback: 0,
});

modularAV.registerAudioKernel(
  "modular-av-audio-reverb",
  class {
    constructor({ sampleRate, options }) {
      this.rate = sampleRate;
      this.combs = COMBS.map((samples) => line(samples, sampleRate));
      this.allpasses = ALLPASSES.map((samples) => line(samples, sampleRate));
      this.decay = 1.5;
      this.damping = 0.3;
      this.level = 0;
      this.configure(options);
    }

    configure(settings) {
      const decay = inRange(settings?.decay, MIN_DECAY, MAX_DECAY, this.decay);
      const brightness = inRange(settings?.brightness, 0, 1, null);
      this.decay = decay;
      if (brightness !== null) this.damping = (1 - brightness) * MAX_DAMPING;
      let energy = 0;
      for (const comb of this.combs) {
        const seconds = comb.buffer.length / this.rate;
        comb.feedback = 10 ** ((-3 * seconds) / (decay * DECAY_MARGIN));
        energy += 1 / (1 - comb.feedback ** 2);
      }
      // A longer decay piles up more: what comes out stays about as loud.
      this.level = HEADROOM / Math.sqrt(energy);
    }

    render(input, output) {
      const { combs, allpasses, damping, level } = this;
      const open = 1 - damping;
      for (let i = 0; i < output.length; i += 1) {
        const dry = input[i] * level;
        let wet = 0;
        for (const comb of combs) {
          const { buffer, at } = comb;
          const delayed = buffer[at];
          comb.low = delayed * open + comb.low * damping;
          buffer[at] = dry + comb.low * comb.feedback;
          comb.at = at + 1 === buffer.length ? 0 : at + 1;
          wet += delayed;
        }
        for (const allpass of allpasses) {
          const { buffer, at } = allpass;
          const delayed = buffer[at];
          buffer[at] = wet + delayed * ALLPASS_FEEDBACK;
          allpass.at = at + 1 === buffer.length ? 0 : at + 1;
          wet = delayed - wet;
        }
        output[i] = bent(wet);
      }
    }
  },
);
