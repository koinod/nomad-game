// World.ts — the Beta Island world: terrain, zones, scatter,
// structures, sky. The terrain itself lives in betaTerrain.ts — ONE
// authored height grid (1.25 m) that the mesh, the Rapier heightfield
// and every gameplay sampler read verbatim (map restart, Ian's order
// 2026-10-21; integrated here the same day). The old analytic height
// system (initTerrainField / analyticHeightAt / the baked 2 m ground
// field) is RETIRED: there is no second surface left to disagree.

import * as THREE from 'three';
import { mulberry32, clamp } from './rng';
import { buildLighthouse } from './Lighthouse';
import { buildAirbaseSite } from './airbase';
import { decalPlane } from './modelKit';
import type { KitBuilding, KitResult } from './kit';
import type { BiomeId } from './Game';
import type { StationId } from '../data/items';
import { WORLD_STATION_PLACEMENTS } from '../data/stations';
import type { Collider } from './Colliders';
import { LightShafts, tightenFog } from './PostFX';
import { BETA_POI_PLACEMENTS, BETA_ROADS, BETA_DAYMARKERS, BETA_SECTORS } from '../data/betaLayout';
import {
  betaHeightAt, betaSlopeAt, betaZoneAt, buildBetaTerrainChunks,
  type BetaZone,
} from './betaTerrain';
import {
  computeVegPlacements, vegTreeAnchors, vegScatterVeto, VegetationLayer,
} from './Vegetation';

export const WORLD = {
  xMin: -700, xMax: 700,
  zMin: -320, zMax: 320,
  waterY: 0,
};

// ---- terrain truth (betaTerrain.ts — the one grid) -----------------------

/** THE ground truth every system samples: the Beta grid's own
 *  triangle-split read — the same surface the terrain mesh renders
 *  and the Rapier heightfield collides (identity proven in
 *  betaTerrain.test.ts against the module and in groundTruth.test.ts
 *  against these live bindings). */
export function heightAt(x: number, z: number): number {
  return betaHeightAt(x, z);
}

/** Terrain slope magnitude at a point (finite difference of the grid). */
export function slopeAt(x: number, z: number): number {
  return betaSlopeAt(x, z);
}

/** The physical material zone at a point (spec §1.1 palette) — terrain
 *  coloring and scatter key off this; gameplay reads biomeAt below. */
export function zoneAt(x: number, z: number): BetaZone {
  return betaZoneAt(x, z);
}

/** Gameplay biome (the loot-weighting / phone-map vocabulary) derived
 *  from the physical zone: the zone set is the terrain truth, this is
 *  its gameplay read — seabed is open water, sand is beach, open
 *  grass and bare granite are the old 'dune' country, and the graded
 *  road corridor reads as traveled (town-class) ground. */
const ZONE_TO_BIOME: Record<BetaZone, BiomeId> = {
  seabed: 'water',
  sand: 'beach',
  marsh: 'marsh',
  forest: 'forest',
  grass: 'dune',
  granite: 'dune',
  road: 'town',
};

export function biomeAt(x: number, z: number): BiomeId {
  return ZONE_TO_BIOME[betaZoneAt(x, z)];
}

// ---- POI placement --------------------------------------------------------

/**
 * Campfire offsets from their POI points, shared by the World (fire
 * meshes), Interact (rest interactables), and Game (fast travel). The
 * lighthouse fire moved out of the tower's footprint when the tower
 * became a real building with walls.
 */
export const CAMPFIRE_SPOTS: Record<string, [number, number]> = {
  lighthouse_base: [8, 5],
};

