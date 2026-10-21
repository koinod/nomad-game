/**
 * PostFX — the post stack for the Days Gone-tier target: a cinematic
 * grade + vignette, light shafts at low sun, and a fog-tightening
 * config for World to apply.
 *
 * CAMERA BLUR — REMOVED (Ian's order, 2026-10-21: "remove camera
 * blur"). The chain used to run a BokehPass depth-of-field step
 * (RenderPass → Bokeh → grade → OutputPass) with per-tier dof flags,
 * a dofFor() parameter function, and a focus-distance feed from Game.
 * All of it is deleted — the pass is not in the chain, not disabled,
 * GONE; no other blur lives in the chain either (the grade shader is
 * pointwise color math; there is no bloom). The view is sharp at
 * every tier.
 *
 * Hard rules:
 *  - Perf is a feature. Every tier below 'high' trades resolution for
 *    frames, the grade pass is the LAST thing surrendered (one cheap
 *    fullscreen pass carries most of the look), and a governor steps
 *    quality down automatically when frames run long — the player
 *    never opens a settings menu to keep 60fps. Mobile starts low by
 *    device classification, not by failure.
 *  - The chain is linear-HDR: RenderPass → grade → OutputPass.
 *    OutputPass applies the renderer's ACES tone mapping and
 *    color-space conversion, so grading happens on linear values
 *    exactly like the no-composer path would finish.
 *  - All decision math (classification, governor, grade values, fog
 *    tuning, shaft intensity) is pure and test-pinned. The GL
 *    classes are thin shells over it.
 *
 * Integration (Game wiring — see lane report): construct after the
 * renderer exists, replace `renderer.render(scene, camera)` with
 * `postfx.render(dt)` and feed `setGradeInputs(sky.sunElevation,
 * wx.precipitation)` per frame.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, lerp, mulberry32, smoothstep } from './rng';
import type { WeatherSnapshot } from './Weather';

// ---------------------------------------------------------------- tiers

export type PostFxQuality = 'high' | 'medium' | 'low' | 'off';

/** Ascending cost order — the governor walks this list. */
export const TIER_ORDER: PostFxQuality[] = ['off', 'low', 'medium', 'high'];

export interface PostFxTierConfig {
  /** Composer pixel-ratio multiplier (on top of the renderer's). */
  renderScale: number;
  grade: boolean;
}

export const POSTFX_TIERS: Record<PostFxQuality, PostFxTierConfig> = {
  high: { renderScale: 1, grade: true },
  medium: { renderScale: 0.85, grade: true },
  low: { renderScale: 0.7, grade: true },
  off: { renderScale: 1, grade: false },
};

export function stepQuality(q: PostFxQuality, dir: 1 | -1): PostFxQuality {
  const i = TIER_ORDER.indexOf(q);
  return TIER_ORDER[clamp(i + dir, 0, TIER_ORDER.length - 1)];
}

// ------------------------------------------------- device classification

export interface DeviceSignals {
  /** Touch-primary device (coarse pointer / touch points). */
  isTouch: boolean;
  /** navigator.hardwareConcurrency (0 = unknown). */
  cores: number;
  /** navigator.deviceMemory in GB, null when the browser hides it. */
  deviceMemoryGb: number | null;
}

/**
 * Where a device STARTS. Conservative on mobile: a phone that begins
 * at 'medium' and holds it beats one that begins at 'high' and
 * stutters until the governor saves it. The governor may step DOWN
 * from here at runtime; it never steps above this initial tier.
 */
export function classifyDevicePostFx(s: DeviceSignals): PostFxQuality {
  if (s.cores > 0 && s.cores <= 2) return 'low';
  if (s.deviceMemoryGb != null && s.deviceMemoryGb <= 2) return 'low';
  if (s.isTouch) {
    return s.cores >= 6 && (s.deviceMemoryGb == null || s.deviceMemoryGb >= 4)
      ? 'medium'
      : 'low';
  }
  if (s.cores >= 8) return 'high';
  if (s.cores >= 4) return 'medium';
  return 'low';
}

let bootQuality: PostFxQuality | null = null;

