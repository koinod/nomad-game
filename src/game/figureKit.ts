// figureKit.ts — LANE 4: the rigged-base figure pipeline.
//
// ONE parametric humanoid rig builds every person and husk in NOMAD:
// lofted (never box-stacked) torso and limbs hung on JOINT PIVOTS —
// torso at the hip line, head at the neck, arms at the shoulders, legs
// at the hips — so animation code poses the figure by writing pivot
// rotations, exactly the contract Player.ts already uses for its limb
// swing and Husks.ts uses for flinch / wind-up / telegraph posing.
//
// Appearance is data: skin / hair / jacket / pants + build (slim /
// standard / heavy) + hair style, and WORN GEAR renders on the body
// (pack by tier, armored vest, helmets) — the same reads Player's
// wave-4 figure did by hand, now shared by the player avatar, NPCs,
// recruits, and (mutated per kind) every husk.
//
// GLB path: authored Blender figures can replace the procedural build
// per figure by following the node contract — pivots named `torso`,
// `head`, `jaw`, `armL`, `armR`, `legL`, `legR`, feature node `sac`,
// eye meshes sharing one material named `eyes`. `bindFigureGLB()`
// wraps such a root in the same FigureRig shape; proof GLBs exported
// from this kit live in public/figures/.

import * as THREE from 'three';

export type FigureBuild = 'slim' | 'standard' | 'heavy';
export type HairStyle = 'bald' | 'crop' | 'long' | 'hawk';

export interface FigurePalette {
  skin: number;
  jacket: number;
  pants: number;
  hair?: number;
  dark?: number; // boots / trim / jaw shadow
}

export interface GearSpec {
  pack?: 0 | 1 | 2; // 0/none, trail pack, rigger pack (bedroll)
  vest?: boolean; // armored vest bulk + front plate
  helmet?: boolean; // plain shell (military / riot base)
  riotVisor?: boolean; // + dark visor strip
  hat?: number; // soft cap color (civilian)
}

export interface FigureRig {
  group: THREE.Group; // root — origin at the feet, faces +Z
  torso: THREE.Group; // pivot at the hip line; rotation.x rocks the whole upper body
  head: THREE.Group; // pivot at the neck base
  jaw: THREE.Object3D | null; // hinge at the jaw line; rotation.x opens it
  armL: THREE.Group; // pivots at the shoulders — geometry hangs DOWN -Y
  armR: THREE.Group;
  legL: THREE.Group; // pivots at the hips — geometry hangs DOWN -Y
  legR: THREE.Group;
  sac: THREE.Mesh | null; // kind feature slot (spitter throat sac)
  eyeMat: THREE.MeshBasicMaterial | null;
  bodyMat: THREE.MeshStandardMaterial; // torso material — the damage-flash target
  mats: THREE.Material[]; // every material the build created
  height: number;
  /** Static base rotations the builder posed (animation adds around these). */
  pose: { torsoX: number; armLX: number; armRX: number; legLX: number; legRX: number };
}

// ------------------------------------------------------------- lofting ---

interface YSection { y: number; w: number; d: number; x?: number; z?: number }

/**
 * Sweep elliptical cross-sections along Y (up) — the vertical sibling of
 * modelKit.loftMesh. Sections run bottom → top; caps close both ends.
 */
