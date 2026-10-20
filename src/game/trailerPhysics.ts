// Pure trailer kinematics — no three.js imports.
// Heading convention: forward = (sin θ, cos θ) in XZ.

export interface Body2 {
  x: number;
  z: number;
  heading: number;
}

export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let wrapped = (a + Math.PI) % twoPi;
  if (wrapped < 0) wrapped += twoPi;
  return wrapped - Math.PI;
}

export function pointAt(body: Body2, localZ: number): { x: number; z: number } {
  return {
    x: body.x + Math.sin(body.heading) * localZ,
    z: body.z + Math.cos(body.heading) * localZ,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function stepTrailer(
  body: Body2,
  hitch: { x: number; z: number },
  tongueDist: number,
  axleDist: number,
  maxArticulation: number,
  towHeading: number,
): Body2 {
  const tongue = pointAt(body, tongueDist);
  const axle = pointAt(body, axleDist);

  const oldDir = Math.atan2(tongue.x - axle.x, tongue.z - axle.z);
  const newDir = Math.atan2(hitch.x - axle.x, hitch.z - axle.z);

  const dTheta = clamp(wrapAngle(newDir - oldDir), -0.6, 0.6);
  let heading2 = body.heading + dTheta;

  const art = wrapAngle(heading2 - towHeading);
  if (Math.abs(art) > maxArticulation) {
    heading2 = towHeading + Math.sign(art) * maxArticulation;
  }

  const x = hitch.x - Math.sin(heading2) * tongueDist;
  const z = hitch.z - Math.cos(heading2) * tongueDist;

  return { x, z, heading: heading2 };
}

export function articulationOf(trailerHeading: number, towHeading: number): number {
  return wrapAngle(trailerHeading - towHeading);
}

/**
 * Pack vehicles nose-forward on a deck, in load order, starting at the
 * front stop. Returns each vehicle's deck-local center z, or null when
 * the load doesn't fit the pack zone [rearZ, frontZ].
 */
export function packDeckSlots(
  lengths: readonly number[],
  frontZ: number,
  rearZ: number,
  gap = 0.3,
  margin = 0.15,
): number[] | null {
  const centers: number[] = [];
  let cursor = frontZ - margin;
  for (const len of lengths) {
    const center = cursor - len / 2;
    if (center - len / 2 < rearZ) return null;
    centers.push(center);
    cursor = center - len / 2 - gap;
  }
  return centers;
}
