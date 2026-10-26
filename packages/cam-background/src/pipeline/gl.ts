/**
 * WebGL2 helpers for the background effect. It draws in the context it
 * shares with MediaPipe (one OffscreenCanvas, so MediaPipe's masks are
 * textures here without a copy), so every pass binds what it needs and
 * leaves the bindings as it found them.
 */

/** Every pass draws one triangle over the target; uv runs 0..1. */
export const VERTEX_SHADER = `#version 300 es
in vec2 position;
out vec2 uv;
void main() {
  uv = (position + 1.0) / 2.0;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

/** The shader or program couldn't be built: this GPU or driver can't run it. */
export class ShaderError extends Error {
  override readonly name = "ShaderError";
}

function compile(
  gl: WebGL2RenderingContext,
  type: GLenum,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new ShaderError("Unable to create a shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    gl.deleteShader(shader);
    throw new ShaderError(`Unable to compile a shader: ${log}`);
  }
  return shader;
}

export interface Program {
  readonly program: WebGLProgram;
  uniform(name: string): WebGLUniformLocation | null;
  dispose(): void;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  fragmentSource: string,
): Program {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "position");
  gl.linkProgram(program);
  // Linked, the program keeps what it needs.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "";
    gl.deleteProgram(program);
    throw new ShaderError(`Unable to link a program: ${log}`);
  }
  const locations = new Map<string, WebGLUniformLocation | null>();
  return {
    program,
    uniform(name) {
      if (!locations.has(name))
        locations.set(name, gl.getUniformLocation(program, name));
      return locations.get(name) ?? null;
    },
    dispose() {
      gl.deleteProgram(program);
    },
  };
}

/** One triangle covering the target, at attribute 0. */
export interface FullScreen {
  readonly vertexArray: WebGLVertexArrayObject;
  dispose(): void;
}

export function createFullScreen(gl: WebGL2RenderingContext): FullScreen {
  const saved = saveState(gl);
  const vertexArray = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  restoreState(gl, saved);
  return {
    vertexArray,
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vertexArray);
    },
  };
}

/** A texture to draw into, with its framebuffer. */
export interface Target {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
  dispose(): void;
}

/** A linearly filtered RGBA texture, clamped at its edges. */
export function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

export function createTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): Target {
  const saved = saveState(gl);
  gl.activeTexture(gl.TEXTURE0);
  const texture = createTexture(gl);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  restoreState(gl, saved);
  return {
    texture,
    framebuffer,
    width,
    height,
    dispose() {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    },
  };
}

/** The texture units the passes use. */
export const UNITS = 3;

export interface SavedState {
  readonly program: WebGLProgram | null;
  readonly framebuffer: WebGLFramebuffer | null;
  readonly vertexArray: WebGLVertexArrayObject | null;
  readonly arrayBuffer: WebGLBuffer | null;
  readonly viewport: Int32Array;
  readonly activeTexture: GLenum;
  readonly textures: readonly (WebGLTexture | null)[];
  readonly blend: boolean;
  readonly scissor: boolean;
  readonly depth: boolean;
}

/** The bindings and switches the passes change, which MediaPipe also uses. */
export function saveState(gl: WebGL2RenderingContext): SavedState {
  const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as GLenum;
  const textures = Array.from({ length: UNITS }, (_, i) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    return gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
  });
  gl.activeTexture(activeTexture);
  return {
    program: gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram | null,
    framebuffer: gl.getParameter(
      gl.FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null,
    vertexArray: gl.getParameter(
      gl.VERTEX_ARRAY_BINDING,
    ) as WebGLVertexArrayObject | null,
    arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null,
    viewport: gl.getParameter(gl.VIEWPORT) as Int32Array,
    activeTexture,
    textures,
    blend: gl.isEnabled(gl.BLEND),
    scissor: gl.isEnabled(gl.SCISSOR_TEST),
    depth: gl.isEnabled(gl.DEPTH_TEST),
  };
}

const toggle = (gl: WebGL2RenderingContext, cap: GLenum, on: boolean): void => {
  if (on) gl.enable(cap);
  else gl.disable(cap);
};

export function restoreState(
  gl: WebGL2RenderingContext,
  saved: SavedState,
): void {
  saved.textures.forEach((texture, i) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  });
  gl.activeTexture(saved.activeTexture);
  gl.useProgram(saved.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, saved.framebuffer);
  gl.bindVertexArray(saved.vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, saved.arrayBuffer);
  const [x = 0, y = 0, width = 0, height = 0] = saved.viewport;
  gl.viewport(x, y, width, height);
  toggle(gl, gl.BLEND, saved.blend);
  toggle(gl, gl.SCISSOR_TEST, saved.scissor);
  toggle(gl, gl.DEPTH_TEST, saved.depth);
}

/** Draws one pass: binds its program, textures and target, then restores. */
export function drawPass(
  gl: WebGL2RenderingContext,
  screen: FullScreen,
  pass: {
    readonly program: Program;
    /** Null: the canvas itself. */
    readonly target: Target | null;
    readonly width: number;
    readonly height: number;
    readonly textures: readonly WebGLTexture[];
    readonly setUniforms?: (program: Program) => void;
  },
): void {
  const saved = saveState(gl);
  gl.bindFramebuffer(gl.FRAMEBUFFER, pass.target?.framebuffer ?? null);
  gl.viewport(0, 0, pass.width, pass.height);
  gl.disable(gl.BLEND);
  gl.disable(gl.SCISSOR_TEST);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(pass.program.program);
  gl.bindVertexArray(screen.vertexArray);
  pass.textures.forEach((texture, i) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  });
  pass.setUniforms?.(pass.program);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  restoreState(gl, saved);
}
