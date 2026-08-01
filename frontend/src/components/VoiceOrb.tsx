import { useEffect, useRef } from "react";

export type OrbState = "idle" | "listening" | "verified" | "failed";

interface Props {
  state: OrbState;
  /** Live microphone amplitude, 0-1. Only meaningful while listening. */
  level?: number;
  size?: number;
}

/**
 * The visual signature of the product: a rippling orb driven by real microphone
 * amplitude while recording.
 *
 * The ripple responds to `level`, which comes from an AnalyserNode on the live
 * capture stream — so it genuinely reacts to your voice rather than animating on
 * a timer. Falls back to a CSS-only glow if WebGL is unavailable.
 */
export function VoiceOrb({ state, level = 0, size = 220 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read through a ref so the animation loop is never torn down and rebuilt as
  // amplitude changes sixty times a second.
  const levelRef = useRef(level);
  const stateRef = useRef(state);
  levelRef.current = level;
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const gl =
      canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false }) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return;

    const vertexSrc = `
      attribute vec2 a_position;
      varying vec2 v_uv;
      void main() {
        v_uv = a_position;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }`;

    const fragmentSrc = `
      precision highp float;
      uniform float u_time;
      uniform float u_level;
      uniform vec3  u_colour;
      uniform float u_settled;   // 1.0 = collapsed to a solid sphere
      varying vec2 v_uv;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      void main() {
        vec2 uv = v_uv;
        float dist = length(uv);

        // Amplitude drives ripple speed, depth and overall radius.
        float amp    = u_level;
        float radius = 0.52 + amp * 0.12;
        float speed  = 1.6 + amp * 7.0;
        float freq   = 11.0 + amp * 15.0;

        float ripple = sin(dist * freq - u_time * speed) * 0.5 + 0.5;
        float grain  = noise(uv * 3.5 + u_time * 0.6);

        // Settled state: quiet, even sphere with no ripple.
        ripple = mix(ripple, 1.0, u_settled);
        grain  = mix(grain, 0.85, u_settled);

        float body = smoothstep(radius, radius - 0.34, dist);
        float halo = 0.055 / (dist + 0.04);
        float energy = (ripple * 0.72 + 0.28) * (grain * 0.55 + 0.45);

        vec3 colour = u_colour * energy * halo * body;
        colour += u_colour * 0.16 * (1.0 - clamp(dist, 0.0, 1.0)) * (0.55 + amp);

        float alpha = clamp(max(colour.r, max(colour.g, colour.b)), 0.0, 1.0);
        gl_FragColor = vec4(colour, alpha);
      }`;

    function compile(type: number, src: string) {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, src);
      gl!.compileShader(shader);
      return shader;
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSrc));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSrc));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPosition = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "u_time");
    const uLevel = gl.getUniformLocation(program, "u_level");
    const uColour = gl.getUniformLocation(program, "u_colour");
    const uSettled = gl.getUniformLocation(program, "u_settled");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const palette: Record<OrbState, [number, number, number]> = {
      idle: [0.13, 0.62, 0.72],
      listening: [0.13, 0.83, 0.93],
      verified: [0.29, 0.87, 0.5],
      failed: [0.98, 0.44, 0.52],
    };

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let raf = 0;
    let smoothed = 0;

    const render = (t: number) => {
      const current = stateRef.current;
      // Ease toward the target so the orb breathes rather than jitters.
      const target = current === "listening" ? levelRef.current : 0.06;
      smoothed += (target - smoothed) * 0.16;

      const [r, g, b] = palette[current];
      gl.uniform1f(uTime, reduceMotion ? 0 : t * 0.001);
      gl.uniform1f(uLevel, smoothed);
      gl.uniform3f(uColour, r, g, b);
      gl.uniform1f(
        uSettled,
        current === "verified" || current === "failed" ? 1 : 0
      );
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, [size]);

  return (
    <div className="orb" style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, display: "block" }}
        aria-hidden="true"
      />
    </div>
  );
}