export function loftY(sections: YSection[], material: THREE.Material, seg = 14): THREE.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  sections.forEach((s) => {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      positions.push((s.x ?? 0) + Math.cos(a) * s.w * 0.5, s.y, (s.z ?? 0) + Math.sin(a) * s.d * 0.5);
    }
  });
  const cols = seg + 1;
  for (let si = 0; si < sections.length - 1; si++) {
    for (let i = 0; i < seg; i++) {
      const a = si * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = b + cols;
      indices.push(a, b, c, b, d, c);
    }
  }
  const cap = (si: number, flip: boolean) => {
    const s = sections[si];
    const center = positions.length / 3;
    positions.push(s.x ?? 0, s.y, s.z ?? 0);
    const base = si * cols;
    for (let i = 0; i < seg; i++) {
      const a = base + i;
      const b = base + ((i + 1) % cols);
      if (flip) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
  };
  cap(0, true);
  cap(sections.length - 1, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A tapered limb hanging from its joint: origin at the pivot, mass below. */
function limb(len: number, rTop: number, rMid: number, rEnd: number, material: THREE.Material): THREE.Mesh {
  const m = loftY([
    { y: -len, w: rEnd * 2, d: rEnd * 2 },
    { y: -len * 0.55, w: rMid * 2, d: rMid * 2 },
    { y: -len * 0.12, w: rTop * 2, d: rTop * 2 },
    { y: 0.015, w: rTop * 1.7, d: rTop * 1.7 }, // joint ball swells over the pivot
  ], material, 10);
  return m;
}

function ball(r: number, material: THREE.Material, sx = 1, sy = 1, sz = 1): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), material);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

export function buildWidth(build: FigureBuild | undefined): number {
  return build === 'slim' ? 0.86 : build === 'heavy' ? 1.18 : 1;
}

// ------------------------------------------------------------- the rig ---

export interface HumanSpec {
  height?: number; // standing height, m (default 1.8)
  build?: FigureBuild;
  female?: boolean;
  palette: FigurePalette;
  hairStyle?: HairStyle;
  gear?: GearSpec;
  /** Husk mutation: desaturate/stain handled by palette choice; this
   *  stretches the frame (screamer) without touching the proportions code. */
  gaunt?: number; // 0..1 — narrows limbs/torso, lengthens arms
  /** 'glow' = husk eye pits (shared basic material, night readability +
   *  screamer flare); 'dark' = plain bead eyes (people). Default 'dark'. */
  eyes?: 'glow' | 'dark';
}

/**
 * The base humanoid. Proportions as fractions of height so every kind —
 * 1.8m shambler to 2.4m brute — shares one skeleton:
 *   hip line .48H · shoulder .80H · neck .845H · head center ≈ .925H
 * Husk kinds pass their HitProfile headY through `headCenterY` so the
 * visible skull sits exactly where shots resolve.
 */
