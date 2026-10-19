// World.ts — deterministic terrain, biomes, scatter, structures, sky.
// Pure height/biome functions are exported so Game.getHeightAt/getBiomeAt
// (and the phone map) sample the exact same island the mesh was built from.

import * as THREE from 'three';
import { makeFbm, makeNoise2D, mulberry32, clamp, lerp, smoothstep } from './rng';
import type { BiomeId } from './Game';

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

/** Deterministic island height. Requires initTerrainField(seed) first. */
export function heightAt(x: number, z: number): number {
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
  // beach edges pull toward low sand
  const beach = smoothstep(205, 272, az);
  h = lerp(h, 1.15 + detail(x * 0.03, z * 0.03) * 0.7, beach * shore);
  // fall to water past the shoreline and past the island ends
  const water = smoothstep(318, 288, az) * smoothstep(1, 0.35, 1 - xFall);
  h = lerp(-1.6, h, clamp(water, 0, 1));
  return h;
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

/** Suggested x per INTERFACES.md; z resolved against real terrain. */
export const POI_DEFS: PoiDef[] = [
  { id: 'shore_camp', x: -560, zGuess: 250 },
  { id: 'jonah_camp', x: -380, zGuess: 60 },
  { id: 'wreck', x: -220, zGuess: 150 },
  { id: 'town', x: 40, zGuess: 0 },
  { id: 'forest_cache', x: 180, zGuess: 40 },
  { id: 'relay_station', x: 330, zGuess: -40 },
  { id: 'relay_switch', x: 338, zGuess: -34 },
  { id: 'dune_cache', x: 470, zGuess: 150 },
  { id: 'lighthouse_base', x: 600, zGuess: 40 },
  { id: 'lighthouse_top', x: 600, zGuess: 40 },
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

export class World {
  readonly scene: THREE.Scene;
  readonly seed: number;
  readonly rng: () => number;
  poiPositions: Record<string, [number, number]> = {};

  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private moonFill!: THREE.DirectionalLight;
  private stars!: THREE.Points;
  private starMat!: THREE.PointsMaterial;
  private beam!: THREE.Mesh;
  private beamPivot!: THREE.Group;
  private lampLight!: THREE.PointLight;
  private water!: THREE.Mesh;
  private waterMat!: THREE.MeshStandardMaterial;
  private terrainMat!: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, seed: number) {
    this.scene = scene;
    this.seed = seed;
    this.rng = mulberry32(seed ^ 0x12345678);
    initTerrainField(seed);
  }

  build(): void {
    this.buildTerrain();
    this.buildWater();
    this.buildLights();
    this.buildStars();
    this.resolvePois();
    this.buildScatter();
    this.buildTown();
    this.buildCampfires();
    this.buildWreck();
    this.buildLighthouse();
    this.buildRelayRuin();
  }

  // -- terrain mesh ---------------------------------------------------------

  private buildTerrain(): void {
    const w = WORLD.xMax - WORLD.xMin;
    const d = WORLD.zMax - WORLD.zMin;
    const segX = 256;
    const segZ = 128;
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
      const v = 1 + n(x * 0.05, z * 0.05) * 0.09; // subtle variation
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
    this.sun.castShadow = false;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbdd3e6, 0x3a4a35, 0.85);
    this.scene.add(this.hemi);
    this.moonFill = new THREE.DirectionalLight(0x8fa8d8, 0.0);
    this.moonFill.position.set(-300, 400, -200);
    this.scene.add(this.moonFill);
    this.scene.background = new THREE.Color(0x87b5d6);
    this.scene.fog = new THREE.Fog(0x9db8c8, 120, 900);
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
    // Trees: maritime forest band. Instanced cone + trunk.
    const treeSpots: [number, number][] = [];
    let guard = 0;
    while (treeSpots.length < 150 && guard++ < 4000) {
      const x = -440 + this.rng() * 880;
      const z = -150 + this.rng() * 300;
      if (biomeAt(x, z) !== 'forest') continue;
      treeSpots.push([x, z]);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 5);
    const crownGeo = new THREE.ConeGeometry(1.9, 4.6, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x2c5230, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeSpots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    treeSpots.forEach(([x, z], i) => {
      const s = 0.75 + this.rng() * 0.8;
      const y = this.groundY(x, z);
      e.set(0, this.rng() * Math.PI * 2, 0);
      q.setFromEuler(e);
      sc.set(s, s, s);
      m.compose(new THREE.Vector3(x, y + 1.1 * s, z), q, sc);
      trunks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, y + (2.2 + 2.3) * s, z), q, sc);
      crowns.setMatrixAt(i, m);
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    this.scene.add(trunks, crowns);

    // Rocks: scattered, more on beach/dune.
    const rockGeo = new THREE.IcosahedronGeometry(0.8, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e6a63, roughness: 1 });
    const rockCount = 70;
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
    this.scene.add(rocks);
  }

  private buildTown(): void {
    // Ruined town: ~9 house shells around the town POI.
    const [cx, cz] = this.poi('town');
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 1 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a3f33, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2 + this.rng() * 0.5;
      const rad = 25 + this.rng() * 55;
      const x = cx + Math.cos(ang) * rad;
      const z = cz + Math.sin(ang) * rad * 0.7;
      const h = this.groundY(x, z);
      if (h < 1) continue;
      const wdt = 5 + this.rng() * 4;
      const dep = 4 + this.rng() * 3;
      const hgt = 2.6 + this.rng() * 1.6;
      const ruin = this.rng() < 0.4; // some are roofless shells
      const house = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(wdt, hgt, dep), wallMat);
      walls.position.y = hgt / 2;
      house.add(walls);
      if (!ruin) {
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(wdt, dep) * 0.72, 1.8, 4), roofMat);
        roof.position.y = hgt + 0.9;
        roof.rotation.y = Math.PI / 4;
        house.add(roof);
      }
      house.position.set(x, h - 0.15, z);
      house.rotation.y = this.rng() * Math.PI;
      this.scene.add(house);
    }
  }

  private buildCampfires(): void {
    for (const id of ['shore_camp', 'jonah_camp', 'lighthouse_base']) {
      const [x, z] = this.poi(id);
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

  private buildWreck(): void {
    const [x, z] = this.poi('wreck');
    const y = this.groundY(x, z);
    const g = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x4d5a63, roughness: 0.9 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 2.2, 3.2), hullMat);
    hull.position.y = 1.1;
    hull.rotation.z = 0.12;
    g.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), hullMat);
    mast.position.set(1, 4.5, 0);
    mast.rotation.z = 0.5;
    g.add(mast);
    g.position.set(x, y - 0.4, z);
    g.rotation.y = 0.7;
    g.name = 'wreck';
    this.scene.add(g);
  }

  private buildLighthouse(): void {
    const [x, z] = this.poi('lighthouse_base');
    const y = this.groundY(x, z);
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.9 });
    const red = new THREE.MeshStandardMaterial({ color: 0x8e2f28, roughness: 0.9 });
    // striped tower: stacked cylinders
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const r0 = 3.4 - i * 0.32;
      const r1 = 3.4 - (i + 1) * 0.32;
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(r1, r0, 4, 12),
        i % 2 === 0 ? white : red,
      );
      seg.position.y = 2 + i * 4;
      g.add(seg);
    }
    // lamp room
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.2, 12), white);
    lampBase.position.y = 2 + segs * 4 + 0.6;
    g.add(lampBase);
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 2.6, 12, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xbfe3ff, transparent: true, opacity: 0.35,
        side: THREE.DoubleSide, roughness: 0.2,
      }),
    );
    glass.position.y = 2 + segs * 4 + 2.5;
    g.add(glass);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.8, 12), red);
    cap.position.y = 2 + segs * 4 + 4.6;
    g.add(cap);
    // rotating beam
    this.beamPivot = new THREE.Group();
    this.beamPivot.position.y = 2 + segs * 4 + 2.5;
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
    this.beamPivot.add(this.beam);
    g.add(this.beamPivot);
    this.lampLight = new THREE.PointLight(0xffe9a8, 60, 90, 1.8);
    this.lampLight.position.y = 2 + segs * 4 + 2.5;
    g.add(this.lampLight);
    g.position.set(x, y, z);
    g.name = 'lighthouse';
    this.scene.add(g);
  }

  private buildRelayRuin(): void {
    const [x, z] = this.poi('relay_station');
    const y = this.groundY(x, z);
    const g = new THREE.Group();
    const conc = new THREE.MeshStandardMaterial({ color: 0x77716a, roughness: 1 });
    const rust = new THREE.MeshStandardMaterial({ color: 0x6b4a34, roughness: 1 });
    // broken building shells
    for (let i = 0; i < 3; i++) {
      const bx = (this.rng() - 0.5) * 26;
      const bz = (this.rng() - 0.5) * 20;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(6 + this.rng() * 4, 2 + this.rng() * 2.5, 5), conc);
      wall.position.set(bx, 1.2, bz);
      wall.rotation.y = this.rng() * Math.PI;
      g.add(wall);
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
  updateSky(timeMinutes: number): SkyState {
    const t01 = timeMinutes / 1440;
    const ang = (t01 - 0.25) * Math.PI * 2; // sunrise 06:00 at horizon
    const elev = Math.sin(ang);
    const isNight = timeMinutes < 360 || timeMinutes >= 1080;

    const R = 600;
    this.sun.position.set(Math.cos(ang) * R, Math.max(elev, -0.2) * R, 220);
    if (elev > 0.02) {
      const dayness = clamp(elev * 2.2, 0, 1);
      this.sun.intensity = 0.25 + dayness * 2.4;
      this.sun.color.setHex(0xfff2dd).lerp(new THREE.Color(0xff9a4e), 1 - dayness);
      this.moonFill.intensity = 0;
      const sky = NIGHT_SKY.clone()
        .lerp(SUNSET_SKY, clamp(1 - Math.abs(elev) * 4, 0, 1))
        .lerp(DAY_SKY, dayness);
      (this.scene.background as THREE.Color).copy(sky);
      (this.scene.fog as THREE.Fog).color.copy(DAY_FOG).lerp(NIGHT_FOG, 1 - dayness);
      this.hemi.intensity = 0.25 + dayness * 0.65;
      this.starMat.opacity = 0;
    } else {
      // night: moonlight fill
      this.sun.intensity = 0;
      this.moonFill.intensity = 0.35;
      (this.scene.background as THREE.Color).copy(NIGHT_SKY);
      (this.scene.fog as THREE.Fog).color.copy(NIGHT_FOG);
      this.hemi.intensity = 0.22;
      this.starMat.opacity = clamp(-elev * 3, 0, 0.9);
    }
    // lighthouse lamp burns at night
    const lampOn = isNight;
    this.lampLight.intensity = lampOn ? 60 : 0;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = lampOn ? 0.16 : 0;
    return { isNight, sunElevation: elev };
  }

  /** Per-frame world animation (beam rotation, water shimmer). */
  update(dt: number, elapsed: number): void {
    this.beamPivot.rotation.y += dt * 0.5;
    // cheap water shimmer
    this.waterMat.opacity = 0.8 + Math.sin(elapsed * 0.7) * 0.03;
  }

  dispose(): void {
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
