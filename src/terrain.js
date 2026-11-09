import * as THREE from 'three';
import { COLS, ROWS } from './config.js';

/*
 * Mountains around the lanes, as a single heightfield mesh. Walkable ground stays flat at
 * y = 0 (the sand plane shows through); rock rises from the lane edge into ridges the deeper
 * it sits, with value noise so no two ranges look alike. One mesh for the whole map keeps a
 * 128 x 128 battlefield cheap to draw.
 */

const MARGIN = 14;          // mountains carry on past the map edge so the horizon is not a cliff
const PEAK = 5.6;           // how high the deep rock gets, in tiles
const RISE = 4.6;           // how quickly it climbs away from the lane

function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x, y, seed) {
  return valueNoise(x / 9, y / 9, seed) * 0.6 + valueNoise(x / 4, y / 4, seed + 7) * 0.3 + valueNoise(x / 1.7, y / 1.7, seed + 13) * 0.1;
}

const LOW = new THREE.Color(0x6b5a44);     // dusty foothill, matches the lane dirt
const MID = new THREE.Color(0x5e554b);     // weathered rock
const HIGH = new THREE.Color(0x9a8f7e);    // pale high ground
const CLIFF = new THREE.Color(0x3f3933);   // steep faces

/**
 * @param depth  per-cell distance into the rock (0 = walkable), from carveLevel
 * @returns { mesh, heightAt(x, z), flatRock: [[x, y]] } — flatRock are blocked cells the
 *          mountains could not rise over (one-tile ribs between lanes); they need a boulder.
 */
export function buildTerrain(depth, seed) {
  const cellDepth = (x, y) => {
    const cx = Math.max(0, Math.min(COLS - 1, x)), cy = Math.max(0, Math.min(ROWS - 1, y));
    const out = Math.max(Math.abs(x - cx), Math.abs(y - cy));
    return depth[cy * COLS + cx] + out * 1.3;
  };

  const vx = COLS + 1 + MARGIN * 2, vy = ROWS + 1 + MARGIN * 2;
  const heights = new Float32Array(vx * vy);
  const pos = new Float32Array(vx * vy * 3);
  for (let j = 0; j < vy; j++) {
    for (let i = 0; i < vx; i++) {
      const x = i - MARGIN, y = j - MARGIN;          // vertex sits at the corner of cells (x-1..x, y-1..y)
      const d = Math.min(cellDepth(x - 1, y - 1), cellDepth(x, y - 1), cellDepth(x - 1, y), cellDepth(x, y));
      let h = 0;
      if (d > 0) {
        const n = fbm(x, y, seed);
        h = PEAK * (1 - Math.exp(-d / RISE)) * (0.62 + 0.76 * n) + Math.min(1, d) * (n - 0.5) * 0.5;
        h = Math.max(0.12 * Math.min(1, d), h);
      }
      const k = j * vx + i;
      heights[k] = h;
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = y;
    }
  }

  const index = [];
  const flatRock = [];
  for (let j = 0; j < vy - 1; j++) {
    for (let i = 0; i < vx - 1; i++) {
      const a = j * vx + i, b = a + 1, c = a + vx, d = c + 1;
      if (heights[a] + heights[b] + heights[c] + heights[d] < 1e-4) {
        // flat quad: open ground, or a rock rib squeezed between lanes
        const x = i - MARGIN, y = j - MARGIN;
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS && depth[y * COLS + x] > 0) flatRock.push([x, y]);
        continue;
      }
      index.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();

  // colour by height and steepness
  const col = new Float32Array(vx * vy * 3);
  const nrm = geo.attributes.normal;
  const c = new THREE.Color();
  for (let k = 0; k < vx * vy; k++) {
    const h = heights[k];
    const t = Math.min(1, h / PEAK);
    if (t < 0.35) c.copy(LOW).lerp(MID, t / 0.35);
    else c.copy(MID).lerp(HIGH, (t - 0.35) / 0.65);
    const steep = 1 - Math.max(0, nrm.getY(k));
    c.lerp(CLIFF, Math.min(0.75, steep * 1.4));
    const grain = (hash(k, 3, seed) - 0.5) * 0.06;
    col[k * 3] = c.r + grain; col[k * 3 + 1] = c.g + grain; col[k * 3 + 2] = c.b + grain;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0.02
  }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const heightAt = (x, z) => {
    const fi = x + MARGIN, fj = z + MARGIN;
    const i = Math.max(0, Math.min(vx - 2, Math.floor(fi))), j = Math.max(0, Math.min(vy - 2, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    const h00 = heights[j * vx + i], h10 = heights[j * vx + i + 1];
    const h01 = heights[(j + 1) * vx + i], h11 = heights[(j + 1) * vx + i + 1];
    return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
  };

  return { mesh, heightAt, flatRock };
}