export function buildHumanFigure(spec: HumanSpec & { headCenterY?: number }): FigureRig {
  const H = spec.height ?? 1.8;
  const bw = buildWidth(spec.build) * (spec.female ? 0.94 : 1);
  const gaunt = spec.gaunt ?? 0;
  const limbNarrow = 1 - gaunt * 0.3;
  const pal = spec.palette;
  const mats: THREE.Material[] = [];
  const std = (color: number, rough = 0.95, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
    mats.push(m);
    return m;
  };
  const skinMat = std(pal.skin, 0.85);
  const jacketMat = std(pal.jacket, 1);
  const pantsMat = std(pal.pants, 1);
  const darkMat = std(pal.dark ?? 0x24211e, 1);
  const hairMat = std(pal.hair ?? 0x2c2320, 1);

  const group = new THREE.Group();
  const hipY = H * 0.48;
  const shoulderY = H * 0.335; // local to the torso pivot (hip → shoulder)
  const torsoLen = H * 0.36;

  // ---- legs (root children; pivots at the hip line) ----
  // Hip joints sit at the anatomical bi-acetabular width — ±0.055H
  // (±0.099 m at 1.8 m), INSIDE the pelvis silhouette. The pre-fix
  // ±0.095H put the pivots outside the pelvis (±0.084H half-width):
  // the thigh columns hung outboard of the body with a wide crotch
  // gap and read as detached, splayed legs (Ian playtest, 2026-10-21).
  const legLen = hipY - H * 0.02;
  const mkLeg = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * H * 0.055 * bw, hipY, 0);
    const leg = limb(legLen, H * 0.052 * limbNarrow, H * 0.046, H * 0.037, pantsMat);
    leg.scale.x = bw;
    pivot.add(leg);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11 * (H / 1.8), 0.07 * (H / 1.8), 0.24 * (H / 1.8)), darkMat);
    boot.position.set(0, -legLen + 0.03, 0.045);
    boot.castShadow = true;
    pivot.add(boot);
    group.add(pivot);
    return pivot;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // ---- torso (pivot at the hip line; everything above rides it) ----
  const torso = new THREE.Group();
  torso.position.y = hipY;
  group.add(torso);
  const chestW = 0.36 * (H / 1.8) * bw * (spec.female ? 0.9 : 1) * (1 - gaunt * 0.18);
  const torsoMesh = loftY([
    { y: -H * 0.03, w: chestW * 0.82, d: chestW * 0.52 }, // pelvis
    { y: torsoLen * 0.3, w: chestW * 0.78, d: chestW * 0.5 }, // waist
    { y: torsoLen * 0.68, w: chestW * 1.02, d: chestW * 0.58 }, // chest
    { y: torsoLen * 0.97, w: chestW * 0.94, d: chestW * 0.5 }, // shoulder line
    { y: torsoLen + H * 0.012, w: chestW * 0.5, d: chestW * 0.34 }, // neck base
  ], jacketMat);
  torso.add(torsoMesh);
  // pelvis block below the pivot (hips read as hips, not a skirt)
  const pelvis = loftY([
    { y: -H * 0.075, w: chestW * 0.8, d: chestW * 0.5 },
    { y: -H * 0.005, w: chestW * 0.84, d: chestW * 0.52 },
  ], pantsMat);
  torso.add(pelvis);

  // ---- arms (children of the torso, pivots at the shoulders) ----
  const armLen = H * 0.36 * (1 + gaunt * 0.22);
  const mkArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (chestW * 0.52 + 0.035), shoulderY, 0);
    const arm = limb(armLen, H * 0.04 * limbNarrow * bw, H * 0.033, H * 0.027, jacketMat);
    pivot.add(arm);
    const hand = ball(0.052 * (H / 1.8), skinMat, 0.85, 1.15, 0.9);
    hand.position.y = -armLen - 0.02;
    pivot.add(hand);
    torso.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // ---- head (child of the torso, pivot at the neck base) ----
  const head = new THREE.Group();
  head.position.y = torsoLen + H * 0.015;
  torso.add(head);
  const headCenterLocal = (spec.headCenterY ?? H * 0.925) - (hipY + torsoLen + H * 0.015);
  const skullR = H * 0.068;
  const skull = ball(skullR, skinMat, 0.88, 1.08, 0.96);
  skull.name = 'skull';
  skull.position.y = headCenterLocal;
  head.add(skull);
  // neck: a short column so the head never floats off the torso
  const neckBase = new THREE.Mesh(
    new THREE.CylinderGeometry(skullR * 0.4, skullR * 0.5, skullR * 1.1, 8), skinMat,
  );
  neckBase.position.y = headCenterLocal - skullR * 0.85;
  neckBase.castShadow = true;
  head.add(neckBase);
  // jaw: its own hinge so wind-ups and flinches can drop it
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, headCenterLocal - skullR * 0.55, skullR * 0.35);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(skullR * 0.92, skullR * 0.5, skullR * 0.95), skinMat);
  jawMesh.position.set(0, -skullR * 0.22, skullR * 0.1);
  jawMesh.castShadow = true;
  jaw.add(jawMesh);
  head.add(jaw);
  // eyes: husks get glowing pits on ONE shared basic material (night
  // readability + the screamer's flare reads through it); people get
  // plain dark beads — a survivor with lamp eyes reads wrong.
  let eyeMat: THREE.MeshBasicMaterial | null = null;
  let eyeMeshMat: THREE.Material;
  if ((spec.eyes ?? 'dark') === 'glow') {
    eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd76a });
    mats.push(eyeMat);
    eyeMeshMat = eyeMat;
  } else {
    eyeMeshMat = std(0x1a1512, 0.6);
  }
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016 * (H / 1.8) + 0.008, 6, 6), eyeMeshMat);
    eye.name = 'eye';
    eye.position.set(sx * skullR * 0.36, headCenterLocal + skullR * 0.12, skullR * 0.88);
    head.add(eye);
  }

  // ---- hair ----
  const hairStyle = spec.hairStyle ?? 'bald';
  if (hairStyle !== 'bald') {
    const capM = ball(skullR * 1.06, hairMat, 0.92, 1.02, 1);
    capM.position.set(0, headCenterLocal + skullR * 0.3, -skullR * 0.14);
    head.add(capM);
    if (hairStyle === 'long') {
      const back = new THREE.Mesh(new THREE.BoxGeometry(skullR * 1.5, H * 0.26, skullR * 0.5), hairMat);
      back.position.set(0, headCenterLocal - H * 0.1, -skullR * 0.95);
      back.castShadow = true;
      head.add(back);
    }
    if (hairStyle === 'hawk') {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(skullR * 0.42, skullR * 0.75, skullR * 1.9), hairMat);
      strip.position.set(0, headCenterLocal + skullR * 0.95, -skullR * 0.05);
      strip.castShadow = true;
      head.add(strip);
    }
  }

  // ---- worn gear (rides the torso / head so it poses with the body) ----
  const gear = spec.gear;
  if (gear?.pack) {
    const big = gear.pack === 2;
    const packMat = std(big ? 0x3a3f35 : 0x4a4438, 1);
    const packDepth = big ? 0.27 : 0.2;
    const pack = loftY([
      { y: torsoLen * 0.08, w: chestW * (big ? 0.98 : 0.8), d: packDepth * 0.8 },
      { y: torsoLen * 0.5, w: chestW * (big ? 1.05 : 0.86), d: packDepth },
      { y: torsoLen * (big ? 0.92 : 0.8), w: chestW * (big ? 0.95 : 0.78), d: packDepth * 0.85 },
    ], packMat);
    pack.position.z = -(chestW * 0.29 + packDepth * 0.5);
    torso.add(pack);
    if (big) {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, chestW * 0.95, 10), std(0x5a5148, 1));
      roll.rotation.z = Math.PI / 2;
      roll.position.set(0, torsoLen * 0.98, pack.position.z);
      roll.castShadow = true;
      torso.add(roll);
    }
  }
  if (gear?.vest) {
    const kevlar = std(0x2b2e33, 0.9, 0.08);
    const vest = loftY([
      { y: torsoLen * 0.12, w: chestW * 1.1, d: chestW * 0.64 },
      { y: torsoLen * 0.55, w: chestW * 1.14, d: chestW * 0.68 },
      { y: torsoLen * 0.82, w: chestW * 1.04, d: chestW * 0.6 },
    ], kevlar);
    torso.add(vest);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(chestW * 0.62, torsoLen * 0.42, 0.045),
      std(0x3d434b, 0.55, 0.45),
    );
    plate.position.set(0, torsoLen * 0.48, chestW * 0.35);
    plate.castShadow = true;
    torso.add(plate);
  }
  if (gear?.helmet) {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(skullR * 1.22, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
      std(0x394048, 0.6, 0.35),
    );
    shell.position.y = headCenterLocal + skullR * 0.12;
    shell.castShadow = true;
    head.add(shell);
    if (gear.riotVisor) {
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(skullR * 1.5, skullR * 0.5, 0.025),
        std(0x14181d, 0.2, 0.4),
      );
      visor.position.set(0, headCenterLocal + skullR * 0.05, skullR * 1.02);
      head.add(visor);
    }
  }
  if (gear?.hat !== undefined) {
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(skullR * 1.12, skullR * 1.2, skullR * 0.4, 12), std(gear.hat, 1));
    hat.position.y = headCenterLocal + skullR * 0.78;
    hat.castShadow = true;
    head.add(hat);
  }

  return {
    group, torso, head, jaw, armL, armR, legL, legR,
    sac: null, eyeMat, bodyMat: jacketMat, mats, height: H,
    pose: { torsoX: 0, armLX: 0, armRX: 0, legLX: 0, legRX: 0 },
  };
}

