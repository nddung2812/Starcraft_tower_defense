import * as THREE from 'three';
import { COLS, ROWS } from './config.js';
import { detailTerrain } from './scenery.js';

/*
 * Mountains around the lanes, as a heightfield split into cullable sections. Walkable ground
 * stays flat at y = 0 (the sand plane shows through); rock rises into ridges the deeper
 * it sits, with value noise so no two ranges look alike. Only visible sections reach the GPU;
 * normals are computed across the full heightfield first to keep section edges seamless.
 */

const MARGIN = 0;           // hard boundary: no terrain exists beyond the playable map
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

const LOW = new THREE.Color(0x536a3c);     // dusty foothill, matches the lane dirt
const MID = new THREE.Color(0x667354);     // weathered rock
const HIGH = new THREE.Color(0x9a8f7e);    // pale high ground
const CLIFF = new THREE.Color(0x3f3933);   // steep faces
const VEGETATION = new THREE.Color(0x416735);
const SHORE = new THREE.Color(0x9d9970);
const CHUNK_TILES = 12;

/**
 * @param depth  per-cell distance into the rock (0 = walkable), from carveLevel
 * @returns { mesh, heightAt(x, z), flatRock: [[x, y]] } — flatRock are blocked cells the
 *          mountains could not rise over (one-tile ribs between lanes); they need a boulder.
 */
