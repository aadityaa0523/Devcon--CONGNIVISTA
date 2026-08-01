import { useEffect, useRef } from "react";

export type OrbState = "idle" | "listening" | "verified" | "failed";

interface Props {
  state: OrbState;
  /** Live microphone amplitude, 0-1. Only meaningful while listening. */
  level?: number;
  size?: number;
}

/**
 * The visual signature of the product: an orb that ripples with your voice.
 *
 * Amplitude comes from an AnalyserNode on the live capture stream, so the motion
 * is genuinely your speech rather than a timer. Idle breathes slowly; listening
 * throws concentric rings outward in proportion to how loudly you are speaking.
 *
 * The shader fades to zero alpha well inside the canvas bounds — otherwise the
 * square edge of the canvas is visible against the page.
 */
export function VoiceOrb({ state, level = 0, size = 260 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read through refs so the render loop is never rebuilt as amplitude changes
  // sixty times a second.
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
      canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: false,
        antialias: true,
      }) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

    if (!gl) {
      canvas.classList.add("orb-fallback");
      return;
    }

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
      uniform float u_level;    // smoothed microphone amplitude, 0-1
      uniform float u_active;   // 1.0 while listening
      uniform float u_settled;  // 1.0 once a verdict has landed
      uniform vec3  u_colour;
      varying vec2 v_uv;

      float hash(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y);
      }

      void main() {
        vec2 uv = v_uv;
        float d = length(uv);

        // Everything past 0.95 is fully transparent, so the canvas edge never shows.
        float envelope = smoothstep(0.95, 0.30, d);
        if (envelope <= 0.001) {
          gl_FragColor = vec4(0.0);
          return;
        }

        float amp = u_level;

        // Idle breathes slowly; speaking drives rings outward, faster and deeper.
        float breathe = sin(u_time * 0.9) * 0.5 + 0.5;
        float coreR   = 0.10 + breathe * 0.012 + amp * 0.10;
        float speed   = 1.1 + amp * 9.0;
        float freq    = 13.0 + amp * 22.0;
        float depth   = 0.18 + amp * 0.72 * u_active;

        // Concentric rings travelling outward from the core.
        float rings = sin(d * freq - u_time * speed) * 0.5 + 0.5;
        rings = pow(rings, 1.6);

        // Break up the rings so they read as energy rather than a target pattern.
        float grain = noise(uv * 3.0 + u_time * 0.45);
        rings *= 0.55 + grain * 0.45;

        float shell = smoothstep(0.62 + amp * 0.12, 0.16, d);
        float ringLayer = rings * depth * shell;

        // Bright core, swelling with amplitude.
        float core = smoothstep(coreR, 0.0, d);

        // Wide ambient halo.
        float halo = exp(-d * 3.0) * (0.12 + amp * 0.30);

        // Settled: rings stop, leaving a calm even sphere.
        ringLayer = mix(ringLayer, shell * 0.32, u_settled);
        core = mix(core, smoothstep(0.30, 0.0, d), u_settled);

        float intensity = core * 1.15 + ringLayer + halo;
        vec3 colour = u_colour * intensity;

        // Hot centre reads white rather than saturated.
        colour += vec3(1.0) * core * (0.34 + amp * 0.4);

        float alpha = clamp(intensity * 1.5, 0.0, 1.0) * envelope;
        gl_FragColor = vec4(colour * envelope, alpha);
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
    const uActive = gl.getUniformLocation(program, "u_active");
    const uSettled = gl.getUniformLocation(program, "u_settled");
    const uColour = gl.getUniformLocation(program, "u_colour");

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const palette: Record<OrbState, [number, number, number]> = {
      idle: [0.11, 0.58, 0.70],
      listening: [0.13, 0.83, 0.93],
      verified: [0.29, 0.87, 0.50],
      failed: [0.98, 0.44, 0.52],
    };

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let raf = 0;
    let smoothed = 0;

    const render = (t: number) => {
      const current = stateRef.current;
      const listening = current === "listening";
      // Rise fast so a sudden word registers, fall slower so it does not flicker.
      const target = listening ? levelRef.current : 0.0;
      const ease = target > smoothed ? 0.35 : 0.09;
      smoothed += (target - smoothed) * ease;

      const [r, g, b] = palette[current];
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, reduceMotion ? 2.0 : t * 0.001);
      gl.uniform1f(uLevel, smoothed);
      gl.uniform1f(uActive, listening ? 1 : 0);
      gl.uniform1f(
        uSettled,
        current === "verified" || current === "failed" ? 1 : 0
      );
      gl.uniform3f(uColour, r, g, b);
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

  const meter = Math.round(Math.min(1, level) * 100);

  return (
    <div className={`orb orb--${state}`} style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size, display: "block" }}
        aria-hidden="true"
      />
      {state === "listening" && (
        <div className="orb-caption" role="status">
          <span className="dot live" />
          Listening
          <span className="orb-meter" aria-hidden="true">
            <span style={{ width: `${meter}%` }} />
          </span>
        </div>
      )}
    </div>
  );
}