// ------------------------------------------------------ husk variants ---

export type HuskFigureKind =
  | 'shambler' | 'stalker' | 'armored' | 'screamer' | 'brute' | 'crawler' | 'bloater' | 'spitter';

export interface HuskFigureOptions {
  height: number;
  headCenterY: number; // from the kind's HitProfile — skull sits on the hit window
  palette: FigurePalette;
  /** Deterministic per-husk variation source (wardrobe rolls). */
  vrnd: () => number;
}

const stdMat = (track: THREE.Material[], color: number, rough = 0.95, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  track.push(m);
  return m;
};

/**
 * Every husk kind on the shared rig — the mutation is proportions,
 * attachments, and pose, never a different skeleton. Behavior code
 * (Husks.ts) poses the returned pivots; this function only builds.
 */
export function buildHuskFigure(kind: HuskFigureKind, o: HuskFigureOptions): FigureRig {
  const { vrnd } = o;
  switch (kind) {
    case 'screamer': return huskScreamer(o);
    case 'brute': return huskBrute(o);
    case 'crawler': return huskCrawler(o);
    case 'bloater': return huskBloater(o);
    case 'spitter': return huskSpitter(o);
    case 'armored': {
      const rig = buildHumanFigure({
        height: o.height, headCenterY: o.headCenterY, palette: o.palette, eyes: 'glow', build: 'heavy',
        gear: { vest: true, helmet: true },
      });
      // shoulder pads ride the arm pivots (they swing with the arms)
      const plate = stdMat(rig.mats, 0x3f4750, 0.55, 0.45);
      for (const arm of [rig.armL, rig.armR]) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.24), plate);
        pad.position.y = -0.09;
        pad.castShadow = true;
        arm.add(pad);
      }
      poseSlump(rig, 0.14, vrnd);
      return rig;
    }
    case 'stalker': {
      const rig = buildHumanFigure({
        height: o.height, headCenterY: o.headCenterY, palette: o.palette, eyes: 'glow', build: 'slim', gaunt: 0.35,
      });
      poseSlump(rig, 0.2, vrnd);
      return rig;
    }
    default: { // shambler
      const rig = buildHumanFigure({
        height: o.height, headCenterY: o.headCenterY, palette: o.palette, eyes: 'glow',
        build: vrnd() < 0.3 ? 'heavy' : 'standard',
        gear: vrnd() < 0.3 ? { hat: o.palette.dark ?? 0x2c2c30 } : undefined,
      });
      poseSlump(rig, 0.14, vrnd);
      return rig;
    }
  }
}

