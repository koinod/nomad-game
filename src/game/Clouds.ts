/**
 * Clouds — the sky's moving layer: drifting cloud sprites, light
 * shafts, and the shared wind uniforms that foliage sway reads.
 *
 * Design rules, mirroring Weather.ts:
 *  - This module owns NO weather state. The WeatherSystem snapshot is
 *    the single source of truth; everything here is a pure function of
 *    (snapshot, sun elevation, time) plus a thin three.js shell that
 *    applies those functions. The pure functions are pinned by tests.
 *  - Coverage comes from the snapshot's cloudCover (already eased by
 *    Weather with a 45s tau, so the deck thickens and thins over ~a
 *    minute — no pops here either).
 *  - Cloud materials ignore scene fog on purpose: the deck sits at
 *    130–190m inside a span wider than the fog far plane, and fogging
 *    it would erase the sky exactly when fog is the story.
 *
 * Integration (Game / World wiring — see lane report): construct once,
 * add `layer.group` to the scene, call `layer.update(dt, focusX,
 * focusZ, weather.snapshot(), sky.sunElevation)` per frame, and feed
 * `updateWindUniforms(snapshot, elapsed)` so sway materials move with
 * the same wind the clouds drift on.
 */

import * as THREE from 'three';
import { clamp, mulberry32, smoothstep } from './rng';
import type { WeatherSnapshot } from './Weather';

// ------------------------------------------------------------------ pure

/** Fraction of the deck visible at a coverage value. Clear weather
 *  (cloudCover ≈ 0.15) still rates a few wisps; a storm deck is full. */
export function cloudVisibleFraction(cover: number): number {
  const c = clamp(cover, 0, 1);
  return 0.05 + 0.95 * smoothstep(0, 1, c);
}

/** Per-puff opacity at a coverage / precipitation pair. Rain decks are
 *  denser, not just darker. */
export function cloudOpacity(cover: number, precipitation: number): number {
  const c = clamp(cover, 0, 1);
  const p = clamp(precipitation, 0, 1);
  return clamp(0.3 + 0.5 * c + 0.12 * p, 0, 0.92);
}

export interface CloudTint {
  /** Sun-facing top of the puff. */
  lit: THREE.Color;
  /** Shadowed belly of the puff. */
  shade: THREE.Color;
}

// Elevation stops for the tint ramp. Night first, day last; the
// golden band lives between 0 and 0.45 where the palettes blend.
const TINT_STOPS: { elev: number; lit: number; shade: number }[] = [
  { elev: -0.25, lit: 0x27324a, shade: 0x11182a },
  { elev: 0.0, lit: 0xffc184, shade: 0x8a6a5e },
  { elev: 0.45, lit: 0xf7fafc, shade: 0xb4c6da },
  { elev: 1.0, lit: 0xf7fafc, shade: 0xb4c6da },
];

/**
 * Cloud tint by sun elevation, darkened and greyed by weather.
 * Precipitation is the storm signal: a full storm roughly halves the
 * light and pulls the deck toward slate.
 */
export function cloudTint(
  sunElevation: number,
  cover: number,
  precipitation: number,
): CloudTint {
  const e = clamp(sunElevation, -0.25, 1);
  let lo = TINT_STOPS[0];
  let hi = TINT_STOPS[TINT_STOPS.length - 1];
  for (let i = 0; i < TINT_STOPS.length - 1; i++) {
    if (e >= TINT_STOPS[i].elev && e <= TINT_STOPS[i + 1].elev) {
      lo = TINT_STOPS[i];
      hi = TINT_STOPS[i + 1];
      break;
    }
  }
  const t = hi.elev === lo.elev ? 0 : (e - lo.elev) / (hi.elev - lo.elev);
  const lit = new THREE.Color(lo.lit).lerp(new THREE.Color(hi.lit), t);
  const shade = new THREE.Color(lo.shade).lerp(new THREE.Color(hi.shade), t);
  const p = clamp(precipitation, 0, 1);
  const c = clamp(cover, 0, 1);
  const grey = 0.3 * c * (0.35 + 0.65 * p);
  const slate = new THREE.Color(0x69727f);
  lit.lerp(slate, grey * 0.7);
  shade.lerp(slate, grey);
  const darken = 1 - 0.5 * p;
  lit.multiplyScalar(darken);
  shade.multiplyScalar(darken);
  return { lit, shade };
}

