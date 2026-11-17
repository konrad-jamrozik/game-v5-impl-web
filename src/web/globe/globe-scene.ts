/**
 * GLOBE, Globe files in the Implementation repo: the scene of the Spec repo's reference viewer, `lib/globe/globe.js`,
 * ported to one module. The shaders and the SETTINGS values are those of the reference viewer, unchanged; what changed
 * is only what an owned component needs: the scene draws on a canvas it is given, sizes itself by that canvas, can be
 * paused, and releases everything it created. The reference viewer's map-set switch and rotation button are left out.
 * This module is loaded only when the globe is first shown, and it imports nothing from the engine.
 */
import * as THREE from 'three';

const SETTINGS = {
  spinDegreesPerSecond: 3, // the planet's own rotation; with the sun fixed, this is the day and night cycle
  cloudDriftRadiansPerSecond: 0.004, // clouds relative to the ground
  sharpness: 2, // minimum backing-store pixels per CSS pixel
  clouds: true,
  atmosphere: true,
  fieldOfViewDegrees: 30,
  startDistance: 4.6, // camera distance in planet radii at zoom 1
  minZoom: 0.6,
  maxZoom: 14,
  bump: 1.6, // strength of the relief shading
  exposure: 1.15,
  atmosphereRadius: 1.1,
};

/** The addresses of the four maps, relative to the Game build. */
export interface GlobeMaps {
  readonly day: string;
  readonly night: string;
  readonly normalWater: string;
  readonly clouds: string;
}

export interface GlobeScene {
  /** Starts or stops requesting animation frames. */
  setRunning(running: boolean): void;
  /** Releases the renderer, the textures, the geometries, the materials, and the event listeners. */
  dispose(): void;
}

/** Why the globe could not start; the component shows a message in its place. */
export class GlobeUnavailable extends Error {
  readonly reason: 'webgl' | 'maps';
  constructor(reason: 'webgl' | 'maps', message: string) {
    super(message);
    this.reason = reason;
  }
}

const NOISE_GLSL = /* glsl */ `
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm3(vec3 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.03 + vec3(11.3, 5.7, 3.1); a *= 0.5; } return s / 0.875; }
`;

