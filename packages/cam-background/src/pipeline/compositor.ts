import {
  createFullScreen,
  createProgram,
  createTarget,
  createTexture,
  drawPass,
  type FullScreen,
  type Program,
  restoreState,
  saveState,
  type Target,
} from "./gl.ts";
import { gaussianTaps } from "./math.ts";

/**
 * Draws a frame with its background blurred or replaced, from the frame
 * and the person's mask, into the canvas. Textures hold their top row at
 * v = 0, as uploaded; only the last pass flips, since the canvas has its
 * bottom row there.
 */

/** Taps of the blur, past the centre: radius 14 at most (see gaussianTaps). */
const MAX_TAPS = 8;
/** The mask's edge: below, background; above, person; blended between. */
const EDGE = "smoothstep(0.5, 0.85, texture(u_mask, flipped).r)";

/** The frame at a quarter of its size, weighted by how much is background. */
const PREPARE_SHADER = `#version 300 es
precision mediump float;
in vec2 uv;
uniform sampler2D u_frame;
uniform sampler2D u_mask;
uniform vec2 u_texel;
out vec4 color;
void main() {
  vec3 sum = vec3(0.0);
  float weight = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 at = uv + u_texel * vec2(i % 2 == 0 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0);
    float background = 1.0 - texture(u_mask, at).r;
    sum += texture(u_frame, at).rgb * background;
    weight += background;
  }
  color = vec4(sum, weight) / 4.0;
}`;

/** One pass of a separable Gaussian, along u_direction. */
const BLUR_SHADER = `#version 300 es
precision mediump float;
in vec2 uv;
uniform sampler2D u_source;
uniform vec2 u_direction;
uniform float u_offsets[${String(MAX_TAPS)}];
uniform float u_weights[${String(MAX_TAPS)}];
uniform int u_taps;
out vec4 color;
void main() {
  vec4 sum = texture(u_source, uv) * u_weights[0];
  for (int i = 1; i < ${String(MAX_TAPS)}; i++) {
    if (i >= u_taps) break;
    vec2 step = u_direction * u_offsets[i];
    sum += (texture(u_source, uv + step) + texture(u_source, uv - step)) * u_weights[i];
  }
  color = sum;
}`;

/**
 * The person over the blurred background. The blur only spread the
 * background (weighted by it), so the person doesn't halo into it; where
 * no background was near, the frame shows through.
 */
const BLUR_COMPOSE_SHADER = `#version 300 es
precision mediump float;
in vec2 uv;
uniform sampler2D u_frame;
uniform sampler2D u_mask;
uniform sampler2D u_blurred;
out vec4 color;
void main() {
  vec2 flipped = vec2(uv.x, 1.0 - uv.y);
  vec3 frame = texture(u_frame, flipped).rgb;
  vec4 blurred = texture(u_blurred, flipped);
  vec3 background = blurred.a > 0.004 ? blurred.rgb / blurred.a : frame;
  color = vec4(mix(background, frame, ${EDGE}), 1.0);
}`;

const REPLACE_SHADER = `#version 300 es
precision mediump float;
in vec2 uv;
uniform sampler2D u_frame;
uniform sampler2D u_mask;
uniform sampler2D u_image;
out vec4 color;
void main() {
  vec2 flipped = vec2(uv.x, 1.0 - uv.y);
  vec3 frame = texture(u_frame, flipped).rgb;
  vec3 image = texture(u_image, flipped).rgb;
  color = vec4(mix(image, frame, ${EDGE}), 1.0);
}`;

export type Background =
  | { readonly mode: "blur"; readonly radius: number }
  | { readonly mode: "replace" };

export interface Compositor {
  /** The frame to draw next, as a texture of the context. */
  uploadFrame(frame: TexImageSource, width: number, height: number): void;
  /** The replacing image, already the frame's size; null: none yet. */
  setImage(image: TexImageSource | null): void;
  readonly hasImage: boolean;
  /** Draws the uploaded frame into the canvas, which is its size. */
  draw(background: Background, mask: WebGLTexture): void;
  dispose(): void;
}

interface Passes {
  readonly prepare: Program;
  readonly blur: Program;
  readonly blurCompose: Program;
  readonly replace: Program;
}

function createPasses(gl: WebGL2RenderingContext): Passes {
  const built: Program[] = [];
  const build = (source: string): Program => {
    const program = createProgram(gl, source);
    built.push(program);
    return program;
  };
  try {
    return {
      prepare: build(PREPARE_SHADER),
      blur: build(BLUR_SHADER),
      blurCompose: build(BLUR_COMPOSE_SHADER),
      replace: build(REPLACE_SHADER),
    };
  } catch (error: unknown) {
    for (const program of built) program.dispose();
    throw error;
  }
}

/** Uploads `source` into `texture`, leaving the bindings as they were. */
function upload(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  source: TexImageSource,
): void {
  const saved = saveState(gl);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  restoreState(gl, saved);
}

/** A new linear texture, leaving the bindings as they were. */
function newTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const saved = saveState(gl);
  const texture = createTexture(gl);
  restoreState(gl, saved);
  return texture;
}