/**
 * The infected posture: torso slumped, head lolled, arms hanging forward.
 * Exported so an authored GLB rig (bindFigureGLB) receives the IDENTICAL
 * base pose the procedural builders apply — pose bases are behavior
 * (flinch/walk relax back to them), not decoration.
 */
export function poseSlump(rig: FigureRig, slump: number, vrnd: () => number): void {
  rig.torso.rotation.x = slump;
  rig.pose.torsoX = slump;
  rig.head.rotation.z = 0.14 + vrnd() * 0.12;
  rig.head.rotation.x = 0.08;
  const hangL = -0.52 - vrnd() * 0.15;
  const hangR = -0.38 - vrnd() * 0.15;
  rig.armL.rotation.x = hangL;
  rig.armR.rotation.x = hangR;
  rig.armL.rotation.z = 0.1;
  rig.armR.rotation.z = -0.1;
  rig.pose.armLX = hangL;
  rig.pose.armRX = hangR;
}

/** Screamer: all ribs and throat — gaunt lofted torso, bone rings proud
 *  of the cage, long neck, elongated skull, arms nearly at the knees. */
function huskScreamer(o: HuskFigureOptions): FigureRig {
  const rig = buildHumanFigure({
    height: o.height, headCenterY: o.headCenterY, palette: o.palette, eyes: 'glow', build: 'slim', gaunt: 0.85,
  });
  const H = o.height;
  // exposed ribs: bone rings riding proud of the ribcage
  const bone = stdMat(rig.mats, 0xb8ab90, 0.9);
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.168 - i * 0.012, 0.02, 6, 18), bone);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = H * (0.15 + i * 0.045); // the ribcage band, not the throat
    rib.castShadow = true;
    rig.torso.add(rib);
  }
  // long neck: a stretched column bridging the head pivot up to the
  // skull, which rides high (headCenterY comes from the HitProfile)
  const skull = rig.head.getObjectByName('skull');
  const skullY = skull?.position.y ?? H * 0.1;
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.07, Math.max(0.06, skullY + H * 0.03), 8),
    stdMat(rig.mats, o.palette.skin, 0.85),
  );
  neck.position.y = skullY / 2 - H * 0.02;
  neck.castShadow = true;
  rig.head.add(neck);
  // elongate the skull — a screamer's head is a stretched oval
  if (skull instanceof THREE.Mesh) {
    skull.scale.y *= 1.35;
    skull.scale.x *= 0.9;
  }
  rig.torso.rotation.x = 0.06;
  rig.pose.torsoX = 0.06;
  rig.head.rotation.x = -0.25; // thrown back — the wind-up deepens it
  rig.armL.rotation.x = -0.42;
  rig.armR.rotation.x = -0.34;
  rig.pose.armLX = -0.42;
  rig.pose.armRX = -0.34;
  return rig;
}

