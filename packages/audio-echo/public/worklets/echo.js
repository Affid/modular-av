/* global modularAV */
/**
 * An echo, run by the core's effect host: one delay line feeding itself.
 *
 * The feedback comes from the decay, counted from the first repeat, which comes
 * out at full level. So the last repeat worth hearing ends at the decay, and no
 * setting can ring past the 3 s tail the module declares.
 */

const MIN_TIME = 0.05;
const MAX_TIME = 0.6;
const MIN_DECAY = 0.1;
const MAX_DECAY = 3;
/** A change of time glides over about this long, so it doesn't jump. */
const GLIDE_S = 0.05;
/** A held note can pile up: above this it bends to 1. */
const KNEE = 0.8;
const BEND = 1 - KNEE;

const inRange = (value, min, max, otherwise) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : otherwise;

const bent = (sample) => {
  const size = Math.abs(sample);
  if (size <= KNEE) return sample;
  return Math.sign(sample) * (KNEE + BEND * Math.tanh((size - KNEE) / BEND));
};

modularAV.registerAudioKernel(
  "modular-av-audio-echo",
  class {
    constructor({ sampleRate, options }) {
      this.rate = sampleRate;
      this.line = new Float32Array(Math.ceil(sampleRate * MAX_TIME) + 2);
      this.at = 0;
      this.glide = 1 - Math.exp(-1 / (GLIDE_S * sampleRate));
      this.target = 0.3;
      this.decay = 1.5;
      this.feedback = 0;
      this.configure(options);
      this.frames = this.target * sampleRate;
    }

    configure(settings) {
      const time = inRange(settings?.time, MIN_TIME, MAX_TIME, this.target);
      const decay = inRange(settings?.decay, MIN_DECAY, MAX_DECAY, this.decay);
      this.target = time;
      this.decay = decay;
      this.feedback = decay > time ? 10 ** ((-3 * time) / (decay - time)) : 0;
    }

    render(input, output) {
      const { line, rate, glide, feedback } = this;
      const size = line.length;
      const target = this.target * rate;
      let { at, frames } = this;
      for (let i = 0; i < output.length; i += 1) {
        frames += (target - frames) * glide;
        const back = at - frames;
        const from = back < 0 ? back + size : back;
        const whole = Math.floor(from);
        const part = from - whole;
        const early = line[whole % size];
        const late = line[(whole + 1) % size];
        const delayed = early + (late - early) * part;
        line[at] = input[i] + delayed * feedback;
        at = at + 1 === size ? 0 : at + 1;
        output[i] = bent(delayed);
      }
      this.at = at;
      this.frames = frames;
    }
  },
);
