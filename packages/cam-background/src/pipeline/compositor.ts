import {
  createFullScreen,
  createProgram,
  createTarget,
  createTexture,
  drawPass,
  type FullScreen,
  type Program,
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

export function createCompositor(gl: WebGL2RenderingContext): Compositor {
  const screen: FullScreen = createFullScreen(gl);
  const passes = createPasses(gl);
  const frameTexture = createTexture(gl);
  let imageTexture: WebGLTexture | null = null;
  let quarter: readonly [Target, Target] | null = null;
  let width = 0;
  let height = 0;
  let taps = gaussianTaps(0);
  let tapsRadius = 0;

  const upload = (texture: WebGLTexture, source: TexImageSource): void => {
    gl.activeTexture(gl.TEXTURE0);
    const before = gl.getParameter(
      gl.TEXTURE_BINDING_2D,
    ) as WebGLTexture | null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.bindTexture(gl.TEXTURE_2D, before);
  };

  const quarterTargets = (): readonly [Target, Target] => {
    const w = Math.max(1, Math.round(width / 4));
    const h = Math.max(1, Math.round(height / 4));
    if (quarter?.[0].width === w && quarter[0].height === h) return quarter;
    quarter?.[0].dispose();
    quarter?.[1].dispose();
    quarter = [createTarget(gl, w, h), createTarget(gl, w, h)];
    return quarter;
  };

  const blur = (radius: number, mask: WebGLTexture): WebGLTexture => {
    const [a, b] = quarterTargets();
    if (radius !== tapsRadius) {
      taps = gaussianTaps(radius);
      tapsRadius = radius;
    }
    drawPass(gl, screen, {
      program: passes.prepare,
      target: a,
      width: a.width,
      height: a.height,
      textures: [frameTexture, mask],
      setUniforms(p) {
        gl.uniform1i(p.uniform("u_frame"), 0);
        gl.uniform1i(p.uniform("u_mask"), 1);
        gl.uniform2f(p.uniform("u_texel"), 1 / width, 1 / height);
      },
    });
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
    pass(a, b, 1, 0);
    pass(b, a, 0, 1);
    return a.texture;
  };

  return {
    uploadFrame(frame, w, h) {
      width = w;
      height = h;
      upload(frameTexture, frame);
    },
    setImage(image) {
      if (!image) {
        if (imageTexture) gl.deleteTexture(imageTexture);
        imageTexture = null;
        return;
      }
      imageTexture ??= createTexture(gl);
      upload(imageTexture, image);
    },
    get hasImage() {
      return imageTexture !== null;
    },
    draw(background, mask) {
      if (background.mode === "replace") {
        if (!imageTexture) throw new Error("No background image yet");
        drawPass(gl, screen, {
          program: passes.replace,
          target: null,
          width,
          height,
          textures: [frameTexture, mask, imageTexture],
          setUniforms(p) {
            gl.uniform1i(p.uniform("u_frame"), 0);
            gl.uniform1i(p.uniform("u_mask"), 1);
            gl.uniform1i(p.uniform("u_image"), 2);
          },
        });
        return;
      }
      const blurred = blur(background.radius, mask);
      drawPass(gl, screen, {
        program: passes.blurCompose,
        target: null,
        width,
        height,
        textures: [frameTexture, mask, blurred],
        setUniforms(p) {
          gl.uniform1i(p.uniform("u_frame"), 0);
          gl.uniform1i(p.uniform("u_mask"), 1);
          gl.uniform1i(p.uniform("u_blurred"), 2);
        },
      });
    },
    dispose() {
      quarter?.[0].dispose();
      quarter?.[1].dispose();
      quarter = null;
      gl.deleteTexture(frameTexture);
      if (imageTexture) gl.deleteTexture(imageTexture);
      imageTexture = null;
      for (const program of [
        passes.prepare,
        passes.blur,
        passes.blurCompose,
        passes.replace,
      ])
        program.dispose();
      screen.dispose();
    },
  };
}

const padded = (values: readonly number[]): Float32Array => {
  const out = new Float32Array(MAX_TAPS);
  out.set(values.slice(0, MAX_TAPS));
  return out;
};