/** Brute: mass first — a hump of muscle over the back, the head sunk
 *  low between the shoulders, arms like wrecking bars. */
function huskBrute(o: HuskFigureOptions): FigureRig {
  const rig = buildHumanFigure({
    height: o.height, headCenterY: o.headCenterY, palette: o.palette, eyes: 'glow', build: 'heavy',
  });
  const H = o.height;
  rig.group.scale.x = 1.22; // broader than any human frame
  rig.group.scale.z = 1.12;
  // the hump: a squashed dome over the upper back, riding the torso
  const hump = new THREE.Mesh(new THREE.SphereGeometry(H * 0.17, 12, 10), rig.bodyMat);
  hump.scale.set(1.3, 0.72, 1.05);
  hump.position.set(0, H * 0.33, -H * 0.05);
  hump.castShadow = true;
  rig.torso.add(hump);
  // fists: the hands swell into clubs
  for (const arm of [rig.armL, rig.armR]) {
    const fist = ball2(H * 0.075, rig.mats, o.palette.skin);
    fist.position.y = -H * 0.37;
    arm.add(fist);
  }
  rig.torso.rotation.x = 0.24;
  rig.pose.torsoX = 0.24;
  rig.head.rotation.x = 0.28; // sunk forward between the traps
  rig.armL.rotation.x = -0.3;
  rig.armR.rotation.x = -0.3;
  rig.pose.armLX = -0.3;
  rig.pose.armRX = -0.3;
  return rig;
}

function ball2(r: number, track: THREE.Material[], color: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), stdMat(track, color, 0.85));
  m.castShadow = true;
  return m;
}

/** Crawler: the rig re-posed quadruped — torso pitched flat and slung
 *  low, head thrust forward at the front, limbs bent for scuttling. */
