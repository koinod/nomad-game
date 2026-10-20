// Fx.ts — pooled combat feedback: impact puffs (flesh/dust), muzzle
// smoke, ejected brass, and hitscan tracers. One Points cloud with a
// tiny shader (per-particle size + alpha), one pool of tracer slivers.
// Everything pre-allocated — firing a shotgun allocates nothing.

import * as THREE from 'three';

const MAX_PARTICLES = 900;
const MAX_TRACERS = 28;

interface BurstOpts {
  count: number;
  colorA: [number, number, number];
  colorB: [number, number, number];
  speed: number;
  up: number; // vertical bias added to the random sphere velocity
  life: number;
  size: number;
  gravity: number; // negative pulls down; positive (smoke) rises
  drag?: number;
}

export class Fx {
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX_PARTICLES * 3);
  private col = new Float32Array(MAX_PARTICLES * 3);
  private psize = new Float32Array(MAX_PARTICLES);
  private palpha = new Float32Array(MAX_PARTICLES);
  private vel = new Float32Array(MAX_PARTICLES * 3);
  private life = new Float32Array(MAX_PARTICLES);
  private maxLife = new Float32Array(MAX_PARTICLES);
  private baseAlpha = new Float32Array(MAX_PARTICLES);
  private grav = new Float32Array(MAX_PARTICLES);
  private dragK = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  private points: THREE.Points;
  private tracers: { mesh: THREE.Mesh; t: number; life: number }[] = [];
  private tracerCursor = 0;

  constructor(scene: THREE.Scene) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.psize, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.palpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * vAlpha;
          if (a < 0.012) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    const tGeo = new THREE.BoxGeometry(0.016, 0.016, 1);
    for (let i = 0; i < MAX_TRACERS; i++) {
      const m = new THREE.Mesh(
        tGeo,
        new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false }),
      );
      m.visible = false;
      m.frustumCulled = false;
      scene.add(m);
      this.tracers.push({ mesh: m, t: 0, life: 0.075 });
    }
    // park every particle far underground until spawned
    for (let i = 0; i < MAX_PARTICLES; i++) this.pos[i * 3 + 1] = -100;
  }

  /** Spawn a burst of particles at p. */
  burst(p: THREE.Vector3, o: BurstOpts): void {
    for (let n = 0; n < o.count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const i3 = i * 3;
      this.pos[i3] = p.x;
      this.pos[i3 + 1] = p.y;
      this.pos[i3 + 2] = p.z;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const sp = o.speed * (0.35 + Math.random() * 0.85);
      this.vel[i3] = Math.sin(ph) * Math.cos(th) * sp;
      this.vel[i3 + 1] = Math.cos(ph) * sp + o.up;
      this.vel[i3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      const mix = Math.random();
      this.col[i3] = o.colorA[0] + (o.colorB[0] - o.colorA[0]) * mix;
      this.col[i3 + 1] = o.colorA[1] + (o.colorB[1] - o.colorA[1]) * mix;
      this.col[i3 + 2] = o.colorA[2] + (o.colorB[2] - o.colorA[2]) * mix;
      this.psize[i] = o.size * (0.7 + Math.random() * 0.6);
      this.maxLife[i] = o.life * (0.7 + Math.random() * 0.6);
      this.life[i] = this.maxLife[i];
      this.baseAlpha[i] = 0.95;
      this.palpha[i] = 0.95;
      this.grav[i] = o.gravity;
      this.dragK[i] = o.drag ?? 2.2;
    }
  }

  /** Blood-and-meat puff where a round found a husk. Size scales with damage. */
  impactFlesh(p: THREE.Vector3, damage: number, head: boolean): void {
    this.burst(p, {
      count: Math.min(16, 6 + Math.round(damage / 6)) + (head ? 4 : 0),
      colorA: [0.32, 0.04, 0.04],
      colorB: [0.52, 0.1, 0.07],
      speed: 1.5 + Math.min(2, damage * 0.02),
      up: 0.5,
      life: 0.5,
      size: 0.11 + Math.min(0.1, damage * 0.0012),
      gravity: -2.4,
    });
  }

  /** Dirt puff where a round found the ground instead. */
  impactDust(p: THREE.Vector3): void {
    this.burst(p, {
      count: 5,
      colorA: [0.5, 0.44, 0.34],
      colorB: [0.66, 0.58, 0.44],
      speed: 0.9,
      up: 0.9,
      life: 0.55,
      size: 0.13,
      gravity: -0.7,
    });
  }

  /** A wisp of propellant smoke off the muzzle. */
  muzzleSmoke(p: THREE.Vector3, dir: THREE.Vector3): void {
    const at = _v.copy(p).addScaledVector(dir, 0.25);
    this.burst(at, {
      count: 3,
      colorA: [0.55, 0.55, 0.58],
      colorB: [0.75, 0.75, 0.78],
      speed: 0.35,
      up: 0.55,
      life: 0.8,
      size: 0.17,
      gravity: 0.7, // smoke climbs
      drag: 1.2,
    });
  }

  /** One spent casing, kicked out sideways to tumble and fall. */
  brass(p: THREE.Vector3, right: THREE.Vector3): void {
    this.burst(p, {
      count: 1,
      colorA: [0.85, 0.64, 0.18],
      colorB: [0.95, 0.78, 0.3],
      speed: 0.2,
      up: 1.5,
      life: 0.55,
      size: 0.05,
      gravity: -9,
      drag: 0.2,
    });
    // bias the casing's velocity along the ejection side
    const i = (this.cursor + MAX_PARTICLES - 1) % MAX_PARTICLES;
    this.vel[i * 3] += right.x * 1.3;
    this.vel[i * 3 + 2] += right.z * 1.3;
  }

  /** A hitscan tracer sliver from muzzle to impact, gone in a blink. */
  tracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const len = from.distanceTo(to);
    if (len < 1.5) return;
    const slot = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % MAX_TRACERS;
    slot.t = slot.life;
    slot.mesh.visible = true;
    slot.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    slot.mesh.scale.set(1, 1, len);
    slot.mesh.lookAt(to);
    (slot.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.palpha[i] = 0;
        this.pos[i3 + 1] = -100;
        continue;
      }
      const drag = Math.max(0, 1 - this.dragK[i] * dt);
      this.vel[i3] *= drag;
      this.vel[i3 + 2] *= drag;
      this.vel[i3 + 1] = this.vel[i3 + 1] * drag + this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.palpha[i] = this.baseAlpha[i] * Math.min(1, (this.life[i] / this.maxLife[i]) * 1.6);
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    for (const slot of this.tracers) {
      if (slot.t <= 0) continue;
      slot.t -= dt;
      const m = slot.mesh.material as THREE.MeshBasicMaterial;
      if (slot.t <= 0) {
        slot.mesh.visible = false;
        m.opacity = 0;
      } else {
        m.opacity = 0.55 * (slot.t / slot.life);
      }
    }
  }
}

const _v = new THREE.Vector3();
