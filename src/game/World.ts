// World.ts — deterministic terrain, biomes, scatter, structures, sky.
// Pure height/biome functions are exported so Game.getHeightAt/getBiomeAt
// (and the phone map) sample the exact same island the mesh was built from.

import * as THREE from 'three';
import { makeFbm, makeNoise2D, mulberry32, clamp, lerp, smoothstep } from './rng';
import { buildLighthouse } from './Lighthouse';
import { buildAirbaseSite } from './airbase';
import { decalPlane } from './modelKit';
import type { KitBuilding, KitResult } from './kit';
import type { BiomeId } from './Game';
import type { StationId } from '../data/items';
import type { Collider } from './Colliders';
import { LightShafts, tightenFog } from './PostFX';
import { ROAD_GRAPH } from '../data/worldWiring';
import { applyWindSway } from './Clouds';

export const WORLD = {
  xMin: -700, xMax: 700,
  zMin: -320, zMax: 320,
  waterY: 0,
};

// ---- pure terrain field -------------------------------------------------

let fbm: (x: number, z: number) => number = () => 0;
let detail: (x: number, z: number) => number = () => 0;
let ridgeN: (x: number, z: number) => number = () => 0;

export function initTerrainField(seed: number): void {
  fbm = makeFbm(seed ^ 0x9e3779b9, 4);
  detail = makeNoise2D(seed ^ 0x51ed270b);
  ridgeN = makeFbm(seed ^ 0xabcdef01, 3);
}

function townMask(x: number, z: number): number {
  return (
    smoothstep(130, 95, Math.abs(x - 40)) * smoothstep(130, 95, Math.abs(z))
  );
}

function forestMask(x: number, z: number): number {
  return (
    smoothstep(440, 330, Math.abs(x)) * smoothstep(155, 100, Math.abs(z))
  );
}

function duneBand(x: number, z: number): number {
  void x;
  const az = Math.abs(z);
  return smoothstep(95, 150, az) * smoothstep(245, 195, az);
}

/** The airbase plateau (AIRBASE wave): a graded-flat military complex on
 *  the south-east plain, formula-leveled like the town pad so the whole
 *  site — depot, runway, hangar row — sits on one surveyed grade. */
export const AIRBASE_CENTER: [number, number] = [480, -108];
export const AIRBASE_GRADE = 2.7;
function airbaseMask(x: number, z: number): number {
  return (
    smoothstep(168, 128, Math.abs(x - AIRBASE_CENTER[0])) *
    smoothstep(118, 78, Math.abs(z - AIRBASE_CENTER[1]))
  );
}

/** Terrain pads under houses: set by World after POIs resolve, before the
 *  terrain mesh is built — heightAt blends raw terrain to the pad height so
 *  floors never overlay terrain and walls never float. */
interface TerrainPad {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  y: number;
}
let terrainPads: TerrainPad[] = [];

export function setTerrainPads(pads: TerrainPad[]): void {
  terrainPads = pads;
}

