/* global AudioWorkletProcessor, registerProcessor, sampleRate */
/**
 * The core's voice gate, the last stage of the microphone chain.
 *
 * It decides whether the player is speaking: the level is above a threshold
 * that is either fixed or follows the background noise, sitting a fixed
 * distance above the noise floor. The floor is learned quickly when the gate
 * starts, then falls quickly to quieter levels and rises slowly towards the
 * quietest level of the last moments: speech has pauses, steady noise
 * doesn't.
 *
 * In "gate" mode (voice activity) it silences the microphone while closed,
 * ramping to digital silence. In "detect" mode it passes everything and only
 * reports, for the speaking indicator and "speaking while muted".
 *
 * Messages in:
 *   { type: "configure", mode?: "gate" | "detect", auto?: boolean,
 *     threshold?: number (dBFS) }
 *   { type: "levels", enabled: boolean }
 * Messages out:
 *   { type: "open", open: boolean } on each transition only
 *   { type: "level", db, threshold } (dBFS) 20 times a second while enabled
 */

// The level is the mean square of the signal, smoothed with a faster time
// constant when it rises than when it falls
const LEVEL_ATTACK_S = 0.01;
const LEVEL_RELEASE_S = 0.06;
// Mean squares below this (about -100 dBFS) are digital silence, e.g. a muted
// microphone, and don't move the noise floor
const SILENCE = 1e-10;

// Auto mode: the threshold is this far above the noise floor, within limits
const AUTO_MARGIN_DB = 12;
const AUTO_MIN_THRESHOLD_DB = -60;
const AUTO_MAX_THRESHOLD_DB = -25;
const INITIAL_FLOOR_DB = -55;
const DEFAULT_THRESHOLD_DB = -50;
// When the gate starts, the floor follows the level closely for a moment
const CALIBRATION_S = 0.5;
const CALIBRATION_TIME_S = 0.05;
// Then it falls to quieter levels with this time constant...
const FLOOR_FALL_S = 0.25;
// ...and rises at most this fast (dB per second) towards the quietest level
// of the last few segments
const FLOOR_RISE_CLOSED_DB_S = 6;
const FLOOR_RISE_OPEN_DB_S = 3;
const QUIET_SEGMENT_S = 0.5;
const QUIET_SEGMENTS = 3;

// The gate closes once the level has been this far below the threshold for
// the hold time
const HYSTERESIS_DB = 3;
const HOLD_S = 0.3;
// Gain ramps when opening and closing
const ATTACK_S = 0.005;
const RELEASE_S = 0.05;

const LEVEL_INTERVAL_S = 0.05;
const MODES = ["gate", "detect"];

const isRecord = (value) => typeof value === "object" && value !== null;

class VoiceGateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.mode = "gate";
    this.auto = true;
    this.manualThreshold = DEFAULT_THRESHOLD_DB;
    this.configure(options?.processorOptions);

    this.level = SILENCE;
    this.floorDb = INITIAL_FLOOR_DB;
    this.calibrationRemaining = CALIBRATION_S;
    // The quietest level of each recent segment, and of the current one
    this.quietSegments = [];
    this.segmentQuietest = Infinity;
    this.segmentRemaining = QUIET_SEGMENT_S;
    this.open = false;
    this.holdRemaining = 0;
    this.gain = 0;
    this.levels = false;
    this.untilLevel = 0;

    this.port.onmessage = (event) => {
      this.receive(event.data);
    };
  }

  receive(data) {
    if (!isRecord(data)) return;
    if (data.type === "configure") this.configure(data);
    else if (data.type === "levels" && typeof data.enabled === "boolean") {
      this.levels = data.enabled;
      this.untilLevel = 0;
    }
  }

  configure(options) {
    if (!isRecord(options)) return;
    const { mode, auto, threshold } = options;
    if (MODES.includes(mode)) this.mode = mode;
    if (typeof auto === "boolean") this.auto = auto;
    if (typeof threshold === "number" && Number.isFinite(threshold))
      this.manualThreshold = threshold;
  }

  get threshold() {
    if (!this.auto) return this.manualThreshold;
    return Math.min(
      Math.max(this.floorDb + AUTO_MARGIN_DB, AUTO_MIN_THRESHOLD_DB),
      AUTO_MAX_THRESHOLD_DB,
    );
  }

  updateQuietSegments(db, seconds) {
    this.segmentQuietest = Math.min(this.segmentQuietest, db);
    this.segmentRemaining -= seconds;
    if (this.segmentRemaining > 0) return;
    this.quietSegments.push(this.segmentQuietest);
    if (this.quietSegments.length > QUIET_SEGMENTS) this.quietSegments.shift();
    this.segmentQuietest = Infinity;
    this.segmentRemaining = QUIET_SEGMENT_S;
  }

  updateFloor(db, seconds) {
    this.updateQuietSegments(db, seconds);
    if (this.calibrationRemaining > 0) {
      this.calibrationRemaining -= seconds;
      this.floorDb +=
        (db - this.floorDb) * (1 - Math.exp(-seconds / CALIBRATION_TIME_S));
    } else if (db < this.floorDb) {
      this.floorDb +=
        (db - this.floorDb) * (1 - Math.exp(-seconds / FLOOR_FALL_S));
    } else {
      const quietest = Math.min(
        db,
        this.segmentQuietest,
        ...this.quietSegments,
      );
      const rise = this.open ? FLOOR_RISE_OPEN_DB_S : FLOOR_RISE_CLOSED_DB_S;
      if (quietest > this.floorDb)
        this.floorDb = Math.min(this.floorDb + rise * seconds, quietest);
    }
  }

  measure(samples, length, seconds) {
    let sum = 0;
    if (samples)
      for (let i = 0; i < length; i++) sum += samples[i] * samples[i];
    const meanSquare = samples ? sum / length : 0;
    const levelTime =
      meanSquare > this.level ? LEVEL_ATTACK_S : LEVEL_RELEASE_S;
    this.level +=
      (meanSquare - this.level) * (1 - Math.exp(-seconds / levelTime));
    const db = 10 * Math.log10(Math.max(this.level, SILENCE));
    if (this.auto && meanSquare >= SILENCE) this.updateFloor(db, seconds);
    return db;
  }

  decide(db, threshold, seconds) {
    if (db >= threshold) {
      this.open = true;
      this.holdRemaining = HOLD_S;
    } else if (this.open) {
      if (db >= threshold - HYSTERESIS_DB) this.holdRemaining = HOLD_S;
      else {
        this.holdRemaining -= seconds;
        if (this.holdRemaining <= 0) this.open = false;
      }
    }
  }

  /** Ramps the gain towards open or closed; detect mode passes everything. */
  write(input, output, length) {
    const passing = this.mode === "detect" || this.open;
    const target = passing ? 1 : 0;
    const step = 1 / ((passing ? ATTACK_S : RELEASE_S) * sampleRate);
    for (let channel = 0; channel < output.length; channel++) {
      const source = input[channel] ?? input[0];
      const destination = output[channel];
      let gain = this.gain;
      for (let i = 0; i < length; i++) {
        gain =
          gain < target
            ? Math.min(gain + step, target)
            : Math.max(gain - step, target);
        destination[i] = source ? source[i] * gain : 0;
      }
      if (channel === output.length - 1) this.gain = gain;
    }
    if (output.length === 0) this.gain = target;
  }

  report(db, threshold, wasOpen, seconds) {
    if (this.open !== wasOpen)
      this.port.postMessage({ type: "open", open: this.open });
    if (!this.levels) return;
    this.untilLevel -= seconds;
    if (this.untilLevel > 0) return;
    this.untilLevel += LEVEL_INTERVAL_S;
    this.port.postMessage({
      type: "level",
      db: Math.round(db * 10) / 10,
      threshold: Math.round(threshold * 10) / 10,
    });
  }

  process(inputs, outputs) {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    const length = input[0]?.length ?? output[0]?.length ?? 128;
    const seconds = length / sampleRate;
    const db = this.measure(input[0], length, seconds);
    const threshold = this.threshold;
    const wasOpen = this.open;
    this.decide(db, threshold, seconds);
    this.write(input, output, length);
    this.report(db, threshold, wasOpen, seconds);
    return true;
  }
}

registerProcessor("modular-av-voice-gate", VoiceGateProcessor);
