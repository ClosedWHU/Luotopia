import * as THREE from 'three';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function makeRenderer(canvas, { alpha = false, exposure = 1.0 } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

// Runs the render loop only while the canvas is on-screen and the tab is
// visible; two live WebGL scenes plus the site aurora is worth gating.
export function makeLoopGate(renderer, canvas, loop) {
  let inView = false;
  let docVisible = !document.hidden;
  let running = false;

  const sync = () => {
    const want = inView && docVisible;
    if (want && !running) { running = true; renderer.setAnimationLoop(loop); }
    else if (!want && running) { running = false; renderer.setAnimationLoop(null); }
  };

  const io = new IntersectionObserver((entries) => {
    inView = entries.some((e) => e.isIntersecting);
    sync();
  }, { rootMargin: '150px' });
  io.observe(canvas);

  const onVis = () => { docVisible = !document.hidden; sync(); };
  document.addEventListener('visibilitychange', onVis);

  return {
    sync,
    dispose() {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      renderer.setAnimationLoop(null);
      running = false;
    },
  };
}

// Sizes the renderer to the canvas's laid-out box (not the window), so the
// scenes embed cleanly in cards.
export function attachResize(renderer, camera, canvas) {
  const parent = canvas.parentElement || canvas;
  const resize = () => {
    const w = parent.clientWidth, h = parent.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    if (camera.isPerspectiveCamera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  };
  const ro = new ResizeObserver(resize);
  ro.observe(parent);
  resize();
  return { resize, dispose: () => ro.disconnect() };
}

// Turns pointer movement over a canvas into a per-frame impulse {x, y} that the
// scenes feed their spring physics. Dragging (orbiting) weighs more than idle
// hover, so a flick visibly "shoves" the logo. Accumulator is clamped so a fast
// swipe can never inject an unbounded kick (the springs also hard-clamp travel,
// so the pieces can wobble but never fly apart).
export function attachDragForce(canvas, { hoverWeight = 0.3, maxDelta = 90 } = {}) {
  let accX = 0, accY = 0;
  let dragging = false, lastX = null, lastY = null;
  const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
  const onMove = (e) => {
    if (lastX == null) { lastX = e.clientX; lastY = e.clientY; }
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    const w = dragging ? 1 : hoverWeight;
    accX = clamp(accX + dx * w, -maxDelta, maxDelta);
    accY = clamp(accY + dy * w, -maxDelta, maxDelta);
  };
  const onUp = () => { dragging = false; lastX = null; lastY = null; };
  canvas.addEventListener('pointerdown', onDown);
  // pointermove is scoped to this canvas (not window): OrbitControls captures
  // the pointer on drag, so moves still reach us even outside the box, while
  // pointer travel over the rest of the page (or over the *other* viewer) does
  // not leak force into this scene.
  canvas.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  return {
    consume() { const d = { x: accX, y: accY }; accX = 0; accY = 0; return d; },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    },
  };
}
