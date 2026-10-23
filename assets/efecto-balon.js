import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ===== CONFIG ===== */
const canvas = document.getElementById('fx-obj');
const MODEL_URL = canvas.dataset.model || 'assets/balon.glb';
const SIZE = 0.30;   // fracción de la altura del viewport (s=1)
// posición del balón en el hero: x/y en -1..1, s = escala
const HERO_DESKTOP = { x: .50, y: .06, s: 2.0 };
const HERO_MOBILE = { x: .12, y: .30, s: 1.25 };
/* ================== */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180;
const errText = e => (e && e.message) ? e.message : String(e);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  const targetAt = () => ({ ...(innerWidth < 760 ? HERO_MOBILE : HERO_DESKTOP) });

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
    flight.position.set(px * halfW + mouse.sx * .1, (cur.y + 2 * scrollY / innerHeight) * halfH + Math.sin(t * 1.6) * .05 * halfH * w + mouse.sy * .06, 0);  // se queda en el hero y sube con la página
    flight.scale.setScalar(diam);
    // el balón gira con el scroll (más un giro lento constante)
    spin.rotation.set(.35 + mouse.sy * .25, t * .35 * w + mouse.sx * .3, -.2);
    if (ready && scrollY < innerHeight * 1.3) renderer.render(scene, camera);
  })();
}