/** Two targets at a quarter of the frame's size, made again when it changes. */
function quarterTargets(gl: WebGL2RenderingContext): {
  readonly for: (width: number, height: number) => readonly [Target, Target];
  readonly dispose: () => void;
} {
  let pair: readonly [Target, Target] | null = null;
  const dispose = (): void => {
    pair?.[0].dispose();
    pair?.[1].dispose();
    pair = null;
  };
  return {
    for(width, height) {
      const w = Math.max(1, Math.round(width / 4));
      const h = Math.max(1, Math.round(height / 4));
      if (pair?.[0].width === w && pair[0].height === h) return pair;
      dispose();
      pair = [createTarget(gl, w, h), createTarget(gl, w, h)];
      return pair;
    },
    dispose,
  };
}

/** Lets go of every program. */
function disposePasses(passes: Passes): void {
  for (const program of [
    passes.prepare,
    passes.blur,
    passes.blurCompose,
    passes.replace,
  ])
    program.dispose();
}

interface Blur {
  /** The frame's background, blurred, at a quarter of its size. */
  run(
    frame: WebGLTexture,
    mask: WebGLTexture,
    size: { readonly width: number; readonly height: number },
    radius: number,
  ): WebGLTexture;
  dispose(): void;
}

/** A separable Gaussian at a quarter of the frame's size, of the background only. */
function createBlur(
  gl: WebGL2RenderingContext,
  screen: FullScreen,
  passes: Passes,
): Blur {
  const quarter = quarterTargets(gl);
  let taps = gaussianTaps(0);
  let tapsRadius = 0;
  const pass = (from: Target, to: Target, dx: number, dy: number): void => {
    drawPass(gl, screen, {
      program: passes.blur,
      target: to,
      width: to.width,
      height: to.height,
      textures: [from.texture],
      setUniforms(p) {
        gl.uniform1i(p.uniform("u_source"), 0);
        gl.uniform2f(p.uniform("u_direction"), dx / to.width, dy / to.height);
        gl.uniform1fv(p.uniform("u_offsets"), padded(taps.offsets));
        gl.uniform1fv(p.uniform("u_weights"), padded(taps.weights));
        gl.uniform1i(p.uniform("u_taps"), taps.offsets.length);
      },
    });
  };
  return {
    run(frame, mask, { width, height }, radius) {
      const [a, b] = quarter.for(width, height);
      if (radius !== tapsRadius) {
        taps = gaussianTaps(radius);
        tapsRadius = radius;
      }
      drawPass(gl, screen, {
        program: passes.prepare,
        target: a,
        width: a.width,
        height: a.height,
        textures: [frame, mask],
        setUniforms(p) {
          gl.uniform1i(p.uniform("u_frame"), 0);
          gl.uniform1i(p.uniform("u_mask"), 1);
          gl.uniform2f(p.uniform("u_texel"), 1 / width, 1 / height);
        },
      });
      pass(a, b, 1, 0);
      pass(b, a, 0, 1);
      return a.texture;
    },
    dispose: quarter.dispose,
  };
}

/** The last pass, into the canvas: the frame over its new background. */
function compose(
  gl: WebGL2RenderingContext,
  screen: FullScreen,
  program: Program,
  textures: readonly [WebGLTexture, WebGLTexture, WebGLTexture],
  size: { readonly width: number; readonly height: number },
  third: "u_blurred" | "u_image",
): void {
  drawPass(gl, screen, {
    program,
    target: null,
    width: size.width,
    height: size.height,
    textures,
    setUniforms(p) {
      gl.uniform1i(p.uniform("u_frame"), 0);
      gl.uniform1i(p.uniform("u_mask"), 1);
      gl.uniform1i(p.uniform(third), 2);
    },
  });
}

/** The replacing image's texture: made on the first image, deleted on none. */
function imageSlot(gl: WebGL2RenderingContext): {
  readonly set: (image: TexImageSource | null) => void;
  readonly texture: WebGLTexture | null;
} {
  let texture: WebGLTexture | null = null;
  return {
    set: (image) => {
      if (!image) {
        if (texture) gl.deleteTexture(texture);
        texture = null;
        return;
      }
      texture ??= newTexture(gl);
      upload(gl, texture, image);
    },
    get texture() {
      return texture;
    },
  };
}

export function createCompositor(gl: WebGL2RenderingContext): Compositor {
  const screen: FullScreen = createFullScreen(gl);
  const passes = createPasses(gl);
  const blur = createBlur(gl, screen, passes);
  const frameTexture = newTexture(gl);
  const image = imageSlot(gl);
  let size = { width: 0, height: 0 };
  return {
    uploadFrame(frame, width, height) {
      size = { width, height };
      upload(gl, frameTexture, frame);
    },
    setImage: image.set,
    get hasImage() {
      return image.texture !== null;
    },
    draw(background, mask) {
      if (background.mode === "blur") {
        const blurred = blur.run(frameTexture, mask, size, background.radius);
        compose(
          gl,
          screen,
          passes.blurCompose,
          [frameTexture, mask, blurred],
          size,
          "u_blurred",
        );
        return;
      }
      const imageTexture = image.texture;
      if (!imageTexture) throw new Error("No background image yet");
      compose(
        gl,
        screen,
        passes.replace,
        [frameTexture, mask, imageTexture],
        size,
        "u_image",
      );
    },
    dispose() {
      blur.dispose();
      gl.deleteTexture(frameTexture);
      image.set(null);
      disposePasses(passes);
      screen.dispose();
    },
  };
}

const padded = (values: readonly number[]): Float32Array => {
  const out = new Float32Array(MAX_TAPS);
  out.set(values.slice(0, MAX_TAPS));
  return out;
};