/** Cloud drift velocity (m/s) from the snapshot's wind. Direction
 *  follows the game's wind convention (windX = cos(dir), windZ =
 *  sin(dir) — see Game's sky wiring); the deck rides higher and
 *  faster than the ground wind the rain falls through. */
export function cloudDrift(windSpeed: number, windDirRad: number): { x: number; z: number } {
  const speed = 3 + clamp(windSpeed, 0, 1) * 17;
  return { x: Math.cos(windDirRad) * speed, z: Math.sin(windDirRad) * speed };
}

/** Wrap a focus-relative offset into [-span/2, span/2). Same wrap the
 *  rain box uses, so the deck recentering is invisible. */
export function wrapDelta(d: number, span: number): number {
  const half = span / 2;
  return ((((d + half) % span) + span) % span) - half;
}

/** Gust factor for sway: slow, never negative, ±20% around the mean.
 *  Two incommensurate sines so the pattern never obviously loops. */
export function windGust(elapsed: number, windSpeed: number): number {
  const g = 0.82 + 0.18 * Math.sin(elapsed * 0.9) * Math.sin(elapsed * 0.37 + 1.7);
  return clamp(windSpeed, 0, 1) * g;
}

// ------------------------------------------------------- wind for foliage

/**
 * Shared wind uniforms. Foliage materials patched with applyWindSway
 * read THESE objects (not copies), so one updateWindUniforms call per
 * frame moves every patched material — clouds, grass and trees all
 * agree on the same wind.
 */
export const windUniforms = {
  uWindTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(1, 0) },
  uWindStrength: { value: 0 },
};

/** Feed the shared uniforms from the weather snapshot. */
export function updateWindUniforms(wx: WeatherSnapshot, elapsed: number): void {
  windUniforms.uWindTime.value = elapsed;
  windUniforms.uWindDir.value.set(Math.cos(wx.windDirRad), Math.sin(wx.windDirRad));
  windUniforms.uWindStrength.value = windGust(elapsed, wx.windSpeed);
}

export interface WindSwayOptions {
  /** Tip displacement in meters at full height / full wind. Default 0.35. */
  strength?: number;
  /** Height (object-space Y) at which sway reaches full strength. Default 6. */
  height?: number;
}

/** Spatial frequency of the sway field (rad/m): one full gust wave
 *  every ~24 m, so a gust visibly sweeps across a stand of trees
 *  instead of every tree pulsing in place. */
export const SWAY_WAVE_NUMBER = 0.26;

/**
 * The sway field (Item 2, 2026-10-21 — rewritten). Displacement is a
 * pure function of WORLD position and time:
 *
 *   phase = (worldPos · windDir) * k − t * (0.9 + 1.1 * strength)
 *   wave  = 0.75 * sin(phase) + 0.25 * sin(0.53 * phase + 1.7)
 *   amp   = heightFrac² * maxAmp * (0.25 + 0.75 * windStrength)
 *   D     = windDir * wave * amp          (|D| <= maxAmp, always)
 *
 * Same world position ⇒ same displacement, ALWAYS — that is the whole
 * point. The shader this replaces phased every vertex by gl_VertexID,
 * so duplicated seam vertices (same position, different IDs) were
 * displaced differently and the low-poly crowns tore open along their
 * seams ("trees split"), while each vertex oscillating on its own
 * phase at up to ~2.9 rad/s read as shaking. A traveling wave over
 * world space cannot tear (it is continuous everywhere) and its
 * period is 3–7 s: trees sway, they do not vibrate.
 *
 * This TS mirror is the testable truth; the GLSL in applyWindSway
 * implements the identical formula. heightFrac is the vertex's
 * object-space height fraction (clamped 0..1) — object Y is safe to
 * key on because seam duplicates share their full object position.
 */