/**
 * Classify this device once and remember it. Called by GameView
 * during render (before the Game boots) so Game's init can read the
 * answer synchronously. Safe to call repeatedly; safe off-browser.
 */
export function primePostFxBoot(): PostFxQuality {
  if (bootQuality) return bootQuality;
  let signals: DeviceSignals = { isTouch: false, cores: 0, deviceMemoryGb: null };
  if (typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & { deviceMemory?: number };
    signals = {
      isTouch:
        (typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(pointer: coarse)').matches) ||
        (nav.maxTouchPoints ?? 0) > 0,
      cores: nav.hardwareConcurrency ?? 0,
      deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    };
  }
  bootQuality = classifyDevicePostFx(signals);
  return bootQuality;
}

export function getPostFxBootQuality(): PostFxQuality {
  return bootQuality ?? primePostFxBoot();
}

// ------------------------------------------------------------ the governor

export const GOVERNOR = {
  /** EMA frame ms above which a step-down is considered. */
  stepDownMs: 24,
  /** EMA frame ms below which step-up streaks accumulate. */
  stepUpMs: 11.5,
  /** Frames between governor evaluations. */
  evalFrames: 45,
  /** Seconds an evaluation is locked out after a tier change. */
  cooldownSec: 3.5,
  /** Consecutive good evaluations required to step back up. */
  upStreakNeeded: 3,
};

/**
 * Adaptive quality: watches an EMA of frame intervals, steps down a
 * tier when frames run long, steps back up only after a sustained
 * streak of cheap frames, and never above the device's initial tier
 * (the cap). Hysteresis + cooldown make oscillation structurally
 * impossible: a step costs ≥3.5s of lockout on either side.
 */
export class PostFxGovernor {
  private emaMs = 1000 / 60;
  private frames = 0;
  private cooldown = 0;
  private upStreak = 0;
  readonly cap: PostFxQuality;
  quality: PostFxQuality;

  constructor(initial: PostFxQuality) {
    this.quality = initial;
    this.cap = initial;
  }

  /** Feed one frame. Returns the (possibly changed) quality tier. */
  sample(frameMs: number, dtSec: number): PostFxQuality {
    if (frameMs > 0) this.emaMs += (frameMs - this.emaMs) * 0.05;
    this.cooldown = Math.max(0, this.cooldown - dtSec);
    this.frames++;
    if (this.frames < GOVERNOR.evalFrames) return this.quality;
    this.frames = 0;
    if (this.cooldown > 0) return this.quality;
    if (this.emaMs > GOVERNOR.stepDownMs && this.quality !== 'off') {
      this.quality = stepQuality(this.quality, -1);
      this.cooldown = GOVERNOR.cooldownSec;
      this.upStreak = 0;
    } else if (this.emaMs < GOVERNOR.stepUpMs) {
      this.upStreak++;
      if (this.upStreak >= GOVERNOR.upStreakNeeded && this.quality !== this.cap) {
        this.quality = stepQuality(this.quality, 1);
        this.cooldown = GOVERNOR.cooldownSec;
        this.upStreak = 0;
      }
    } else {
      this.upStreak = 0;
    }
    return this.quality;
  }

  /** Current frame-time EMA (diagnostics). */
  get frameMs(): number {
    return this.emaMs;
  }
}

// -------------------------------------------------- DoF: REMOVED ---
// dofFor / DofParams / the BokehPass chain step were deleted on
// Ian's 2026-10-21 order ("remove camera blur") — see the module
// header. postfx.test.ts pins the removal deliberately.

// ----------------------------------------------------------------- grade

export interface GradeSettings {
  saturation: number;
  contrast: number;
  vignette: number;
}

/**
 * The cinematic grade, by sun and weather. Day is vivid and open;
 * night desaturates and tightens the vignette (the dark closes in);
 * precipitation greys and moodens whatever phase it falls in.
 */
export function gradeFor(sunElevation: number, precipitation: number): GradeSettings {
  const dayF = smoothstep(-0.08, 0.35, sunElevation);
  const p = clamp(precipitation, 0, 1);
  return {
    saturation: lerp(0.9, 1.05, dayF) - 0.08 * p,
    contrast: lerp(1.03, 1.06, dayF),
    vignette: lerp(0.34, 0.22, dayF) + 0.06 * p,
  };
}

/** Linear-space grade: lift → saturate → contrast (pivot at linear
 *  mid-grey 0.18) → vignette. Runs before OutputPass tone mapping. */
export const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1.04 },
    uContrast: { value: 1.05 },
    uVignette: { value: 0.24 },
    uLift: { value: new THREE.Vector3(0.004, 0.003, 0.002) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform vec3 uLift;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb + uLift;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.18) * uContrast + 0.18;
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - uVignette * smoothstep(0.45, 0.95, d);
      gl_FragColor = vec4(col, c.a);
    }
  `,
};

// ------------------------------------------------------------ fog tuning

/**
 * Fog/far tightening for World's weatherSkyAdjust output. Today a
 * clear sky runs fog 120→900m on a 1400m island — the horizon melts
 * into fog colour long before the far shore, which reads cheap. The
 * tuned clear range (95→620) keeps the island's scale: near shore
 * crisp, far shore a silhouette in haze. Fog weather keeps World's
 * own collapse untouched — tightening never LOOSENS a range.
 */
export const FOG_TUNING = { clearNear: 95, clearFar: 620 };

export function tightenFog(
  fogNear: number,
  fogFar: number,
  fogFactor: number,
): { fogNear: number; fogFar: number } {
  const f = clamp(fogFactor, 0, 1);
  return {
    fogNear: Math.min(fogNear, lerp(FOG_TUNING.clearNear, fogNear, f)),
    fogFar: Math.min(fogFar, lerp(FOG_TUNING.clearFar, fogFar, f)),
  };
}

// ------------------------------------------------------------ light shafts

/**
 * Shaft visibility: a low-sun phenomenon. The band opens just above
 * the horizon and closes by mid-morning elevation; cloud cover and
 * precipitation kill it (no clean sun, no shafts).
 */
export function shaftIntensity(
  sunElevation: number,
  cloudCover: number,
  precipitation: number,
): number {
  const band =
    smoothstep(0.005, 0.09, sunElevation) * (1 - smoothstep(0.3, 0.5, sunElevation));
  const sky = Math.pow(1 - clamp(cloudCover, 0, 1), 1.5) * (1 - clamp(precipitation, 0, 1));
  return clamp(band * sky, 0, 1);
}

/** Shaft colour follows the sun down: pale gold high, deep amber low. */
export function shaftTint(sunElevation: number): THREE.Color {
  const t = smoothstep(0, 0.4, sunElevation);
  return new THREE.Color(0xff9a4d).lerp(new THREE.Color(0xffdca6), t);
}

export interface ShaftAnchor {
  x: number;
  y: number; // ground height at the anchor — shaft base sits here
  z: number;
}

const SHAFT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHAFT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float side = sin(vUv.x * 3.14159);
    float vert = smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.5, 1.0, vUv.y));
    float a = side * side * vert * uIntensity;
    gl_FragColor = vec4(uColor, a);
  }
`;

