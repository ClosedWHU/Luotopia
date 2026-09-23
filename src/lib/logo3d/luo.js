import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeRenderer, attachResize, makeLoopGate, attachDragForce, clamp } from './common.js';
import { phaseT, reset, virtualTime, BUILD_START, BUILD_END, HOLD_END, DISSOLVE_END } from './conductor.js';

const S = 1 / 300;
const toX = (x) => (x - 512) * S;
const toY = (y) => (512 - y) * S;

export async function mountLuo(canvas, opts = {}) {
  const reduced = opts.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const svgUrl = opts.svgUrl || '/brand/logo-luo.svg';

  const renderer = makeRenderer(canvas, { alpha: false, exposure: 1.12 });

  const scene = new THREE.Scene();
  {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(256, 120, 20, 256, 280, 440);
    grd.addColorStop(0, '#2c4a30');
    grd.addColorStop(0.42, '#12251a');
    grd.addColorStop(1, '#050d09');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0.5, 0.25, 7.4);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 3.2;
  controls.maxDistance = 14;
  controls.autoRotate = false;
  controls.target.set(0, -0.05, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture;
  scene.environmentIntensity = 0.6;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xfff0d0, 2.7);
  key.position.set(3.4, 6.0, 4.4);
  scene.add(key);
  const backGreen = new THREE.DirectionalLight(0x6fd489, 1.7);
  backGreen.position.set(-3.2, 2.0, -4.2);
  scene.add(backGreen);
  const rimGold = new THREE.DirectionalLight(0xd9eaa2, 0.85);
  rimGold.position.set(-4.2, -1.2, 3.0);
  scene.add(rimGold);
  scene.add(new THREE.HemisphereLight(0xc4ecd0, 0x15240f, 0.6));

  const svgText = await fetch(svgUrl).then((r) => r.text());
  const svgData = new SVGLoader().parse(svgText);

  function shapeBBox(shape) {
    const pts = shape.extractPoints(3);
    const all = [...pts.shape, ...pts.holes.flat()];
    const xs = all.map((p) => p.x);
    return { w: Math.max(...xs) - Math.min(...xs) };
  }
  const classified = { stroke: null, frame: null, brushWang: null };
  for (const path of svgData.paths) {
    const shapes = SVGLoader.createShapes(path);
    if (!shapes.length) continue;
    const shape = shapes[0];
    const bb = shapeBBox(shape);
    const nPts = path.subPaths[0] ? path.subPaths[0].getPoints(2).length : 0;
    const holes = shape.holes.length;
    if (holes >= 1 && bb.w > 300) classified.stroke = shape;
    else if (holes >= 1) classified.frame = shape;
    else if (nPts > 12 && bb.w < 300) classified.brushWang = shape;
  }
  if (!classified.stroke || !classified.frame || !classified.brushWang) throw new Error('logo-luo.svg 部件识别失败');

  function flipWinding(geo) {
    const idx = geo.index;
    if (!idx) return;
    const a = idx.array;
    for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    idx.needsUpdate = true;
  }
  function buildPart(shape, { depth, bevel, curveSegments = 5 }) {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
      bevelSegments: 2, curveSegments,
    });
    geo.applyMatrix4(new THREE.Matrix4().makeScale(S, -S, S));
    flipWinding(geo);
    geo.translate(-512 * S, 512 * S, -depth * S / 2);
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    const c = new THREE.Vector3();
    geo.boundingBox.getCenter(c);
    geo.translate(-c.x, -c.y, -c.z);
    const mesh = new THREE.Mesh(geo, null);
    mesh.position.copy(c);
    mesh.userData.home = c.clone();
    return mesh;
  }

  const WANG = [0.0, 0.40], STEM = [0.40, 0.85], KOU = [0.85, 1.0];
  const WAYPOINTS_SVG = [
    [760, 152], [756, 240], [755, 320], [753, 400],
    [700, 425], [650, 438], [625, 441],
    [660, 460], [710, 478], [741, 486],
    [720, 497], [660, 505], [580, 507], [500, 505], [470, 503],
    [540, 494], [620, 487], [690, 483],
    [740, 520], [770, 570], [781, 626], [782, 700], [781, 756],
    [800, 830], [811, 877], [795, 915], [784, 928], [760, 912],
  ];
  function densePath(wp, step) {
    const dense = [];
    for (let i = 0; i < wp.length - 1; i++) {
      const [ax, ay] = wp[i], [bx, by] = wp[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(2, Math.round(len / step));
      for (let s = 0; s < steps; s++) dense.push([ax + (bx - ax) * s / steps, ay + (by - ay) * s / steps]);
    }
    dense.push(wp[wp.length - 1]);
    const cum = [0];
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    return { dense, cum, total: cum[cum.length - 1] };
  }
  function bakeStroke(geo, center, g0, g1) {
    const wp = WAYPOINTS_SVG.map(([x, y]) => [toX(x), toY(y)]);
    const { dense, cum, total } = densePath(wp, 0.025);
    const pos = geo.attributes.position;
    const arr = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i) + center.x, vy = pos.getY(i) + center.y;
      let best = Infinity, bestT = 0;
      for (let j = 0; j < dense.length; j++) {
        const dx = dense[j][0] - vx, dy = dense[j][1] - vy, d = dx * dx + dy * dy;
        if (d < best) { best = d; bestT = cum[j] / total; }
      }
      arr[i] = g0 + bestT * (g1 - g0);
    }
    geo.setAttribute('aTime', new THREE.BufferAttribute(arr, 1));
  }
  function bakeFrame(geo, center, g0, g1) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const minX = bb.min.x, maxX = bb.max.x, minY = bb.min.y, maxY = bb.max.y;
    const spanX = Math.max(1e-6, maxX - minX), spanY = Math.max(1e-6, maxY - minY);
    const pos = geo.attributes.position;
    const arr = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const dLeft = x - minX, dRight = maxX - x, dBottom = y - minY, dTop = maxY - y;
      const m = Math.min(dLeft, dRight, dTop, dBottom);
      let local;
      if (m === dLeft) local = ((maxY - y) / spanY) * (1 / 3);
      else if (m === dTop) local = 1 / 3 + ((x - minX) / spanX) * (1 / 6);
      else if (m === dRight) local = 1 / 2 + ((maxY - y) / spanY) * (1 / 6);
      else local = 2 / 3 + ((x - minX) / spanX) * (1 / 3);
      arr[i] = g0 + local * (g1 - g0);
    }
    geo.setAttribute('aTime', new THREE.BufferAttribute(arr, 1));
  }
  // Stroke-order reveal for the calligraphic 王: four brush strokes written
  // 横→横→竖→横. Each surface point takes the earliest stroke that covers it,
  // progressing left→right on horizontals and top→bottom on the vertical, so
  // the glyph is "written" rather than wiped. Regions are the clean bar boxes
  // (generously padded to swallow the brush's tapered ends).
  const WANG_BARS = [
    { x0: 198, x1: 474, y0: 224, y1: 316, vertical: false },
    { x0: 198, x1: 474, y0: 446, y1: 544, vertical: false },
    { x0: 294, x1: 374, y0: 238, y1: 772, vertical: true },
    { x0: 198, x1: 474, y0: 676, y1: 790, vertical: false },
  ];
  function bakeWangStrokes(geo, center, g0, g1) {
    const bars = WANG_BARS.map((b) => ({
      x0: toX(b.x0), x1: toX(b.x1), yTop: toY(b.y0), yBot: toY(b.y1), vertical: b.vertical,
    }));
    const n = bars.length;
    const pos = geo.attributes.position;
    const arr = new Float32Array(pos.count);
    const pad = 0.05;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i) + center.x, vy = pos.getY(i) + center.y;
      let best = Infinity;
      for (let s = 0; s < n; s++) {
        const b = bars[s];
        if (vx >= b.x0 - pad && vx <= b.x1 + pad && vy <= b.yTop + pad && vy >= b.yBot - pad) {
          const prog = b.vertical
            ? clamp((b.yTop - vy) / Math.max(1e-6, b.yTop - b.yBot), 0, 1)
            : clamp((vx - b.x0) / Math.max(1e-6, b.x1 - b.x0), 0, 1);
          const at = g0 + ((s + prog) / n) * (g1 - g0);
          if (at < best) best = at;
        }
      }
      if (best === Infinity) {
        let bd = Infinity, bs = 0;
        for (let s = 0; s < n; s++) { const b = bars[s], cx = (b.x0 + b.x1) / 2, cy = (b.yTop + b.yBot) / 2; const dd = (vx - cx) ** 2 + (vy - cy) ** 2; if (dd < bd) { bd = dd; bs = s; } }
        const b = bars[bs];
        const prog = b.vertical
          ? clamp((b.yTop - vy) / Math.max(1e-6, b.yTop - b.yBot), 0, 1)
          : clamp((vx - b.x0) / Math.max(1e-6, b.x1 - b.x0), 0, 1);
        best = g0 + ((bs + prog) / n) * (g1 - g0);
      }
      arr[i] = best;
    }
    geo.setAttribute('aTime', new THREE.BufferAttribute(arr, 1));
  }

  const uProgress = { value: 0 };
  const uWriting = { value: 0 };
  function addReveal(mat) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uProgress = uProgress;
      shader.uniforms.uWriting = uWriting;
      shader.vertexShader = 'attribute float aTime;\nvarying float vTime;\n' + shader.vertexShader.replace('void main() {', 'void main() {\n\tvTime = aTime;');
      shader.fragmentShader = 'uniform float uProgress;\nuniform float uWriting;\nvarying float vTime;\n' + shader.fragmentShader
        .replace('void main() {', 'void main() {\n\tif ( vTime > uProgress ) discard;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tfloat tipd = uProgress - vTime;\n\tfloat tip = exp( - tipd * tipd * 90000.0 ) * uWriting;\n\tgl_FragColor.rgb += vec3( 0.55, 1.0, 0.42 ) * tip * 1.1;');
    };
    return mat;
  }
  const leafMaterial = addReveal(new THREE.MeshPhysicalMaterial({
    color: 0x54a86c, roughness: 0.34, metalness: 0.0,
    transmission: 0.5, thickness: 0.75, ior: 1.42,
    attenuationColor: new THREE.Color(0x1c6b39), attenuationDistance: 0.5,
    sheen: 0.75, sheenColor: new THREE.Color(0xc9f2c2), sheenRoughness: 0.45,
    clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 1.2,
  }));
  const stemMaterial = addReveal(new THREE.MeshPhysicalMaterial({
    color: 0x2f7f4d, roughness: 0.24, metalness: 0.0,
    transmission: 0.34, thickness: 0.6, ior: 1.45,
    attenuationColor: new THREE.Color(0x17692f), attenuationDistance: 0.42,
    clearcoat: 0.85, clearcoatRoughness: 0.13,
    sheen: 0.5, sheenColor: new THREE.Color(0xa6ecab), sheenRoughness: 0.4,
    envMapIntensity: 1.1,
  }));

  const art = new THREE.Group();
  scene.add(art);

  const strokeMesh = buildPart(classified.stroke, { depth: 58, bevel: 9, curveSegments: 5 });
  bakeStroke(strokeMesh.geometry, strokeMesh.userData.home, STEM[0], STEM[1]);
  strokeMesh.material = stemMaterial;
  art.add(strokeMesh);

  const frameMesh = buildPart(classified.frame, { depth: 60, bevel: 12, curveSegments: 6 });
  bakeFrame(frameMesh.geometry, frameMesh.userData.home, KOU[0], KOU[1]);
  frameMesh.material = leafMaterial;
  art.add(frameMesh);

  const brushMesh = buildPart(classified.brushWang, { depth: 54, bevel: 8, curveSegments: 6 });
  bakeWangStrokes(brushMesh.geometry, brushMesh.userData.home, WANG[0], WANG[1]);
  brushMesh.material = leafMaterial;
  art.add(brushMesh);

  // Drag-driven plant motion. The whole glyph bends like a rooted plant (group
  // spring), and each part flutters about its own centre with a compliance —
  // the cursive vine is limber, the 口 frame is stiff. Both are damped springs
  // with hard angle clamps, so a flick makes it sway and settle, never detach.
  const dragForce = attachDragForce(canvas);
  let bendX = 0, bendZ = 0, velX = 0, velZ = 0;
  const parts = [
    { mesh: strokeMesh, comp: 1.0, k: 40, ph: 0.0, x: 0, z: 0, vx: 0, vz: 0 },
    { mesh: brushMesh, comp: 0.6, k: 54, ph: 1.7, x: 0, z: 0, vx: 0, vz: 0 },
    { mesh: frameMesh, comp: 0.34, k: 68, ph: 3.1, x: 0, z: 0, vx: 0, vz: 0 },
  ];
  const KP = 46, CP = 5.0, IMP = 2.2, BEND_CLAMP = 0.16, PART_CLAMP = 0.075;

  function stepSway(imp, dt) {
    const gx = imp.x * 0.012 * IMP;
    const gy = imp.y * 0.012 * IMP;
    velZ += gx;
    velX += -gy;
    for (const p of parts) {
      p.vx += gx * p.comp * 0.55;
      p.vz += gy * p.comp * 0.55;
    }
    const steps = 2, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      velX += (-KP * bendX - CP * velX) * h; bendX += velX * h;
      velZ += (-KP * bendZ - CP * velZ) * h; bendZ += velZ * h;
      if (bendX > BEND_CLAMP) { bendX = BEND_CLAMP; if (velX > 0) velX = 0; }
      else if (bendX < -BEND_CLAMP) { bendX = -BEND_CLAMP; if (velX < 0) velX = 0; }
      if (bendZ > BEND_CLAMP) { bendZ = BEND_CLAMP; if (velZ > 0) velZ = 0; }
      else if (bendZ < -BEND_CLAMP) { bendZ = -BEND_CLAMP; if (velZ < 0) velZ = 0; }
      for (const p of parts) {
        p.vx += (-p.k * p.x - CP * p.vx) * h; p.x += p.vx * h;
        p.vz += (-p.k * p.z - CP * p.vz) * h; p.z += p.vz * h;
        if (p.x > PART_CLAMP) { p.x = PART_CLAMP; if (p.vx > 0) p.vx = 0; }
        else if (p.x < -PART_CLAMP) { p.x = -PART_CLAMP; if (p.vx < 0) p.vx = 0; }
        if (p.z > PART_CLAMP) { p.z = PART_CLAMP; if (p.vz > 0) p.vz = 0; }
        else if (p.z < -PART_CLAMP) { p.z = -PART_CLAMP; if (p.vz < 0) p.vz = 0; }
      }
    }
  }

  const clamp01 = (k) => clamp(k, 0, 1);
  const inOutSine = (k) => -(Math.cos(Math.PI * k) - 1) / 2;

  // Driven by the shared conductor so the writing stays in lockstep with the
  // 武 slices: build (write) → hold → dissolve (retract) → loop.
  function timeline(T) {
    let p, w = 0;
    if (reduced) { p = 1; }
    else if (T < BUILD_START) { p = 0; }
    else if (T < BUILD_END) { const k = clamp01((T - BUILD_START) / (BUILD_END - BUILD_START)); p = inOutSine(k); w = (k > 0 && k < 1) ? 1 : 0; }
    else if (T < HOLD_END) { p = 1; }
    else if (T < DISSOLVE_END) { const k = clamp01((T - HOLD_END) / (DISSOLVE_END - HOLD_END)); p = 1 - inOutSine(k); w = k < 1 ? 0.5 : 0; }
    else { p = 0; }
    uProgress.value = p;
    uWriting.value = w;
    const show = p > 1e-4;
    brushMesh.visible = show;
    strokeMesh.visible = show;
    frameMesh.visible = show;
  }

  const resize = attachResize(renderer, camera, canvas);
  const clock = new THREE.Clock();
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = virtualTime();
    timeline(reduced ? (BUILD_END + HOLD_END) / 2 : phaseT());
    const imp = dragForce.consume();
    if (!reduced) {
      stepSway(imp, dt);
      const grown = clamp01((uProgress.value - 0.6) / 0.4);
      art.rotation.y = Math.sin(elapsed * 0.32) * 0.12;
      art.rotation.x = bendX + Math.sin(elapsed * 0.27) * 0.04;
      art.rotation.z = bendZ + Math.sin(elapsed * 0.23) * 0.02;
      for (const p of parts) {
        const tremor = Math.sin(elapsed * 1.1 + p.ph) * 0.018 * p.comp * grown;
        p.mesh.rotation.z = p.x + tremor;
        p.mesh.rotation.x = p.z * 0.6;
      }
      key.position.x = 3.4 + Math.sin(elapsed * 0.2) * 1.6;
      key.position.z = 4.4 + Math.cos(elapsed * 0.2) * 1.6;
      backGreen.intensity = 1.7 + Math.sin(elapsed * 0.5) * 0.35;
    }
    controls.update();
    renderer.render(scene, camera);
  }
  const gate = makeLoopGate(renderer, canvas, loop);

  return {
    replay() { reset(); },
    dispose() {
      gate.dispose();
      resize.dispose();
      dragForce.dispose();
      controls.dispose();
      strokeMesh.geometry.dispose();
      frameMesh.geometry.dispose();
      brushMesh.geometry.dispose();
      leafMaterial.dispose();
      stemMaterial.dispose();
      scene.environment?.dispose?.();
      scene.background?.dispose?.();
      renderer.dispose();
    },
  };
}