function huskCrawler(o: HuskFigureOptions): FigureRig {
  const rig = buildHumanFigure({
    height: 1.8, headCenterY: 1.62, palette: o.palette, eyes: 'glow', build: 'slim', gaunt: 0.4,
  });
  const g = rig.group;
  // pitch the whole upper body flat around the hip pivot and drop it low
  rig.torso.position.y = 0.4;
  rig.torso.rotation.x = 1.35;
  rig.pose.torsoX = 1.35;
  // head counter-pitches so the face looks forward, not into the dirt
  rig.head.rotation.x = -1.1;
  // spine ridges down the (now horizontal) back — local -Z is world-up
  const dark = stdMat(rig.mats, o.palette.dark ?? 0x24211e, 1);
  for (let i = 0; i < 4; i++) {
    const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 6), dark);
    ridge.position.set(0, 0.12 + i * 0.15, -0.17);
    ridge.rotation.x = -Math.PI / 2; // cone tip out of the back
    rig.torso.add(ridge);
  }
  // forelimbs: arm pivots ride the flat torso — swing them hard negative
  // (torso-local) and they land down-forward like a quadruped's front legs
  rig.armL.rotation.x = -1.85;
  rig.armR.rotation.x = -1.75;
  rig.pose.armLX = -1.85;
  rig.pose.armRX = -1.75;
  // hindlimbs: drop the hip pivots to the slung body's line, trail bent
  rig.legL.position.set(-0.17, 0.44, -0.2);
  rig.legR.position.set(0.17, 0.44, -0.2);
  rig.legL.rotation.x = 0.95;
  rig.legR.rotation.x = 0.88;
  rig.pose.legLX = 0.95;
  rig.pose.legRX = 0.88;
  // the head lands on the kind's low hit window (≈0.6m) by construction:
  // flat torso (pivot y .40, pitch 1.35) carries the skull to ≈0.62m
  g.scale.y = 0.96;
  rig.height = o.height;
  return rig;
}

/** Bloater: the belly IS the model — the torso loft swells into a sac,
 *  weeping pustules across it, arms dangling useless at the mass. */
function huskBloater(o: HuskFigureOptions): FigureRig {
  const rig = buildHumanFigure({
    height: o.height, headCenterY: o.headCenterY, palette: o.palette, eyes: 'glow', build: 'heavy',
  });
  const H = o.height;
  const u = H / 1.85; // torso-local unit (belly coords authored at kind height)
  // the sac: a second, grosser loft ballooning out of the torso front
  // (sections are torso-local: the pivot sits at the hip line, .48H)
  const sacMat = stdMat(rig.mats, o.palette.jacket, 0.6);
  const belly = loftY([
    { y: -0.08 * u, w: 0.52 * u, d: 0.44 * u, z: 0.08 * u },
    { y: 0.08 * u, w: 0.8 * u, d: 0.72 * u, z: 0.15 * u },
    { y: 0.24 * u, w: 0.74 * u, d: 0.68 * u, z: 0.14 * u },
    { y: 0.4 * u, w: 0.44 * u, d: 0.4 * u, z: 0.07 * u },
  ], sacMat);
  rig.torso.add(belly);
  // pustules: glossy sick blisters across the sac and shoulders
  const pus = stdMat(rig.mats, 0x9aa84e, 0.25, 0, { emissive: 0x2a3305, emissiveIntensity: 0.7 });
  const spots: [number, number, number, number][] = [
    [0.26, 0.14, 0.42, 0.075], [-0.3, 0.08, 0.36, 0.06], [0.08, 0.26, 0.44, 0.055],
    [-0.13, 0.36, -0.13, 0.05], [0.17, 0.42, 0.02, 0.045], [0, -0.02, 0.46, 0.06],
  ];
  for (const [px, py, pz, pr] of spots) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(pr * u, 8, 8), pus);
    p.position.set(px * u, py * u, pz * u);
    rig.torso.add(p);
  }
  poseSlump(rig, 0.1, o.vrnd);
  // arms ride OUTBOARD of the sac and splay around it — from the front
  // they must read as limbs dangling at the sides of the mass
  rig.armL.position.x -= 0.17;
  rig.armR.position.x += 0.17;
  rig.armL.rotation.z = 0.38;
  rig.armR.rotation.z = -0.38;
  return rig;
}