/**
 * Volumetric-look light shafts: additive gradient billboards hung at
 * forest anchors (World supplies them from its scatter data — tree
 * lines). Each shaft yaws to face the camera and leans as the sun
 * drops. Intensity is a pure function of sun + weather (shaftIntensity)
 * times a per-shaft jitter so the set never pulses in unison.
 */
export class LightShafts {
  readonly group = new THREE.Group();
  private readonly shafts: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; jitter: number }[] =
    [];
  private readonly geo: THREE.PlaneGeometry;

  constructor(anchors: ShaftAnchor[], seed = 0x5af7) {
    this.group.name = 'light-shafts';
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.geo.translate(0, 0.5, 0); // origin at the base, scale.y = height
    const rng = mulberry32(seed);
    for (const a of anchors) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: SHAFT_VERT,
        fragmentShader: SHAFT_FRAG,
        uniforms: {
          uColor: { value: new THREE.Color(0xffc98a) },
          uIntensity: { value: 0 },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      const h = 20 + rng() * 22;
      mesh.scale.set(2.5 + rng() * 4.5, h, 1);
      mesh.position.set(a.x, a.y, a.z);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.shafts.push({ mesh, mat, jitter: 0.55 + rng() * 0.45 });
    }
    this.group.visible = false;
  }

  /**
   * Per-frame: face the camera, lean with the sun, set intensity.
   * `cameraPos` is the world camera position; wx is the weather
   * snapshot (cloud cover / precipitation gate the effect).
   */
  update(
    cameraPos: THREE.Vector3,
    sunElevation: number,
    wx: WeatherSnapshot,
  ): void {
    const base = shaftIntensity(sunElevation, wx.cloudCover, wx.precipitation);
    this.group.visible = base > 0.01 && this.shafts.length > 0;
    if (!this.group.visible) return;
    const tint = shaftTint(sunElevation);
    const lean = clamp((1 - clamp(sunElevation, 0, 1)) * 0.55, 0, 0.6);
    for (const s of this.shafts) {
      const p = s.mesh.position;
      s.mesh.rotation.set(0, Math.atan2(cameraPos.x - p.x, cameraPos.z - p.z), 0, 'YXZ');
      s.mesh.rotateX(lean);
      (s.mat.uniforms.uColor.value as THREE.Color).copy(tint);
      s.mat.uniforms.uIntensity.value = base * 0.4 * s.jitter;
    }
  }

  dispose(): void {
    for (const s of this.shafts) {
      s.mat.dispose();
      this.group.remove(s.mesh);
    }
    this.geo.dispose();
  }
}

