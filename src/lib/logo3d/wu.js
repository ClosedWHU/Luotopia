import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeRenderer, attachResize, makeLoopGate, attachDragForce, clamp } from './common.js';
import { phaseT, reset, virtualTime, BUILD_START, BUILD_END, HOLD_END, DISSOLVE_END } from './conductor.js';

const S = 1 / 300;
const toX = (x) => (x - 512) * S;
const toY = (y) => (512 - y) * S;

const srand = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp01 = (k) => clamp(k, 0, 1);
const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const easeInCubic = (k) => k * k * k;
const easeInOutCubic = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

export async function mountWu(canvas, opts = {}) {
  const reduced = opts.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layersUrl = opts.layersUrl || '/brand/wu-layers.json';
  const offsetAmp = opts.offsetAmp ?? 0.18;
  const depthBase = opts.depthBase ?? 0.5;

  const renderer = makeRenderer(canvas, { alpha: false, exposure: 1.06 });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(256, 180, 30, 256, 256, 430);
    grd.addColorStop(0, '#15293f');
    grd.addColorStop(0.5, '#0b1725');
    grd.addColorStop(1, '#050a11');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }
  scene.fog = new THREE.Fog(0x0b1725, 12, 26);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(3.6, 1.9, 5.0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 3;
  controls.maxDistance = 16;
  controls.autoRotateSpeed = 0.7;
  controls.autoRotate = !reduced;
  controls.target.set(0, 0.08, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xfff2e0, 2.3);
  key.position.set(3.2, 5.0, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 20;
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6fb0ff, 1.5);
  rim.position.set(-4.5, 1.2, -3.5);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x2a4a6d, 0x080e16, 0.55));

  const art = new THREE.Group();
  scene.add(art);

  const data = await (await fetch(layersUrl)).json();
  const N = data.bands.length;

  const C_BOT = new THREE.Color(0x082a49);
  const C_MID = new THREE.Color(0x0e4675);
  const C_TOP = new THREE.Color(0x3a80bd);
  function bandColor(k) {
    const t = (N - 1 - k) / (N - 1);
    const c = new THREE.Color();
    if (t < 0.5) c.copy(C_BOT).lerp(C_MID, t * 2);
    else c.copy(C_MID).lerp(C_TOP, (t - 0.5) * 2);
    c.multiplyScalar(1 + 0.07 * Math.sin(k * 2.3));
    return c;
  }

  function ensureWinding(pts, ccw) {
    let a = 0;
    for (let i = 0; i < pts.length - 1; i++) a += pts[i].x * pts[i + 1].y - pts[i + 1].x * pts[i].y;
    if ((a > 0) !== ccw) pts.reverse();
    return pts;
  }
  function makeShapes(band) {
    const shapes = [];
    for (const poly of band) {
      if (!poly.outer || poly.outer.length < 3) continue;
      const pts = ensureWinding(poly.outer.map(([x, y]) => new THREE.Vector2(toX(x), toY(y))), true);
      const shape = new THREE.Shape(pts);
      for (const h of (poly.holes || [])) {
        if (h.length < 3) continue;
        const hp = ensureWinding(h.map(([x, y]) => new THREE.Vector2(toX(x), toY(y))), false);
        shape.holes.push(new THREE.Path(hp));
      }
      shapes.push(shape);
    }
    return shapes;
  }
  function layerOffset(k) {
    const t = N > 1 ? k / (N - 1) : 0;
    return offsetAmp * (0.62 * Math.sin(t * Math.PI * 2.0 + 0.6) + 0.38 * Math.sin(t * Math.PI * 5.3 + 1.1));
  }

  const bands = [];
  for (let k = 0; k < N; k++) {
    const shapes = makeShapes(data.bands[k]);
    if (!shapes.length) { bands.push(null); continue; }
    const D = depthBase * (0.8 + 0.4 * srand(k));
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth: D, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.016,
      bevelSegments: 2, steps: 1, curveSegments: 1,
    });
    geo.translate(0, 0, -D / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: bandColor(k), roughness: 0.72, metalness: 0.08,
      flatShading: true, envMapIntensity: 0.55,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const Oz = layerOffset(k);
    mesh.position.set(0, 0, Oz);
    mesh.userData = {
      k, Oz,
      spreadY: ((N - 1) / 2 - k) * 0.36,
      spreadZ: ((k % 2) ? 1 : -1) * 1.15 + ((N - 1) / 2 - k) * 0.04,
      spreadX: (srand(k + 7) - 0.5) * 0.55,
      rotX: (srand(k + 3) - 0.5) * 0.55,
      rotZ: (srand(k + 11) - 0.5) * 0.32,
    };
    art.add(mesh);
    bands.push(mesh);
  }

  // Drag-driven layer physics: every slice is a damped spring pinned to the
  // stack axis (the "silk thread"), anchored at the base and freer toward the
  // top, so a shove sends a bounded sway up the stack that settles back. Travel
  // is hard-clamped, so layers wobble and ripple but can never fly apart.
  const dragForce = attachDragForce(canvas);
  const px = new Float32Array(N), pz = new Float32Array(N);
  const vx = new Float32Array(N), vz = new Float32Array(N);
  const flex = new Float32Array(N);
  for (let i = 0; i < N; i++) flex[i] = 0.15 + 0.85 * Math.pow(1 - i / Math.max(1, N - 1), 1.4);
  const K_SPRING = 58, C_DAMP = 6.0, K_IMP = 2.0, MAX_TRAVEL = 0.15;

  function stepSway(imp, dt) {
    const shove = imp.x * 0.012 * K_IMP;
    const ripple = imp.y * 0.012 * K_IMP;
    for (let i = 0; i < N; i++) {
      const topness = 1 - i / Math.max(1, N - 1);
      vx[i] += shove * flex[i] * (0.5 + 0.5 * topness);
      vz[i] += ripple * flex[i] * 0.5 * Math.sin(i * 0.85);
    }
    const steps = 2, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < N; i++) {
        vx[i] += (-K_SPRING * px[i] - C_DAMP * vx[i]) * h; px[i] += vx[i] * h;
        vz[i] += (-K_SPRING * pz[i] - C_DAMP * vz[i]) * h; pz[i] += vz[i] * h;
        if (px[i] > MAX_TRAVEL) { px[i] = MAX_TRAVEL; if (vx[i] > 0) vx[i] = 0; }
        else if (px[i] < -MAX_TRAVEL) { px[i] = -MAX_TRAVEL; if (vx[i] < 0) vx[i] = 0; }
        if (pz[i] > MAX_TRAVEL) { pz[i] = MAX_TRAVEL; if (vz[i] > 0) vz[i] = 0; }
        else if (pz[i] < -MAX_TRAVEL) { pz[i] = -MAX_TRAVEL; if (vz[i] < 0) vz[i] = 0; }
      }
    }
  }

  // Slices build bottom-up and dissolve top-down, staggered across the shared
  // build/dissolve windows so both logos animate in lockstep.
  const SPAN = 0.55, DUR = 0.45;
  function sliceBlend(T, k) {
    if (T < BUILD_START || T >= DISSOLVE_END) return 0;
    if (T < BUILD_END) {
      const A = (T - BUILD_START) / (BUILD_END - BUILD_START);
      const s = (N - 1 - k) / Math.max(1, N - 1) * SPAN;
      return easeOutBack(clamp01((A - s) / DUR));
    }
    if (T < HOLD_END) return 1;
    const Dp = (T - HOLD_END) / (DISSOLVE_END - HOLD_END);
    const s = k / Math.max(1, N - 1) * SPAN;
    return 1 - easeInCubic(clamp01((Dp - s) / DUR));
  }

  function timeline(T, elapsed) {
    for (const m of bands) {
      if (!m) continue;
      const u = m.userData;
      const b = reduced ? 1 : sliceBlend(T, u.k);
      const inv = 1 - b;
      const wob = reduced ? 0 : b;
      const shimmer = 0.012 * Math.max(0, b - 0.98) / 0.02 * Math.sin(elapsed * 0.7 + u.k * 0.6);
      m.position.set(
        u.spreadX * inv + px[u.k] * wob,
        u.spreadY * inv,
        u.Oz + u.spreadZ * inv + pz[u.k] * wob + (reduced ? 0 : shimmer)
      );
      m.scale.setScalar(1 + 0.06 * inv);
      m.rotation.set(u.rotX * inv, 0, u.rotZ * inv);
      m.visible = b > 0.002;
    }
  }

  const VIEWS = {
    front: { pos: new THREE.Vector3(0, 0.12, 6.3), tgt: new THREE.Vector3(0, 0.08, 0) },
    oblique: { pos: new THREE.Vector3(3.6, 1.9, 5.0), tgt: new THREE.Vector3(0, 0.05, 0) },
    side: { pos: new THREE.Vector3(6.2, 0.2, 0.15), tgt: new THREE.Vector3(0, 0.05, 0) },
    top: { pos: new THREE.Vector3(0.25, 5.6, 2.3), tgt: new THREE.Vector3(0, 0, 0) },
  };
  let tween = null;
  function flyTo(name, dur = 1.2) {
    const v = VIEWS[name];
    if (!v) return;
    if (reduced || dur === 0) {
      camera.position.copy(v.pos); controls.target.copy(v.tgt); controls.update(); tween = null; return;
    }
    tween = { t: 0, dur, fromPos: camera.position.clone(), toPos: v.pos.clone(), fromTgt: controls.target.clone(), toTgt: v.tgt.clone() };
  }

  const resize = attachResize(renderer, camera, canvas);
  if (!reduced) setTimeout(() => flyTo('front', 2.5), 350);
  else flyTo('front', 0);

  const clock = new THREE.Clock();
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = virtualTime();
    const T = reduced ? (BUILD_END + HOLD_END) / 2 : phaseT();
    const imp = dragForce.consume();
    if (!reduced) stepSway(imp, dt);
    timeline(T, elapsed);
    if (tween) {
      tween.t += dt;
      const k = easeInOutCubic(clamp01(tween.t / tween.dur));
      camera.position.lerpVectors(tween.fromPos, tween.toPos, k);
      controls.target.lerpVectors(tween.fromTgt, tween.toTgt, k);
      if (k >= 1) tween = null;
    }
    controls.update();
    renderer.render(scene, camera);
  }
  const gate = makeLoopGate(renderer, canvas, loop);

  return {
    replay() { reset(); },
    setView(name) { flyTo(name, 1.0); },
    dispose() {
      gate.dispose();
      resize.dispose();
      dragForce.dispose();
      controls.dispose();
      for (const m of bands) { if (m) { m.geometry.dispose(); m.material.dispose(); } }
      scene.environment?.dispose?.();
      scene.background?.dispose?.();
      renderer.dispose();
    },
  };
}
