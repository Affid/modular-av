import {
  type FullScreen,
  createProgram,
  createTarget,
  drawPass,
  type Target,
} from "./gl.ts";
import { smoothingWeight } from "./math.ts";

/**
 * Steadies the person mask over time. MediaPipe segments every frame on
 * its own, so the edge of the mask jumps with the camera's noise and small
 * movements: each new mask is blended with the result before it, by how
 * much time has passed (see `smoothingWeight`).
 */
const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 uv;
uniform sampler2D u_mask;
uniform sampler2D u_previous;
uniform float u_weight;
uniform bool u_invert;
out vec4 color;
void main() {
  float value = texture(u_mask, uv).r;
  if (u_invert) value = 1.0 - value;
  float smoothed = mix(texture(u_previous, uv).r, value, u_weight);
  color = vec4(smoothed, smoothed, smoothed, 1.0);
}`;

export interface MaskSmoother {
  /**
   * Blends MediaPipe's confidence mask (a texture of this context) into
   * the result, at `now` (ms); returns the person's confidence, steadied.
   * `invert`: the mask is the background's confidence (the multiclass
   * model), not the person's.
   */
  update(
    mask: WebGLTexture,
    size: { readonly width: number; readonly height: number },
    now: number,
    invert: boolean,
  ): WebGLTexture;
  /** The latest result, or null before the first mask. */
  readonly texture: WebGLTexture | null;
  /** Forget the masks so far: the next one is taken as it is. */
  reset(): void;
  dispose(): void;
}

export function createMaskSmoother(
  gl: WebGL2RenderingContext,
  screen: FullScreen,
): MaskSmoother {
  const program = createProgram(gl, FRAGMENT_SHADER);
  let targets: readonly [Target, Target] | null = null;
  let current = 0;
  let last: number | null = null;
  let hasResult = false;

  const release = (): void => {
    targets?.[0].dispose();
    targets?.[1].dispose();
    targets = null;
  };

  return {
    update(mask, { width, height }, now, invert) {
      if (targets?.[0].width !== width || targets[0].height !== height) {
        release();
        targets = [
          createTarget(gl, width, height),
          createTarget(gl, width, height),
        ];
        last = null;
      }
      const weight = smoothingWeight(last === null ? null : now - last);
      last = now;
      const previous = targets[current];
      const next = targets[1 - current];
      if (!previous || !next) throw new Error("unreachable");
      drawPass(gl, screen, {
        program,
        target: next,
        width,
        height,
        textures: [mask, previous.texture],
        setUniforms(p) {
          gl.uniform1i(p.uniform("u_mask"), 0);
          gl.uniform1i(p.uniform("u_previous"), 1);
          gl.uniform1f(p.uniform("u_weight"), weight);
          gl.uniform1i(p.uniform("u_invert"), invert ? 1 : 0);
        },
      });
      current = 1 - current;
      hasResult = true;
      return next.texture;
    },
    get texture() {
      return hasResult ? (targets?.[current]?.texture ?? null) : null;
    },
    reset() {
      last = null;
    },
    dispose() {
      release();
      program.dispose();
      hasResult = false;
    },
  };
}