export function swayDisplacementAt(
  worldX: number,
  worldZ: number,
  heightFrac: number,
  time: number,
  windStrength: number,
  dirX: number,
  dirZ: number,
  maxAmp: number,
): { x: number; z: number } {
  const h = Math.min(1, Math.max(0, heightFrac));
  const ws = Math.min(1, Math.max(0, windStrength));
  const phase = (worldX * dirX + worldZ * dirZ) * SWAY_WAVE_NUMBER - time * (0.9 + 1.1 * ws);
  const wave = 0.75 * Math.sin(phase) + 0.25 * Math.sin(phase * 0.53 + 1.7);
  const amp = h * h * maxAmp * (0.25 + 0.75 * ws);
  return { x: dirX * wave * amp, z: dirZ * wave * amp };
}

/**
 * Patch a standard material so its vertices sway with the shared wind
 * uniforms, displaced by the world-position field above. The shader
 * computes the vertex's world position (instance-aware), evaluates
 * the field there, and rotates the displacement back into object
 * space (transpose of the model*instance 3x3, normalized by the
 * squared scale — exact for the uniform-scale instances World
 * scatters). This is a HOOK for World to call on its foliage
 * materials — Clouds never reaches into World.
 */
export function applyWindSway(
  material: THREE.MeshStandardMaterial,
  options: WindSwayOptions = {},
): void {
  const strength = options.strength ?? 0.35;
  const height = Math.max(0.1, options.height ?? 6);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windUniforms.uWindTime;
    shader.uniforms.uWindDir = windUniforms.uWindDir;
    shader.uniforms.uWindStrength = windUniforms.uWindStrength;
    shader.uniforms.uSwayStrength = { value: strength };
    shader.uniforms.uSwayHeight = { value: height };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uWindTime;
         uniform vec2 uWindDir;
         uniform float uWindStrength;
         uniform float uSwayStrength;
         uniform float uSwayHeight;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           // world position of the undisplaced vertex (instance-aware)
           vec4 swayWorld4 = vec4(position, 1.0);
           #ifdef USE_INSTANCING
             swayWorld4 = instanceMatrix * swayWorld4;
           #endif
           swayWorld4 = modelMatrix * swayWorld4;
           // the field — identical formula to swayDisplacementAt
           float swayH = clamp(position.y / uSwayHeight, 0.0, 1.0);
           float swayPhase = dot(swayWorld4.xz, uWindDir) * ${SWAY_WAVE_NUMBER.toFixed(3)}
             - uWindTime * (0.9 + uWindStrength * 1.1);
           float swayWave = sin(swayPhase) * 0.75 + sin(swayPhase * 0.53 + 1.7) * 0.25;
           float swayAmp = swayH * swayH * uSwayStrength * (0.25 + 0.75 * uWindStrength);
           vec2 swayDispW = uWindDir * (swayWave * swayAmp);
           // world displacement -> object space (transpose = inverse
           // rotation; divide by squared scale — exact for uniform
           // scale, which is what every sway instance uses)
           mat3 swayRot = mat3(modelMatrix);
           #ifdef USE_INSTANCING
             swayRot = swayRot * mat3(instanceMatrix);
           #endif
           float swayScale2 = max(dot(swayRot[0], swayRot[0]), 0.0001);
           transformed += transpose(swayRot) * vec3(swayDispW.x, 0.0, swayDispW.y) / swayScale2;
         }`,
      );
  };
  // Patched and unpatched standard materials must not share a program.
  material.customProgramCacheKey = () => 'nomad-wind-sway-v2';
  material.needsUpdate = true;
}

// ------------------------------------------------------------- the deck

export interface CloudLayerOptions {
  /** Puffs in the deck. Default 132. */
  count?: number;
  /** Deck altitude in meters. Default 155. */
  altitude?: number;
  /** Side of the follow-box in meters. Default 1700. */
  span?: number;
  /** Placement seed — same deck every boot. Default 0xc10d5. */
  seed?: number;
}

interface Puff {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  shadeMix: number; // 0 = fully lit tint, 1 = fully shade tint
  alpha: number; // per-puff opacity jitter
  rotSpeed: number;
  fade: number; // eased 0..1 toward membership in the visible set
}

/** A soft multi-lobe puff, drawn once on a canvas — no asset files. */
function makePuffTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const cx = cv.getContext('2d')!;
  const rng = mulberry32(0xbeef);
  for (let i = 0; i < 16; i++) {
    const x = 40 + rng() * 176;
    const y = 52 + rng() * 28;
    const r = 20 + rng() * 30;
    const grad = cx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.16)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.07)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = grad;
    cx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The cloud deck: sprites in a follow-box around the player, drifting
 * on the weather wind, tinted by the sun, thickened by cloudCover.
 * Puffs fade in/out at the visible-set boundary (fade tau ~8s) so a
 * state change never pops a cloud into existence.
 */
export class CloudLayer {
  readonly group = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private readonly span: number;
  private readonly tex: THREE.CanvasTexture;
  private tint: CloudTint | null = null;

  constructor(options: CloudLayerOptions = {}) {
    const count = options.count ?? 132;
    this.span = options.span ?? 1700;
    const altitude = options.altitude ?? 155;
    const rng = mulberry32(options.seed ?? 0xc10d5);
    this.tex = makePuffTexture();
    this.group.name = 'clouds';
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      });
      const sprite = new THREE.Sprite(mat);
      const w = 150 + rng() * 210;
      sprite.scale.set(w, w * (0.36 + rng() * 0.14), 1);
      sprite.position.set(
        (rng() - 0.5) * this.span,
        altitude + (rng() - 0.5) * 55,
        (rng() - 0.5) * this.span,
      );
      sprite.frustumCulled = false;
      mat.rotation = (rng() - 0.5) * 0.35;
      this.group.add(sprite);
      this.puffs.push({
        sprite,
        mat,
        shadeMix: rng(),
        alpha: 0.65 + rng() * 0.35,
        rotSpeed: (rng() - 0.5) * 0.004,
        fade: 0,
      });
    }
  }

  /**
   * Advance the deck. `wx` is the live weather snapshot; sunElevation
   * comes from World's SkyState (World.updateSky's return).
   */
  update(
    dt: number,
    focusX: number,
    focusZ: number,
    wx: WeatherSnapshot,
    sunElevation: number,
  ): void {
    const cover = clamp(wx.cloudCover, 0, 1);
    const visibleCount = Math.round(cloudVisibleFraction(cover) * this.puffs.length);
    const baseOpacity = cloudOpacity(cover, wx.precipitation);
    const drift = cloudDrift(wx.windSpeed, wx.windDirRad);
    const tint = cloudTint(sunElevation, cover, wx.precipitation);
    this.tint = tint;
    const fadeStep = dt / 8;
    const tmp = new THREE.Color();
    for (let i = 0; i < this.puffs.length; i++) {
      const puff = this.puffs[i];
      const inSet = i < visibleCount;
      puff.fade = clamp(puff.fade + (inSet ? fadeStep : -fadeStep), 0, 1);
      const p = puff.sprite.position;
      p.x += drift.x * dt;
      p.z += drift.z * dt;
      p.x = focusX + wrapDelta(p.x - focusX, this.span);
      p.z = focusZ + wrapDelta(p.z - focusZ, this.span);
      puff.mat.rotation += puff.rotSpeed * dt;
      puff.mat.opacity = baseOpacity * puff.alpha * puff.fade;
      puff.sprite.visible = puff.fade > 0.01;
      if (puff.sprite.visible) {
        tmp.copy(tint.lit).lerp(tint.shade, puff.shadeMix);
        puff.mat.color.copy(tmp);
      }
    }
  }

  /** Most recent tint (debug / tests of the shell wiring). */
  currentTint(): CloudTint | null {
    return this.tint;
  }

  dispose(): void {
    for (const puff of this.puffs) {
      puff.mat.dispose();
      this.group.remove(puff.sprite);
    }
    this.tex.dispose();
  }
}
