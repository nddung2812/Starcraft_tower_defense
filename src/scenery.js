import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SCENERY_FILES } from './config.js';

/*
 * Optional scenery art: rock models for lane boulders and spires, and photo textures for the
 * canyon floor and mountains (sources and licences in assets/CREDITS.md). Everything here is a
 * drop-in: a file that is missing or fails to load leaves the built-in procedural look in place,
 * so callers always write `sceneryBoulder(n) || buildBoulder(n)`.
 */

const loaded = { boulders: [], spires: [], ground: null, cliff: null, slope: null };

/** What loaded, for the console and tests. */
export function loadedScenery() {
  return {
    boulders: loaded.boulders.length, spires: loaded.spires.length,
    ground: !!loaded.ground, cliff: !!loaded.cliff, slope: !!loaded.slope
  };
}

async function exists(file) {
  try { return (await fetch(file, { method: 'HEAD', cache: 'no-cache' })).ok; } catch { return false; }
}

/** One geometry per file, in tiles: footprint centred on the origin, base on y = 0. */
function rockGeometry(gltf, { footprint, height, maxHeight }) {
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    parts.push(g);
  });
  if (!parts.length) return null;
  const geo = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  geo.computeBoundingBox();
  const box = geo.boundingBox, size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  geo.translate(-mid.x, -box.min.y, -mid.z);
  // spires are fitted by height, boulders by footprint and then flattened so they never hide a unit
  const k = height ? height / size.y : footprint / Math.max(size.x, size.z);
  const ky = maxHeight ? Math.min(k, maxHeight / size.y) : k;
  geo.scale(k, ky, k);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/** Average colour of a texture in linear space, so detail can be applied without shifting brightness. */
function averageLinear(image) {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(image, 0, 0, 16, 16);
  const d = x.getImageData(0, 0, 16, 16).data;
  const sum = new THREE.Color(0, 0, 0), px = new THREE.Color();
  for (let i = 0; i < d.length; i += 4) {
    px.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, THREE.SRGBColorSpace);
    sum.r += px.r; sum.g += px.g; sum.b += px.b;
  }
  return sum.multiplyScalar(4 / d.length);
}

async function texture(loader, spec) {
  if (!spec || !(await exists(spec.file))) return null;
  const tex = await loader.loadAsync(spec.file);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.userData.tiles = spec.tiles;
  const avg = averageLinear(tex.image);
  const luma = Math.max(0.02, avg.r * 0.2126 + avg.g * 0.7152 + avg.b * 0.0722);
  tex.userData.gain = 1 / luma;
  return tex;
}

/** Load whatever scenery files exist. Never rejects: a failure just keeps the built-in look. */
export async function loadScenery({ timeoutMs = 8000 } = {}) {
  const gltf = new GLTFLoader(), tex = new THREE.TextureLoader();
  const rocks = async (list, into, fit) => {
    const geos = await Promise.all(list.map(async (file) => {
      try { return (await exists(file)) ? rockGeometry(await gltf.loadAsync(file), fit) : null; }
      catch (err) { console.warn(`[scenery] could not load ${file}, keeping the built-in rock.`, err); return null; }
    }));
    into.push(...geos.filter(Boolean));
  };
  const map = async (key) => {
    try { loaded[key] = await texture(tex, SCENERY_FILES[key]); }
    catch (err) { console.warn(`[scenery] could not load the ${key} texture, keeping the built-in one.`, err); }
  };
  const jobs = Promise.all([
    rocks(SCENERY_FILES.boulders, loaded.boulders, { footprint: 1, maxHeight: 0.6 }),
    rocks(SCENERY_FILES.spires, loaded.spires, { height: 1.5 }),
    map('ground'), map('cliff'), map('slope')
  ]);
  await Promise.race([jobs, new Promise((r) => setTimeout(r, timeoutMs))]);
  const got = loadedScenery();
  if (Object.values(got).some(Boolean)) console.info('[scenery] using', JSON.stringify(got));
  return got;
}

/*
 * World-space detail: the photo is projected from above on flat faces and from the sides on
 * steep ones, then multiplied into the existing colour. Normalising by the photo's average
 * brightness keeps the palette the game already chose (vertex colours, rock tints).
 */
function detailed(material, { strength = 0.85, tint = 0.55 } = {}) {
  const side = loaded.cliff || loaded.slope, top = loaded.slope || loaded.cliff;
  if (!side) return material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.detailTop = { value: top };
    shader.uniforms.detailSide = { value: side };
    shader.uniforms.detailScale = { value: new THREE.Vector2(1 / top.userData.tiles, 1 / side.userData.tiles) };
    shader.uniforms.detailGain = { value: new THREE.Vector2(top.userData.gain, side.userData.gain) };
    shader.uniforms.detailMix = { value: new THREE.Vector2(strength, tint) };
    shader.vertexShader = 'varying vec3 detailPos;\nvarying vec3 detailNrm;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      detailPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
      detailNrm = normalize( mat3( modelMatrix ) * objectNormal );`
    );
    shader.fragmentShader = `uniform sampler2D detailTop;
      uniform sampler2D detailSide;
      uniform vec2 detailScale;
      uniform vec2 detailGain;
      uniform vec2 detailMix;
      varying vec3 detailPos;
      varying vec3 detailNrm;
      ` + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec3 detailW = pow( abs( normalize( detailNrm ) ), vec3( 4.0 ) );
      detailW /= ( detailW.x + detailW.y + detailW.z );
      vec3 detailRgb = texture2D( detailTop, detailPos.xz * detailScale.x ).rgb * detailGain.x * detailW.y
        + texture2D( detailSide, detailPos.zy * detailScale.y ).rgb * detailGain.y * detailW.x
        + texture2D( detailSide, detailPos.xy * detailScale.y ).rgb * detailGain.y * detailW.z;
      float detailLuma = dot( detailRgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      detailRgb = mix( vec3( detailLuma ), detailRgb, detailMix.y );
      diffuseColor.rgb *= mix( vec3( 1.0 ), detailRgb, detailMix.x );`
    );
  };
  material.customProgramCacheKey = () => 'scenery-detail';
  return material;
}

/** Add the rock photo detail to the mountain material (no-op until textures have loaded). */
export function detailTerrain(material) { return detailed(material); }

/** The canyon-floor photo, or null to keep the painted canvas. Repeats every `userData.tiles` tiles. */
export function groundMap() { return loaded.ground; }

let rockMats = null;
function rockMaterial(seed) {
  rockMats ||= [0x6f6658, 0x625a4e, 0x7c7264].map((color) =>
    detailed(new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.03, flatShading: true }), { strength: 0.9, tint: 0.7 }));
  return rockMats[Math.abs(seed) % rockMats.length];
}

function rock(list, seed) {
  if (!list.length) return null;
  const m = new THREE.Mesh(list[Math.abs(seed) % list.length], rockMaterial(seed >> 3));
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A lane boulder about one tile across, or null when no rock files loaded. */
export function sceneryBoulder(seed) { return rock(loaded.boulders, seed); }

/** A tall rock for the high ground, about 1.5 tiles before the caller scales it, or null. */
export function scenerySpire(seed) { return rock(loaded.spires, seed); }
