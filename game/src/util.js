// util.js — small deterministic helpers shared by every system.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn `heading` toward `target` by at most `maxStep` radians. */
export function turnToward(heading, target, maxStep) {
  const d = angleDiff(heading, target);
  if (Math.abs(d) <= maxStep) return target;
  return heading + Math.sign(d) * maxStep;
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

/** Format seconds as M:SS. */
export function fmtTime(s) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Format dollars. */
export function fmtMoney(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------- collisions

/**
 * Push a circle (x, z, radius) out of every AABB and circle collider.
 * Mutates and returns the position object {x, z}. Returns true if any push happened.
 */
export function resolveCircle(pos, radius, colliders) {
  let hit = false;
  for (const b of colliders.boxes) {
    const cx = clamp(pos.x, b.minX, b.maxX);
    const cz = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Center inside the box: push out along the smallest penetration axis.
      const pl = pos.x - b.minX;
      const pr = b.maxX - pos.x;
      const pt = pos.z - b.minZ;
      const pb = b.maxZ - pos.z;
      const m = Math.min(pl, pr, pt, pb);
      if (m === pl) pos.x = b.minX - radius;
      else if (m === pr) pos.x = b.maxX + radius;
      else if (m === pt) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
  }
  for (const c of colliders.circles) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const d2 = dx * dx + dz * dz;
    const r = radius + c.r;
    if (d2 >= r * r || d2 < 1e-8) continue;
    hit = true;
    const d = Math.sqrt(d2);
    pos.x = c.x + (dx / d) * r;
    pos.z = c.z + (dz / d) * r;
  }
  return hit;
}

/** True when a circle overlaps any collider (no push-out). */
export function circleHits(pos, radius, colliders) {
  for (const b of colliders.boxes) {
    const cx = clamp(pos.x, b.minX, b.maxX);
    const cz = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  for (const c of colliders.circles) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const r = radius + c.r;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}