// Shared by the surface, the cloud shell, and the atmosphere shell.
const VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vT;
varying vec3 vPosW;
varying vec3 vObj;
void main() {
  vUv = uv;
  vObj = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  // tangent towards east; the bitangent N x T then points north, matching the normal map
  vec3 t = cross(vec3(0.0, 1.0, 0.0), normal);
  t = length(t) < 0.0001 ? vec3(1.0, 0.0, 0.0) : normalize(t);
  vT = normalize(mat3(modelMatrix) * t);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const EARTH_FRAGMENT = /* glsl */ `
uniform sampler2D tDay;
uniform sampler2D tNight;
uniform sampler2D tNrm;
uniform sampler2D tClouds;
uniform vec3 uSun;
uniform float uCloudShift;
uniform float uCloudsOn;
uniform float uBump;
uniform float uExposure;
uniform float uAtmo;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vT;
varying vec3 vPosW;
void main() {
  // the maps are uploaded unflipped, so row 0 is north
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec3 N = normalize(vN);
  vec3 T = normalize(vT - N * dot(vT, N));
  vec3 B = cross(N, T);
  vec3 nm = texture2D(tNrm, uv).rgb;
  float water = nm.b;
  vec2 nxy = (nm.rg * 2.0 - 1.0) * uBump * (1.0 - water);
  vec3 Nb = normalize(N + T * nxy.x + B * nxy.y);
  vec3 V = normalize(cameraPosition - vPosW);
  vec3 L = normalize(uSun);
  float ndl = dot(N, L);
  float day = smoothstep(-0.1, 0.25, ndl);
  float relief = clamp(dot(Nb, L) - ndl, -0.6, 0.6);
  float diff = max(max(ndl, 0.0) + relief * day * 1.2, 0.0);
  vec3 albedo = pow(texture2D(tDay, uv).rgb, vec3(2.2));
  vec2 cuv = vec2(uv.x + uCloudShift, uv.y);
  vec2 sdir = vec2(dot(L, T), -dot(L, B));
  float cShadow = texture2D(tClouds, cuv + sdir * 0.003).r * uCloudsOn;
  float cTop = texture2D(tClouds, cuv).r * uCloudsOn;
  vec3 sunCol = vec3(1.0, 0.96, 0.9) * 3.0;
  vec3 col = albedo * sunCol * diff * (1.0 - 0.6 * cShadow);
  col += albedo * vec3(0.3, 0.45, 0.8) * 0.12 * day;
  // water: base lift, sun glint, sky reflection towards the limb
  col += vec3(0.004, 0.02, 0.05) * water * diff * 1.5;
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float spec = pow(nh, 220.0) * 6.0 + pow(nh, 28.0) * 0.35;
  col += vec3(1.0, 0.93, 0.8) * spec * water * (1.0 - cShadow) * (1.0 - cTop * 0.8) * day;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
  col += vec3(0.25, 0.45, 0.8) * fres * water * max(ndl, 0.0) * 0.8;
  // night side: city lights, dimmed under cloud, and a faint surface
  float lights = pow(texture2D(tNight, uv).r, 1.6);
  float nightK = 1.0 - smoothstep(-0.18, 0.06, ndl);
  col += vec3(1.0, 0.72, 0.38) * lights * 1.6 * nightK * (1.0 - 0.75 * cTop);
  col += albedo * vec3(0.4, 0.5, 0.8) * 0.012;
  // atmosphere seen against the surface
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  float lit = smoothstep(-0.2, 0.5, ndl);
  vec3 scatter = mix(vec3(1.0, 0.45, 0.2), vec3(0.3, 0.55, 1.0), smoothstep(-0.1, 0.35, ndl));
  col += scatter * rim * lit * 0.9 * uAtmo;
  float term = 1.0 - smoothstep(0.0, 0.28, abs(ndl - 0.05));
  col *= mix(vec3(1.0), vec3(1.25, 0.8, 0.55), term * 0.6);
  col = vec3(1.0) - exp(-col * uExposure);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;

const CLOUD_FRAGMENT = /* glsl */ `
uniform sampler2D tClouds;
uniform vec3 uSun;
uniform float uExposure;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vObj;
${NOISE_GLSL}
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  float c = texture2D(tClouds, uv).r;
  // the cloud map is the lowest-resolution layer, so break its edges up with fine noise
  float n = fbm3(normalize(vObj) * 120.0);
  float a = smoothstep(0.06, 0.8, c * (0.75 + 0.6 * n));
  float ndl = dot(normalize(vN), normalize(uSun));
  float lit = smoothstep(-0.15, 0.35, ndl);
  vec3 sunCol = mix(vec3(1.0, 0.5, 0.25), vec3(1.0, 0.97, 0.93), smoothstep(-0.05, 0.3, ndl)) * 3.2;
  vec3 col = vec3(0.92) * sunCol * (max(ndl, 0.0) * 0.85 + 0.15) * lit + vec3(0.012, 0.016, 0.026);
  col = vec3(1.0) - exp(-col * uExposure);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), a * uOpacity);
}
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
uniform float uRa;
uniform float uStrength;
varying vec3 vN;
varying vec3 vPosW;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vPosW);
  // |N.V| on the far side of the shell: 0 at its outer edge, m where the view ray grazes the planet
  float m = sqrt(1.0 - 1.0 / (uRa * uRa));
  float x = clamp(abs(dot(N, V)) / m, 0.0, 1.0);
  float glow = pow(x, 3.0);
  float ndl = dot(N, normalize(uSun));
  float lit = smoothstep(-0.35, 0.45, ndl);
  vec3 c = mix(vec3(1.0, 0.45, 0.18), vec3(0.32, 0.58, 1.0), smoothstep(-0.15, 0.3, ndl));
  gl_FragColor = vec4(c * glow * lit * uStrength, 1.0);
}
`;

async function loadBitmap(url: string, maxSize: number): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new GlobeUnavailable('maps', `could not load ${url} (status ${res.status})`);
  }
  const blob = await res.blob();
  let bmp = await createImageBitmap(blob);
  // GLOBE, Edge cases: a map larger than the graphics hardware accepts is reduced to the largest size it accepts.
  if (bmp.width > maxSize) {
    const h = Math.round((bmp.height * maxSize) / bmp.width);
    bmp.close();
    bmp = await createImageBitmap(blob, { resizeWidth: maxSize, resizeHeight: h, resizeQuality: 'high' });
  }
  return bmp;
}

function makeTexture(renderer: THREE.WebGLRenderer, bmp: ImageBitmap, oneChannel: boolean): THREE.Texture {
  const tex = new THREE.Texture(bmp);
  tex.flipY = false;
  if (oneChannel) {
    tex.format = THREE.RedFormat;
  }
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}

async function loadMaps(renderer: THREE.WebGLRenderer, maps: GlobeMaps) {
  const maxSize = renderer.capabilities.maxTextureSize;
  const [day, night, normalWater, clouds] = await Promise.all([
    loadBitmap(maps.day, maxSize),
    loadBitmap(maps.night, maxSize),
    loadBitmap(maps.normalWater, maxSize),
    loadBitmap(maps.clouds, maxSize),
  ]);
  return {
    tDay: makeTexture(renderer, day, false),
    tNight: makeTexture(renderer, night, true),
    tNrm: makeTexture(renderer, normalWater, false),
    tClouds: makeTexture(renderer, clouds, true),
  };
}

function makeStars(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  // on a far sphere, so they shift as the camera orbits
  let seed = 424243;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const count = 2600;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    pos.set([80 * r * Math.cos(a), 80 * z, 80 * r * Math.sin(a)], i * 3);
    const b = 0.15 + 0.85 * rnd() ** 3;
    col.set([b * (0.85 + 0.15 * rnd()), b * 0.92, b * (0.85 + 0.15 * rnd())], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true }),
  );
}

/**
 * Creates the globe on `canvas`, which takes its size from the element that holds it, over the CSS colour
 * `background`. Rejects with GlobeUnavailable
 * when WebGL 2 is unavailable or a map fails to load, after releasing whatever it created. `onContextLost` is called
 * when the browser drops the graphics context; the scene is then unusable and must be disposed.
 */
export async function createGlobeScene(
  canvas: HTMLCanvasElement,
  maps: GlobeMaps,
  background: string,
  onContextLost: () => void,
): Promise<GlobeScene> {
  const context = canvas.getContext('webgl2', {
    antialias: true,
    powerPreference: 'high-performance',
    alpha: true,
  });
  if (context === null) {
    throw new GlobeUnavailable('webgl', 'WebGL 2 is unavailable');
  }
  const renderer = new THREE.WebGLRenderer({ canvas, context });
  renderer.setPixelRatio(1);
  // The space behind the planet is the Globe stage's Background, in place of the reference viewer's own near-black. It
  // is opaque, because the atmosphere shell is blended additively onto it.
  renderer.setClearColor(new THREE.Color(background), 1);

  let textures: Awaited<ReturnType<typeof loadMaps>>;
  try {
    textures = await loadMaps(renderer, maps);
  } catch (error) {
    renderer.dispose();
    throw error instanceof GlobeUnavailable ? error : new GlobeUnavailable('maps', String(error));
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(SETTINGS.fieldOfViewDegrees, 1, 0.01, 200);
  const sun = new THREE.Vector3(1, 0.18, 0.35).normalize();

  // The planet: tilted axis, sun fixed in space, so spinning it is the day and night cycle.
  const tilt = new THREE.Group();
  tilt.rotation.z = -0.41;
  tilt.rotation.x = 0.15;
  scene.add(tilt);

  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      tDay: { value: textures.tDay },
      tNight: { value: textures.tNight },
      tNrm: { value: textures.tNrm },
      tClouds: { value: textures.tClouds },
      uSun: { value: sun },
      uCloudShift: { value: 0 },
      uCloudsOn: { value: SETTINGS.clouds ? 1 : 0 },
      uBump: { value: SETTINGS.bump },
      uExposure: { value: SETTINGS.exposure },
      uAtmo: { value: SETTINGS.atmosphere ? 1 : 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: EARTH_FRAGMENT,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), earthMat);
  earth.rotation.y = (-100 * Math.PI) / 180; // start with longitude 10° E facing the camera
  tilt.add(earth);

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      tClouds: { value: textures.tClouds },
      uSun: { value: sun },
      uExposure: { value: SETTINGS.exposure },
      uOpacity: { value: 0.95 },
    },
    vertexShader: VERTEX,
    fragmentShader: CLOUD_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1.008, 160, 80), cloudMat);
  cloudMesh.renderOrder = 1;
  cloudMesh.visible = SETTINGS.clouds;
  earth.add(cloudMesh);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(SETTINGS.atmosphereRadius, 128, 64),
    new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: sun },
        uRa: { value: SETTINGS.atmosphereRadius },
        uStrength: { value: 0.95 },
      },
      vertexShader: VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  atmosphere.renderOrder = 2;
  atmosphere.visible = SETTINGS.atmosphere;
  scene.add(atmosphere);

  const stars = makeStars();
  scene.add(stars);

  // Orbit and zoom.
  const view = {
    az: 0,
    el: 0.2,
    azVel: 0,
    elVel: 0,
    zoom: 1,
    zoomTarget: 1,
    drag: null as { x: number; y: number; t: number } | null,
  };
  const clampEl = (v: number) => Math.max(-1.45, Math.min(1.45, v));
  const distance = () => 1 + (SETTINGS.startDistance - 1) / view.zoom;
  // radians of orbit per CSS pixel, so the surface under the pointer follows it
  const dragScale = () => {
    const focal = canvas.clientHeight / 2 / Math.tan((SETTINGS.fieldOfViewDegrees * Math.PI) / 360);
    return (1.3 * (distance() - 1)) / focal;
  };

  const onPointerDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    view.drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    view.azVel = 0;
    view.elVel = 0;
    canvas.classList.add('dragging');
  };
  const onPointerMove = (e: PointerEvent) => {
    if (view.drag === null) {
      return;
    }
    const now = performance.now();
    const k = dragScale();
    const da = -(e.clientX - view.drag.x) * k;
    const de = (e.clientY - view.drag.y) * k;
    const dt = Math.max(0.008, (now - view.drag.t) / 1000);
    view.az += da;
    view.el = clampEl(view.el + de);
    view.azVel = Math.max(-6, Math.min(6, da / dt));
    view.elVel = Math.max(-6, Math.min(6, de / dt));
    view.drag = { x: e.clientX, y: e.clientY, t: now };
  };
  const endDrag = () => {
    if (view.drag === null) {
      return;
    }
    if (performance.now() - view.drag.t > 120) {
      view.azVel = 0;
      view.elVel = 0;
    }
    view.drag = null;
    canvas.classList.remove('dragging');
  };
  // GLOBE, Reachable without a pointer: the wheel zooms the globe only while the pointer is over it.
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const target = view.zoomTarget * Math.exp(-e.deltaY * 0.0015);
    view.zoomTarget = Math.max(SETTINGS.minZoom, Math.min(SETTINGS.maxZoom, target));
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    stopFrames();
    onContextLost();
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('webglcontextlost', onLost);

  const spinning = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  let backingWidth = 0;
  let backingHeight = 0;
  const resize = () => {
    if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
      return;
    }
    const k = Math.max(SETTINGS.sharpness, window.devicePixelRatio || 1);
    const w = Math.min(4096, Math.round(canvas.clientWidth * k));
    const h = Math.round((w * canvas.clientHeight) / canvas.clientWidth);
    if (w === backingWidth && h === backingHeight) {
      return;
    }
    backingWidth = w;
    backingHeight = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    stars.material.size = (1.1 * w) / canvas.clientWidth;
  };

  let frame: number | null = null;
  let last = 0;
  const tick = (t: number) => {
    frame = requestAnimationFrame(tick);
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    view.zoom += (view.zoomTarget - view.zoom) * (1 - Math.exp(-dt * 10));
    if (view.drag === null) {
      const k = Math.exp(-dt * 2.2);
      view.azVel *= k;
      view.elVel *= k;
      view.az += view.azVel * dt;
      view.el = clampEl(view.el + view.elVel * dt);
    }
    if (spinning) {
      earth.rotation.y += (dt * SETTINGS.spinDegreesPerSecond * Math.PI) / 180;
      cloudMesh.rotation.y += dt * SETTINGS.cloudDriftRadiansPerSecond;
    }
    resize();
    const d = distance();
    const ce = Math.cos(view.el);
    camera.position.set(d * Math.sin(view.az) * ce, d * Math.sin(view.el), d * Math.cos(view.az) * ce);
    camera.lookAt(0, 0, 0);
    // rotating the cloud shell by a moves its features by a / 2π in u; the shadow lookup undoes that
    const shift = earthMat.uniforms.uCloudShift;
    if (shift !== undefined) {
      shift.value = -cloudMesh.rotation.y / (Math.PI * 2);
    }
    renderer.render(scene, camera);
  };
  function stopFrames(): void {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  }

  let disposed = false;
  return {
    setRunning(running: boolean) {
      if (disposed || running === (frame !== null)) {
        return;
      }
      if (running) {
        // A paused globe resumes where it stopped, without a jump for the time it was hidden.
        last = 0;
        frame = requestAnimationFrame(tick);
      } else {
        stopFrames();
      }
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      stopFrames();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('webglcontextlost', onLost);
      for (const mesh of [earth, cloudMesh, atmosphere]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      stars.geometry.dispose();
      stars.material.dispose();
      for (const tex of Object.values(textures)) {
        (tex.image as ImageBitmap).close();
        tex.dispose();
      }
      renderer.dispose();
    },
  };
}