/** Terrain slope magnitude at a point (finite difference of heightAt). */
export function slopeAt(x: number, z: number): number {
  const e = 1.5;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/** Deterministic island height — the ANALYTIC generator. Requires
 *  initTerrainField(seed) first. This function DEFINES the island, but
 *  nothing at runtime samples it directly once the ground field is
 *  baked (see below): it exists to generate the field and for tests
 *  that pin the island's surveyed properties. */
export function analyticHeightAt(x: number, z: number): number {
  const az = Math.abs(z);
  const ax = Math.abs(x);
  const shore = smoothstep(305, 205, az); // 1 inland, 0 at the waterline
  const xFall = smoothstep(705, 615, ax); // island tapers at both ends

  let h = 3.1 * shore;
  h += 2.7 * forestMask(x, z) * shore; // maritime forest plateau
  h = lerp(h, 2.4, townMask(x, z)); // ruined town: flattened pad
  const r = 1 - Math.abs(ridgeN(x * 0.016, z * 0.016)); // dune ridging 0..1
  h += r * r * 5.2 * duneBand(x, z) * shore;
  h += fbm(x * 0.006 + 7.3, z * 0.006 - 3.1) * 2.3 * shore; // broad swell
  h += detail(x * 0.045, z * 0.045) * 0.55 * shore; // detail
  // TOPOGRAPHY PASS (environment wave): a second, offset relief swell
  // inland + a micro octave so open ground has grain at foot scale.
  // Both sit under the beach/airbase/pad overrides below — surveyed
  // ground stays surveyed.
  h += fbm(x * 0.0028 - 3.7, z * 0.0028 + 9.2) * 1.5 * shore * smoothstep(60, 190, az + 40);
  h += detail(x * 0.16 + 11.7, z * 0.16 - 5.9) * 0.13 * shore; // micro grain
  // beach edges pull toward low sand
  const beach = smoothstep(205, 272, az);
  h = lerp(h, 1.15 + detail(x * 0.03, z * 0.03) * 0.7, beach * shore);
  // fall to water past the shoreline and past the island ends
  const water = smoothstep(318, 288, az) * smoothstep(1, 0.35, 1 - xFall);
  h = lerp(-1.6, h, clamp(water, 0, 1));
  // the airbase grade is surveyed LAST: swell, ridging, and beach pull
  // all blend out across its falloff ring, so the complex core is flat
  h = lerp(h, AIRBASE_GRADE, airbaseMask(x, z));
  // structure pads (cut/fill): full flatten across the footprint + a 1m
  // apron, then a wide feathered ring — no cliff edges at the walls, no
  // topo layers slicing through the air next to a foundation
  for (const p of terrainPads) {
    const m = Math.max(Math.abs(x - p.cx) - p.hw, Math.abs(z - p.cz) - p.hd);
    if (m < 4.5) {
      const t = clamp((m - 1.0) / 3.5, 0, 1);
      h = lerp(p.y, h, smoothstep(0, 1, t));
    }
  }
  return h;
}

// ---- THE GROUND FIELD: one source of truth (Ian playtest, 2026-10-21) ---
//
// The playtest verdict was brutal and specific: the car fell through the
// floor in places and floated on thin air in others; feet fell through
// the topo on foot. Root cause, measured: THREE different surfaces.
// The visual mesh tessellated the analytic heightAt at 4.4x4 m, the
// Rapier heightfield at 5x5 m, and gameplay sampled the analytic curve
// itself — on the dune-ridge cusps those surfaces disagree by up to
// 1.17 m, several times the suspension's whole travel.
//
// The fix is architectural: the island's ground IS a discrete field,
// sampled once from the analytic generator at 2 m. The terrain mesh's
// vertices are exactly the field nodes; the Rapier heightfield is fed
// exactly the field nodes; heightAt() — the function every gameplay
// system samples — bilinearly interpolates the field. All three agree
// by construction; the only residual is the sub-cell triangle-split
// difference (centimeters, pinned by groundTruth.test.ts).

export const GROUND_COLS = 700; // 2 m cells across the 1400 m island
export const GROUND_ROWS = 320; // 2 m cells across the 640 m island

let groundField: Float32Array | null = null;

/** Sample the analytic generator into the ground field. Called by
 *  World.build() after the terrain pads resolve (pads are part of the
 *  analytic definition) and before the terrain mesh is built. */
export function bakeGroundField(): void {
  const heights = new Float32Array((GROUND_COLS + 1) * (GROUND_ROWS + 1));
  for (let j = 0; j <= GROUND_ROWS; j++) {
    for (let i = 0; i <= GROUND_COLS; i++) {
      const x = WORLD.xMin + (i / GROUND_COLS) * (WORLD.xMax - WORLD.xMin);
      const z = WORLD.zMin + (j / GROUND_ROWS) * (WORLD.zMax - WORLD.zMin);
      heights[j * (GROUND_COLS + 1) + i] = analyticHeightAt(x, z);
    }
  }
  groundField = heights;
}

/** The baked field's node heights (null before bake) — the mesh, the
 *  physics heightfield, and the tests all read THIS array. */
export function groundFieldHeights(): Float32Array | null {
  return groundField;
}

/** Sample of the baked field; clamps to the island rect. NOT bilinear:
 *  each cell is two triangles split along the h10–h01 diagonal —
 *  probed 2026-10-21 to be the exact split BOTH Rapier's heightfield
 *  and PlaneGeometry's index buffer use, so this interpolation is the
 *  rendered surface and the physics surface, point for point. */
export function sampleGroundField(x: number, z: number): number {
  const f = groundField;
  if (!f) return analyticHeightAt(x, z);
  const fx = clamp(((x - WORLD.xMin) / (WORLD.xMax - WORLD.xMin)) * GROUND_COLS, 0, GROUND_COLS - 1e-4);
  const fz = clamp(((z - WORLD.zMin) / (WORLD.zMax - WORLD.zMin)) * GROUND_ROWS, 0, GROUND_ROWS - 1e-4);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const w = GROUND_COLS + 1;
  const h00 = f[j * w + i];
  const h10 = f[j * w + i + 1];
  const h01 = f[(j + 1) * w + i];
  const h11 = f[(j + 1) * w + i + 1];
  if (tx + tz <= 1) {
    return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
  }
  return (h10 + h01 - h11) + (h11 - h01) * tx + (h11 - h10) * tz;
}

/** THE ground truth every system samples. Before the field is baked
 *  (tests, pre-build queries) it is the analytic generator; once
 *  World.build() bakes the field, it is the field itself — the same
 *  surface the mesh renders and the physics body rides on. */
export function heightAt(x: number, z: number): number {
  return groundField ? sampleGroundField(x, z) : analyticHeightAt(x, z);
}

export function biomeAt(x: number, z: number): BiomeId {
  const h = heightAt(x, z);
  if (h < 0.45) return 'water';
  const az = Math.abs(z);
  if (townMask(x, z) > 0.4) return 'town';
  if (forestMask(x, z) > 0.45 && h >= 2.4) return 'forest';
  if (az > 215) return 'beach';
  if (h < 1.9) return 'marsh';
  return 'dune';
}

export const BIOME_COLORS: Record<BiomeId, [number, number, number]> = {
  beach: [0.82, 0.74, 0.55],
  dune: [0.62, 0.58, 0.38],
  forest: [0.22, 0.38, 0.2],
  town: [0.38, 0.38, 0.4],
  marsh: [0.3, 0.42, 0.3],
  water: [0.1, 0.23, 0.33],
};

// ---- POI placement --------------------------------------------------------

export interface PoiDef {
  id: string;
  x: number;
  zGuess: number;
}

/**
 * Campfire offsets from their POI points, shared by the World (fire
 * meshes), Interact (rest interactables), and Game (fast travel). The
 * lighthouse fire moved out of the tower's footprint when the tower
 * became a real building with walls.
 */
export const CAMPFIRE_SPOTS: Record<string, [number, number]> = {
  lighthouse_base: [8, 5],
};

/** Suggested x per INTERFACES.md; z resolved against real terrain. */
export const POI_DEFS: PoiDef[] = [
  { id: 'shore_camp', x: -560, zGuess: 250 },
  { id: 'marina', x: -605, zGuess: 80 },
  { id: 'jonah_camp', x: -380, zGuess: 60 },
  { id: 'wreck', x: -220, zGuess: 150 },
  { id: 'town', x: 40, zGuess: 0 },
  { id: 'forest_cache', x: 180, zGuess: 40 },
  { id: 'relay_station', x: 330, zGuess: -40 },
  { id: 'relay_switch', x: 338, zGuess: -34 },
  { id: 'dune_cache', x: 470, zGuess: 150 },
  { id: 'lighthouse_base', x: 600, zGuess: 40 },
  { id: 'lighthouse_top', x: 600, zGuess: 40 },
  // AIRBASE wave: the depot/airbase complex (on the plateau — resolves at
  // the nominal spot) and the beached Heavy Logistics Carrier off the
  // marina shore (open water: findLandZ falls back to the exact guess)
  { id: 'airbase', x: AIRBASE_CENTER[0], zGuess: AIRBASE_CENTER[1] },
  { id: 'carrier', x: -688, zGuess: 48 },
  // W1 (stage 7): Lane 9's six faction sites — named ground (ownership,
  // markers, NPCs, loot) until the parked buildings return. Coordinates
  // per worldWiring WORLD_WIRING_STEPS W1; z resolves via findLandZ.
  { id: 'tollgate', x: 672, zGuess: 60 },
  { id: 'raider_fort', x: 500, zGuess: 150 },
  { id: 'barn', x: -40, zGuess: 120 },
  { id: 'warehouse', x: 140, zGuess: -90 },
  { id: 'gas_station', x: -160, zGuess: -30 },
  { id: 'strip_mall', x: -60, zGuess: -120 },
];

/** Find a walkable z near the guess (height in a sane band). */
export function findLandZ(x: number, zGuess: number): number {
  for (let dz = 0; dz <= 60; dz += 5) {
    for (const s of [1, -1]) {
      const z = zGuess + dz * s;
      const h = heightAt(x, z);
      if (h > 1.1 && h < 9) return z;
    }
  }
  return zGuess;
}

// ---- world builder --------------------------------------------------------

export interface SkyState {
  isNight: boolean;
  sunElevation: number; // -1..1
}

const DAY_SKY = new THREE.Color(0x87b5d6);
const SUNSET_SKY = new THREE.Color(0xd98a52);
const NIGHT_SKY = new THREE.Color(0x05080f);
const DAY_FOG = new THREE.Color(0x9db8c8);
const NIGHT_FOG = new THREE.Color(0x070b12);

/** Lighting baseline (2026-10-20, Ian's order — "a real sun"): the sky
 *  is not just a background color. A PMREM environment is generated from
 *  a procedural sky dome (zenith/horizon/ground + sun glow) per phase of
 *  day, giving every PBR surface image-based light; a hemisphere light
 *  guarantees bounce fill so enclosed interiors at midday are SHADED,
 *  never pitch black (honest fake GI: hemisphere + env, no real GI).
 *  The directional sun + ACES tone mapping complete the baseline. */
/** Weather's vote on the sky (the WeatherSystem snapshot, narrowed). */
export interface SkyWeather {
  cloudCover: number; // 0..1
  fog: number; // 0..1
  precipitation: number; // 0..1
  /** Ground wetness 0..1 (Item 3): the terrain must LOOK as wet as
   *  the grip says it is — before this field existed, wetness fed the
   *  tire model and the HUD but nothing rendered it, so the ground
   *  looked bone dry while grip fell to 0.65x. */
  wetness?: number; // 0..1
}

export interface SkyAdjust {
  sunScale: number;
  hemiScale: number;
  envScale: number;
  fogNear: number;
  fogFar: number;
}

/**
 * How weather bends the lighting baseline: cloud cover eats the sun
 * (and some bounce/IBL), fog + rain collapse the view distance. Pure —
 * updateSky applies it; tests pin it.
 */
export function weatherSkyAdjust(wx: SkyWeather | undefined): SkyAdjust {
  if (!wx) return { sunScale: 1, hemiScale: 1, envScale: 1, fogNear: 120, fogFar: 900 };
  const cc = clamp(wx.cloudCover, 0, 1);
  const fogF = clamp(wx.fog + wx.precipitation * 0.45, 0, 1);
  return {
    sunScale: 1 - 0.82 * cc,
    hemiScale: 1 - 0.25 * cc,
    envScale: 1 - 0.6 * cc,
    fogNear: 120 + (6 - 120) * fogF,
    fogFar: 900 + (55 - 900) * fogF,
  };
}

export type SkyPhase = 'day' | 'golden' | 'night';

export function skyPhase(sunElevation: number): SkyPhase {
  if (sunElevation > 0.25) return 'day';
  if (sunElevation > -0.06) return 'golden';
  return 'night';
}

export interface SkyPalette {
  zenith: number;
  horizon: number;
  ground: number;
  sun: number;
  envIntensity: number;
  hemiIntensity: number;
}

export const SKY_PALETTES: Record<SkyPhase, SkyPalette> = {
  day: { zenith: 0x2f62a8, horizon: 0xc3d7e8, ground: 0x54503f, sun: 0xfff2dd, envIntensity: 0.5, hemiIntensity: 0.55 },
  golden: { zenith: 0x39598c, horizon: 0xe9b47c, ground: 0x4c463a, sun: 0xffb36b, envIntensity: 0.42, hemiIntensity: 0.45 },
  night: { zenith: 0x05070f, horizon: 0x111a29, ground: 0x0a0c10, sun: 0x8fa8d8, envIntensity: 0.1, hemiIntensity: 0.2 },
};

/** The sky's colors CONTINUOUSLY, by sun elevation (Item 7): the
 *  phase palettes are three stops; the visible dome blends between
 *  them so dawn/dusk are gradients in time, not steps. Endpoints are
 *  the palettes themselves (elev ≥ 0.25 = day, 0 = golden,
 *  ≤ −0.06 = night — the skyPhase thresholds).
 *
 *  Item 3 (2026-10-21): the INTENSITIES blend too. updateSky used to
 *  read hemi/env straight from SKY_PALETTES[skyPhase(elev)], so the
 *  whole scene's fill light stepped at the phase thresholds (hemi
 *  0.45→0.55 at elev 0.25, 0.2→0.45 at −0.06; env 0.42→0.5 and
 *  0.1→0.42) while the colors eased — a visible lighting pop twice a
 *  day. The palettes themselves are unchanged (lighting.test pins
 *  them); only their application is continuous now. */
export function skyPaletteAt(elev: number): {
  zenith: number; horizon: number; ground: number; sun: number;
  envIntensity: number; hemiIntensity: number;
} {
  const mix = (a: SkyPalette, b: SkyPalette, t: number) => {
    const c = (x: number, y: number) => new THREE.Color(x).lerp(new THREE.Color(y), t).getHex();
    return {
      zenith: c(a.zenith, b.zenith), horizon: c(a.horizon, b.horizon),
      ground: c(a.ground, b.ground), sun: c(a.sun, b.sun),
      envIntensity: a.envIntensity + (b.envIntensity - a.envIntensity) * t,
      hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * t,
    };
  };
  const pick = (p: SkyPalette) => ({
    zenith: p.zenith, horizon: p.horizon, ground: p.ground, sun: p.sun,
    envIntensity: p.envIntensity, hemiIntensity: p.hemiIntensity,
  });
  if (elev >= 0.25) return pick(SKY_PALETTES.day);
  if (elev >= 0) return mix(SKY_PALETTES.golden, SKY_PALETTES.day, elev / 0.25);
  if (elev >= -0.06) return mix(SKY_PALETTES.night, SKY_PALETTES.golden, (elev + 0.06) / 0.06);
  return pick(SKY_PALETTES.night);
}

/**
 * Sun/moon crossfade (Item 3, 2026-10-21). updateSky used to switch
 * light sources on a hard `elev > 0.02` branch: sun intensity jumped
 * 0 → ~0.36, the moon fill 0.35 → 0, the fog colour snapped from
 * night to day stock, and the sky disc teleported from the moon's
 * fixed position to the sun's. This blend is the single continuous
 * replacement: a smoothstep band across the horizon (elev −0.03 …
 * +0.05) where the sun ramps in as the moon ramps out. Pure — tests
 * pin continuity at the old branch line.
 */
export function sunMoonBlend(elev: number): { sun: number; moon: number } {
  const t = clamp((elev + 0.03) / 0.08, 0, 1);
  const s = t * t * (3 - 2 * t);
  return { sun: s, moon: 1 - s };
}

/** Rain streak opacity from precipitation (Item 3): ramps from ZERO
 *  with the eased precipitation factor. The old rule (visible at
 *  p > 0.02, opacity instantly 0.16 + p·0.5) popped the whole rain
 *  box in at ~0.17 opacity the moment a shower started. Same ceiling
 *  (0.66 at p = 1), no step. */
export function rainOpacity(precipitation: number): number {
  return clamp(precipitation, 0, 1) * 0.66;
}

/**
 * How soaked ground LOOKS (Item 3): wet terrain is darker and
 * smoother (lower roughness — puddle sheen on the micro surface).
 * `darken` multiplies the terrain material colour (the terrain uses
 * vertex colours over a white base, so the multiplier darkens the
 * baked biome colours without touching them). Grip and looks now
 * read the same wetness number.
 */
export function terrainWetnessLook(wetness: number): { roughness: number; darken: number } {
  const w = clamp(wetness, 0, 1);
  return { roughness: 0.95 * (1 - 0.5 * w), darken: 1 - 0.28 * w };
}

/** The sky shader — ONE factory for the PMREM environment dome and
 *  the visible sky dome, so the light the surfaces drink and the sky
 *  the player sees are the same sky. The sun term is a tight disc +
 *  corona + wide halo (strengthened for Item 7: previously the disc
 *  existed only inside the IBL bake — the visible sky was a flat
 *  background color, which is why the sun never read as real). */
export function makeSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x2f62a8) },
      horizon: { value: new THREE.Color(0xc3d7e8) },
      ground: { value: new THREE.Color(0x54503f) },
      sunColor: { value: new THREE.Color(0xfff2dd) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunBoost: { value: 1 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground;
      uniform vec3 sunColor; uniform vec3 sunDir; uniform float sunBoost;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.55));
        col = mix(col, ground, smoothstep(0.02, -0.3, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunColor * sunBoost * (pow(s, 800.0) * 5.0 + pow(s, 240.0) * 2.2 + pow(s, 8.0) * 0.20);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export class World {
  readonly scene: THREE.Scene;
  readonly seed: number;
  readonly rng: () => number;
  poiPositions: Record<string, [number, number]> = {};
  /** The rebuilt lighthouse (kit): colliders/floors/containers/roofs for
   *  Game to merge, the gate-audited building record, and the lamp room
   *  floor height the beacon/reach gates read. */
  lighthouseKit!: KitResult;
  lighthouseBuilding?: KitBuilding;
  lampRoomY = 0;
  /** The REVAMPED AIRBASE (Ian, 2026-10-21 — un-parked for the airbase
   *  only): the portable kit sited at AIRBASE_SITE (airbaseSite.ts —
   *  today the plateau; the Beta Island map wave re-sites it in one
   *  move). Game merges these like the lighthouse's. */
  airfieldKits: KitResult[] = [];
  /** Apron prop colliders (floodlight poles, windsock). */
  airfieldPropColliders: Collider[] = [];
  // physical crafting stations: { station, x, z } + their colliders
  stations: { station: StationId; x: number; z: number }[] = [];
  stationColliders: Collider[] = [];
  /** Lane 12: light shafts hung at forest anchors (built in
   *  buildScatter); Game drives update() per frame with camera + sun. */
  lightShafts: LightShafts | null = null;

  private sun!: THREE.DirectionalLight;
  private skyAdj: SkyAdjust = weatherSkyAdjust(undefined);
  private rain?: THREE.Points;
  private rainPos?: Float32Array;
  private wxPrecip = 0;
  private wxWindX = 0;
  private wxWindZ = 0;
  /** Item 3: fog targets from the 4 Hz updateSky; World.update damps
   *  the live fog toward them per frame (no 150 m steps at onsets). */
  private fogNearT = 120;
  private fogFarT = 900;
  private fogInit = false;
  /** Item 3: rain's display precipitation — damped toward the 4 Hz
   *  wxPrecip per frame so opacity/density never step at tick rate. */
  private rainPrecipCur = 0;
  private hemi!: THREE.HemisphereLight;
  private moonFill!: THREE.DirectionalLight;
  private stars!: THREE.Points;
  private starMat!: THREE.PointsMaterial;
  private beam!: THREE.Mesh;
  private beamPivot!: THREE.Group;
  private lampLight!: THREE.PointLight;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envScene: THREE.Scene | null = null;
  private envMat: THREE.ShaderMaterial | null = null;
  private envTex: THREE.Texture | null = null;
  private envPhase: SkyPhase | null = null;
  private skyMat: THREE.ShaderMaterial | null = null;
  private skyDome: THREE.Mesh | null = null;
  private water!: THREE.Mesh;
  private waterMat!: THREE.MeshStandardMaterial;
  private terrainMat!: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, seed: number) {
    this.scene = scene;
    this.seed = seed;
    this.rng = mulberry32(seed ^ 0x12345678);
    initTerrainField(seed);
  }

  /** One-time IBL setup (Game calls this once the renderer exists): a
   *  PMREM environment baked from the procedural sky dome. Regenerated
   *  only when the phase of day changes (see updateSky). */
  setupEnvironment(renderer: THREE.WebGLRenderer): void {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envMat = makeSkyMaterial();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.envMat);
    this.envScene.add(dome);
    this.envPhase = null;
    this.applyEnvironment(skyPhase(1), new THREE.Vector3(0.3, 1, 0.2));
  }

  /** The VISIBLE sky (Item 7): the same shader as the IBL dome, on a
   *  world-scale sphere in the main scene. Before this, scene.background
   *  was a flat color and the gradient/disc existed only inside the
   *  PMREM bake — lit surfaces drank a real sky the player never saw.
   *  Follows the player (World.update) so its edge is never reached;
   *  radius sits inside the camera far plane (3200). */
  private buildSkyDome(): void {
    this.skyMat = makeSkyMaterial();
    (this.skyMat.uniforms.sunBoost.value as number) = 1.6;
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), this.skyMat);
    this.skyDome.frustumCulled = false;
    this.skyDome.renderOrder = -10;
    this.skyDome.name = 'sky';
    this.scene.add(this.skyDome);
  }

  private applyEnvironment(phase: SkyPhase, sunDir: THREE.Vector3): void {
    if (!this.pmrem || !this.envScene || !this.envMat) return;
    const pal = SKY_PALETTES[phase];
    const u = this.envMat.uniforms;
    (u.zenith.value as THREE.Color).setHex(pal.zenith);
    (u.horizon.value as THREE.Color).setHex(pal.horizon);
    (u.ground.value as THREE.Color).setHex(pal.ground);
    (u.sunColor.value as THREE.Color).setHex(pal.sun);
    (u.sunDir.value as THREE.Vector3).copy(sunDir);
    const tex = this.pmrem.fromScene(this.envScene, 0.04).texture;
    if (this.envTex) this.envTex.dispose();
    this.envTex = tex;
    this.scene.environment = tex;
    this.scene.environmentIntensity = pal.envIntensity * this.skyAdj.envScale;
    this.envPhase = phase;
  }

  build(): void {
    this.resolvePois();
    this.setupHousePads();
    // the ground field bakes AFTER the pads resolve (they are part of
    // the analytic definition) and BEFORE anything samples heightAt
    // for placement — from here on, heightAt IS the field the mesh
    // renders and the physics rides on
    bakeGroundField();
    this.buildTerrain();
    this.buildWater();
    this.buildLights();
    this.buildSkyDome();
    this.buildStars();
    this.buildScatter();
    // TOTAL PURGE (2026-10-20): every building except the lighthouse is
    // demolished — V4 houses, all POI buildings (incl. the gas station),
    // the airbase complex and the carrier structure are gone. What
    // stands now: terrain, water, the relay mast, stations, campfires,
    // region signs — and the lighthouse.
    // EXCEPTION (Ian, 2026-10-21): the AIRBASE returns — rebuilt
    // properly on the kit (hangar / ops / tower / fuel point, airbase.ts)
    // as the fleet's home. Everything else stays demolished.
    this.buildStations();
    this.buildCampfires();
    this.buildLighthouse();
    this.buildAirbase();
    this.buildRelayRuin();
    this.buildRoads();
    this.buildDressing();
  }

  /**
   * W5 (stage 7): Lane 9's ROAD_GRAPH drawn as dirt ribbons over the
   * terrain — one merged strip mesh, sampled every ~5m, hugging the
   * ground. 'road' edges only: the bridge/ferry doors lead off-island
   * to OBX nodes that don't exist yet, so they draw nothing.
   */
  private buildRoads(): void {
    const positions: number[] = [];
    const indices: number[] = [];
    let base = 0;
    const HALF_W = 1.9;
    for (const e of ROAD_GRAPH.edges) {
      if (e.mode !== 'road') continue;
      const a = this.poiPositions[e.from];
      const b = this.poiPositions[e.to];
      if (!a || !b) continue;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const pxn = -dz / len;
      const pzn = dx / len;
      const steps = Math.max(2, Math.ceil(len / 5));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = a[0] + dx * t;
        const cz = a[1] + dz * t;
        for (const s of [-1, 1]) {
          const x = cx + pxn * HALF_W * s;
          const z = cz + pzn * HALF_W * s;
          positions.push(x, this.groundY(x, z) + 0.07, z);
        }
        if (i > 0) {
          const l0 = base + (i - 1) * 2;
          indices.push(l0, l0 + 1, l0 + 2, l0 + 1, l0 + 3, l0 + 2);
        }
      }
      base += (steps + 1) * 2;
    }
    if (positions.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x6e5c40, roughness: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'roads';
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  /**
   * Shadow flags for everything in the scene. Called by Game after all
   * builders (world, husks, interactables) ran — idempotent, safe to repeat.
   * Skips terrain (receive only), water, stars, and the translucent beam.
   */
  applyShadowFlags(): void {
    this.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.name === 'terrain' || o.name === 'water' || o.name === 'beam') return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }

  // -- terrain mesh ---------------------------------------------------------

  private buildTerrain(): void {
    const w = WORLD.xMax - WORLD.xMin;
    const d = WORLD.zMax - WORLD.zMin;
    // the mesh tessellates EXACTLY the ground field's nodes — one
    // vertex per node, so the rendered surface and the physics
    // heightfield are the same surface by construction
    const segX = GROUND_COLS;
    const segZ = GROUND_ROWS;
    const geo = new THREE.PlaneGeometry(w, d, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const n = makeNoise2D(this.seed ^ 0x77aa);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (WORLD.xMin + WORLD.xMax) / 2;
      const z = pos.getZ(i) + (WORLD.zMin + WORLD.zMax) / 2;
      const h = heightAt(x, z);
      pos.setXYZ(i, x, h, z);
      const b = biomeAt(x, z);
      let [r, g, bl] = BIOME_COLORS[b];
      const v = 1 + n(x * 0.05, z * 0.05) * 0.09 + n(x * 0.23, z * 0.23) * 0.05;
      // steep faces read as rock/dirt, not lawn: blend by slope
      const rock = clamp((slopeAt(x, z) - 0.32) * 1.5, 0, 0.65);
      r = lerp(r, 0.44, rock);
      g = lerp(g, 0.41, rock);
      bl = lerp(bl, 0.38, rock);
      colors[i * 3] = clamp(r * v, 0, 1);
      colors[i * 3 + 1] = clamp(g * v, 0, 1);
      colors[i * 3 + 2] = clamp(bl * v, 0, 1);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, this.terrainMat);
    mesh.name = 'terrain';
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private buildWater(): void {
    const geo = new THREE.PlaneGeometry(4200, 2400);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x14384e,
      transparent: true,
      opacity: 0.82,
      roughness: 0.35,
      metalness: 0.15,
    });
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.position.y = WORLD.waterY;
    this.water.name = 'water';
    this.scene.add(this.water);
  }

  private buildLights(): void {
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -75;
    this.sun.shadow.camera.right = 75;
    this.sun.shadow.camera.top = 75;
    this.sun.shadow.camera.bottom = -75;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 700;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbdd3e6, 0x3a4a35, 0.85);
    this.scene.add(this.hemi);
    this.moonFill = new THREE.DirectionalLight(0x8fa8d8, 0.0);
    this.moonFill.position.set(-300, 400, -200);
    this.scene.add(this.moonFill);
    this.scene.background = new THREE.Color(0x87b5d6);
    this.scene.fog = new THREE.Fog(0x9db8c8, 120, 900);
    this.buildRain();
  }

  /** Rain: ~800 streaks in a box that follows the player (World.update
   *  re-centers it), falling with the wind. Opacity follows the weather
   *  snapshot's precipitation — dry sky, no rain mesh. */
  private buildRain(): void {
    const N = 800;
    this.rainPos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.rainPos[i * 3] = (this.rng() - 0.5) * 46;
      this.rainPos[i * 3 + 1] = this.rng() * 26;
      this.rainPos[i * 3 + 2] = (this.rng() - 0.5) * 46;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    // a tiny vertical streak sprite, drawn once on a canvas
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 32;
    const cx = cv.getContext('2d')!;
    const grad = cx.createLinearGradient(0, 0, 0, 32);
    grad.addColorStop(0, 'rgba(190,215,235,0)');
    grad.addColorStop(0.5, 'rgba(190,215,235,0.85)');
    grad.addColorStop(1, 'rgba(190,215,235,0)');
    cx.fillStyle = grad;
    cx.fillRect(1, 0, 2, 32);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.PointsMaterial({
      size: 0.9, map: tex, transparent: true, opacity: 0,
      depthWrite: false, sizeAttenuation: true, color: 0xcfe2f0,
    });
    this.rain = new THREE.Points(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.name = 'rain';
    this.scene.add(this.rain);
  }

  /** Advance the rain box around a focus point (the player). */
  updateRain(dt: number, focusX: number, focusZ: number): void {
    if (!this.rain || !this.rainPos) return;
    const p = this.rainPrecipCur;
    this.rain.visible = p > 0.01;
    if (!this.rain.visible) return;
    // opacity ramps from zero with precipitation (rainOpacity) — the
    // old 0.16 + p·0.5 popped the box in at ~0.17 the moment p crossed
    // its 0.02 visibility threshold
    (this.rain.material as THREE.PointsMaterial).opacity = rainOpacity(p);
    const fall = 23 * dt;
    const pos = this.rainPos;
    const n = pos.length / 3;
    for (let i = 0; i < n; i++) {
      let y = pos[i * 3 + 1] - fall;
      let x = pos[i * 3] + this.wxWindX * dt;
      let z = pos[i * 3 + 2] + this.wxWindZ * dt;
      if (y < 0) {
        y = 24 + this.rng() * 3;
        x = focusX + (this.rng() - 0.5) * 46;
        z = focusZ + (this.rng() - 0.5) * 46;
      }
      // keep the box wrapped on the focus
      if (x - focusX > 23) x -= 46; else if (x - focusX < -23) x += 46;
      if (z - focusZ > 23) z -= 46; else if (z - focusZ < -23) z += 46;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private buildStars(): void {
    const count = 700;
    const posArr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = this.rng() * Math.PI * 2;
      const phi = this.rng() * Math.PI * 0.48; // upper dome
      const r = 1600;
      posArr[i * 3] = Math.cos(theta) * Math.cos(phi) * r;
      posArr[i * 3 + 1] = Math.sin(phi) * r + 40;
      posArr[i * 3 + 2] = Math.sin(theta) * Math.cos(phi) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xcdd8ff,
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.name = 'stars';
    this.scene.add(this.stars);
  }

  /** Flatten a terrain pad under each house footprint (corners measured on
   *  raw terrain before any pad exists). */
  private setupHousePads(): void {
    // TOTAL PURGE: the only building pad left is the lighthouse grounds.
    const [cx, cz] = this.poiPositions['lighthouse_base'] ?? [0, 0];
    const f = { cx, cz, hw: 9, hd: 9 };
    const corners = [
      heightAt(f.cx - f.hw, f.cz - f.hd),
      heightAt(f.cx + f.hw, f.cz - f.hd),
      heightAt(f.cx - f.hw, f.cz + f.hd),
      heightAt(f.cx + f.hw, f.cz + f.hd),
    ];
    setTerrainPads([{ ...f, y: Math.min(...corners) - 0.08 }]);
  }

  private resolvePois(): void {
    const map: Record<string, [number, number]> = {};
    for (const p of POI_DEFS) {
      const z = findLandZ(p.x, p.zGuess);
      map[p.id] = [p.x, z];
    }
    // NPC positions ride on their POIs per the contract
    map['npc:jonah'] = map['jonah_camp'];
    map['npc:kowalski'] = map['lighthouse_base'];
    this.poiPositions = map;
  }

  poi(id: string): [number, number] {
    const p = this.poiPositions[id];
    return p ?? [0, 0];
  }

  groundY(x: number, z: number): number {
    return heightAt(x, z);
  }

  // -- scatter ---------------------------------------------------------------

  private buildScatter(): void {
    // Trees: maritime forest band. Three looks — tall pines (two-tier cones),
    // broadleaf (blob crowns), and dead snags — so the woods have real depth.
    interface TreeSpot { x: number; z: number; kind: 'pine' | 'leaf' | 'snag'; s: number }
    const treeSpots: TreeSpot[] = [];
    let guard = 0;
    while (treeSpots.length < 380 && guard++ < 12000) {
      const x = -440 + this.rng() * 880;
      const z = -150 + this.rng() * 300;
      if (biomeAt(x, z) !== 'forest') continue;
      const r = this.rng();
      const kind = r < 0.68 ? 'pine' : r < 0.93 ? 'leaf' : 'snag';
      treeSpots.push({ x, z, kind, s: 0.9 + this.rng() * 0.85 });
    }
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 });
    const snagMat = new THREE.MeshStandardMaterial({ color: 0x6a655c, roughness: 1 });
    const pineMat = new THREE.MeshStandardMaterial({ color: 0x2c5230, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a6a34, roughness: 1 });
    // Lane 12: canopies sway on the shared wind uniforms (Clouds.ts) —
    // crowns/cones only, trunks hold. Grass is patched in buildGrass.
    applyWindSway(pineMat, { strength: 0.3, height: 2.6 });
    applyWindSway(leafMat, { strength: 0.35, height: 1.6 });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const setInst = (
      im: THREE.InstancedMesh, i: number, x: number, y: number, z: number,
      sx: number, sy: number, sz: number, ry: number,
    ) => {
      e.set(0, ry, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y, z), q, sc.set(sx, sy, sz));
      im.setMatrixAt(i, m);
    };
    // pines: trunk + two stacked cones — 10–16m tall
    const pines = treeSpots.filter((t) => t.kind === 'pine');
    const pineTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.38, 3.6, 5), trunkMat, Math.max(pines.length, 1));
    const pineLo = new THREE.InstancedMesh(new THREE.ConeGeometry(2.5, 5.2, 7), pineMat, Math.max(pines.length, 1));
    const pineHi = new THREE.InstancedMesh(new THREE.ConeGeometry(1.7, 4.2, 7), pineMat, Math.max(pines.length, 1));
    pineTrunks.count = pines.length; pineLo.count = pines.length; pineHi.count = pines.length;
    pines.forEach((t, i) => {
      const y = this.groundY(t.x, t.z);
      const ry = this.rng() * Math.PI * 2;
      setInst(pineTrunks, i, t.x, y + 1.8 * t.s, t.z, t.s, t.s, t.s, ry);
      setInst(pineLo, i, t.x, y + (3.6 + 2.6) * t.s, t.z, t.s, t.s, t.s, ry);
      setInst(pineHi, i, t.x, y + (3.6 + 5.2 + 2.1) * t.s, t.z, t.s, t.s, t.s, ry + 0.4);
    });
    // broadleaf: trunk + three blobs
    const leaves = treeSpots.filter((t) => t.kind === 'leaf');
    const leafTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.26, 0.4, 2.6, 5), trunkMat, Math.max(leaves.length, 1));
    const leafCrowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 1), leafMat, Math.max(leaves.length * 3, 1));
    leafTrunks.count = leaves.length; leafCrowns.count = leaves.length * 3;
    leaves.forEach((t, i) => {
      const y = this.groundY(t.x, t.z);
      const ry = this.rng() * Math.PI * 2;
      setInst(leafTrunks, i, t.x, y + 1.3 * t.s, t.z, t.s, t.s, t.s, ry);
      const cy = y + 3.4 * t.s;
      setInst(leafCrowns, i * 3, t.x, cy, t.z, t.s, t.s * 0.9, t.s, ry);
      setInst(leafCrowns, i * 3 + 1, t.x + 1.1 * t.s, cy + 0.9 * t.s, t.z + 0.4 * t.s, t.s * 0.7, t.s * 0.65, t.s * 0.7, ry + 1);
      setInst(leafCrowns, i * 3 + 2, t.x - 1.0 * t.s, cy + 0.7 * t.s, t.z - 0.5 * t.s, t.s * 0.65, t.s * 0.6, t.s * 0.65, ry + 2);
    });
    // snags: bare lightning-killed trunks
    const snags = treeSpots.filter((t) => t.kind === 'snag');
    const snagTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 5.2, 5), snagMat, Math.max(snags.length, 1));
    snagTrunks.count = snags.length;
    snags.forEach((t, i) => {
      const y = this.groundY(t.x, t.z);
      e.set((this.rng() - 0.5) * 0.12, this.rng() * Math.PI * 2, (this.rng() - 0.5) * 0.12);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(t.x, y + 2.6 * t.s, t.z), q, sc.set(t.s, t.s, t.s));
      snagTrunks.setMatrixAt(i, m);
    });
    for (const im of [pineTrunks, pineLo, pineHi, leafTrunks, leafCrowns, snagTrunks]) {
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      this.scene.add(im);
    }

    // Lane 12: light-shaft anchors — every 15th tree spot, capped at 26,
    // bases on the ground. Game drives the shafts per frame.
    const shaftAnchors = treeSpots
      .filter((_, i) => i % 15 === 0)
      .slice(0, 26)
      .map((t) => ({ x: t.x, y: this.groundY(t.x, t.z), z: t.z }));
    this.lightShafts = new LightShafts(shaftAnchors);
    this.scene.add(this.lightShafts.group);

    // Rocks: scattered, more on beach/dune.
    const rockGeo = new THREE.IcosahedronGeometry(0.8, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e6a63, roughness: 1 });
    const rockCount = 140;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    for (let i = 0; i < rockCount; i++) {
      const x = -680 + this.rng() * 1360;
      const z = -300 + this.rng() * 600;
      const b = biomeAt(x, z);
      if (b === 'water' || b === 'town') {
        m.compose(new THREE.Vector3(0, -50, 0), q.identity(), sc.set(0.001, 0.001, 0.001));
      } else {
        const s = 0.4 + this.rng() * 1.6;
        e.set(this.rng() * 3, this.rng() * 3, this.rng() * 3);
        q.setFromEuler(e);
        m.compose(
          new THREE.Vector3(x, this.groundY(x, z) + 0.2 * s, z),
          q,
          sc.set(s, s * 0.75, s),
        );
      }
      rocks.setMatrixAt(i, m);
    }
    rocks.instanceMatrix.needsUpdate = true;
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.scene.add(rocks);

    this.buildGrass();
    this.buildUnderbrush();
  }

  /** Underbrush: bushes in the forest band + fallen logs — one cheap instanced
   *  pass each, so the woods read dense without tanking the frame budget. */
  private buildUnderbrush(): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    // bushes: dark foliage blobs
    const bushGeo = new THREE.IcosahedronGeometry(0.7, 1);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x2a4a2c, roughness: 1 });
    const bushCount = 160;
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, bushCount);
    let placed = 0;
    let guard = 0;
    while (placed < bushCount && guard++ < 8000) {
      const x = -440 + this.rng() * 880;
      const z = -150 + this.rng() * 300;
      if (biomeAt(x, z) !== 'forest') continue;
      const s = 0.7 + this.rng() * 1.1;
      e.set(0, this.rng() * 3, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, this.groundY(x, z) + 0.3 * s, z), q, sc.set(s, s * 0.7, s));
      bushes.setMatrixAt(placed, m);
      placed++;
    }
    bushes.count = placed;
    bushes.instanceMatrix.needsUpdate = true;
    bushes.castShadow = true;
    this.scene.add(bushes);
    // fallen logs: horizontal cylinders, slight tilt
    const logGeo = new THREE.CylinderGeometry(0.22, 0.28, 3.2, 7);
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 });
    const logCount = 36;
    const logs = new THREE.InstancedMesh(logGeo, logMat, logCount);
    placed = 0;
    guard = 0;
    while (placed < logCount && guard++ < 4000) {
      const x = -440 + this.rng() * 880;
      const z = -150 + this.rng() * 300;
      const b = biomeAt(x, z);
      if (b !== 'forest' && b !== 'marsh') continue;
      e.set(Math.PI / 2, 0, (this.rng() - 0.5) * 0.3 + this.rng() * 3);
      q.setFromEuler(e);
      const s = 0.8 + this.rng() * 0.8;
      m.compose(new THREE.Vector3(x, this.groundY(x, z) + 0.22 * s, z), q, sc.set(s, s, s));
      logs.setMatrixAt(placed, m);
      placed++;
    }
    logs.count = placed;
    logs.instanceMatrix.needsUpdate = true;
    logs.castShadow = true;
    logs.receiveShadow = true;
    this.scene.add(logs);
  }

  /** Dune-grass tufts: one cheap instanced mesh, big readability payoff. */
  private buildGrass(): void {
    const spots: [number, number][] = [];
    let guard = 0;
    while (spots.length < 1500 && guard++ < 22000) {
      const x = -680 + this.rng() * 1360;
      const z = -300 + this.rng() * 600;
      const b = biomeAt(x, z);
      if (b !== 'dune' && b !== 'marsh' && b !== 'beach') continue;
      spots.push([x, z]);
    }
    if (spots.length === 0) return;
    const geo = new THREE.ConeGeometry(0.16, 0.9, 4);
    geo.translate(0, 0.45, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 1 });
    // Lane 12: grass tufts sway on the same shared wind as the canopies.
    applyWindSway(mat, { strength: 0.18, height: 0.9 });
    const grass = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    spots.forEach(([x, z], i) => {
      const s = 0.6 + this.rng() * 1.1;
      e.set((this.rng() - 0.5) * 0.35, this.rng() * Math.PI * 2, (this.rng() - 0.5) * 0.35);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, this.groundY(x, z), z), q, sc.set(s, s, s));
      grass.setMatrixAt(i, m);
      grass.setColorAt(i, col.setHSL(0.2 + this.rng() * 0.07, 0.34, 0.3 + this.rng() * 0.14));
    });
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    grass.receiveShadow = true;
    grass.name = 'grass';
    this.scene.add(grass);
  }



  private buildCampfires(): void {
    for (const id of ['shore_camp', 'jonah_camp', 'lighthouse_base']) {
      const [bx, bz] = this.poi(id);
      const [ox, oz] = CAMPFIRE_SPOTS[id] ?? [0, 0];
      const x = bx + ox;
      const z = bz + oz;
      const y = this.groundY(x, z);
      const g = new THREE.Group();
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 1 });
      const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 1 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const stone = new THREE.Mesh(new THREE.SphereGeometry(0.22, 5, 4), stoneMat);
        stone.position.set(Math.cos(a) * 0.9, 0.12, Math.sin(a) * 0.9);
        g.add(stone);
      }
      for (let i = 0; i < 3; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 5), logMat);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = (i / 3) * Math.PI;
        log.position.y = 0.18;
        g.add(log);
      }
      // unlit: cold ash disc
      const ash = new THREE.Mesh(
        new THREE.CircleGeometry(0.55, 10),
        new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 1 }),
      );
      ash.rotation.x = -Math.PI / 2;
      ash.position.y = 0.06;
      g.add(ash);
      g.position.set(x, y, z);
      g.name = `campfire:${id}`;
      this.scene.add(g);
    }
  }

  /** Physical crafting stations: a Weapons Bench at Jonah's camp and in town,
   *  a Chemistry Station at the relay. Machine Shops come with claimed bases. */
  private buildStations(): void {
    const mk = (w: number, h: number, d: number, c: number) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }),
      );
      m.castShadow = true;
      return m;
    };
    const place = (station: StationId, x: number, z: number, kind: 'bench' | 'chem' | 'shop', yOverride?: number) => {
      const y = yOverride ?? this.groundY(x, z);
      const g = new THREE.Group();
      if (kind === 'shop') {
        // Machine Shop: heavy steel table, engine block, hoist frame, tire stack
        const top = mk(2.2, 0.12, 1.1, 0x4a5058); top.position.y = 0.9;
        g.add(top);
        for (const [lx, lz] of [[-1, -0.45], [1, -0.45], [-1, 0.45], [1, 0.45]] as [number, number][]) {
          const leg = mk(0.1, 0.9, 0.1, 0x33383e); leg.position.set(lx, 0.45, lz); g.add(leg);
        }
        const block = mk(0.7, 0.5, 0.5, 0x2e3238); block.position.set(-0.5, 1.2, 0); g.add(block);
        const post1 = mk(0.12, 2.2, 0.12, 0x6a7078); post1.position.set(0.6, 1.1, -0.4); g.add(post1);
        const post2 = mk(0.12, 2.2, 0.12, 0x6a7078); post2.position.set(0.6, 1.1, 0.4); g.add(post2);
        const beam = mk(0.12, 0.12, 1.0, 0x6a7078); beam.position.set(0.6, 2.2, 0); g.add(beam);
        const tireGeo = new THREE.TorusGeometry(0.32, 0.13, 8, 14);
        for (let i = 0; i < 3; i++) {
          const tire = new THREE.Mesh(tireGeo, new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: 1 }));
          tire.rotation.x = Math.PI / 2;
          tire.position.set(1.6, 0.14 + i * 0.26, 0.3);
          tire.castShadow = true;
          g.add(tire);
        }
      } else if (kind === 'bench') {
        const top = mk(1.9, 0.09, 0.95, 0x6b4a2f); top.position.y = 0.92;
        const board = mk(1.9, 0.8, 0.06, 0x4a3826); board.position.set(0, 1.45, -0.42); board.rotation.x = -0.08;
        g.add(top, board);
        for (const [lx, lz] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]] as [number, number][]) {
          const leg = mk(0.08, 0.92, 0.08, 0x4a3320); leg.position.set(lx, 0.46, lz); g.add(leg);
        }
        const vise = mk(0.22, 0.18, 0.2, 0x3a3e44); vise.position.set(-0.6, 1.05, 0.1); g.add(vise);
        const gun = mk(0.7, 0.07, 0.09, 0x2e2e2e); gun.position.set(0.25, 1.0, 0.05); gun.rotation.y = 0.4; g.add(gun);
        const tools = mk(0.4, 0.05, 0.25, 0x7a4a2a); tools.position.set(0.55, 0.99, -0.15); g.add(tools);
      } else {
        const top = mk(1.7, 0.08, 0.85, 0x8a929a); top.position.y = 0.9;
        g.add(top);
        for (const [lx, lz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]] as [number, number][]) {
          const leg = mk(0.07, 0.9, 0.07, 0x5a5e63); leg.position.set(lx, 0.45, lz); g.add(leg);
        }
        const bottleCols = [0x3f7a3a, 0x2a5a8a, 0xb87333];
        bottleCols.forEach((c, i) => {
          const b = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 0.24, 10),
            new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 }),
          );
          b.position.set(-0.5 + i * 0.22, 1.06, -0.15);
          b.castShadow = true;
          g.add(b);
        });
        const jar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.11, 0.3, 12),
          new THREE.MeshStandardMaterial({ color: 0xc9a44a, roughness: 0.35 }),
        );
        jar.position.set(0.45, 1.09, 0.1); jar.castShadow = true; g.add(jar);
        const burner = mk(0.3, 0.12, 0.3, 0x2e2e2e); burner.position.set(0.1, 1.0, 0.2); g.add(burner);
      }
      g.position.set(x, y, z);
      this.scene.add(g);
      this.stations.push({ station, x, z });
      this.stationColliders.push({ x0: x - 0.95, z0: z - 0.5, x1: x + 0.95, z1: z + 0.5 });
    };
    const [jx, jz] = this.poi('jonah_camp');
    place('workbench', jx + 4, jz + 3, 'bench');
    const [tx, tz] = this.poi('town');
    place('workbench', tx - 15, tz + 2, 'bench');
    const [rx, rz] = this.poi('relay_station');
    place('chemistry', rx + 5, rz + 6, 'chem');
    const [mx, mz] = this.poi('marina');
    place('industrial', mx + 8, mz - 4, 'shop');
  }

  /** The revamped airbase: portable kit structures + ground works at
   *  AIRBASE_SITE. Groups join the scene here; colliders/floors/
   *  containers ride the fields Game merges (same pattern as the
   *  lighthouse kit). */
  private buildAirbase(): void {
    const built = buildAirbaseSite((px, pz) => this.groundY(px, pz));
    this.airfieldKits = built.kits;
    this.airfieldPropColliders = built.propColliders;
    for (const r of built.kits) this.scene.add(r.group);
    this.scene.add(built.groundGroup);
  }

  private buildLighthouse(): void {
    const [x, z] = this.poi('lighthouse_base');
    // the V4 tower: a real kit building (Lighthouse.ts) — connected
    // shaft, interior switchback stairs, solid colliders, the Keeper's
    // conversation in a finished watch room, lamp room at the top
    const built = buildLighthouse(x, z, (px, pz) => this.groundY(px, pz));
    this.lighthouseKit = built.result;
    this.lighthouseBuilding = built.result.building;
    this.lampRoomY = built.lampRoomFloorY;
    // rotating beam + lamp light, re-anchored to the real lamp room
    this.beamPivot = new THREE.Group();
    this.beamPivot.position.set(x, built.lampAnchorY, z);
    const beamGeo = new THREE.ConeGeometry(3.2, 60, 12, 1, true);
    beamGeo.translate(0, -30, 0);
    beamGeo.rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfff3c0, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    this.beam.name = 'beam';
    this.beamPivot.add(this.beam);
    built.result.group.add(this.beamPivot);
    this.lampLight = new THREE.PointLight(0xffe9a8, 60, 90, 1.8);
    this.lampLight.position.set(x, built.lampAnchorY, z);
    built.result.group.add(this.lampLight);
    this.scene.add(built.result.group);
  }

  /**
   * Map dressing: region signage at the POI approaches (the island
   * should tell you where you are). Pure scenery — no colliders, no
   * loot. (The spine-road wreck shells were purged with the old models.)
   */
  private buildDressing(): void {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 });
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
    const sign = (poiId: string, dx: number, dz: number, text: string, ry: number): void => {
      const [px, pz] = this.poi(poiId);
      const x = px + dx;
      const z = pz + dz;
      const y = this.groundY(x, z);
      const g = new THREE.Group();
      for (const s of [-1.3, 1.3]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.1, 0.14), postMat);
        post.position.set(s, 1.05, 0);
        post.castShadow = true;
        g.add(post);
      }
      const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.85, 0.07), boardMat);
      board.position.y = 1.72;
      board.castShadow = true;
      g.add(board);
      const face = decalPlane(text, 3.2, 'rgba(238,234,222,0.95)', 44);
      face.position.set(0, 1.72, 0.05);
      g.add(face);
      g.position.set(x, y, z);
      g.rotation.y = ry;
      g.name = `sign:${poiId}`;
      this.scene.add(g);
    };
    sign('town', -26, 16, 'CEDAR SHOAL', 0.35);
    sign('marina', 12, 10, 'MARINA', -0.4);
    sign('relay_station', -14, 12, 'RELAY RIDGE', 0.2);
    sign('lighthouse_base', -16, 9, 'LIGHTHOUSE POINT', 0.55);
    sign('airbase', -42, 58, 'AIRBASE — RESTRICTED', 0.9);
    // W1 (stage 7): the six new faction sites get signs — named ground
    // until their buildings return (buildings stay parked).
    sign('tollgate', -8, 10, 'EASTERN TOLLGATE', -0.5);
    sign('raider_fort', -10, 8, 'DUNE FORT', 0.4);
    sign('barn', 8, -8, 'UNION FARM', 0.3);
    sign('warehouse', -10, -8, 'DEPOT ROW', -0.3);
    sign('gas_station', 8, 8, 'LAST GAS', 0.5);
    sign('strip_mall', -8, -10, 'SHOAL PLAZA', -0.2);
    // the tollgate's barrier arm: a striped bar on a pivot post — the
    // gate reads as a gate with no building attached.
    {
      const [px, pz] = this.poi('tollgate');
      const bx = px - 2;
      const bz = pz - 6;
      const by = this.groundY(bx, bz);
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), postMat);
      post.position.y = 0.55;
      post.castShadow = true;
      g.add(post);
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.8 });
      const arm = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.16, 0.08),
          i % 2 === 0 ? stripeMat : boardMat,
        );
        seg.position.x = 0.45 + i * 0.9;
        seg.castShadow = true;
        arm.add(seg);
      }
      arm.position.set(0.1, 1.02, 0);
      arm.rotation.z = 0.06; // resting, a hair off level
      g.add(arm);
      g.position.set(bx, by, bz);
      g.rotation.y = 0.5;
      g.name = 'prop:tollgate_barrier';
      this.scene.add(g);
    }
  }

  private buildRelayRuin(): void {
    const [x, z] = this.poi('relay_station');
    const y = this.groundY(x, z);
    const g = new THREE.Group();
    const conc = new THREE.MeshStandardMaterial({ color: 0x77716a, roughness: 1 });
    const rust = new THREE.MeshStandardMaterial({ color: 0x6b4a34, roughness: 1 });
    // destroyed building footprints: foundation pads with rebar stubs —
    // honest rubble, not fake buildings. (Enterable ruins live in Houses.ts.)
    for (let i = 0; i < 3; i++) {
      const bx = (this.rng() - 0.5) * 26;
      const bz = (this.rng() - 0.5) * 20;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(6 + this.rng() * 3, 0.55, 5), conc);
      pad.position.set(bx, 0.28, bz);
      pad.rotation.y = this.rng() * Math.PI;
      pad.castShadow = true;
      g.add(pad);
      for (let r = 0; r < 4; r++) {
        const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9 + this.rng() * 0.7, 6), rust);
        rebar.position.set(bx + (this.rng() - 0.5) * 5, 0.8, bz + (this.rng() - 0.5) * 4);
        rebar.rotation.z = (this.rng() - 0.5) * 0.25;
        g.add(rebar);
      }
    }
    // antenna mast with crossbars
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 22, 8), rust);
    mast.position.set(6, 11, -4);
    mast.rotation.z = 0.06;
    g.add(mast);
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.5 - i * 0.7, 6), rust);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(6 - i * 0.35, 16 + i * 2.4, -4);
      g.add(bar);
    }
    // the switch panel (interactable anchor)
    const [sx, sz] = this.poi('relay_switch');
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.5), new THREE.MeshStandardMaterial({ color: 0x2e4a5a, roughness: 0.8 }));
    panel.position.set(sx - x, this.groundY(sx, sz) - y + 1.1, sz - z);
    g.add(panel);
    g.position.set(x, y, z);
    g.name = 'relay_ruin';
    this.scene.add(g);
  }

  // -- day/night -------------------------------------------------------------

  /** Drive sun, sky, fog, stars, lamp from the world clock. */
  updateSky(timeMinutes: number, wx?: SkyWeather & { windX?: number; windZ?: number }): SkyState {
    this.skyAdj = weatherSkyAdjust(wx);
    this.wxPrecip = wx?.precipitation ?? 0;
    this.wxWindX = wx?.windX ?? 0;
    this.wxWindZ = wx?.windZ ?? 0;
    const fog = this.scene.fog as THREE.Fog;
    // Lane 12 fog tightening: on a clear sky the tuned range (95→620)
    // keeps the far shore a silhouette instead of melting into fog
    // colour; weather collapse is never loosened (tightenFog mins).
    // Item 3: updateSky runs at 4 Hz, so these are TARGETS — World.
    // update damps the live fog toward them every frame. Assigned
    // directly, a rain onset stepped the far plane by ~150 m a tick.
    const fogF = wx ? clamp(wx.fog + wx.precipitation * 0.45, 0, 1) : 0;
    const tightened = tightenFog(this.skyAdj.fogNear, this.skyAdj.fogFar, fogF);
    this.fogNearT = tightened.fogNear;
    this.fogFarT = tightened.fogFar;
    if (!this.fogInit) {
      this.fogInit = true;
      fog.near = this.fogNearT;
      fog.far = this.fogFarT;
    }
    const t01 = timeMinutes / 1440;
    const ang = (t01 - 0.25) * Math.PI * 2; // sunrise 06:00 at horizon
    const elev = Math.sin(ang);
    const isNight = timeMinutes < 360 || timeMinutes >= 1080;

    const R = 600;
    this.sun.position.set(Math.cos(ang) * R, Math.max(elev, -0.2) * R, 220);
    // Sun/moon as ONE continuous system (Item 3): the old hard branch
    // at elev 0.02 popped sun intensity, moon fill, background, fog
    // colour and the sky disc simultaneously at dawn and dusk. Every
    // term below is a continuous function of elevation — the blend
    // ramps the sun in and the moon out across the horizon band, and
    // the day-side colours (which already tend to the night values
    // as dayness → 0) are mixed by the same factor.
    const blend = sunMoonBlend(elev);
    const dayness = clamp(elev * 2.2, 0, 1);
    this.sun.intensity = (0.25 + dayness * 2.4) * this.skyAdj.sunScale * blend.sun;
    this.sun.color.setHex(0xfff2dd).lerp(new THREE.Color(0xff9a4e), 1 - dayness);
    this.moonFill.intensity = 0.35 * blend.moon;
    const skyDay = NIGHT_SKY.clone()
      .lerp(SUNSET_SKY, clamp(1 - Math.abs(elev) * 4, 0, 1))
      .lerp(DAY_SKY, dayness);
    (this.scene.background as THREE.Color).copy(NIGHT_SKY).lerp(skyDay, blend.sun);
    const fogDay = DAY_FOG.clone().lerp(NIGHT_FOG, 1 - dayness);
    (this.scene.fog as THREE.Fog).color.copy(NIGHT_FOG).lerp(fogDay, blend.sun);
    this.starMat.opacity = clamp(-elev * 3, 0, 0.9) * blend.moon;
    // the VISIBLE sky (Item 7): continuous palette + the disc tracks
    // the sun (by day) or the moon fill (by night) — the sky the
    // player sees is the sky the IBL is baked from. The disc's
    // direction now CROSSFADES between the two bodies through the
    // horizon band instead of teleporting between them.
    const pal = skyPaletteAt(elev);
    if (this.skyMat) {
      const u = this.skyMat.uniforms;
      (u.zenith.value as THREE.Color).setHex(pal.zenith);
      (u.horizon.value as THREE.Color).setHex(pal.horizon);
      (u.ground.value as THREE.Color).setHex(pal.ground);
      (u.sunColor.value as THREE.Color).setHex(pal.sun);
      const discDir = this.moonFill.position.clone().normalize()
        .lerp(this.sun.position.clone().normalize(), blend.sun)
        .normalize();
      (u.sunDir.value as THREE.Vector3).copy(discDir);
      (u.sunBoost.value as number) = 0.7 + 0.9 * blend.sun;
    }
    // lighting baseline: the environment bake still follows the phase
    // of day (a PMREM rebake is a discrete asset swap by design), but
    // the INTENSITIES the phases used to step are now the palette's
    // continuous blends — no fill-light pop at the thresholds.
    // The hemisphere is the interior guarantee (shaded, never black).
    const phase = skyPhase(elev);
    if (phase !== this.envPhase) {
      this.applyEnvironment(phase, this.sun.position.clone().normalize());
    }
    this.hemi.intensity = pal.hemiIntensity * this.skyAdj.hemiScale;
    if (this.scene.environment) {
      this.scene.environmentIntensity = pal.envIntensity * this.skyAdj.envScale;
    }
    // wet ground looks wet (Item 3): the same wetness that cuts tire
    // grip darkens the terrain and drops its roughness
    if (wx?.wetness != null && this.terrainMat) {
      const look = terrainWetnessLook(wx.wetness);
      this.terrainMat.roughness = look.roughness;
      this.terrainMat.color.setScalar(look.darken);
    }
    // lighthouse lamp burns at night
    const lampOn = isNight;
    this.lampLight.intensity = lampOn ? 60 : 0;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = lampOn ? 0.16 : 0;
    return { isNight, sunElevation: elev };
  }

  /**
   * Keep the shadow frustum centered on the player — WITHOUT the crawl.
   * The anchor is snapped to the shadow map's texel grid in light space:
   * an unsnapped follow makes every texel swim as the player moves, which
   * reads as shadows glitching in and out. Snapped, the shadow image is
   * stable frame to frame and only whole texels ever change.
   */
  updateShadowTarget(x: number, z: number): void {
    const dir = this.sun.position.clone().sub(this.sun.target.position);
    const len = dir.length() || 1;
    dir.divideScalar(len);
    // light-space basis
    const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, dir).normalize();
    const upv = new THREE.Vector3().crossVectors(dir, right).normalize();
    const texel = 150 / 2048; // frustum width / map size, in world units
    const rx = Math.round((x * right.x + z * right.z) / texel) * texel;
    const rz = Math.round((x * upv.x + z * upv.z) / texel) * texel;
    const sx = right.x * rx + upv.x * rz;
    const sz = right.z * rx + upv.z * rz;
    this.sun.target.position.set(sx, 0, sz);
    this.sun.target.updateMatrixWorld();
    this.sun.position.set(sx + dir.x * 220, dir.y * 220, sz + dir.z * 220);
  }

  /** Per-frame world animation (beam rotation, water shimmer, rain). */
  update(dt: number, elapsed: number, focusX = 0, focusZ = 0): void {
    // the sky dome rides with the player — its edge is never reached
    if (this.skyDome) this.skyDome.position.set(focusX, 0, focusZ);
    this.beamPivot.rotation.y += dt * 0.5;
    // Item 3: damp fog + rain toward the 4 Hz sky targets so weather
    // transitions are continuous in real time, not stepped at tick
    // rate (exponential, timestep-independent — same form as the
    // weather system's own easing)
    if (this.fogInit && this.scene.fog) {
      const fog = this.scene.fog as THREE.Fog;
      const k = 1 - Math.exp(-dt / 0.3);
      fog.near += (this.fogNearT - fog.near) * k;
      fog.far += (this.fogFarT - fog.far) * k;
    }
    this.rainPrecipCur += (this.wxPrecip - this.rainPrecipCur) * (1 - Math.exp(-dt / 0.25));
    this.updateRain(dt, focusX, focusZ);
    // cheap water shimmer
    this.waterMat.opacity = 0.8 + Math.sin(elapsed * 0.7) * 0.03;
  }

  dispose(): void {
    this.lightShafts?.dispose();
    this.lightShafts = null;
    if (this.envTex) this.envTex.dispose();
    if (this.pmrem) this.pmrem.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh || (o as THREE.Points).isPoints) {
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
        else mat?.dispose();
      }
    });
  }
}