export function buildTerrain(depth, seed, cols = COLS, rows = ROWS) {
  const cellDepth = (x, y) => {
    const cx = Math.max(0, Math.min(cols - 1, x)), cy = Math.max(0, Math.min(rows - 1, y));
    const out = Math.max(Math.abs(x - cx), Math.abs(y - cy));
    return depth[cy * cols + cx] + out * 1.3;
  };

  // Lakes stay inside blocked terrain, preserving every combat lane and build cell.
  const lakes = [];
  for (let z = 4; z < rows - 4; z += 3) {
    for (let x = 4; x < cols - 4; x += 3) {
      const d = cellDepth(x, z);
      if (d < 3 || hash(x, z, seed + 43) < 0.45) continue;
      const radius = Math.min(4.5, d - 0.7);
      if (x < radius + 1 || z < radius + 1 || x + radius + 1 > cols || z + radius + 1 > rows) continue;
      if (lakes.some(l => Math.hypot(l.x - x, l.z - z) < l.radius + radius + 5)) continue;
      lakes.push({ x, z, radius, phase: hash(x, z, seed) * Math.PI * 2 });
    }
  }
  const lakeDistance = (x, z, l) => {
    const angle = Math.atan2(z - l.z, x - l.x);
    const shore = 1 + 0.09 * Math.sin(angle * 3 + l.phase) + 0.05 * Math.cos(angle * 5 - l.phase);
    return Math.hypot(x - l.x, (z - l.z) / 0.82) / (l.radius * shore);
  };

  const resolution = 3;
  const vx = cols * resolution + 1, vy = rows * resolution + 1;
  const heights = new Float32Array(vx * vy);
  const pos = new Float32Array(vx * vy * 3);
  for (let j = 0; j < vy; j++) {
    for (let i = 0; i < vx; i++) {
      const x = i / resolution, y = j / resolution;
      const ax = Math.floor(x), ay = Math.floor(y), u = x - ax, v = y - ay;
      const cornerDepth = (cx, cy) => Math.min(cellDepth(cx - 1, cy - 1), cellDepth(cx, cy - 1), cellDepth(cx - 1, cy), cellDepth(cx, cy));
      const d = cornerDepth(ax, ay) * (1 - u) * (1 - v) + cornerDepth(ax + 1, ay) * u * (1 - v)
        + cornerDepth(ax, ay + 1) * (1 - u) * v + cornerDepth(ax + 1, ay + 1) * u * v;
      let h = 0;
      if (d > 0) {
        const n = fbm(x, y, seed);
        h = PEAK * (1 - Math.exp(-d / RISE)) * (0.62 + 0.76 * n) + Math.min(1, d) * (n - 0.5) * 0.5;
        h = Math.max(0.12 * Math.min(1, d), h);
      }
      for (const lake of lakes) {
        const distance = lakeDistance(x, y, lake);
        if (distance < 1.35 && d > 0) {
          const t = THREE.MathUtils.smoothstep(distance, 0.62, 1.35);
          h = 0.04 + (h - 0.04) * t;
        }
      }
      const k = j * vx + i;
      heights[k] = h;
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = y;
    }
  }

  const index = [];
  const chunks = new Map();
  const flatRock = [];
  for (let j = 0; j < vy - 1; j++) {
    for (let i = 0; i < vx - 1; i++) {
      const a = j * vx + i, b = a + 1, c = a + vx, d = c + 1;
      if (heights[a] + heights[b] + heights[c] + heights[d] < 1e-4) {
        // flat quad: open ground, or a rock rib squeezed between lanes
        const x = i / resolution, y = j / resolution;
        if (i % resolution === 0 && j % resolution === 0 && x < cols && y < rows && depth[y * cols + x] > 0) flatRock.push([x, y]);
        continue;
      }
      index.push(a, c, b, b, c, d);
      const key = `${Math.floor(i / (resolution * CHUNK_TILES))},${Math.floor(j / (resolution * CHUNK_TILES))}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(a, c, b, b, c, d);
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
    const x = pos[k * 3], z = pos[k * 3 + 2];
    const vegetation = valueNoise(x / 5, z / 5, seed + 81);
    c.lerp(VEGETATION, Math.max(0, vegetation - 0.3) * (1 - steep) * 0.8);
    for (const lake of lakes) {
      const distance = lakeDistance(x, z, lake);
      if (distance < 1.15) c.lerp(SHORE, (1 - THREE.MathUtils.smoothstep(distance, 0.7, 1.15)) * 0.65);
    }
    const grain = (hash(k, 3, seed) - 0.5) * 0.025;
    col[k * 3] = c.r + grain; col[k * 3 + 1] = c.g + grain; col[k * 3 + 2] = c.b + grain;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const material = detailTerrain(new THREE.MeshStandardMaterial({
    vertexColors: true, color: 0xa5a5a5, roughness: 0.96, metalness: 0.02
  }));
  const mesh = new THREE.Group();
  mesh.name = 'terrain';
  for (const [key, indices] of chunks) {
    const vertices = new Map();
    const localIndices = indices.map(i => {
      if (!vertices.has(i)) vertices.set(i, vertices.size);
      return vertices.get(i);
    });
    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) {
      const source = geo.getAttribute(name);
      const values = new Float32Array(vertices.size * 3);
      for (const [from, to] of vertices) values.set(source.array.subarray(from * 3, from * 3 + 3), to * 3);
      geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
    }
    geometry.setIndex(localIndices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const section = new THREE.Mesh(geometry, material);
    section.name = `terrain-${key}`;
    section.castShadow = section.receiveShadow = true;
    section.matrixAutoUpdate = false;
    mesh.add(section);
  }
  geo.dispose();
  if (!chunks.size) material.dispose();

  const heightAt = (x, z) => {
    const fi = x * resolution, fj = z * resolution;
    const i = Math.max(0, Math.min(vx - 2, Math.floor(fi))), j = Math.max(0, Math.min(vy - 2, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    const h00 = heights[j * vx + i], h10 = heights[j * vx + i + 1];
    const h01 = heights[(j + 1) * vx + i], h11 = heights[(j + 1) * vx + i + 1];
    return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
  };

  const waterTime = { value: 0 };
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x327e82, roughness: 0.22, metalness: 0.3, transparent: true, opacity: 0.87,
    depthWrite: false, side: THREE.DoubleSide
  });
  waterMaterial.onBeforeCompile = shader => {
    shader.uniforms.waterTime = waterTime;
    shader.vertexShader = 'varying vec3 waterPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nwaterPosition = position;');
    shader.fragmentShader = 'uniform float waterTime; varying vec3 waterPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float shimmer = sin(waterPosition.x * 4.0 + waterPosition.y * 2.5 + waterTime) * cos(waterPosition.y * 5.0 - waterTime * 0.6);
      diffuseColor.rgb *= 0.94 + shimmer * 0.08;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      float ripples = sin(waterPosition.x * 5.0 + waterPosition.y * 2.8 + waterTime * 0.9);
      float crossRipples = cos(waterPosition.y * 7.0 - waterPosition.x * 1.8 - waterTime * 0.7);
      normal = normalize(normal + vec3(ripples * 0.065, crossRipples * 0.045, 0.0));`);
  };
  for (const lake of lakes) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 96; i++) {
      const a = i / 96 * Math.PI * 2;
      const r = lake.radius * (1 + 0.09 * Math.sin(a * 3 + lake.phase) + 0.05 * Math.cos(a * 5 - lake.phase));
      const x = lake.x + Math.cos(a) * r, z = lake.z + Math.sin(a) * r * 0.82;
      if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z);
    }
    const water = new THREE.Mesh(new THREE.ShapeGeometry(shape), waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.23;
    water.name = 'lake-water';
    mesh.add(water);
  }
  // No lakes still needs no retained, unused GPU material.
  if (!lakes.length) waterMaterial.dispose();
  return { mesh, heightAt, flatRock, lakes, update: time => { waterTime.value = time; } };

}