// -------------------------------------------------------------- the chain

export interface PostFxOptions {
  /** Starting tier (default: the device-classified boot quality). */
  quality?: PostFxQuality;
}

/**
 * The composer chain shell. Construct once the renderer exists;
 * call render(dt) where the game used to call renderer.render.
 * Resize is self-managed (window listener + canvas client size).
 */
export class PostFX {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly composer: EffectComposer;
  private readonly gradePass: ShaderPass;
  private readonly governor: PostFxGovernor;
  private appliedTier: PostFxQuality;
  private lastNow = -1;
  private readonly onResize = () => this.syncSize();

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: PostFxOptions = {},
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const initial = options.quality ?? getPostFxBootQuality();
    this.governor = new PostFxGovernor(initial);
    this.appliedTier = initial;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gradePass = new ShaderPass(GRADE_SHADER);
    this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());

    this.applyTier(initial);
    this.syncSize();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onResize);
    }
  }

  /** Current effective tier (after the governor has had its say). */
  get quality(): PostFxQuality {
    return this.appliedTier;
  }

  /** Feed the grade its sky inputs (World's sun elevation + weather). */
  setGradeInputs(sunElevation: number, precipitation: number): void {
    const g = gradeFor(sunElevation, precipitation);
    const u = this.gradePass.uniforms;
    if (u.uSaturation) u.uSaturation.value = g.saturation;
    if (u.uContrast) u.uContrast.value = g.contrast;
    if (u.uVignette) u.uVignette.value = g.vignette;
  }

  /**
   * Render one frame. dtSec is the frame delta (the governor samples
   * the real interval internally, so render cost beyond vsync shows
   * up as it should). At tier 'off' this is a plain renderer.render.
   */
  render(dtSec: number): void {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const frameMs = this.lastNow >= 0 ? now - this.lastNow : 1000 / 60;
    this.lastNow = now;
    const tier = this.governor.sample(frameMs, Math.max(dtSec, 0.0001));
    if (tier !== this.appliedTier) this.applyTier(tier);

    if (tier === 'off') {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render();
  }

  private applyTier(tier: PostFxQuality): void {
    this.appliedTier = tier;
    const cfg = POSTFX_TIERS[tier];
    this.gradePass.enabled = cfg.grade;
    this.syncSize();
  }

  private syncSize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1);
    const h = canvas.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 1);
    const basePr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(basePr * POSTFX_TIERS[this.appliedTier].renderScale);
    this.composer.setSize(w, h);
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onResize);
    }
    this.gradePass.dispose();
    this.composer.dispose();
  }
}
