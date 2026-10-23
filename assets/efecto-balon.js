import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ===== CONFIG ===== */
const canvas = document.getElementById('fx-obj');
const MODEL_URL = canvas.dataset.model || 'assets/balon.glb';
const SIZE = 0.30;   // fracción de la altura del viewport (s=1)
// una keyframe por <section> de <main>: x/y en -1..1, s = escala
const K_DESKTOP = [
  { x:  .50, y:  .06, s: 2.0 },  // hero
  { x:  .46, y: -.40, s: .50 },   // el club
  { x:  .40, y:  .30, s: .60 },   // equipos
  { x:  .38, y:  .26, s: .80 },   // partidos
  { x:  .40, y:  .32, s: .60 },   // noticias
  { x: -.80, y:  .00, s: 1.00 },  // únete
  { x:  .02, y:  .36, s: .55 },   // contacto
];
const K_MOBILE = K_DESKTOP.map((k, i) => ({ x: i === 0 ? .12 : .34, y: i === 0 ? .30 : .38, s: i === 0 ? 1.25 : .45 }));
/* ================== */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180;
const errText = e => (e && e.message) ? e.message : String(e);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sections = [...document.querySelectorAll('#cva main > section')];

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (e) { console.warn('WebGL no disponible → ' + errText(e)); }

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, .1, 100);
  camera.position.set(0, 0, 10);
  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();
  scene.add(new THREE.HemisphereLight(0xeaffee, 0x0b3d1b, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x2fc653, 3.2); rim.position.set(-5, 2, -4); scene.add(rim);

  const flight = new THREE.Group(), spin = new THREE.Group();
  flight.add(spin); scene.add(flight);
  let ready = false;

  (async () => {
    try {
      const res = await fetch(MODEL_URL, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = await res.arrayBuffer();
      const gltf = await new Promise((ok, ko) => new GLTFLoader().parse(buf, '', ok, ko));
      const model = gltf.scene;
      model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      const box = new THREE.Box3().setFromObject(model);
      model.scale.multiplyScalar(1 / Math.max(...box.getSize(new THREE.Vector3()).toArray()));
      box.setFromObject(model); model.position.sub(box.getCenter(new THREE.Vector3()));
      spin.add(model);
      ready = true; canvas.classList.add('ready'); document.body.classList.add('fx-3d');
    } catch (e) { console.warn('Balón 3D no disponible → ' + errText(e)); }
  })();

  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function targetAt() {
    const K = innerWidth < 760 ? K_MOBILE : K_DESKTOP;
    const n = Math.min(K.length, sections.length);
    if (n < 2) return { ...K[0], arc: 0 };
    const mid = scrollY + innerHeight / 2;
    const c = sections.slice(0, n).map(s => { const r = s.getBoundingClientRect(); return r.top + scrollY + r.height / 2; });
    let i = 0; while (i < n - 2 && mid > c[i + 1]) i++;
    const f = clamp((mid - c[i]) / (c[i + 1] - c[i]), 0, 1);
    const t = ease(clamp((f - .2) / .6, 0, 1)), a = K[i], b = K[i + 1];
    const arc = reduced ? 0 : Math.sin(t * Math.PI);
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) - arc * .12, s: lerp(a.s, b.s, t) * (1 + arc * .1), arc };
  }

  const cur = { ...targetAt() }, mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = -(e.clientY / innerHeight * 2 - 1); }, { passive: true });
  const clock = new THREE.Clock();
  (function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime, tg = targetAt();
    const k = 1 - Math.exp(-dt * 3.2);
    for (const p of ['x', 'y', 's']) cur[p] += (tg[p] - cur[p]) * k;
    const km = 1 - Math.exp(-dt * 2); mouse.sx += (mouse.x - mouse.sx) * km; mouse.sy += (mouse.y - mouse.sy) * km;
    const halfH = Math.tan(camera.fov * DEG / 2) * camera.position.z, halfW = halfH * camera.aspect, w = reduced ? 0 : 1;
    const diam = Math.min(halfH * 2, halfW * 1.4) * SIZE * cur.s, edge = 1 - diam / 2 / halfW - .02;
    const px = clamp(cur.x, -edge, edge);   // nunca se sale por los lados
    flight.position.set(px * halfW + mouse.sx * .1, cur.y * halfH + Math.sin(t * 1.6) * .05 * halfH * w + mouse.sy * .06, 0);
    flight.scale.setScalar(diam);
    // el balón gira con el scroll (más un giro lento constante)
    spin.rotation.set(.35 + mouse.sy * .25, scrollY * .0042 + t * .22 * w + mouse.sx * .3, -.2 + scrollY * .0011);
    if (ready) renderer.render(scene, camera);
  })();
}