/** Spitter: a rangy frame with a translucent acid sac slung under the
 *  jaw — it swells bright on the telegraph (Husks.ts scales `sac`). */
function huskSpitter(o: HuskFigureOptions): FigureRig {
  const rig = buildHumanFigure({
    height: o.height, headCenterY: o.headCenterY, palette: o.palette, eyes: 'glow', build: 'slim', gaunt: 0.3,
  });
  const H = o.height;
  const sacMat = stdMat(rig.mats, 0x7d9b3a, 0.2, 0, {
    emissive: 0x33450a, emissiveIntensity: 0.8, transparent: true, opacity: 0.88,
  });
  const sac = new THREE.Mesh(new THREE.SphereGeometry(0.145 * (H / 1.8), 12, 10), sacMat);
  sac.scale.set(0.9, 1.25, 0.9);
  sac.position.set(0.02, H * 0.325, H * 0.085); // slung from jaw to chest (torso-local)
  sac.castShadow = true;
  rig.torso.add(sac);
  rig.sac = sac;
  // nozzle lips at the mouth
  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 8), stdMat(rig.mats, o.palette.dark ?? 0x24211e, 1));
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0.02, H * 0.115, H * 0.06);
  rig.head.add(nozzle);
  poseSlump(rig, 0.14, o.vrnd);
  return rig;
}

// ------------------------------------------------------------ GLB path ---

/** Node names an authored GLB must carry to bind as a FigureRig. */
export const FIGURE_GLB_NODES = ['torso', 'head', 'jaw', 'armL', 'armR', 'legL', 'legR', 'sac', 'eyes'] as const;

/** Where exported/authored figure GLBs live (public dir). */
export const figureGLBUrl = (name: string): string => `figures/${name}.glb`;

/**
 * Bind an authored GLB root (loaded by the caller via GLTFLoader) into
 * the FigureRig shape. Missing optional nodes bind as null; a missing
 * torso/head/arm/leg pivot throws — a GLB that can't be posed can't be
 * integrated. Materials are collected for disposal/flash parity.
 */
export function bindFigureGLB(root: THREE.Object3D, height: number): FigureRig {
  const find = (name: string): THREE.Object3D | null => root.getObjectByName(name) ?? null;
  const need = (name: string): THREE.Object3D => {
    const o = find(name);
    if (!o) throw new Error(`figure GLB missing required pivot node "${name}"`);
    return o;
  };
  const group = root instanceof THREE.Group ? root : (() => { const g = new THREE.Group(); g.add(root); return g; })();
  const mats: THREE.Material[] = [];
  let eyeMat: THREE.MeshBasicMaterial | null = null;
  let bodyMat: THREE.MeshStandardMaterial | null = null;
  root.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      const m = c.material as THREE.Material;
      if (!mats.includes(m)) mats.push(m);
      if (c.name === 'eyes' && m instanceof THREE.MeshBasicMaterial) eyeMat = m;
      if (c.name === 'torsoMesh' && m instanceof THREE.MeshStandardMaterial) bodyMat = m;
    }
  });
  if (!bodyMat) {
    const first = mats.find((m) => m instanceof THREE.MeshStandardMaterial);
    bodyMat = (first as THREE.MeshStandardMaterial) ?? new THREE.MeshStandardMaterial();
  }
  const sacNode = find('sac');
  return {
    group,
    torso: need('torso') as THREE.Group,
    head: need('head') as THREE.Group,
    jaw: find('jaw'),
    armL: need('armL') as THREE.Group,
    armR: need('armR') as THREE.Group,
    legL: need('legL') as THREE.Group,
    legR: need('legR') as THREE.Group,
    sac: sacNode instanceof THREE.Mesh ? sacNode : null,
    eyeMat,
    bodyMat,
    mats,
    height,
    pose: { torsoX: 0, armLX: 0, armRX: 0, legLX: 0, legRX: 0 },
  };
}