// POI positions ARE data/betaLayout.ts BETA_POI_PLACEMENTS (map
// integration, 2026-10-21): every POI id placed exactly once against
// the Beta Island spec + aerial, on ground the grid itself surveyed
// (sector pads / knolls / the dredged channel). The old POI_DEFS
// (x + zGuess, z resolved by a findLandZ land scan over the retired
// analytic terrain) is deleted with the terrain it scanned — a
// placement is now a surveyed fact, not a search result.

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
   *  re-sited onto the Beta airbase pad in the map integration,
   *  2026-10-21). Game merges these like the lighthouse's. */
  airfieldKits: KitResult[] = [];
  /** Apron prop colliders (floodlight poles, windsock). */
  airfieldPropColliders: Collider[] = [];
  // physical crafting stations: { station, x, z } + their colliders
  stations: { station: StationId; x: number; z: number }[] = [];
  stationColliders: Collider[] = [];
  /** Lane 12: light shafts hung at forest anchors (built in
   *  buildScatter); Game drives update() per frame with camera + sun. */
  lightShafts: LightShafts | null = null;
  /** Modeled vegetation (BETA_SCATTER classes as instanced GLBs,
   *  Vegetation.ts); built in buildScatter, populates as GLBs load. */
  vegetation: VegetationLayer | null = null;

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
    // No terrain field to initialize: the Beta grid is authored data,
    // built once by betaTerrain and shared by every World instance.
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
    // No bake step: heightAt reads the Beta grid directly, so every
    // placement below samples the same surface the mesh renders and
    // the physics rides on — from the first call, not after a bake.
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
    this.buildDaymarkers();
    this.buildDressing();
  }

  /**
   * The road network drawn as dirt ribbons (map integration,
   * 2026-10-21): BETA_ROADS polylines — the same centerlines the grid
   * graded into itself, so the visible track and the drivable
   * corridor are one line, not two drawings of it. One merged strip
   * mesh, sampled every ~4 m along each polyline, hugging the ground.
   * (Lane 9's ROAD_GRAPH remains the travel/faction graph data; it no
   * longer draws the roads — its POI-to-POI straight lines were a
   * second, disagreeing road system.)
   */
  private buildRoads(): void {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const road of BETA_ROADS) {
      const halfW = road.halfWidth;
      let prevRow = -1; // vertex index of this road's previous ribbon row
      for (let s = 0; s + 1 < road.points.length; s++) {
        const [ax, az] = road.points[s];
        const [bx, bz] = road.points[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1) continue;
        const pxn = -(bz - az) / len;
        const pzn = (bx - ax) / len;
        const steps = Math.max(1, Math.ceil(len / 4));
        for (let i = s === 0 ? 0 : 1; i <= steps; i++) {
          const t = i / steps;
          const cx = ax + (bx - ax) * t;
          const cz = az + (bz - az) * t;
          const row = positions.length / 3;
          for (const sd of [-1, 1]) {
            const x = cx + pxn * halfW * sd;
            const z = cz + pzn * halfW * sd;
            positions.push(x, this.groundY(x, z) + 0.07, z);
          }
          if (prevRow >= 0) {
            indices.push(prevRow, prevRow + 1, row, prevRow + 1, row + 1, row);
          }
          prevRow = row;
        }
      }
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

  /** Channel daymarkers (spec §3.3): post + colored topmark on each
   *  bank of the dredged cut, from BETA_DAYMARKERS — generated from
   *  the channel line itself, so marker and water can never disagree.
   *  Port = red, starboard = green (the data's bank names). Each post
   *  stands on the seabed and clears the waterline by ~2 m. */
  private buildDaymarkers(): void {
    const marks = BETA_DAYMARKERS;
    if (marks.length === 0) return;
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.11, 1, 6);
    poleGeo.translate(0, 0.5, 0); // unit height, base at origin — scaled per post
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d3a35, roughness: 0.9 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, marks.length);
    const capGeo = new THREE.BoxGeometry(0.42, 0.3, 0.42);
    const capMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const caps = new THREE.InstancedMesh(capGeo, capMat, marks.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    marks.forEach((mk, i) => {
      const bed = this.groundY(mk.x, mk.z);
      const top = Math.max(bed, WORLD.waterY) + 2.0;
      const h = top - bed;
      m.compose(new THREE.Vector3(mk.x, bed, mk.z), q.identity(), sc.set(1, h, 1));
      poles.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(mk.x, top + 0.15, mk.z), q, sc.set(1, 1, 1));
      caps.setMatrixAt(i, m);
      caps.setColorAt(i, col.setHex(mk.side === 'port' ? 0xb03024 : 0x2a7a3a));
    });
    poles.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
    poles.name = 'daymarkers';
    caps.name = 'daymarkers:caps';
    this.scene.add(poles);
    this.scene.add(caps);
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
    // The mesh IS the Beta grid: chunked geometries whose vertices are
    // the grid nodes verbatim, triangulated on the sampler's diagonal,
    // colored per-vertex by material zone (betaTerrain builds them).
    // One shared material across chunks so the wetness look (Item 3)
    // still drives the whole island at once.
    this.terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
    });
    for (const geo of buildBetaTerrainChunks()) {
      const mesh = new THREE.Mesh(geo, this.terrainMat);
      mesh.name = 'terrain';
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
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

  private resolvePois(): void {
    // Surveyed placements, verbatim (betaLayout) — including the
    // claim-only 'military_base' id, which IS the airbase ground, so
    // the claim system's airbase fallback never has to fire.
    const map: Record<string, [number, number]> = {};
    for (const p of BETA_POI_PLACEMENTS) {
      map[p.poiId] = [p.x, p.z];
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
  //
  // Scatter is keyed to the Beta material zones (betaTerrain) and the
  // layout's scatter table (BETA_SCATTER): modeled vegetation in its
  // declared zones (Vegetation.ts), rocks on open ground, logs in the
  // woods. Two vetoes keep the surveyed world clean: nothing sprouts
  // on a sector/extra pad (the flats are built ground — lighthouse
  // grounds, the airbase, the Refuge, the helipad) and nothing
  // sprouts on a road corridor.

  /** The scatter veto (surveyed ground / road corridor) — the math
   *  lives in Vegetation.ts, one source for every scatter system. */
  private scatterVeto(x: number, z: number, roadClearance: number): boolean {
    return vegScatterVeto(x, z, roadClearance);
  }

  private buildScatter(): void {
    // Modeled vegetation (Vegetation.ts): the BETA_SCATTER classes as
    // instanced Blender-built GLBs — live oak + loblolly forest, wax
    // myrtle understory, marsh needle rush + spartina at the
    // waterline, sea-oat dune grass on the foredune. This replaces the
    // retired cone/blob/snag scatter outright (high-poly law).
    // Placements are computed here (pure, seeded); the layer's meshes
    // populate as the GLBs arrive.
    const vegPlacements = computeVegPlacements(this.rng);
    this.vegetation = new VegetationLayer();
    this.vegetation.build(this.scene, vegPlacements);

    // Lane 12: light-shaft anchors — every 15th tree placement,
    // capped at 26, bases on the ground. Game drives the shafts.
    this.lightShafts = new LightShafts(vegTreeAnchors(vegPlacements));
    this.scene.add(this.lightShafts.group);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();

    // Rocks: open ground — sand, granite, grass, forest floor.
    const rockGeo = new THREE.IcosahedronGeometry(0.8, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e6a63, roughness: 1 });
    const rockCount = 140;
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    for (let i = 0; i < rockCount; i++) {
      const x = -680 + this.rng() * 1360;
      const z = -300 + this.rng() * 600;
      const zn = zoneAt(x, z);
      if (zn === 'seabed' || zn === 'road' || this.scatterVeto(x, z, 5)) {
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

    this.buildUnderbrush();
  }

  /** Fallen logs in the forest/marsh band — one cheap instanced pass.
   *  (The blob bushes that used to share this method retired with the
   *  cone/blob scatter — understory is the modeled wax myrtle now.) */
  private buildUnderbrush(): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    let placed = 0;
    let guard = 0;
    // fallen logs: horizontal cylinders, slight tilt
    const logGeo = new THREE.CylinderGeometry(0.22, 0.28, 3.2, 7);
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 });
    const logCount = 36;
    const logs = new THREE.InstancedMesh(logGeo, logMat, logCount);
    placed = 0;
    guard = 0;
    while (placed < logCount && guard++ < 20000) {
      const x = -690 + this.rng() * 1380;
      const z = -310 + this.rng() * 620;
      const zn = zoneAt(x, z);
      if (zn !== 'forest' && zn !== 'marsh') continue;
      if (this.scatterVeto(x, z, 6)) continue;
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

  /** Physical crafting stations, placed from WORLD_STATION_PLACEMENTS
   *  (data/stations.ts): benches, chemistry, and Machine Shops at camps,
   *  town, the relay, the marina, the airbase depot, the Citadel yard,
   *  and the Refuge. Base facilities host more (data/stations hosts). */
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
    // Placements are data (data/stations.ts WORLD_STATION_PLACEMENTS is
    // the single source of truth — edit there, never here). Anchors
    // resolve POI-first, then sector pads (the Refuge has no POI entry).
    for (const p of WORLD_STATION_PLACEMENTS) {
      let ax: number; let az: number;
      if (p.poiId) {
        [ax, az] = this.poi(p.poiId);
      } else {
        const sector = BETA_SECTORS.find((s) => s.id === p.sectorId);
        if (!sector) continue;
        ax = sector.x; az = sector.z;
      }
      place(p.station, ax + p.dx, az + p.dz, p.kind);
    }
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
