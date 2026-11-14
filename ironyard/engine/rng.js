// Deterministic PRNG (mulberry32). Every random draw in the engine goes through here.
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (n) => Math.floor(f() * n);
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

// FNV-1a string/number hash -> uint32, used to derive sub-seeds.
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
