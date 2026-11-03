/* global modularAV */
/**
 * A walkie-talkie, run by the core's effect host after the voice gate.
 *
 * The voice goes through a high-pass, a clipper the drive pushes and a
 * low-pass, with hiss under it that follows its level. When the gate closes,
 * the post feed sends exact zeros: that ends a transmission, and the squelch
 * bursts. Room sound the gate lets through is never exact zeros, so a pause in
 * always-on speech doesn't burst.
 *
 * Whatever it makes has ended within the 0.3 s tail the module declares.
 */

const LOW_HZ = 300;
const HIGH_HZ = 3000;
/** Two biquads at these Qs make a fourth order Butterworth. */
const BUTTERWORTH_Q = [0.5412, 1.3066];
/** The clipper's gain at full drive. */
const MAX_DRIVE = 10;
/** A peak this loud comes out as loud at any drive: quieter ones are raised. */
const REFERENCE = 0.3;
/** Hiss at full static, against the voice's level. */
const MAX_STATIC = 2;
const MAX_SQUELCH = 0.25;
/** How fast the voice's level is followed, rising and falling. */
const ATTACK_S = 0.005;
const RELEASE_S = 0.03;
/** This much exact silence ends a transmission... */
const ZERO_RUN_S = 0.005;
/** ...of at least this much sound: a click doesn't burst. */
const MIN_TALK_S = 0.1;
const BURST_S = 0.2;
const BURST_ATTACK_S = 0.003;
const BURST_RELEASE_S = 0.04;
/** A change of drive glides over about this long, so it doesn't jump. */
const GLIDE_S = 0.02;

const inRange = (value, otherwise) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : otherwise;

/** Transposed direct form II, with the cookbook's coefficients. */
class Biquad {
  constructor(type, hz, q, sampleRate) {
    const w = (2 * Math.PI * hz) / sampleRate;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    const edge = type === "low" ? (1 - cos) / 2 : (1 + cos) / 2;
    this.b0 = edge / a0;
    this.b1 = ((type === "low" ? 2 : -2) * edge) / a0;
    this.b2 = edge / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
    this.z1 = 0;
    this.z2 = 0;
  }

  step(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

const butterworth = (type, hz, sampleRate) =>
  BUTTERWORTH_Q.map((q) => new Biquad(type, hz, q, sampleRate));

/** The squelch: a shaped burst of noise once a transmission ends. */
class Squelch {
  constructor(sampleRate) {
    this.zeroRun = Math.round(ZERO_RUN_S * sampleRate);
    this.minTalk = Math.round(MIN_TALK_S * sampleRate);
    this.length = Math.round(BURST_S * sampleRate);
    this.attack = Math.round(BURST_ATTACK_S * sampleRate);
    this.release = Math.round(BURST_RELEASE_S * sampleRate);
    this.talk = 0;
    this.zeros = 0;
    this.at = 0;
    this.end = 0;
  }

  /** The burst's gain for this sample, 0 to 1. */
  next(sample) {
    if (sample === 0) this.silence();
    else this.sound();
    if (this.at >= this.end) return 0;
    const at = this.at;
    this.at += 1;
    return Math.min(1, at / this.attack, (this.end - at) / this.release);
  }

  silence() {
    this.zeros += 1;
    if (this.zeros !== this.zeroRun) return;
    if (this.talk >= this.minTalk) {
      this.at = 0;
      this.end = this.length;
    }
    this.talk = 0;
  }

  /** Talking again: a burst under way fades out. */
  sound() {
    this.talk += 1;
    this.zeros = 0;
    this.end = Math.min(this.end, this.at + this.release);
  }
}

modularAV.registerAudioKernel(
  "modular-av-audio-radio",
  class {
    constructor({ sampleRate, options }) {
      this.highPass = butterworth("high", LOW_HZ, sampleRate);
      this.lowPass = butterworth("low", HIGH_HZ, sampleRate);
      this.squelch = new Squelch(sampleRate);
      this.attack = 1 - Math.exp(-1 / (ATTACK_S * sampleRate));
      this.release = 1 - Math.exp(-1 / (RELEASE_S * sampleRate));
      this.glide = 1 / (GLIDE_S * sampleRate);
      this.level = 0;
      this.seed = 0x2545f491;
      this.settings = { drive: 0.5, static: 0.3, squelch: 0.5 };
      this.configure(options);
      this.gain = this.settings.drive * MAX_DRIVE;
    }

    configure(value) {
      const { drive, static: hiss, squelch } = this.settings;
      this.settings = {
        drive: inRange(value?.drive, drive),
        static: inRange(value?.static, hiss),
        squelch: inRange(value?.squelch, squelch),
      };
    }

    /** White noise, -1 to 1: xorshift, so a test hears the same each time. */
    noise() {
      let s = this.seed;
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      this.seed = s;
      return s / 2147483648;
    }

    /** Raises quiet peaks and rounds off loud ones, the more the drive. */
    clipper(length) {
      const target = this.settings.drive * MAX_DRIVE;
      this.gain += (target - this.gain) * Math.min(1, length * this.glide);
      const gain = this.gain;
      if (gain < 1e-6) return (x) => x;
      const scale = REFERENCE / Math.tanh(gain * REFERENCE);
      return (x) => Math.tanh(gain * x) * scale;
    }

    render(input, output) {
      const [h1, h2] = this.highPass;
      const [l1, l2] = this.lowPass;
      const clip = this.clipper(output.length);
      const hiss = this.settings.static * MAX_STATIC;
      const burst = this.settings.squelch * MAX_SQUELCH;
      for (let i = 0; i < output.length; i += 1) {
        const voice = clip(h2.step(h1.step(input[i])));
        const size = Math.abs(voice);
        const rate = size > this.level ? this.attack : this.release;
        this.level += (size - this.level) * rate;
        const noisy = hiss * this.level + burst * this.squelch.next(input[i]);
        const sent = l2.step(l1.step(voice + noisy * this.noise()));
        output[i] = Math.min(1, Math.max(-1, sent));
      }
    }
  },
);
